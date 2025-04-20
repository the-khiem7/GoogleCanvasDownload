console.log("Google Canvas Download content script loaded");

const processedZIndexes = new Set();
let totalPages = 0;
let isDownloading = false;

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
            requestDirectoryAndDownload();
            sendResponse({status: "started"});
        } else {
            sendResponse({status: "already_downloading"});
        }
    }
    return true;
});

// Hàm yêu cầu người dùng chọn thư mục (sử dụng File System Access API)
async function getDirectoryHandle() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        return dirHandle;
    } catch (error) {
        console.error("Directory selection error:", error);
        chrome.runtime.sendMessage({
            action: "downloadError",
            error: "Không thể chọn thư mục: " + error.message
        });
        isDownloading = false;
        return null;
    }
}

// Yêu cầu người dùng chọn thư mục
async function requestDirectoryAndDownload() {
    chrome.runtime.sendMessage({
        action: "downloadStatus",
        message: "⏳ Đang chờ chọn thư mục..."
    });

    const directoryHandle = await getDirectoryHandle();
    if (!directoryHandle) return;

    chrome.runtime.sendMessage({
        action: "downloadStatus",
        message: "🔄 Bắt đầu tải xuống..."
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

                // Chuyển đổi Base64 thành blob
                const response = await fetch(dataURL);
                const blob = await response.blob();

                // Lưu file vào thư mục được chọn
                if (directoryHandle) {
                    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
                    const writableStream = await fileHandle.createWritable();
                    await writableStream.write(blob);
                    await writableStream.close();
                }

                processedZIndexes.add(rawZ);
                downloadedThisRound.push(displayZ);
            } catch (error) {
                console.error(`Error processing canvas ${displayZ}:`, error);
                chrome.runtime.sendMessage({
                    action: "downloadError",
                    error: `Lỗi khi xử lý trang ${displayZ}: ${error.message}`
                });
            }
        });

        // After all processing is done
        Promise.all(promises).then(() => {
            if (skippedZIndexes.length > 0) {
                chrome.runtime.sendMessage({
                    action: "downloadStatus", 
                    message: `⚠️ Bỏ qua Trang: ${[...new Set(skippedZIndexes)].join(', ')}`
                });
            }

            // Process results after all downloads are complete
            // Kiểm tra liền mạch
            const missingZ = [];
            for (let i = 0; i < totalPages; i++) {
                if (!processedZIndexes.has(i)) {
                    missingZ.push(i + 1);
                }
            }

            // Nổi bật log "Trang đang chờ" với màu đen
            if (missingZ.length > 0) {
                chrome.runtime.sendMessage({
                    action: "waitingPages", 
                    pages: missingZ.join(', ')
                });
            }

            // Send all downloaded pages, not just from this round
            const allDownloadedPages = Array.from(processedZIndexes).map(x => x + 1).sort((a, b) => a - b);
            
            if (allDownloadedPages.length > 0) {
                console.log("Sending downloaded pages:", allDownloadedPages.join(', '));
                chrome.runtime.sendMessage({
                    action: "downloadedPages", 
                    pages: allDownloadedPages.join(', ')
                });
            }

            // Nếu đủ trang và không thiếu => dừng
            if (processedZIndexes.size >= totalPages && missingZ.length === 0) {
                chrome.runtime.sendMessage({
                    action: "downloadComplete"
                });
                isDownloading = false;
                return true;
            }
        });

        return false;
    }

    function autoScroll() {
        window.scrollBy(0, window.innerHeight);
    }

    function startExtraction() {
        const done = extractCanvasData();
        if (!done) {
            autoScroll();
            setTimeout(startExtraction, 1000);  // Giảm thời gian delay xuống 1 giây
        }
    }

    startExtraction();
}

// Send a message to let the popup know the content script has loaded
chrome.runtime.sendMessage({
    action: "contentScriptLoaded"
});
