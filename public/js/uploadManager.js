/**
 * Upload Manager Module
 * Handles file uploads with retry logic and progress tracking
 */

const UploadManager = {
    MAX_PARALLEL_UPLOADS: 3,
    MAX_RETRIES: 3,
    RETRY_DELAY_BASE: 1000,

    /**
     * Initialize upload manager
     */
    init() {
        this.attachEventListeners();
    },

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Upload menu toggle
        document.getElementById('uploadMenuBtn').onclick = () => {
            document.getElementById('uploadMenu').classList.toggle('hidden');
        };

        // Upload files
        document.getElementById('uploadFilesBtn').onclick = () => {
            document.getElementById('fileInput').click();
            document.getElementById('uploadMenu').classList.add('hidden');
        };

        // Upload folder
        document.getElementById('uploadFolderBtn').onclick = () => {
            document.getElementById('folderInput').click();
            document.getElementById('uploadMenu').classList.add('hidden');
        };

        // File input change
        document.getElementById('fileInput').onchange = (e) => {
            if (e.target.files.length > 0) {
                this.startUpload(Array.from(e.target.files));
                e.target.value = ''; // Reset
            }
        };

        // Folder input change
        document.getElementById('folderInput').onchange = (e) => {
            if (e.target.files.length > 0) {
                this.startUpload(Array.from(e.target.files));
                e.target.value = ''; // Reset
            }
        };

        // Cancel upload
        document.getElementById('cancelUploadBtn').onclick = () => {
            this.cancelUpload();
        };

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('uploadMenu');
            const btn = document.getElementById('uploadMenuBtn');
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    },

    /**
     * Start upload process
     */
    async startUpload(files) {
        if (files.length === 0) return;

        // Reset upload state
        AppState.uploads.active.clear();
        AppState.uploads.cancelled = false;
        AppState.uploads.startTime = Date.now();
        AppState.uploads.totalBytesUploaded = 0;

        // Show upload panel
        this.showUploadPanel();

        // Prepare upload queue
        const uploadQueue = this.prepareUploadQueue(files);

        // Initialize upload tracking
        uploadQueue.forEach(item => {
            AppState.uploads.active.set(item.id, {
                id: item.id,
                name: item.file.name,
                size: item.file.size,
                path: item.path,
                status: 'pending',
                progress: 0
            });
        });

        this.updateUI();

        // Process uploads in parallel batches
        let completed = 0;
        let failed = 0;
        let deduplicated = 0;

        for (let i = 0; i < uploadQueue.length; i += this.MAX_PARALLEL_UPLOADS) {
            if (AppState.uploads.cancelled) break;

            const batch = uploadQueue.slice(i, i + this.MAX_PARALLEL_UPLOADS);
            
            const batchPromises = batch.map(async (item) => {
                try {
                    const result = await this.uploadFileWithRetry(item);
                    
                    if (result.deduplicated > 0) {
                        deduplicated++;
                    } else {
                        completed++;
                    }

                    return { success: true };
                } catch (error) {
                    failed++;
                    return { success: false, error };
                }
            });

            await Promise.all(batchPromises);
        }

        // Hide cancel button
        document.getElementById('cancelUploadBtn').style.display = 'none';

        // Show completion message
        if (AppState.uploads.cancelled) {
            UI.showNotification('Upload cancelled', 'info');
        } else {
            const message = `Upload complete: ${completed} uploaded, ${deduplicated} deduplicated${failed > 0 ? `, ${failed} failed` : ''}`;
            UI.showNotification(message, failed > 0 ? 'error' : 'success');
        }

        // Reload files
        setTimeout(() => {
            FileManager.loadFiles();
            
            // Hide upload panel after a delay
            setTimeout(() => {
                this.hideUploadPanel();
            }, 2000);
        }, 500);
    },

    /**
     * Prepare upload queue with paths
     */
    prepareUploadQueue(files) {
        return files.map(file => {
            const id = this.generateFileId();
            let targetPath;

            if (file.webkitRelativePath) {
                // Folder upload - preserve directory structure
                const parts = file.webkitRelativePath.split('/');
                parts.pop(); // Remove filename
                targetPath = this.normalizePath('/' + parts.join('/') + '/');
            } else {
                // File upload - use current path
                targetPath = AppState.currentPath;
            }

            return { id, file, path: targetPath };
        });
    },

    /**
     * Upload single file with retry
     */
    async uploadFileWithRetry(item, retryCount = 0) {
        const upload = AppState.uploads.active.get(item.id);

        if (AppState.uploads.cancelled) {
            upload.status = 'cancelled';
            upload.progress = 0;
            this.updateUI();
            throw new Error('Upload cancelled');
        }

        // Update status
        if (retryCount > 0) {
            upload.status = 'retrying';
        } else {
            upload.status = 'uploading';
        }
        upload.progress = 25;
        this.updateUI();

        try {
            const result = await API.uploadFile(item.file, item.path);
            
            if (!result) {
                throw new Error('Upload failed');
            }

            // Update progress
            AppState.uploads.totalBytesUploaded += item.file.size;
            upload.status = result.deduplicated > 0 ? 'dedup' : 'complete';
            upload.progress = 100;
            this.updateUI();

            return result;
        } catch (error) {
            if (AppState.uploads.cancelled) {
                upload.status = 'cancelled';
                upload.progress = 0;
                this.updateUI();
                throw error;
            }

            if (retryCount < this.MAX_RETRIES) {
                const delay = this.RETRY_DELAY_BASE * Math.pow(2, retryCount);
                console.warn(`Retrying ${item.file.name} in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                
                await this.sleep(delay);
                return this.uploadFileWithRetry(item, retryCount + 1);
            }

            // Failed after retries
            upload.status = 'failed';
            upload.progress = 0;
            this.updateUI();
            throw error;
        }
    },

    /**
     * Cancel ongoing upload
     */
    cancelUpload() {
        AppState.uploads.cancelled = true;
        UI.showNotification('Cancelling uploads...', 'info');
    },

    /**
     * Show upload panel
     */
    showUploadPanel() {
        document.getElementById('uploadPanel').classList.remove('hidden');
        document.getElementById('cancelUploadBtn').style.display = 'block';
    },

    /**
     * Hide upload panel
     */
    hideUploadPanel() {
        document.getElementById('uploadPanel').classList.add('hidden');
    },

    /**
     * Update upload UI
     */
    updateUI() {
        const uploads = Array.from(AppState.uploads.active.values());
        const total = uploads.length;
        const completed = uploads.filter(u => u.status === 'complete' || u.status === 'dedup').length;
        const failed = uploads.filter(u => u.status === 'failed').length;

        // Update title
        document.getElementById('uploadPanelTitle').textContent = 
            `Uploading... (${completed}/${total})`;

        // Update overall progress
        const overallProgress = total > 0 ? (completed / total) * 100 : 0;
        document.getElementById('overallProgressFill').style.width = overallProgress + '%';

        // Update stats
        const elapsed = (Date.now() - AppState.uploads.startTime) / 1000;
        const speed = elapsed > 0 ? AppState.uploads.totalBytesUploaded / elapsed : 0;
        document.getElementById('uploadStatsText').textContent = 
            `${completed} / ${total} files${failed > 0 ? ` (${failed} failed)` : ''}`;
        document.getElementById('uploadSpeedText').textContent = 
            speed > 0 ? UI.formatSpeed(speed) : '-- MB/s';

        // Update upload list
        this.renderUploadList(uploads);
    },

    /**
     * Render upload list
     */
    renderUploadList(uploads) {
        const list = document.getElementById('uploadList');
        
        list.innerHTML = uploads.map(upload => {
            let statusIcon, statusClass, progressClass;
            
            switch (upload.status) {
                case 'pending':
                    statusIcon = '<i class="fas fa-clock"></i>';
                    statusClass = 'pending';
                    progressClass = '';
                    break;
                case 'uploading':
                    statusIcon = '<i class="fas fa-spinner fa-spin"></i>';
                    statusClass = 'uploading';
                    progressClass = '';
                    break;
                case 'complete':
                    statusIcon = '<i class="fas fa-check"></i>';
                    statusClass = 'complete';
                    progressClass = 'complete';
                    break;
                case 'dedup':
                    statusIcon = '<i class="fas fa-copy"></i>';
                    statusClass = 'complete';
                    progressClass = 'complete';
                    break;
                case 'failed':
                    statusIcon = '<i class="fas fa-times"></i>';
                    statusClass = 'failed';
                    progressClass = 'failed';
                    break;
                case 'retrying':
                    statusIcon = '<i class="fas fa-redo"></i>';
                    statusClass = 'retrying';
                    progressClass = 'retrying';
                    break;
                case 'cancelled':
                    statusIcon = '<i class="fas fa-ban"></i>';
                    statusClass = 'failed';
                    progressClass = 'failed';
                    break;
                default:
                    statusIcon = '<i class="fas fa-file"></i>';
                    statusClass = 'pending';
                    progressClass = '';
            }

            return `
                <div class="upload-item">
                    <div class="upload-item-header">
                        <span class="status-icon ${statusClass}">${statusIcon}</span>
                        <span class="upload-item-name" title="${upload.name}">${upload.name}</span>
                        <span class="upload-item-size">${UI.formatBytes(upload.size)}</span>
                    </div>
                    <div class="upload-progress-bar">
                        <div class="upload-progress-fill ${progressClass}" style="width: ${upload.progress}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Normalize path
     */
    normalizePath(inputPath) {
        if (!inputPath || typeof inputPath !== 'string') return '/';
        
        let normalized = inputPath.replace(/\\/g, '/').replace(/\/+/g, '/');
        
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        if (!normalized.endsWith('/')) normalized = normalized + '/';
        
        // Remove . and .. segments
        const parts = normalized.split('/').filter(p => p && p !== '.' && p !== '..');
        return '/' + parts.join('/') + (parts.length > 0 ? '/' : '');
    },

    /**
     * Generate unique file ID
     */
    generateFileId() {
        return `upload-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    },

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
