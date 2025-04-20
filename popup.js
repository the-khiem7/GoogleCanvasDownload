document.addEventListener('DOMContentLoaded', function() {
  const startButton = document.getElementById('startBtn');
  const totalPagesInput = document.getElementById('totalPages');
  const statusMessage = document.getElementById('statusMessage');
  const downloadedPagesElement = document.getElementById('downloadedPages');
  const waitingPagesElement = document.getElementById('waitingPages');
  
  startButton.addEventListener('click', function() {
    const totalPages = parseInt(totalPagesInput.value);
    
    if (isNaN(totalPages) || totalPages <= 0) {
      statusMessage.textContent = "❌ Số trang không hợp lệ.";
      statusMessage.className = "error";
      return;
    }
    
    // Send message to content script to start download
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        {action: "startDownload", totalPages: totalPages},
        function(response) {
          if (response && response.status === "started") {
            startButton.disabled = true;
            statusMessage.textContent = "⏳ Đang khởi động...";
            downloadedPagesElement.textContent = "-";
            waitingPagesElement.textContent = "Đang tải...";
          }
        }
      );
    });
  });
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    switch(request.action) {
      case "downloadStatus":
        statusMessage.textContent = request.message;
        statusMessage.className = "";
        break;
        
      case "downloadedPages":
        downloadedPagesElement.textContent = request.pages;
        break;
        
      case "waitingPages":
        waitingPagesElement.textContent = request.pages;
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
  });
});
