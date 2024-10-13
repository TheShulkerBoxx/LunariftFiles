/**
 * API Communication Module
 * Handles all server communication
 */

const API = {
    baseURL: '',

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

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
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
