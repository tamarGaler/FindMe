let userPhotos = [];
const progressStatus = document.getElementById('progress-status');
const maxImageCount = 500;

async function authenticateUser() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, function (token) {
            if (chrome.runtime.lastError || !token) {
                console.error('Error getting OAuth2 token:', chrome.runtime.lastError.message);
                reject(new Error('Error getting OAuth2 token: ' + chrome.runtime.lastError.message));
            } else {
                resolve(token);
            }
        });
    });
}

async function fetchGoogleDriveAlbums() {
    try {
        const token = await authenticateUser();

        // Query to get only folders (which could be albums)
        const response = await fetch(
            'https://www.googleapis.com/drive/v3/files?q=mimeType="application/vnd.google-apps.folder"&fields=files(id,name)',
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            throw new Error('Error fetching albums from Google Drive: ' + response.statusText);
        }

        const data = await response.json();
        console.log('Albums (folders) retrieved');
        return data.files; // Array of folders (albums)
    } catch (error) {
        console.error('Error fetching albums:', error);
        throw error;
    }
}

async function displayAlbumsDropdown() {
    try {
        const albums = await fetchGoogleDriveAlbums();
        const albumSelect = document.getElementById('album-select');

        // Clear existing options
        albumSelect.innerHTML = '';

        // Create a default option
        const defaultOption = document.createElement('option');
        defaultOption.text = 'Select an Album';
        defaultOption.value = '';
        albumSelect.add(defaultOption);

        // Populate the dropdown with albums
        albums.forEach(album => {
            const option = document.createElement('option');
            option.value = album.id;
            option.text = album.name;
            albumSelect.add(option);
        });

        // Enable the dropdown
        albumSelect.disabled = false;
    } catch (error) {
        console.error('Error displaying albums:', error);
    }
}

