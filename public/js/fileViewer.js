/**
 * File Viewer Module
 * Handles previewing files in a modal
 */

const FileViewer = {
    /**
     * Initialize the viewer
     */
    init() {
        this.createViewerModal();

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        });
    },

    /**
     * Create the viewer modal element
     */
    createViewerModal() {
        if (document.getElementById('fileViewerModal')) return;

        const modal = document.createElement('div');
        modal.id = 'fileViewerModal';
        // Flex center for lightbox feel, backdrop blur
        modal.className = 'fixed inset-0 z-[100] hidden bg-black/90 flex items-center justify-center backdrop-blur-sm';

        // Force geometry
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';

        // Close when clicking empty space
        modal.onclick = (e) => {
            if (e.target === modal || e.target.id === 'viewerWrapper') {
                this.close();
            }
        };

        modal.innerHTML = `
            <div id="viewerWrapper" class="w-full h-full flex items-center justify-center p-4 relative overflow-hidden">
                <div id="viewerContent" class="relative flex items-center justify-center pointer-events-auto transition-transform duration-100 ease-out origin-center">
                    <!-- Dynamic Content -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    /**
     * Open a file in the viewer
     * @param {Object} file - File object {id, name, size}
     */
    open(file) {
        console.log('[FileViewer] Opening file:', file.name);
        const modal = document.getElementById('fileViewerModal');
        const content = document.getElementById('viewerContent');

        if (!modal) {
            console.error('[FileViewer] Modal element not found!');
            return;
        }

        // Reset Zoom
        this.cleanupZoom();

        // Determine type
        const ext = file.name.split('.').pop().toLowerCase();
        let html = '';
        const url = API.getDownloadURL(file.id, true);

        // --- IMAGES ---
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
            // Constrain image to 90vw/90vh, allow object-contain to keep aspect ratio
            // ID 'viewerImage' for zoom logic
            html = `<img id="viewerImage" src="${url}" style="max-width: 90vw; max-height: 90vh; cursor: zoom-in;" class="rounded-lg shadow-2xl select-none" alt="${file.name}">`;

            // Wait for render then setup zoom
            requestAnimationFrame(() => this.setupImageZoom());
        }

        // --- VIDEO ---
        else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            html = `
                <video controls autoplay style="max-width: 90vw; max-height: 90vh;" class="rounded-lg shadow-2xl outline-none bg-black">
                    <source src="${url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
        }

        // --- AUDIO ---
        else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
            html = `
                <div class="bg-white p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4 min-w-[300px]">
                    <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                        <i class="fas fa-music text-3xl text-blue-500"></i>
                    </div>
                    <h3 class="text-gray-800 font-medium">${file.name}</h3>
                    <audio controls autoplay class="w-full">
                        <source src="${url}" type="audio/mpeg">
                    </audio>
                </div>
            `;
        }

        // --- PDF ---
        else if (ext === 'pdf') {
            html = `
                <div class="bg-white w-[90vw] h-[90vh] rounded-lg shadow-2xl overflow-hidden relative">
                    <object data="${url}" type="application/pdf" class="w-full h-full">
                        <div class="flex flex-col items-center justify-center h-full text-slate-500">
                            <p class="mb-4">Unable to display PDF directly.</p>
                            <a href="${url}" class="text-blue-600 hover:text-blue-800 underline">Click to download</a>
                        </div>
                    </object>
                </div>
            `;
        }

        // --- TXT / CODE ---
        else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'ini', 'conf', 'yml', 'yaml', 'sh', 'env'].includes(ext)) {
            // White container, scrollable
            html = `<div class="bg-white w-[80vw] h-[80vh] flex flex-col items-center justify-center rounded-lg shadow-2xl overflow-hidden"><div class="loading-spinner mb-4 border-blue-500"></div><p class="text-gray-500">Loading text...</p></div>`;
            this.fetchTextContent(url);
        }

        // --- HEIC ---
        else if (['heic', 'heif'].includes(ext)) {
            html = `<div class="text-white flex flex-col items-center"><div class="loading-spinner mb-4"></div><p>Converting HEIC...</p></div>`;
            this.renderHEIC(url);
        }

        // --- DOCX ---
        else if (['docx'].includes(ext)) {
            // White container, scrollable
            html = `<div class="bg-white w-[90vw] h-[90vh] flex flex-col items-center justify-center rounded-lg shadow-2xl overflow-hidden"><div class="loading-spinner mb-4 border-blue-500"></div><p class="text-gray-500">Rendering Document...</p></div>`;
            this.renderDOCX(url);
        }

        // --- UNSUPPORTED ---
        else {
            let message = "Preview not available";
            let iconClass = 'fa-file';

            if (['doc', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
                iconClass = 'fa-file-word';
                message = "This document format cannot be previewed directly.";
            }

            html = `
                <div class="text-center p-10 bg-white rounded-xl shadow-2xl max-w-md">
                    <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas ${iconClass} text-4xl text-gray-400"></i>
                    </div>
                    <h3 class="text-xl font-semibold text-gray-800 mb-2">${file.name}</h3>
                    <p class="text-gray-500 mb-6">${message}</p>
                    <button onclick="API.downloadFile('${file.id}', '${file.name}')" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition shadow-md">
                        Download File
                    </button>
                </div>
            `;
        }

        content.innerHTML = html;

        // Final Display Logic
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
    },

    /**
     * Setup Image Zoom Logic
     */
    setupImageZoom() {
        const img = document.getElementById('viewerImage');
        const content = document.getElementById('viewerContent');
        if (!img) return;

        let scale = 1;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let translateX = 0;
        let translateY = 0;

        // Wheel Zoom
        this._wheelHandler = (e) => {
            e.preventDefault();
            const delta = e.deltaY * -0.01;
            const newScale = Math.min(Math.max(1, scale + delta), 4); // Min 1x, Max 4x

            if (newScale !== scale) {
                scale = newScale;
                content.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
                img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
            }
        };

        // Drag Start
        this._mouseDownHandler = (e) => {
            if (scale > 1) {
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                img.style.cursor = 'grabbing';
            }
        };

        // Dragging
        this._mouseMoveHandler = (e) => {
            if (isDragging) {
                e.preventDefault();
                translateX = e.clientX - startX;
                translateY = e.clientY - startY;
                content.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
            }
        };

        // Drag End
        this._mouseUpHandler = () => {
            isDragging = false;
            if (img) img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
        };

        content.addEventListener('wheel', this._wheelHandler);
        content.addEventListener('mousedown', this._mouseDownHandler);
        window.addEventListener('mousemove', this._mouseMoveHandler);
        window.addEventListener('mouseup', this._mouseUpHandler);
    },

    /**
     * Cleanup Zoom Listeners
     */
    cleanupZoom() {
        const content = document.getElementById('viewerContent');
        if (content) {
            content.style.transform = 'none';
            if (this._wheelHandler) content.removeEventListener('wheel', this._wheelHandler);
            if (this._mouseDownHandler) content.removeEventListener('mousedown', this._mouseDownHandler);
        }
        if (this._mouseMoveHandler) window.removeEventListener('mousemove', this._mouseMoveHandler);
        if (this._mouseUpHandler) window.removeEventListener('mouseup', this._mouseUpHandler);
    },

    /**
     * Render HEIC image
     */
    async renderHEIC(url) {
        try {
            if (!window.heic2any) {
                throw new Error('HEIC library not loaded');
            }

            const res = await fetch(url);
            const blob = await res.blob();

            const conversionResult = await heic2any({
                blob,
                toType: "image/jpeg",
                quality: 0.8
            });

            const jpgBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            const imgUrl = URL.createObjectURL(jpgBlob);

            const content = document.getElementById('viewerContent');
            // HEIC gets same zoom capability
            content.innerHTML = `<img id="viewerImage" src="${imgUrl}" style="max-width: 90vw; max-height: 90vh; cursor: zoom-in;" class="rounded-lg shadow-2xl select-none">`;
            requestAnimationFrame(() => this.setupImageZoom());

        } catch (error) {
            console.error('HEIC Error:', error);
            this.showError('Failed to convert HEIC image');
        }
    },

    /**
     * Render DOCX document
     */
    async renderDOCX(url) {
        try {
            if (!window.docx) {
                throw new Error('DOCX library not loaded');
            }

            const res = await fetch(url);
            const blob = await res.blob();

            const content = document.getElementById('viewerContent');
            // Clear loading spinner and set container
            // Ensure container allows scroll
            content.innerHTML = `<div id="docx-container" class="docx-wrapper bg-white text-black p-8 w-[90vw] h-[90vh] overflow-auto rounded-lg shadow-lg"></div>`;

            await docx.renderAsync(blob, document.getElementById('docx-container'), null, {
                className: "docx-content",
                inWrapper: false
            });
        } catch (error) {
            console.error('DOCX Error:', error);
            this.showError('Failed to render DOCX document');
        }
    },

    /**
     * Show Error Message
     */
    showError(message) {
        document.getElementById('viewerContent').innerHTML = `
            <div class="text-center text-red-400 p-8 bg-white rounded-lg shadow-xl">
                <i class="fas fa-exclamation-circle text-4xl mb-4"></i>
                <p>${message}</p>
            </div>
        `;
    },

    /**
     * Fetch and display text content
     */
    async fetchTextContent(url) {
        try {
            const res = await fetch(url);
            const text = await res.text();
            const content = document.getElementById('viewerContent');

            // Simple escaping
            const escaped = text.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            // Text is already inside the white wrapper from open()
            content.innerHTML = `
                <div class="w-[80vw] h-[80vh] p-4 overflow-auto bg-white text-gray-800 font-mono text-sm rounded-lg shadow-2xl">
                    <pre>${escaped}</pre>
                </div>
            `;
        } catch (error) {
            document.getElementById('viewerContent').innerHTML = `
                <div class="text-center text-red-400 bg-white p-4 rounded">
                    <p>Failed to load text content</p>
                </div>
            `;
        }
    },

    /**
     * Close the viewer
     */
    close() {
        const modal = document.getElementById('fileViewerModal');
        // Clear content to stop video/audio playing
        document.getElementById('viewerContent').innerHTML = '';
        modal.classList.add('hidden');
        modal.style.display = 'none'; // Ensure hidden
        this.cleanupZoom();
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    FileViewer.init();
});
