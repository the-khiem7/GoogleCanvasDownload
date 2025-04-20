document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startBtn');
  const openFolderButton = document.getElementById('openFolderBtn');
  const totalPagesInput = document.getElementById('totalPages');
  const statusMessage = document.getElementById('statusMessage');
  const downloadedPagesElement = document.getElementById('downloadedPages');
  const waitingPagesElement = document.getElementById('waitingPages');
  
  // Track the first download ID and folder name to enable opening the folder later
  let firstDownloadId = null;
  let currentFolderName = null;
  let isProcessing = false; // Global flag for tracking button state
  
  console.log("Popup initialized");
  
  // Set initial button state
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    // Check if we're on Google Docs
    if (!tabs[0].url.includes('docs.google.com')) {
      startButton.disabled = true;
      statusMessage.textContent = "❌ Này chỉ hoạt động trên Google Docs";
      statusMessage.className = "error";
    }
  });
  
  // Add simple debug logging to the popup
  function logStatus(message) {
    console.log(message);
    // For cleaner debugging, uncomment this line to show logs in the popup
    // statusMessage.textContent += "\n" + message;
  }
  
  // Modify the click event to use our global processing flag
  startButton.addEventListener('click', function() {
    console.log("Start button clicked, current state:", isProcessing ? "processing" : "ready");
    
    // Prevent multiple clicks
    if (isProcessing) {
      logStatus("Already processing, ignoring click");
      return;
    }
    
    const totalPages = parseInt(totalPagesInput.value);
    
    if (isNaN(totalPages) || totalPages <= 0) {
      statusMessage.textContent = "❌ Số trang không hợp lệ.";
      statusMessage.className = "error";
      return;
    }
    
    // Set processing flag IMMEDIATELY on click
    isProcessing = true;
    startButton.disabled = true;
    
    // Visual feedback
    startButton.textContent = "Đang xử lý...";
    statusMessage.textContent = "⏳ Đang khởi động...";
    statusMessage.className = "";
    downloadedPagesElement.textContent = "-";
    waitingPagesElement.textContent = "-";
    
    // Reset download tracking
    firstDownloadId = null;
    currentFolderName = null;
    openFolderButton.style.display = "none";
    
    logStatus("Querying active tab");
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) {
        handleError("Không thể tìm thấy tab hiện tại");
        return;
      }
      
      const tabId = tabs[0].id;
      logStatus(`Found tab ID: ${tabId}`);
      
      injectAndStartDownload(tabId, totalPages);
    });
  });
  
  function handleError(message) {
    logStatus(`ERROR: ${message}`);
    statusMessage.textContent = "❌ " + message;
    statusMessage.className = "error";
    startButton.disabled = false;
    startButton.textContent = "Bắt đầu Tải";
    isProcessing = false;
  }
  
  function injectAndStartDownload(tabId, totalPages) {
    logStatus("Checking if content script is loaded");
    
    // First check if content script is loaded with a timeout
    let pingTimeout = setTimeout(() => {
      logStatus("Ping timed out, injecting script");
      injectContentScript(tabId, totalPages);
    }, 500);
    
    chrome.tabs.sendMessage(tabId, {action: "ping"}, function(response) {
      clearTimeout(pingTimeout);
      
      if (chrome.runtime.lastError) {
        logStatus(`Ping error: ${chrome.runtime.lastError.message}`);
        injectContentScript(tabId, totalPages);
      } else if (response && response.status === "content_script_active") {
        logStatus("Content script is active, starting download");
        sendStartMessage(tabId, totalPages);
      } else {
        logStatus("Unexpected ping response, injecting script");
        injectContentScript(tabId, totalPages);
      }
    });
  }
  
  function injectContentScript(tabId, totalPages) {
    logStatus("Injecting content script");
    
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      files: ['content.js']
    }).then(() => {
      logStatus("Script injection successful");
      
      // Wait for script to initialize
      setTimeout(() => {
        sendStartMessage(tabId, totalPages);
      }, 300);
    }).catch(error => {
      handleError(`Không thể chạy script: ${error.message}`);
    });
  }
  
  function sendStartMessage(tabId, totalPages) {
    logStatus(`Sending start message for ${totalPages} pages`);
    
    chrome.tabs.sendMessage(
      tabId,
      {action: "startDownload", totalPages: totalPages},
      function(response) {
        if (chrome.runtime.lastError) {
          handleError(`Không thể kết nối với trang: ${chrome.runtime.lastError.message}`);
        } else if (response && response.status === "started") {
          logStatus("Download process started");
          // State is already set, just update UI
          downloadedPagesElement.textContent = "-";
          waitingPagesElement.textContent = "Đang tải...";
        } else if (response && response.status === "already_downloading") {
          statusMessage.textContent = "⚠️ Đã có quá trình tải đang chạy!";
          statusMessage.className = "warning";
        } else {
          handleError("Phản hồi không xác định từ script");
        }
      }
    );
  }
  
  // Add click event for the open folder button
  openFolderButton.addEventListener('click', function() {
    if (firstDownloadId) {
      chrome.downloads.show(firstDownloadId);
    }
  });
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    logStatus(`Received message: ${request.action}`);
    
    if (request.action === "downloadFile") {
      // Handle download request from content script
      const folderPath = request.folderName || "GoogleCanvasDownload";
      currentFolderName = folderPath;
      
      chrome.downloads.download({
        url: request.dataUrl,
        filename: folderPath + '/' + request.fileName,
        saveAs: false
      }, downloadId => {
        if (chrome.runtime.lastError) {
          logStatus(`Download error: ${chrome.runtime.lastError.message}`);
          sendResponse({success: false, error: chrome.runtime.lastError.message});
        } else {
          // Store the first download ID to enable opening the folder later
          if (firstDownloadId === null) {
            firstDownloadId = downloadId;
          }
          sendResponse({success: true, downloadId: downloadId});
        }
      });
      
      return true; // Required for async sendResponse
    }
    
    switch(request.action) {
      case "contentScriptLoaded":
        logStatus("Content script loaded notification received");
        break;
        
      case "downloadStatus":
        statusMessage.textContent = request.message;
        statusMessage.className = "";
        break;
        
      case "downloadedPages":
        if (request.pages && request.pages.length > 0) {
          downloadedPagesElement.textContent = request.pages;
        }
        break;
        
      case "waitingPages":
        if (request.pages && request.pages.length > 0) {
          waitingPagesElement.textContent = request.pages;
        }
        break;
        
      case "downloadComplete":
        statusMessage.textContent = "✅ Đã hoàn tất tải tất cả trang!";
        statusMessage.className = "success";
        startButton.disabled = false;
        startButton.textContent = "Bắt đầu Tải";
        waitingPagesElement.textContent = "-";
        isProcessing = false;
        
        // Show the Open Folder button if we have a download ID
        if (firstDownloadId !== null) {
          openFolderButton.style.display = "block";
        }
        break;
        
      case "downloadError":
        handleError(request.error);
        break;
    }
    
    return true; // Keep the message channel open
  });
});
