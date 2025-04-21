document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startBtn');
  const openFolderButton = document.getElementById('openFolderBtn');
  const totalPagesInput = document.getElementById('totalPages');
  const statusMessage = document.getElementById('statusMessage');
  const downloadedPagesElement = document.getElementById('downloadedPages');
  const waitingPagesElement = document.getElementById('waitingPages');
  const detectPagesBtn = document.getElementById('detectPages');
  
  // Add references to the new progress bars
  const downloadedBarElement = document.getElementById('downloadedBar');
  const waitingBarElement = document.getElementById('waitingBar');
  
  // Track total pages for progress calculations
  let totalPagesCount = 0;
  
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
    totalPagesCount = totalPages; // Store for progress calculations
    
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
    
    // Reset progress bars
    downloadedBarElement.style.width = '0%';
    waitingBarElement.style.width = '0%';
    
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
          
          // Update progress bar if we have total pages info
          if (totalPagesCount > 0) {
            const downloaded = parseInt(request.pages) || 0;
            const percentComplete = Math.min(100, Math.round((downloaded / totalPagesCount) * 100));
            downloadedBarElement.style.width = percentComplete + '%';
            console.log("Updated downloadedBar width to", percentComplete + '%'); // Add logging
          }
        }
        break;
        
      case "waitingPages":
        if (request.pages && request.pages.length > 0) {
          waitingPagesElement.textContent = request.pages;
          
          // Update waiting progress bar if we have total pages info
          if (totalPagesCount > 0 && request.pages !== '-') {
            const waiting = parseInt(request.pages) || 0;
            const percentWaiting = Math.min(100, Math.round((waiting / totalPagesCount) * 100));
            waitingBarElement.style.width = percentWaiting + '%';
            console.log("Updated waitingBar width to", percentWaiting + '%'); // Add logging
          } else {
            // If we're in initial "Đang tải..." state
            waitingBarElement.style.width = '100%';
            console.log("Set waitingBar to 100% (loading state)"); // Add logging
          }
        }
        break;
        
      case "downloadComplete":
        statusMessage.textContent = "✅ Đã hoàn tất tải tất cả trang!";
        statusMessage.className = "success";
        startButton.disabled = false;
        startButton.textContent = "Bắt đầu Tải";
        waitingPagesElement.textContent = "-";
        isProcessing = false;
        
        // Complete the progress bars
        downloadedBarElement.style.width = '100%';
        waitingBarElement.style.width = '0%';
        
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

  // Detect pages button click handler
  detectPagesBtn.addEventListener('click', function() {
    detectPagesBtn.textContent = 'Đang phát hiện...';
    
    // Execute script in the active Google Docs tab to detect page count
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: detectGoogleDocsPageCount
      }, (results) => {
        detectPagesBtn.textContent = 'Phát hiện';
        
        if (results && results[0] && results[0].result) {
          totalPagesInput.value = results[0].result;
          statusMessage.textContent = `Đã phát hiện ${results[0].result} trang từ Google Docs.`;
          statusMessage.className = 'success';
        } else {
          statusMessage.textContent = 'Không thể phát hiện số trang. Hãy kiểm tra lại hoặc nhập thủ công.';
          statusMessage.className = 'error';
        }
      });
    });
  });

  // Function to detect Google Docs page count
  function detectGoogleDocsPageCount() {
    try {
      // Look for the tooltip element that shows page numbers
      const tooltips = document.querySelectorAll('div[class*="jfk-tooltip-content"]');
      let pageCountText = '';
      
      // Search for a tooltip with page numbers "X of Y"
      for (let tooltip of tooltips) {
        if (tooltip.textContent && tooltip.textContent.match(/\d+\s+of\s+\d+/i)) {
          pageCountText = tooltip.textContent;
          break;
        }
      }
      
      // If not found in tooltips, try to find it in the status bar
      if (!pageCountText) {
        const statusElements = document.querySelectorAll('.docs-status-container *');
        for (let element of statusElements) {
          if (element.textContent && element.textContent.match(/\d+\s+of\s+\d+/i)) {
            pageCountText = element.textContent;
            break;
          }
        }
      }
      
      if (pageCountText) {
        // Extract the total page count (the number after "of")
        const match = pageCountText.match(/of\s+(\d+)/i);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
      }
      
      return null;
    } catch (error) {
      console.error("Error detecting page count:", error);
      return null;
    }
  }
  
  // Add this debugging function to check if the progress bar elements exist
  function checkProgressBarElements() {
    console.log("Progress bar elements check:");
    console.log("downloadedBarElement exists:", !!downloadedBarElement);
    console.log("waitingBarElement exists:", !!waitingBarElement);
    
    if (downloadedBarElement) {
      console.log("downloadedBarElement current width:", downloadedBarElement.style.width);
    }
    
    if (waitingBarElement) {
      console.log("waitingBarElement current width:", waitingBarElement.style.width);
    }
  }
  
  // Call this check after DOM is loaded
  setTimeout(checkProgressBarElements, 500);
  
  // Also initialize the progress bars to ensure they're visible
  if (downloadedBarElement) {
    downloadedBarElement.style.width = '0%';
  }
  
  if (waitingBarElement) {
    waitingBarElement.style.width = '0%';
  }
});
