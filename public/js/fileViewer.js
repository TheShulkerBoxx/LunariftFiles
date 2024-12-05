/**
 * File Viewer Module
 * Handles previewing files in a centered modal with pre-fetching and gallery navigation
 */

const FileViewer = {
    // Cache for pre-fetched file blobs
    cache: new Map(),
    // Current file being viewed
    currentFile: null,
    // List of viewable files in current directory
    viewableFiles: [],
    // Current index in viewable files
    currentIndex: -1,

    /**
     * Initialize the viewer
     */
    init() {
        this.createViewerModal();

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isOpen()) {
                if (e.key === 'Escape') {
                    this.close();
                } else if (e.key === 'ArrowLeft') {
                    this.navigatePrev();
                } else if (e.key === 'ArrowRight') {
                    this.navigateNext();
                }
            }
        });
    },

    /**
     * Check if viewer is open
     */
    isOpen() {
        const modal = document.getElementById('fileViewerModal');
        return modal && modal.style.display === 'flex';
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
            if (e.target === modal || e.target.id === 'viewerContainer') {
                this.close();
            }
        };

        modal.innerHTML = `
            <div class="viewer-header">
                <span id="viewerFilename" class="viewer-filename"></span>
                <div class="viewer-controls">
                    <span id="viewerCounter" class="viewer-counter"></span>
                    <button id="viewerDownloadBtn" class="viewer-control-btn" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button id="viewerCloseBtn" class="viewer-control-btn close-btn" title="Close (Esc)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <button id="viewerPrevBtn" class="viewer-nav prev" title="Previous (Left Arrow)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <button id="viewerNextBtn" class="viewer-nav next" title="Next (Right Arrow)">
                <i class="fas fa-chevron-right"></i>
            </button>
            <div id="viewerContainer" class="viewer-container">
                <div id="viewerContent" class="viewer-content">
                    <!-- Dynamic Content -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Event handlers
        document.getElementById('viewerCloseBtn').onclick = () => this.close();
        document.getElementById('viewerDownloadBtn').onclick = () => this.downloadCurrent();
        document.getElementById('viewerPrevBtn').onclick = () => this.navigatePrev();
        document.getElementById('viewerNextBtn').onclick = () => this.navigateNext();
    },

    /**
     * Get supported file types for preview
     */
    getSupportedExtensions() {
        return [
            // Images
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'heic', 'heif',
            // Video
            'mp4', 'webm', 'mov', 'mkv',
            // Audio
            'mp3', 'wav', 'ogg', 'flac',
            // Documents
            'pdf', 'txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'ini',
            'conf', 'yml', 'yaml', 'sh', 'env', 'docx',
            // Web archives
            'mhtml', 'mht'
        ];
    },

    /**
     * Check if file is viewable
     */
    isViewable(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        return this.getSupportedExtensions().includes(ext);
    },

    /**
     * Pre-fetch files in the current directory for instant viewing
     * Called when files are loaded/rendered
     */
    prefetchCurrentDirectory() {
        const files = AppState.getCurrentFiles();
        const viewable = files.filter(f => this.isViewable(f.name) && f.status !== 'PENDING');

        // Clear old cache entries not in current directory
        const currentIds = new Set(viewable.map(f => f.id));
        for (const [id] of this.cache) {
            if (!currentIds.has(id)) {
                this.cache.delete(id);
            }
        }

        // Pre-fetch files (under 50MB) for instant viewing
        viewable.forEach(file => {
            if (!this.cache.has(file.id) && file.size < 50 * 1024 * 1024) {
                this.prefetchFile(file);
            }
        });

        // Store viewable files list for navigation
        this.viewableFiles = viewable;
    },

    /**
     * Pre-fetch a single file
     */
    async prefetchFile(file) {
        try {
            const url = API.getDownloadURL(file.id, true);
            const response = await fetch(url);
            if (response.ok) {
                const blob = await response.blob();
                this.cache.set(file.id, {
                    blob,
                    url: URL.createObjectURL(blob),
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            // Silently fail - file will be fetched on demand
            console.debug(`[FileViewer] Prefetch failed for ${file.name}:`, error.message);
        }
    },

    /**
     * Get file URL (from cache or generate new)
     */
    getFileURL(file, inline = true) {
        const cached = this.cache.get(file.id);
        if (cached) {
            return cached.url;
        }
        return API.getDownloadURL(file.id, inline);
    },

    /**
     * Get cached blob for a file
     */
    getCachedBlob(fileId) {
        const cached = this.cache.get(fileId);
        return cached ? cached.blob : null;
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

        // Store current file
        this.currentFile = file;

        // Find index in viewable files
        this.currentIndex = this.viewableFiles.findIndex(f => f.id === file.id);

        // Reset zoom and content
        this.cleanupZoom();
        content.innerHTML = '';

        // Update header
        this.updateHeader();
        this.updateNavigation();

        // Render content based on type
        this.renderFile(file);

        // Show modal
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    /**
     * Update the header with filename and counter
     */
    updateHeader() {
        document.getElementById('viewerFilename').textContent = this.currentFile.name;

        const counter = document.getElementById('viewerCounter');
        if (this.viewableFiles.length > 1 && this.currentIndex >= 0) {
            counter.textContent = `${this.currentIndex + 1} / ${this.viewableFiles.length}`;
            counter.style.display = 'block';
        } else {
            counter.style.display = 'none';
        }
    },

    /**
     * Update navigation buttons
     */
    updateNavigation() {
        const prevBtn = document.getElementById('viewerPrevBtn');
        const nextBtn = document.getElementById('viewerNextBtn');

        const hasMultiple = this.viewableFiles.length > 1;
        prevBtn.style.display = hasMultiple ? 'flex' : 'none';
        nextBtn.style.display = hasMultiple ? 'flex' : 'none';

        if (hasMultiple) {
            prevBtn.disabled = this.currentIndex <= 0;
            nextBtn.disabled = this.currentIndex >= this.viewableFiles.length - 1;
        }
    },

    /**
     * Navigate to previous file
     */
    navigatePrev() {
        if (this.currentIndex > 0) {
            const prevFile = this.viewableFiles[this.currentIndex - 1];
            this.open(prevFile);
        }
    },

    /**
     * Navigate to next file
     */
    navigateNext() {
        if (this.currentIndex < this.viewableFiles.length - 1) {
            const nextFile = this.viewableFiles[this.currentIndex + 1];
            this.open(nextFile);
        }
    },

    /**
     * Download current file
     */
    downloadCurrent() {
        if (this.currentFile) {
            API.downloadFile(this.currentFile.id, this.currentFile.name);
        }
    },

    /**
     * Render file content based on type
     */
    renderFile(file) {
        const content = document.getElementById('viewerContent');
        const ext = file.name.split('.').pop().toLowerCase();
        const url = this.getFileURL(file, true);

        // --- IMAGES ---
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
            content.innerHTML = `<img id="viewerImage" src="${url}" class="viewer-image" alt="${file.name}">`;
            const img = document.getElementById('viewerImage');
            img.onload = () => this.setupImageZoom();
            img.onerror = () => this.showError('Failed to load image');
        }

        // --- VIDEO ---
        else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            content.innerHTML = `
                <video controls autoplay class="viewer-video">
                    <source src="${url}" type="video/${ext === 'mov' ? 'quicktime' : ext}">
                    Your browser does not support the video tag.
                </video>
            `;
        }

        // --- AUDIO ---
        else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
            content.innerHTML = `
                <div class="viewer-audio">
                    <div class="audio-icon">
                        <i class="fas fa-music"></i>
                    </div>
                    <h3 class="audio-filename">${file.name}</h3>
                    <audio controls autoplay>
                        <source src="${url}" type="audio/${ext === 'mp3' ? 'mpeg' : ext}">
                        Your browser does not support the audio tag.
                    </audio>
                </div>
            `;
        }

        // --- PDF ---
        else if (ext === 'pdf') {
            content.innerHTML = `
                <div class="viewer-pdf-container">
                    <iframe src="${url}#toolbar=1&navpanes=0&scrollbar=1&view=FitH" class="viewer-pdf" type="application/pdf">
                        <div class="viewer-fallback">
                            <p>Unable to display PDF.</p>
                            <a href="${url}" class="download-link" target="_blank">Open in new tab</a>
                        </div>
                    </iframe>
                </div>
            `;
        }

        // --- TEXT FILES ---
        else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'ini', 'conf', 'yml', 'yaml', 'sh', 'env'].includes(ext)) {
            content.innerHTML = `
                <div class="viewer-document">
                    <div class="viewer-document-inner">
                        <div class="viewer-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Loading...</p>
                        </div>
                    </div>
                </div>
            `;
            this.fetchTextContent(file);
        }

        // --- HEIC ---
        else if (['heic', 'heif'].includes(ext)) {
            content.innerHTML = `
                <div class="viewer-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Converting HEIC image...</p>
                </div>
            `;
            this.renderHEIC(file);
        }

        // --- DOCX ---
        else if (ext === 'docx') {
            content.innerHTML = `
                <div class="viewer-docx-container">
                    <div class="viewer-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading document...</p>
                    </div>
                </div>
            `;
            this.renderDOCX(file);
        }

        // --- MHTML/MHT Web Archives ---
        else if (['mhtml', 'mht'].includes(ext)) {
            content.innerHTML = `
                <div class="viewer-mhtml-container">
                    <div class="viewer-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading web archive...</p>
                    </div>
                </div>
            `;
            this.renderMHTML(file);
        }

        // --- UNSUPPORTED ---
        else {
            content.innerHTML = `
                <div class="viewer-unsupported">
                    <div class="file-icon">
                        <i class="fas fa-file"></i>
                    </div>
                    <h3>${file.name}</h3>
                    <p>Preview not available for this file type</p>
                    <a href="${API.getDownloadURL(file.id, false)}" class="download-button">
                        <i class="fas fa-download"></i> Download File
                    </a>
                </div>
            `;
        }
    },

    /**
     * Close the viewer
     */
    close() {
        const modal = document.getElementById('fileViewerModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            this.cleanupZoom();
            this.currentFile = null;

            // Pause any playing media
            const video = modal.querySelector('video');
            const audio = modal.querySelector('audio');
            if (video) video.pause();
            if (audio) audio.pause();
        }
    },

    /**
     * Fetch text content from URL
     */
    async fetchTextContent(file) {
        const content = document.getElementById('viewerContent');
        const inner = content.querySelector('.viewer-document-inner');

        try {
            // Try cache first
            let text;
            const cached = this.getCachedBlob(file.id);
            if (cached) {
                text = await cached.text();
            } else {
                const url = this.getFileURL(file, true);
                const res = await fetch(url);
                text = await res.text();
            }

            inner.innerHTML = `<pre class="viewer-text">${this.escapeHtml(text)}</pre>`;
        } catch (error) {
            console.error('Text loading error:', error);
            this.showError('Failed to load text file');
        }
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
        const zoomStep = 0.25;

        // Double-click to toggle zoom
        img.ondblclick = (e) => {
            e.preventDefault();
            if (scale === 1) {
                scale = 2;
                img.style.cursor = 'grab';
            } else {
                scale = 1;
                translateX = 0;
                translateY = 0;
                img.style.cursor = 'zoom-in';
            }
            content.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
        };

        // Wheel Zoom
        this._wheelHandler = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
            const newScale = Math.max(minZoom, Math.min(maxZoom, scale + delta));

            if (newScale !== scale) {
                scale = newScale;
                if (scale === 1) {
                    translateX = 0;
                    translateY = 0;
                }
                content.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
                img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
            }
        };

        // Drag Start
        this._mouseDownHandler = (e) => {
            if (scale > 1) {
                isDragging = true;
                startX = e.clientX - translateX * scale;
                startY = e.clientY - translateY * scale;
                img.style.cursor = 'grabbing';
                e.preventDefault();
            }
        };

        // Dragging
        this._mouseMoveHandler = (e) => {
            if (isDragging) {
                e.preventDefault();
                translateX = (e.clientX - startX) / scale;
                translateY = (e.clientY - startY) / scale;
                content.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
            }
        };

        // Drag End
        this._mouseUpHandler = () => {
            isDragging = false;
            if (img) img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
        };

        content.addEventListener('wheel', this._wheelHandler, { passive: false });
        img.addEventListener('mousedown', this._mouseDownHandler);
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
        }
        const img = document.getElementById('viewerImage');
        if (img && this._mouseDownHandler) {
            img.removeEventListener('mousedown', this._mouseDownHandler);
        }
        if (this._mouseMoveHandler) window.removeEventListener('mousemove', this._mouseMoveHandler);
        if (this._mouseUpHandler) window.removeEventListener('mouseup', this._mouseUpHandler);
    },

    /**
     * Render HEIC image
     */
    async renderHEIC(file) {
        const content = document.getElementById('viewerContent');

        try {
            if (!window.heic2any) {
                throw new Error('HEIC library not loaded');
            }

            let blob = this.getCachedBlob(file.id);
            if (!blob) {
                const url = this.getFileURL(file, true);
                const res = await fetch(url);
                blob = await res.blob();
            }

            const conversionResult = await heic2any({
                blob,
                toType: "image/jpeg",
                quality: 0.9
            });

            const jpgBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            const imgUrl = URL.createObjectURL(jpgBlob);

            content.innerHTML = `<img id="viewerImage" src="${imgUrl}" class="viewer-image" alt="HEIC Image">`;
            const img = document.getElementById('viewerImage');
            img.onload = () => this.setupImageZoom();

        } catch (error) {
            console.error('HEIC Error:', error);
            this.showError('Failed to convert HEIC image');
        }
    },

    /**
     * Render DOCX document
     */
    async renderDOCX(file) {
        const content = document.getElementById('viewerContent');

        try {
            if (!window.docx) {
                throw new Error('DOCX library not loaded');
            }

            let blob = this.getCachedBlob(file.id);
            if (!blob) {
                const url = this.getFileURL(file, true);
                const res = await fetch(url);
                blob = await res.blob();
            }

            content.innerHTML = `
                <div class="viewer-docx-container">
                    <div id="docx-render" class="viewer-docx"></div>
                </div>
            `;

            const container = document.getElementById('docx-render');

            // Configure docx-preview options for best rendering
            await docx.renderAsync(blob, container, null, {
                className: 'docx-content',
                inWrapper: true,           // Use wrapper for proper page structure
                ignoreWidth: false,        // Respect document width
                ignoreHeight: true,        // Allow content to flow naturally
                ignoreFonts: false,        // Render document fonts
                breakPages: false,         // Don't break into separate pages (continuous scroll)
                renderHeaders: true,
                renderFooters: true,
                renderFootnotes: true,
                renderEndnotes: true,
                useBase64URL: true,         // Use base64 for embedded images
                renderChanges: false,       // Don't show tracked changes
                experimental: true          // Enable experimental features for better rendering
            });

        } catch (error) {
            console.error('DOCX Error:', error);
            this.showError('Failed to load document');
        }
    },

    /**
     * Render MHTML/MHT web archive
     */
    async renderMHTML(file) {
        const content = document.getElementById('viewerContent');

        try {
            let text;
            const cached = this.getCachedBlob(file.id);
            if (cached) {
                text = await cached.text();
            } else {
                const url = this.getFileURL(file, true);
                const res = await fetch(url);
                text = await res.text();
            }

            // Parse MHTML format
            const parsed = this.parseMHTML(text);

            if (!parsed.html) {
                throw new Error('Could not extract HTML from MHTML file');
            }

            // Create a blob URL for the processed HTML
            const htmlBlob = new Blob([parsed.html], { type: 'text/html' });
            const htmlUrl = URL.createObjectURL(htmlBlob);

            content.innerHTML = `
                <div class="viewer-mhtml-container">
                    <iframe
                        id="mhtml-frame"
                        src="${htmlUrl}"
                        class="viewer-mhtml"
                        sandbox="allow-same-origin"
                    ></iframe>
                </div>
            `;

            // Clean up blob URL when viewer closes
            const frame = document.getElementById('mhtml-frame');
            frame.onload = () => {
                // Revoke after a delay to ensure it's loaded
                setTimeout(() => URL.revokeObjectURL(htmlUrl), 1000);
            };

        } catch (error) {
            console.error('MHTML Error:', error);
            this.showError('Failed to load web archive');
        }
    },

    /**
     * Parse MHTML file and extract HTML with embedded resources
     */
    parseMHTML(mhtmlContent) {
        // Find the boundary string
        const boundaryMatch = mhtmlContent.match(/boundary="?([^"\r\n]+)"?/i);
        if (!boundaryMatch) {
            // Try to find HTML directly if no boundary (simple case)
            const htmlMatch = mhtmlContent.match(/<html[\s\S]*<\/html>/i);
            return { html: htmlMatch ? htmlMatch[0] : null, resources: {} };
        }

        const boundary = boundaryMatch[1];
        const parts = mhtmlContent.split('--' + boundary);

        const resources = {};
        let mainHtml = null;

        for (const part of parts) {
            if (part.trim() === '' || part.trim() === '--') continue;

            // Parse headers
            const headerEndIndex = part.indexOf('\r\n\r\n');
            if (headerEndIndex === -1) continue;

            const headers = part.substring(0, headerEndIndex);
            const body = part.substring(headerEndIndex + 4);

            // Get content type and location
            const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n;]+)/i);
            const contentLocationMatch = headers.match(/Content-Location:\s*([^\r\n]+)/i);
            const contentTransferEncodingMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);

            const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : '';
            const contentLocation = contentLocationMatch ? contentLocationMatch[1].trim() : '';
            const encoding = contentTransferEncodingMatch ? contentTransferEncodingMatch[1].trim().toLowerCase() : '';

            // Decode body if needed
            let decodedBody = body;
            if (encoding === 'base64') {
                try {
                    decodedBody = atob(body.replace(/\s/g, ''));
                } catch (e) {
                    decodedBody = body;
                }
            } else if (encoding === 'quoted-printable') {
                decodedBody = this.decodeQuotedPrintable(body);
            }

            // Store resource or identify main HTML
            if (contentType.includes('text/html')) {
                if (!mainHtml) {
                    mainHtml = decodedBody;
                }
            }

            if (contentLocation) {
                // Create data URL for embedded resources
                if (encoding === 'base64' && !contentType.includes('text/')) {
                    resources[contentLocation] = `data:${contentType};base64,${body.replace(/\s/g, '')}`;
                } else {
                    resources[contentLocation] = decodedBody;
                }
            }
        }

        // Replace resource references in HTML with data URLs
        if (mainHtml && Object.keys(resources).length > 0) {
            for (const [location, data] of Object.entries(resources)) {
                // Escape special regex characters in location
                const escapedLocation = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // Replace various URL formats
                mainHtml = mainHtml.replace(
                    new RegExp(`(src|href)=["']${escapedLocation}["']`, 'gi'),
                    `$1="${data}"`
                );
                mainHtml = mainHtml.replace(
                    new RegExp(`url\\(["']?${escapedLocation}["']?\\)`, 'gi'),
                    `url("${data}")`
                );
            }
        }

        return { html: mainHtml, resources };
    },

    /**
     * Decode quoted-printable encoding
     */
    decodeQuotedPrintable(str) {
        return str
            .replace(/=\r?\n/g, '') // Remove soft line breaks
            .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
            });
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
                    <button onclick="FileViewer.close()" class="download-button" style="background: #64748b;">
                        <i class="fas fa-times"></i> Close
                    </button>
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