function extractFolderIdFromLink(link) {
    const match = link.match(/(?:drive\.google\.com\/(?:drive\/folders\/|open\?id=))([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

async function fetchDriveImageAsBase64(fileId, token) {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch image with ID ${fileId}: ${response.statusText}`);
    }
    console.log('Image fetched from Google Drive');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

async function fetchPhotosFromAlbumOrLink(albumId, token) {
    progressStatus.textContent = 'Fetching photos from Google Drive...';
    try {
        let allFiles = [];
        let pageToken = null;

        do {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${albumId}'+in+parents+and+(mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/gif')&pageSize=${maxImageCount}&fields=files(id,name)&includeItemsFromAllDrives=true&supportsAllDrives=true&pageToken=${pageToken || ''}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );

            // Check if the response is okay
            if (!response.ok) {
                console.error("Failed to fetch files:", response.statusText);
                break;
            }
            else {
                console.log('Files fetched from Google Drive');
            }

            const data = await response.json();
            allFiles = allFiles.concat(data.files);
            pageToken = response.nextPageToken;
        } while (pageToken); // Continue until there are no more pages

        const base64Images = await Promise.all(
            allFiles.map((file) => fetchDriveImageAsBase64(file.id, token))
        );
        console.log('returning base64Images');
        progressStatus.textContent = 'Done fetching photos from Google Drive.';
        return base64Images;
    } catch (error) {
        console.error("Error fetching photos:", error);
        throw error;
    }
}

async function getFaceAnnotations(imageBase64, token) {
    const requestData = {
        requests: [
            {
                image: { content: imageBase64 },
                features: [{
                    type: 'FACE_DETECTION',
                    maxResults: 1
                }]
            }
        ]
    };

    // Make request to GCP Vision AI using the token
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
    });

    // Check response status
    if (!response.ok) {
        throw new Error('Error processing images with GCP Vision AI.');
    }

    // Parse response data
    const data = await response.json();
    // Extract face annotations from both images
    return data.responses[0].faceAnnotations[0];
}

async function getImagesAreSamePerson(userFaceAnnotations, imageBase64, token) {
    progressStatus.textContent = 'Finding matching photos...';;
    try {
        const image1Face = userFaceAnnotations;
        const image2Face = await getFaceAnnotations(imageBase64, token);
        if (!image1Face || !image2Face) {
            return false;
        }
        const isSamePerson = compareFaces(image1Face, image2Face);
        return isSamePerson;
    } catch (error) {
        console.error(error);
        return false;
    }
}

function calculateFeatureVector(landmarks) {
    // Normalize landmarks based on the distance between the eyes
    const leftEye = landmarks.find(point => point.type === "LEFT_EYE").position;
    const rightEye = landmarks.find(point => point.type === "RIGHT_EYE").position;


    // Calculate the distance between the eyes
    const eyeDistance = Math.sqrt(
        Math.pow(rightEye.x - leftEye.x, 2) +
        Math.pow(rightEye.y - leftEye.y, 2) +
        Math.pow(rightEye.z - leftEye.z, 2)
    );

    // Normalize the coordinates based on the eye distance
    const normalizedLandmarks = landmarks.map(point => ({
        type: point.type,
        position: {
            x: (point.position.x - leftEye.x) / eyeDistance,
            y: (point.position.y - leftEye.y) / eyeDistance,
            z: (point.position.z - leftEye.z) / eyeDistance
        }
    }));

    // Create a feature vector based on normalized distances between specific points
    const distances = [
        "NOSE_TIP",
        "MOUTH_CENTER",
        "LEFT_EYE",
        "RIGHT_EYE",
        "LEFT_EAR_TRAGION",
        "RIGHT_EAR_TRAGION",
        "CHIN_GNATHION",
        "LEFT_EYE_TOP_BOUNDARY",
        "RIGHT_EYE_TOP_BOUNDARY",
        "LEFT_EYE_BOTTOM_BOUNDARY",
        "RIGHT_EYE_BOTTOM_BOUNDARY",
        "LEFT_EYEBROW_UPPER_MIDPOINT",
        "RIGHT_EYEBROW_UPPER_MIDPOINT",
        "FOREHEAD_GLABELLA",
        "UPPER_LIP",
        "LOWER_LIP"
    ].map(type => {
        const point = normalizedLandmarks.find(p => p.type === type);
        if (!point) {
            console.log(`Landmark type ${type} not found in normalized landmarks.`);
            return [null, null, null];
        }
        else {
            return [point.position.x, point.position.y, point.position.z];
        }
    }).flat();
    return distances;
}

function compareFaces(face1, face2, threshold = 0.78) {
    // Calculate feature vectors for both faces
    const vector1 = calculateFeatureVector(face1.landmarks);
    const vector2 = calculateFeatureVector(face2.landmarks);

    // Calculate the Euclidean distance between the feature vectors
    const distance = Math.sqrt(
        vector1.reduce((sum, value, index) => sum + Math.pow(value - vector2[index], 2), 0)
    );

    // If the distance is below the threshold, the faces are considered similar
    return distance < threshold;
}

async function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function displayMatchedPhotos(matchedPhotos) {
    const photoContainer = document.getElementById('photo-container');
    photoContainer.innerHTML = '';

    matchedPhotos.forEach(photoBase64 => {
        const img = document.createElement('img');
        img.src = 'data:image/jpeg;base64,' + photoBase64;
        img.className = 'photo';
        photoContainer.appendChild(img);
    });
}

document.getElementById('find-my-photos').addEventListener('click', async function (event) {
    event.preventDefault(); // Prevent the default behavior
    const albumSelect = document.getElementById('album-select');
    const directLinkInput = document.getElementById('album-link').value.trim();
    const userPhotos = document.getElementById('file-upload').files;
    const token = await authenticateUser();

    let albumId = null;

    if (directLinkInput) {
        albumId = extractFolderIdFromLink(directLinkInput);
        if (!albumId) {
            alert('Invalid Google Drive link. Please check the format.');
            return;
        }
    } else if (albumSelect.value) {
        albumId = albumSelect.value;
    } else {
        alert('Please select an album or provide a Google Drive link.');
        return;
    }

    if (userPhotos.length === 0) {
        alert('Please select one clear photos of you to search.');
        return;
    }

    const drivePhotos = await fetchPhotosFromAlbumOrLink(albumId, token);
    const userPhotoBlob = userPhotos[0];
    const userPhotoBase64 = await convertFileToBase64(userPhotoBlob);
    progressStatus.textContent = 'Calculating user face annotations...';
    const userPhotoAnnotaions = await getFaceAnnotations(userPhotoBase64, token);
    progressStatus.textContent = 'Comparing photos...';
    const matchedPhotosData = [];
    const matchedPhotos = await Promise.all(
        drivePhotos.map(async (drivePhotoBase64) => {
            const areSame = await getImagesAreSamePerson(userPhotoAnnotaions, drivePhotoBase64, token);
            if (areSame) {
                matchedPhotosData.push(drivePhotoBase64);
            }
            return areSame;
        })
    );
    progressStatus.textContent = 'Done comparing matching photos. Found ' + matchedPhotosData.length + ' photos.';
    if (matchedPhotosData.length > 0) {
        displayMatchedPhotos(matchedPhotosData);
    }
});

const onFileChange = function (event) {
    event.stopPropagation();
    const fileInput = event.target;

    if (!fileInput || !fileInput.files) {
        console.error('File input or files property not found.');
        return;
    }

    const selectedFiles = Array.from(fileInput.files);
    selectedFiles.forEach(file => {
        userPhotos.push(file);
    });
};

// Add event listener for file selection
document.getElementById('file-upload').addEventListener('change', onFileChange);


// Ensure the DOM is fully loaded before running the script
document.addEventListener('DOMContentLoaded', function () {


    // Handle file selection when the user chooses files
    displayAlbumsDropdown();
    const fileInput = document.getElementById('file-upload');

    // Check if the file input exists
    if (!fileInput) {
        console.error('File input element not found.');
        return;
    }
});
