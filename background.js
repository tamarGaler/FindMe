async function authenticateUser() {
    return new Promise((resolve, reject) => {
        // Initiates OAuth2 authentication for the user
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

async function fetchPhotosFromGoogleDrive() {
    console.log('Fetching photos from Google Drive...');
    try {
        const token = await authenticateUser(); // Get the OAuth2 token

        // Make the API request to fetch images from Google Drive
        const response = await fetch('https://www.googleapis.com/drive/v3/files?q=mimeType="image/jpeg"&fields=files(id,name)', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Error fetching files from Google Drive: ' + response.statusText);
        }

        const data = await response.json();
        const photoList = data.files.map(file => ({
            name: file.name,
            url: `https://drive.google.com/uc?export=view&id=${file.id}`
        }));

        console.log('Photos retrieved from Google Drive:', photoList);
        return photoList;
    } catch (error) {
        console.error('Error during Google Drive photo fetch:', error);
        throw error;
    }
}
