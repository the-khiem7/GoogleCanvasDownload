(function () {
    const processedZIndexes = new Set();
    let totalPages = parseInt(prompt("📄 Nhập tổng số trang trong Google Doc:", "10"));
    
    if (isNaN(totalPages) || totalPages <= 0) {
        alert("❌ Số trang không hợp lệ.");
        return;
    }

    // Hàm yêu cầu người dùng chọn thư mục (sử dụng File System Access API)
    async function getDirectoryHandle() {
        const dirHandle = await window.showDirectoryPicker();
        return dirHandle;
    }

    // Yêu cầu người dùng chọn thư mục
    async function requestDirectoryAndDownload() {
        const directoryHandle = await getDirectoryHandle();

        function extractCanvasData() {
            const canvases = document.querySelectorAll('canvas.kix-canvas-tile-content');
            if (canvases.length === 0) {
                console.log('Không tìm thấy canvas nào.');
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
                downloadedPages.push(displayZ);
            });

            if (skippedZIndexes.length > 0) {
                console.log(`⚠️ Bỏ qua Trang: ${[...new Set(skippedZIndexes)].join(', ')}`);
            }

            // Kiểm tra liền mạch
            const missingZ = [];
            for (let i = 0; i < totalPages; i++) {
                if (!processedZIndexes.has(i)) {
                    missingZ.push(i + 1);
                }
            }

            // Nổi bật log "Trang đang chờ" với màu đen
            if (missingZ.length > 0) {
                console.log(`%c📥 Trang đang chờ: ${missingZ.join(', ')}`, 'color: black; font-weight: bold; font-size: 14px;');
            }

            // Gộp lại "Đã tải xuống" thành 1 dòng
            if (downloadedPages.length > 0) {
                console.log(`📸 Đã tải xuống Trang: ${downloadedPages.join(', ')}`);
            }

            // Nếu đủ trang và không thiếu => dừng
            if (processedZIndexes.size >= totalPages && missingZ.length === 0) {
                console.log("✅ Đã hoàn tất tải tất cả trang!");
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
                setTimeout(startExtraction, 1000);  // Giảm thời gian delay xuống 1 giây
            }
        }

        startExtraction();
    }

    // Bắt đầu yêu cầu thư mục và tải file
    requestDirectoryAndDownload();
})();
