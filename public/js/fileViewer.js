/**
 * File Viewer Module
 * Handles previewing files in a centered modal with consistent sizing
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
        modal.className = 'file-viewer-modal';

        // Close when clicking backdrop
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.close();
            }
        };

        modal.innerHTML = `
            <div id="viewerContainer" class="viewer-container">
                <button id="closeViewerBtn" class="close-viewer-btn" title="Close (Esc)">
                    <i class="fas fa-times"></i>
                </button>
                <div id="viewerContent" class="viewer-content">
                    <!-- Dynamic Content -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close button handler
        document.getElementById('closeViewerBtn').onclick = () => this.close();
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
            html = `<img id="viewerImage" src="${url}" class="viewer-image" alt="${file.name}">`;
            content.innerHTML = html;
            requestAnimationFrame(() => this.setupImageZoom());
        }

        // --- VIDEO ---
        else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            html = `
                <video controls autoplay class="viewer-video">
                    <source src="${url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
            content.innerHTML = html;
        }

        // --- AUDIO ---
        else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
            html = `
                <div class="viewer-audio">
                    <div class="audio-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <h3 class="audio-filename">${file.name}</h3>
                    <audio controls autoplay>
                        <source src="${url}" type="audio/mpeg">
                        Your browser does not support the audio tag.
                    </audio>
                </div>
            `;
            content.innerHTML = html;
        }

        // --- PDF ---
        else if (ext === 'pdf') {
            html = `
                <div class="viewer-document">
                    <object data="${url}" type="application/pdf" class="viewer-pdf">
                        <div class="viewer-fallback">
                            <p>Unable to display PDF directly.</p>
                            <a href="${url}" class="download-link">Click to download</a>
                        </div>
                    </object>
                </div>
            `;
            content.innerHTML = html;
        }

        // --- TEXT FILES ---
        else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'ini', 'conf', 'yml', 'yaml', 'sh', 'env'].includes(ext)) {
            html = `
                <div class="viewer-document">
                    <div class="viewer-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading text...</p>
                    </div>
                </div>
            `;
            content.innerHTML = html;
            this.fetchTextContent(url);
        }

        // --- HEIC ---
        else if (['heic', 'heif'].includes(ext)) {
            html = `
                <div class="viewer-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Converting HEIC image...</p>
                </div>
            `;
            content.innerHTML = html;
            this.renderHEIC(url);
        }

        // --- DOCX ---
        else if (['docx'].includes(ext)) {
            html = `
                <div class="viewer-document">
                    <div class="viewer-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading document...</p>
                    </div>
                </div>
            `;
            content.innerHTML = html;
            this.renderDOCX(url);
        }

        // --- UNSUPPORTED ---
        else {
            html = `
                <div class="viewer-unsupported">
                    <i class="fas fa-file"></i>
                    <p>Preview not available for this file type</p>
                    <a href="${API.getDownloadURL(file.id, false)}" class="download-button">
                        <i class="fas fa-download"></i> Download File
                    </a>
                </div>
            `;
            content.innerHTML = html;
        }

        // Show modal
        modal.style.display = 'flex';
    },

    /**
     * Close the viewer
     */
    close() {
        const modal = document.getElementById('fileViewerModal');
        if (modal) {
            modal.style.display = 'none';
            this.cleanupZoom();
        }
    },

    /**
     * Fetch text content from URL
     */
    fetchTextContent(url) {
        const content = document.getElementById('viewerContent');
        
        fetch(url)
            .then(res => res.text())
            .then(text => {
                content.innerHTML = `
                    <div class="viewer-document">
                        <pre class="viewer-text">${this.escapeHtml(text)}</pre>
                    </div>
                `;
            })
            .catch(error => {
                console.error('Text loading error:', error);
                this.showError('Failed to load text file');
            });
    },

    /**
     * Setup image zoom functionality
     */
    setupImageZoom() {
        const content = document.getElementById('viewerContent');
        const img = document.getElementById('viewerImage');
        
        if (!img) return;

        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        const maxZoom = 5;
        const minZoom = 1;
        const zoomStep = 0.2;

        // Wheel Zoom
        this._wheelHandler = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
            const newScale = Math.max(minZoom, Math.min(maxZoom, scale + delta));
            
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
     * Cleanup zoom listeners
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
        const content = document.getElementById('viewerContent');
        
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

            content.innerHTML = `<img id="viewerImage" src="${imgUrl}" class="viewer-image" alt="HEIC Image">`;
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
        const content = document.getElementById('viewerContent');
        
        try {
            if (!window.docx) {
                throw new Error('DOCX library not loaded');
            }

            const res = await fetch(url);
            const blob = await res.blob();

            content.innerHTML = `<div id="docx-container" class="viewer-document viewer-docx"></div>`;
            
            const container = document.getElementById('docx-container');
            await docx.renderAsync(blob, container);

        } catch (error) {
            console.error('DOCX Error:', error);
            this.showError('Failed to load DOCX document');
        }
    },

    /**
     * Show error message
     */
    showError(message) {
        const content = document.getElementById('viewerContent');
        if (content) {
            content.innerHTML = `
                <div class="viewer-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    },

    /**
     * Escape HTML for text display
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
