![FindMeClean](FindMeClean.png)

# Photo Finder Chrome Extension

This Chrome extension was a fun side project created to learn how to build a simple Chrome extension for finding matching photos in Google Drive albums. The extension utilizes the Google Cloud Vision API for facial recognition.

## Features
- Allows users to upload a clear photo and search through a Google Drive album for matching faces.
- Supports JPEG, PNG, and GIF image formats.
- Displays matching photos in a grid layout.

## Limitations
- The extension does not work in full-screen mode.
- Processing might take some time, depending on the number of photos.
- Limited to a maximum of 500 images per search.
- Potential accuracy issues due to variations in lighting, facial expressions, or image quality.

## Getting Started For Development
### Prerequisites
- A [Google API key](https://console.cloud.google.com/) for accessing Google Drive and using the Cloud Vision API.

### Installation
1. Clone the repository:
    ```bash
    git clone https://github.com/your-username/photo-finder-extension.git
    ```cd
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" by toggling the switch at the top right.
4. Click "Load unpacked" and select the cloned project folder.

### Usage
1. Open the extension and paste the link to your Google Drive album.
2. Upload a clear photo of the person you want to find.
3. Click "Find My Photos" and wait for the matching photos to appear in the grid.

## Known Issues
- The extension may not work on all Chrome versions.
- Accuracy can be affected by differences in lighting, facial expressions, or photo quality.

## License
This project is licensed under the MIT License. Feel free to use it and modify it as you like.

## Disclaimer
This project was created just for fun and learning purposes. It may have some issues, and contributions are welcome!
