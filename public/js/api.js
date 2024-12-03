/**
 * API Communication Module
 * Handles all server communication
 */

const API = {
    baseURL: '',

    // Track downloaded filenames in current session for deduplication
    downloadedFilenames: new Map(),

    /**
     * Make an API request with automatic token injection
     */
    async request(endpoint, options = {}) {
        const url = this.baseURL + endpoint;

        // Add authorization header if token exists
        const headers = options.headers || {};
        if (AppState.user.token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${AppState.user.token}`;
        }

        // Merge options
        const fetchOptions = {
            ...options,
            headers
        };

        // Don't set Content-Type for FormData
        if (!(options.body instanceof FormData) && options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, fetchOptions);

            // Handle 401 Unauthorized
            if (response.status === 401) {
                AppState.clearUser();
                UI.showNotification('Session expired. Please log in again.', 'error');
                Auth.showAuthPage();
                return null;
            }

            // Handle other errors
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },

    /**
     * Login user
     */
    async login(username, password) {
        const response = await this.request('/api/login', {
            method: 'POST',
            skipAuth: true,
            body: JSON.stringify({ username, password })
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Register new user
     */
    async register(username, password) {
        const response = await this.request('/api/register', {
            method: 'POST',
            skipAuth: true,
            body: JSON.stringify({ username, password })
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Sync files and folders
     */
    async sync() {
        const response = await this.request('/api/sync', {
            method: 'GET'
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Upload files
     */
    async uploadFile(file, path, batchIndex = 1, batchTotal = 1) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);
        formData.append('batchIndex', batchIndex);
        formData.append('batchTotal', batchTotal);

        const response = await this.request('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Upload large file using streaming (for files >50MB)
     * Uses streaming endpoint that uploads chunks to Discord as they arrive
     * IMPORTANT: path must be appended BEFORE file so server receives it first
     */
    async uploadFileStream(file, path) {
        const formData = new FormData();
        // Path MUST come before file - multipart sends in append order
        formData.append('path', path);
        formData.append('file', file);

        const response = await this.request('/api/upload-stream', {
            method: 'POST',
            body: formData
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Upload very large file using chunked upload (for files that exceed proxy limits)
     * Splits file into 96MB chunks and uploads sequentially to avoid 413 errors
     * @param {File} file - File to upload
     * @param {string} path - Target path
     * @param {Function} onProgress - Progress callback (chunkIndex, totalChunks, percent)
     * @returns {Promise<Object>} Upload result
     */
    async uploadFileChunked(file, path, onProgress = null) {
        const CHUNK_SIZE = 96 * 1024 * 1024; // 96MB chunks (multiple of 8MB for Discord)
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        console.log(`[API] Starting chunked upload: ${file.name} (${totalChunks} chunks, ${(file.size / 1024 / 1024).toFixed(2)}MB)`);

        // Step 1: Initialize the chunked upload session
        const initResponse = await this.request('/api/upload-chunked/init', {
            method: 'POST',
            body: JSON.stringify({
                filename: file.name,
                totalChunks: totalChunks,
                totalSize: file.size,
                path: path
            })
        });

        if (!initResponse) {
            throw new Error('Failed to initialize chunked upload');
        }

        const { uploadId } = await initResponse.json();
        console.log(`[API] Chunked upload initialized: ${uploadId}`);

        // Step 2: Upload each chunk
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('uploadId', uploadId);
            formData.append('chunkIndex', chunkIndex.toString());
            formData.append('chunk', chunk, `chunk_${chunkIndex}`);

            console.log(`[API] Uploading chunk ${chunkIndex + 1}/${totalChunks} (${((end - start) / 1024 / 1024).toFixed(2)}MB)`);

            const chunkResponse = await this.request('/api/upload-chunked/chunk', {
                method: 'POST',
                body: formData
            });

            if (!chunkResponse) {
                // Try to cancel the upload on failure
                await this.request(`/api/upload-chunked/${uploadId}`, { method: 'DELETE' }).catch(() => {});
                throw new Error(`Failed to upload chunk ${chunkIndex + 1}`);
            }

            const chunkResult = await chunkResponse.json();

            // Report progress
            if (onProgress) {
                onProgress(chunkIndex + 1, totalChunks, chunkResult.progress);
            }
        }

        // Step 3: Finalize the upload
        console.log(`[API] Finalizing chunked upload: ${uploadId}`);
        const finalizeResponse = await this.request('/api/upload-chunked/finalize', {
            method: 'POST',
            body: JSON.stringify({ uploadId })
        });

        if (!finalizeResponse) {
            throw new Error('Failed to finalize chunked upload');
        }

        const result = await finalizeResponse.json();
        console.log(`[API] Chunked upload complete: ${file.name}`);

        return result;
    },

    /**
     * Create new folder
     */
    async createFolder(path) {
        const response = await this.request('/api/create-folder', {
            method: 'POST',
            body: JSON.stringify({ path })
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Delete item (file or folder)
     */
    async deleteItem(id, isFolder) {
        const response = await this.request('/api/item', {
            method: 'DELETE',
            body: JSON.stringify({ id, isFolder })
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Nuke all files
     */
    async nuke() {
        const response = await this.request('/api/nuke', {
            method: 'POST'
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Check latency
     */
    async ping() {
        const start = Date.now();
        const response = await this.request('/api/ping', {
            method: 'GET'
        });

        if (!response) return null;
        const latency = Date.now() - start;
        const data = await response.json();
        return { ...data, clientLatency: latency };
    },

    /**
     * Get storage info
     */
    async getStorageInfo() {
        const response = await this.request('/api/storage-info', {
            method: 'GET'
        });

        if (!response) return null;
        return await response.json();
    },

    /**
     * Get file download URL (for direct download)
     */
    getDownloadURL(fileId, inline = false) {
        const token = encodeURIComponent(AppState.user.token || '');
        const inlineParam = inline ? '&inline=true' : '';
        return `/api/download/${fileId}?token=${token}${inlineParam}`;
    },

    /**
     * Get unique filename for download (handles duplicates with (1), (2), etc.)
     */
    getUniqueFilename(fileName) {
        const count = this.downloadedFilenames.get(fileName) || 0;
        this.downloadedFilenames.set(fileName, count + 1);

        if (count === 0) {
            return fileName;
        }

        // Split filename into name and extension
        const lastDot = fileName.lastIndexOf('.');
        if (lastDot === -1) {
            return `${fileName} (${count})`;
        }

        const name = fileName.substring(0, lastDot);
        const ext = fileName.substring(lastDot);
        return `${name} (${count})${ext}`;
    },

    /**
     * Clear download filename tracking (call after bulk download completes)
     */
    clearDownloadTracking() {
        this.downloadedFilenames.clear();
    },

    /**
     * Download a file
     * Triggers browser download via hidden link
     */
    async downloadFile(fileId, fileName) {
        try {
            const response = await this.request(`/api/download/${fileId}`, {
                method: 'GET'
            });

            if (!response) return false;

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Get unique filename for duplicates
            const uniqueName = this.getUniqueFilename(fileName);

            const a = document.createElement('a');
            a.href = url;
            a.download = uniqueName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            window.URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error('Download failed:', error);
            throw error;
        }
    },

    /**
     * Preview a file (open in new tab for viewable types)
     */
    previewFile(fileId) {
        // Open in new tab with authentication header via fetch
        window.open(this.getDownloadURL(fileId, true), '_blank');
    }
};
