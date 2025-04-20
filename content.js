let processedZIndexes = new Set();
let totalPages = 0;
let isDownloading = false;
let directoryHandle = null;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startDownload") {
    totalPages = request.totalPages;
    startDownload();
    sendResponse({status: "started"});
  }
  return true;
});

async function startDownload() {
  if (isDownloading) return;
  isDownloading = true;
  
  try {
    // Request directory access
    directoryHandle = await window.showDirectoryPicker();
    startExtraction();
  } catch (error) {
    console.error("Error selecting directory:", error);
    chrome.runtime.sendMessage({
      action: "downloadError",
      error: "Failed to select directory: " + error.message
    });
    isDownloading = false;
  }
}

function extractCanvasData() {
  const canvases = document.querySelectorAll('canvas.kix-canvas-tile-content');
  if (canvases.length === 0) {
    chrome.runtime.sendMessage({
      action: "downloadStatus", 
      message: 'Không tìm thấy canvas nào.'
    });
    return false;
  }

  const pageTitle = document.title.replace(/[\\/:*?"<>|]/g, '_');
  const skippedZIndexes = [];
  let downloadedPages = [];

  canvases.forEach(async (canvas) => {
    const rawZ = parseInt(getComputedStyle(canvas).zIndex || "-1");
    const displayZ = rawZ + 1;

    if (isNaN(rawZ) || processedZIndexes.has(rawZ)) {
      skippedZIndexes.push(displayZ);
      return;
    }

    const dataURL = canvas.toDataURL("image/png");
    const fileName = `${pageTitle}_${displayZ}.png`;

    // Convert Base64 to blob
    const response = await fetch(dataURL);
    const blob = await response.blob();

    // Save file to selected directory
    if (directoryHandle) {
      try {
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(blob);
        await writableStream.close();
        processedZIndexes.add(rawZ);
        downloadedPages.push(displayZ);
      } catch (error) {
        chrome.runtime.sendMessage({
          action: "downloadError", 
          error: `Error saving ${fileName}: ${error.message}`
        });
      }
    }
  });

  if (skippedZIndexes.length > 0) {
    chrome.runtime.sendMessage({
      action: "downloadStatus", 
      message: `⚠️ Bỏ qua Trang: ${[...new Set(skippedZIndexes)].join(', ')}`
    });
  }

  // Check for missing pages
  const missingZ = [];
  for (let i = 0; i < totalPages; i++) {
    if (!processedZIndexes.has(i)) {
      missingZ.push(i + 1);
    }
  }

  if (missingZ.length > 0) {
    chrome.runtime.sendMessage({
      action: "waitingPages", 
      pages: missingZ.join(', ')
    });
  }

  if (downloadedPages.length > 0) {
    chrome.runtime.sendMessage({
      action: "downloadedPages", 
      pages: downloadedPages.join(', ')
    });
  }

  // If all pages are downloaded and none missing => stop
  if (processedZIndexes.size >= totalPages && missingZ.length === 0) {
    chrome.runtime.sendMessage({
      action: "downloadComplete"
    });
    return true;
  }

  return false;
}

function autoScroll() {
  window.scrollBy(0, window.innerHeight);
}

function startExtraction() {
  const done = extractCanvasData();
  if (!done) {
    autoScroll();
    setTimeout(startExtraction, 1000);  // Reduced delay to 1 second
  } else {
    isDownloading = false;
  }
}
