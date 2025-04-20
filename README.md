# Google Canvas Download

A Chrome extension to download Google Docs pages as images.

## Description

This Chrome extension allows you to download Google Docs pages as PNG images. It captures each page of a Google Doc as a high-quality image, making it useful for backing up documents, sharing content in image format, or preserving the exact visual appearance of your documents.

## Features

- Download Google Docs pages as PNG images
- Automatically process all pages in a document
- Save images with organized page numbering
- Progress tracking during download
- Maintains visual fidelity of document content
- Creates organized folder structure for downloads

## Installation

1. Download or clone this repository:
```bash
git clone https://github.com/yourusername/GoogleCanvasDownload.git
```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked" and select the GoogleCanvasDownload directory

## Usage

1. Open a Google Doc in Chrome
2. Click the extension icon in your browser toolbar
3. Enter the number of pages in the document
4. Click "Download" to start the process
5. The extension will:
   - Capture each page as a PNG image
   - Save files with format: `[page_number]_[document_title].png`
   - Show progress and completion status

## Requirements

- Google Chrome browser
- Access to Google Docs
- Permission to download files to your local machine

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Nguyen Van Duy Khiem

## Acknowledgments

- Google Canvas API
- Node.js community