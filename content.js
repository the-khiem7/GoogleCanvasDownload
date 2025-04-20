console.log("Google Canvas Download content script loaded");

const processedZIndexes = new Set();
let totalPages = 0;
let isDownloading = false;
let downloadFolderName = '';

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    
    // Simple ping to check if content script is loaded
    if (request.action === "ping") {
        sendResponse({status: "content_script_active"});
        return true;
    }
    
    if (request.action === "startDownload") {
        totalPages = request.totalPages;
        console.log(`Starting download for ${totalPages} pages`);
        
        if (!isDownloading) {
            isDownloading = true;
            startDownloadProcess();
            sendResponse({status: "started"});
        } else {
            sendResponse({status: "already_downloading"});
        }
    }
    return true;
});

// Start the download process without requiring directory selection
async function startDownloadProcess() {
    chrome.runtime.sendMessage({
        action: "downloadStatus",
        message: "🔄 Đang chuẩn bị tải xuống..."
    });

    // Get the document title for folder name
    downloadFolderName = document.title.replace(/[\\/:*?"<>|]/g, '_');
    
    chrome.runtime.sendMessage({
        action: "downloadStatus",
        message: `🔄 Tải xuống vào thư mục: "${downloadFolderName}"`
    });

    function extractCanvasData() {
        const canvases = document.querySelectorAll('canvas.kix-canvas-tile-content');
        if (canvases.length === 0) {
            chrome.runtime.sendMessage({
                action: "downloadStatus", 
                message: "Không tìm thấy canvas nào."
            });
            isDownloading = false;
            return false;
        }

        const pageTitle = document.title.replace(/[\\/:*?"<>|]/g, '_');
        const skippedZIndexes = [];
        const downloadedThisRound = [];

        // Process promises for all canvases
        const promises = Array.from(canvases).map(async (canvas) => {
            const rawZ = parseInt(getComputedStyle(canvas).zIndex || "-1");
            const displayZ = rawZ + 1;

            if (isNaN(rawZ) || processedZIndexes.has(rawZ)) {
                skippedZIndexes.push(displayZ);
                return;
            }

            try {
                const dataURL = canvas.toDataURL("image/png");
                const fileName = `${pageTitle}_${displayZ}.png`;
                
                // Use Chrome's downloads API to save the file
                chrome.runtime.sendMessage({
                    action: "downloadFile",
                    dataUrl: dataURL,
                    fileName: fileName,
                    folderName: downloadFolderName
                }, response => {
                    if (response && response.success) {
                        processedZIndexes.add(rawZ);
                        downloadedThisRound.push(displayZ);
                        
                        // Send updated list of all downloaded pages
                        const allDownloadedPages = Array.from(processedZIndexes).map(x => x + 1).sort((a, b) => a - b);
                        chrome.runtime.sendMessage({
                            action: "downloadedPages", 
                            pages: allDownloadedPages.join(', ')
                        });
                        
                        // Check if we're done
                        const missingZ = [];
                        for (let i = 0; i < totalPages; i++) {
                            if (!processedZIndexes.has(i)) {
                                missingZ.push(i + 1);
                            }
                        }
                        
                        if (processedZIndexes.size >= totalPages && missingZ.length === 0) {
                            chrome.runtime.sendMessage({
                                action: "downloadComplete"
                            });
                            isDownloading = false;
                        } else {
                            chrome.runtime.sendMessage({
                                action: "waitingPages", 
                                pages: missingZ.join(', ')
                            });
                        }
                    }
                });
            } catch (error) {
                console.error(`Error processing canvas ${displayZ}:`, error);
                chrome.runtime.sendMessage({
                    action: "downloadError",
                    error: `Lỗi khi xử lý trang ${displayZ}: ${error.message}`
                });
            }
        });

        if (skippedZIndexes.length > 0) {
            chrome.runtime.sendMessage({
                action: "downloadStatus", 
                message: `⚠️ Bỏ qua Trang: ${[...new Set(skippedZIndexes)].join(', ')}`
            });
        }

        return false; // Always return false to continue scrolling and processing
    }

    function autoScroll() {
        window.scrollBy(0, window.innerHeight);
    }

    function startExtraction() {
        const done = extractCanvasData();
        if (!done && isDownloading) {
            autoScroll();
            setTimeout(startExtraction, 1000);
        }
    }

    startExtraction();
}

// Send a message to let the popup know the content script has loaded
chrome.runtime.sendMessage({
    action: "contentScriptLoaded"
});
