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
        modal.className = 'fixed inset-0 z-50 hidden bg-slate-900/95 flex flex-col';
        modal.innerHTML = `
            <div class="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900">
                <div class="flex items-center gap-3 overflow-hidden">
                    <span id="viewerFileIcon" class="text-xl text-blue-500"></span>
                    <h3 id="viewerFileName" class="text-white font-medium truncate"></h3>
                    <span id="viewerFileSize" class="text-xs text-slate-400"></span>
                </div>
                <div class="flex items-center gap-2">
                    <a id="viewerDownloadBtn" href="#" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition" title="Download">
                        <i class="fas fa-download"></i>
                    </a>
                    <button onclick="FileViewer.close()" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="viewerContent" class="flex-1 overflow-auto flex items-center justify-center p-4 relative">
                <!-- Content goes here -->
            </div>
        `;
        document.body.appendChild(modal);
    },

    /**
     * Open a file in the viewer
     * @param {Object} file - File object {id, name, size}
     */
    open(file) {
        const modal = document.getElementById('fileViewerModal');
        const content = document.getElementById('viewerContent');
        const nameEl = document.getElementById('viewerFileName');
        const sizeEl = document.getElementById('viewerFileSize');
        const iconEl = document.getElementById('viewerFileIcon');
        const downloadBtn = document.getElementById('viewerDownloadBtn');

        // Update Header
        nameEl.textContent = file.name;
        sizeEl.textContent = UI.formatBytes(file.size);
        downloadBtn.onclick = (e) => {
            e.preventDefault();
            API.downloadFile(file.id, file.name);
        };

        // Determine type
        const ext = file.name.split('.').pop().toLowerCase();
        let html = '';
        let iconClass = 'fa-file';

        const url = API.getDownloadURL(file.id, true);

        // --- IMAGES ---
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext)) {
            iconClass = 'fa-image';
            html = `<img src="${url}" class="max-w-full max-h-full object-contain rounded shadow-lg" alt="${file.name}">`;
        }

        // --- VIDEO ---
        else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            iconClass = 'fa-video';
            html = `
                <video controls autoplay class="max-w-full max-h-full rounded shadow-lg outline-none">
                    <source src="${url}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
        }

        // --- AUDIO ---
        else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
            iconClass = 'fa-music';
            html = `
                <div class="bg-slate-800 p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4">
                    <i class="fas fa-music text-6xl text-blue-500 mb-4"></i>
                    <audio controls autoplay class="w-full min-w-[300px]">
                        <source src="${url}" type="audio/mpeg">
                        Your browser does not support the audio element.
                    </audio>
                </div>
            `;
        }

        // --- PDF ---
        else if (ext === 'pdf') {
            iconClass = 'fa-file-pdf';
            html = `<iframe src="${url}" class="w-full h-full border-none rounded"></iframe>`;
        }

        // --- TXT / CODE ---
        else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'log', 'ini', 'conf', 'yml', 'yaml'].includes(ext)) {
            iconClass = 'fa-file-code';
            html = `<div class="loading-spinner"></div>`; // Placeholder
            this.fetchTextContent(url, ext);
        }

        // --- UNSUPPORTED ---
        else {
            iconClass = 'fa-file';
            let message = "Preview not available";

            if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
                iconClass = 'fa-file-word';
                message = "Microsoft Office files cannot be previewed directly.";
            } else if (['heic'].includes(ext)) {
                iconClass = 'fa-image';
                message = "HEIC files cannot be previewed in the browser.";
            }

            html = `
                <div class="text-center p-10 bg-slate-800 rounded-xl">
                    <i class="fas ${iconClass} text-6xl text-slate-600 mb-4 block"></i>
                    <p class="text-slate-300 mb-6">${message}</p>
                    <button onclick="API.downloadFile('${file.id}', '${file.name}')" class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">
                        <i class="fas fa-download mr-2"></i> Download File
                    </button>
                </div>
            `;
        }

        iconEl.className = `fas ${iconClass} text-xl text-blue-500`;
        content.innerHTML = html;
        modal.classList.remove('hidden');
    },

    /**
     * Fetch and display text content
     */
    async fetchTextContent(url, ext) {
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

            content.innerHTML = `
                <div class="w-full h-full p-4 overflow-auto bg-[#1e1e1e] text-slate-300 font-mono text-sm rounded">
                    <pre>${escaped}</pre>
                </div>
            `;
        } catch (error) {
            document.getElementById('viewerContent').innerHTML = `
                <div class="text-center text-red-400">
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
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    FileViewer.init();
});
