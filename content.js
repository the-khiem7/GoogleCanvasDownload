console.log("Google Canvas Download content script loaded");

// Constants and state variables
const processedZIndexes = new Set();
let totalPages = 0;
let isDownloading = false;
let downloadFolderName = '';
let activeTabId = null; // Add tab ID tracking

// Utility functions
function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
}

function sendStatusMessage(action, data) {
    try {
        if (!chrome.runtime?.id) {
            console.log('Extension context invalid, stopping process');
            isDownloading = false;
            return;
        }
        
        chrome.runtime.sendMessage({
            action: action,
            ...data
        });
    } catch (e) {
        console.error(`Failed to send ${action} message:`, e);
        isDownloading = false;
    }
}

// Initialization - notify popup that content script is loaded
try {
    chrome.runtime.sendMessage({
        action: "contentScriptLoaded"
    });
} catch (e) {
    console.error("Failed to send contentScriptLoaded message:", e);
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`Content script received message: ${request.action}`, request);
    
    try {
        switch (request.action) {
            case "ping":
                console.log("Ping received, responding with active status");
                sendResponse({status: "content_script_active"});
                break;
                
            case "startDownload":
                handleStartDownload(request, sendResponse);
                break;
                
            case "stopDownload":
                isDownloading = false;
                console.log("Download stopped by popup");
                sendResponse({status: "stopped"});
                break;

            default:
                console.log(`Unhandled action: ${request.action}`);
                sendResponse({status: "unknown_action"});
        }
    } catch (e) {
        console.error("Error handling message:", e);
        try {
            sendResponse({error: e.message});
        } catch (e2) {
            console.error("Failed to send error response:", e2);
        }
    }
    
    return true; // Keep the message channel open for async response
});

// Handle download start request
function handleStartDownload(request, sendResponse) {
    totalPages = request.totalPages;
    activeTabId = request.tabId; // Store tab ID
    console.log(`Start download request for ${totalPages} pages, tab: ${activeTabId}`);
    
    if (!isDownloading) {
        isDownloading = true;
        
        // Critical: Respond immediately before starting the process
        console.log("Sending 'started' response");
        sendResponse({status: "started"});
        
        // Start the download process asynchronously after sending response
        setTimeout(startDownloadProcess, 10);
    } else {
        console.log("Already downloading, sending 'already_downloading' response");
        sendResponse({status: "already_downloading"});
    }
}

// Main download functions
function startDownloadProcess() {
    console.log("Starting download process");
    
    sendStatusMessage("downloadStatus", {
        message: "🔄 Đang chuẩn bị tải xuống..."
    });

    // Get the document title for folder name
    downloadFolderName = sanitizeFileName(document.title);
    
    sendStatusMessage("downloadStatus", {
        message: `🔄 Tải xuống vào thư mục: "${downloadFolderName}"`
    });

    startExtraction();
}

function extractCanvasData() {
    // Check active tab through messaging
    chrome.runtime.sendMessage({action: "checkActiveTab", tabId: activeTabId}, response => {
        if (response && !response.isActiveTab) {
            console.log('Tab changed, stopping download');
            isDownloading = false;
            return true;
        }
    });

    if (!chrome.runtime?.id) {
        console.log('Extension context invalid, stopping process');
        isDownloading = false;
        return true;
    }
    
    const canvases = document.querySelectorAll('canvas.kix-canvas-tile-content');
    if (canvases.length === 0) {
        sendStatusMessage("downloadStatus", {
            message: "Không tìm thấy canvas nào."
        });
        isDownloading = false;
        return false;
    }

    const pageTitle = sanitizeFileName(document.title);
    const skippedZIndexes = [];
    
    // Process canvases
    Array.from(canvases).forEach((canvas) => {
        try {
            processCanvas(canvas, pageTitle, skippedZIndexes);
        } catch (e) {
            console.error("Error processing canvas:", e);
        }
    });

    if (skippedZIndexes.length > 0) {
        sendStatusMessage("downloadStatus", {
            message: `⚠️ Bỏ qua Trang: ${[...new Set(skippedZIndexes)].join(', ')}`
        });
    }

    return false; // Continue scrolling and processing
}

function processCanvas(canvas, pageTitle, skippedZIndexes) {
    const rawZ = parseInt(getComputedStyle(canvas).zIndex || "-1");
    const displayZ = rawZ + 1;

    if (isNaN(rawZ) || processedZIndexes.has(rawZ)) {
        skippedZIndexes.push(displayZ);
        return;
    }

    (async () => {
        try {
            const dataURL = canvas.toDataURL("image/png");
            const fileName = `${displayZ}_${pageTitle}.png`;
            
            console.log(`Processing page ${displayZ}, sending download request`);
            
            // Use Chrome's downloads API to save the file
            chrome.runtime.sendMessage({
                action: "downloadFile",
                dataUrl: dataURL,
                fileName: fileName,
                folderName: downloadFolderName
            }, response => {
                handleDownloadResponse(response, rawZ, displayZ);
            });
        } catch (e) {
            console.error(`Error processing canvas ${displayZ}:`, e);
        }
    })();
}

/**
 * Handles the response from a download request and updates the UI
 * @param {Object} response - The download response object
 * @param {number} rawZ - The raw z-index value
 * @param {number} displayZ - The display z-index value
 */
function handleDownloadResponse(response, rawZ, displayZ) {
    if (response && response.success) {
        processedZIndexes.add(rawZ);
        
        const allDownloadedPages = Array.from(processedZIndexes)
            .map(x => x + 1)
            .sort((a, b) => a - b);
        
        sendStatusMessage("downloadedPages", {
            pages: allDownloadedPages.join(', ')
        });
        
        checkCompletion();
    } else {
        console.error(`Failed to download page ${displayZ}:`, 
            response ? response.error : "No response");
    }
}

/**
 * Checks if all pages have been downloaded and handles completion
 * @returns {boolean} True if download is complete, false otherwise
 */
function checkCompletion() {
    const missingZ = [];
    for (let i = 0; i < totalPages; i++) {
        if (!processedZIndexes.has(i)) {
            missingZ.push(i + 1);
        }
    }
    
    sendStatusMessage("waitingPages", {
        pages: missingZ.length > 0 ? missingZ.join(', ') : "-"
    });
    
    if (processedZIndexes.size >= totalPages && missingZ.length === 0) {
        isDownloading = false;
        sendStatusMessage("downloadComplete", {});
        return true;
    }
    return false;
}

/**
 * Scrolls the window by one viewport height
 */
function autoScroll() {
    window.scrollBy(0, window.innerHeight);
}

function startExtraction() {
    if (!isDownloading) {  // Add this check
        console.log("Download process stopped");
        return;
    }

    const done = extractCanvasData();
    if (!done && isDownloading) {  // Check isDownloading again
        autoScroll();
        setTimeout(startExtraction, 1000);
    }
}
