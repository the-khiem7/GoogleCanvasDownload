document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startBtn');
  const totalPagesInput = document.getElementById('totalPages');
  const statusMessage = document.getElementById('statusMessage');
  const downloadedPagesElement = document.getElementById('downloadedPages');
  const waitingPagesElement = document.getElementById('waitingPages');
  
  // Set initial button state
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    // Check if we're on Google Docs
    if (!tabs[0].url.includes('docs.google.com')) {
      startButton.disabled = true;
      statusMessage.textContent = "❌ Này chỉ hoạt động trên Google Docs";
      statusMessage.className = "error";
    }
  });
  
  startButton.addEventListener('click', function() {
    const totalPages = parseInt(totalPagesInput.value);
    
    if (isNaN(totalPages) || totalPages <= 0) {
      statusMessage.textContent = "❌ Số trang không hợp lệ.";
      statusMessage.className = "error";
      return;
    }
    
    // Show loading status
    startButton.disabled = true;
    statusMessage.textContent = "⏳ Đang khởi động...";
    statusMessage.className = "";
    downloadedPagesElement.textContent = "-";
    waitingPagesElement.textContent = "-";
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tabId = tabs[0].id;
      
      // First try direct message to see if content script is already loaded
      chrome.tabs.sendMessage(
        tabId,
        {action: "ping"},
        function(response) {
          if (chrome.runtime.lastError) {
            console.log("Content script not yet loaded, injecting it now...");
            
            // If content script isn't loaded, inject it programmatically
            chrome.scripting.executeScript({
              target: {tabId: tabId},
              files: ['content.js']
            }).then(() => {
              console.log("Content script injected successfully");
              // Wait a short time for the script to initialize
              setTimeout(() => {
                sendStartDownloadMessage(tabId, totalPages);
              }, 500);
            }).catch(error => {
              console.error("Error injecting content script:", error);
              statusMessage.textContent = "❌ Không thể chạy script. Vui lòng kiểm tra quyền truy cập.";
              statusMessage.className = "error";
              startButton.disabled = false;
            });
          } else {
            // Content script is already loaded, send start message
            sendStartDownloadMessage(tabId, totalPages);
          }
        }
      );
    });
  });
  
  function sendStartDownloadMessage(tabId, totalPages) {
    chrome.tabs.sendMessage(
      tabId,
      {action: "startDownload", totalPages: totalPages},
      function(response) {
        if (chrome.runtime.lastError) {
          console.error("Error sending startDownload message:", chrome.runtime.lastError);
          statusMessage.textContent = "❌ Không thể kết nối với trang. Vui lòng tải lại trang và thử lại.";
          statusMessage.className = "error";
          startButton.disabled = false;
        } else if (response && response.status === "started") {
          // Success
          downloadedPagesElement.textContent = "-";
          waitingPagesElement.textContent = "Đang tải...";
        } else if (response && response.status === "already_downloading") {
          statusMessage.textContent = "⚠️ Đã có quá trình tải đang chạy!";
          startButton.disabled = true;
        }
      }
    );
  }
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Popup received message:", request);
    
    if (request.action === "downloadFile") {
      // Handle download request from content script
      const folderPath = request.folderName || "GoogleCanvasDownload";
      
      chrome.downloads.download({
        url: request.dataUrl,
        filename: folderPath + '/' + request.fileName,
        saveAs: false
      }, downloadId => {
        if (chrome.runtime.lastError) {
          console.error("Download error:", chrome.runtime.lastError);
          sendResponse({success: false, error: chrome.runtime.lastError.message});
        } else {
          sendResponse({success: true, downloadId: downloadId});
        }
      });
      
      return true; // Required for async sendResponse
    }
    
    switch(request.action) {
      case "downloadStatus":
        statusMessage.textContent = request.message;
        statusMessage.className = "";
        break;
        
      case "downloadedPages":
        console.log("Updating downloaded pages to:", request.pages);
        if (request.pages && request.pages.length > 0) {
          downloadedPagesElement.textContent = request.pages;
        }
        break;
        
      case "waitingPages":
        console.log("Updating waiting pages to:", request.pages);
        if (request.pages && request.pages.length > 0) {
          waitingPagesElement.textContent = request.pages;
        }
        break;
        
      case "downloadComplete":
        statusMessage.textContent = "✅ Đã hoàn tất tải tất cả trang!";
        statusMessage.className = "success";
        startButton.disabled = false;
        waitingPagesElement.textContent = "-";
        break;
        
      case "downloadError":
        statusMessage.textContent = "❌ " + request.error;
        statusMessage.className = "error";
        startButton.disabled = false;
        break;
    }
    
    // Keep the popup open when messages are received
    return true;
  });
});
