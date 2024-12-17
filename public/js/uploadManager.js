/**
 * Upload Manager Module
 * Handles file uploads with retry logic and progress tracking
 * Supports multiple concurrent upload sessions (e.g., uploading multiple folders back-to-back)
 */

const UploadManager = {
    MAX_PARALLEL_UPLOADS: 3,
    MAX_RETRIES: 3,
    RETRY_DELAY_BASE: 1000,
    LARGE_FILE_THRESHOLD: 25 * 1024 * 1024, // 25MB - warning threshold
    STREAMING_THRESHOLD: 25 * 1024 * 1024,  // 25MB - use streaming upload
    CHUNKED_THRESHOLD: 90 * 1024 * 1024,    // 90MB - use chunked upload (avoid 413 proxy errors)
    failedUploads: new Map(), // Store failed upload items for retry

    /**
     * Initialize upload manager
     */
    init() {
        this.attachEventListeners();
    },

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    },

    /**
     * Get or create a session
     */
    getSession(sessionId) {
        return AppState.uploads.sessions.get(sessionId);
    },

    /**
     * Create a new upload session
     */
    createSession() {
        const sessionId = this.generateSessionId();
        const session = {
            id: sessionId,
            files: new Map(),
            cancelled: false,
            startTime: Date.now(),
            totalBytesUploaded: 0,
            completed: 0,
            failed: 0,
            total: 0
        };
        AppState.uploads.sessions.set(sessionId, session);
        return session;
    },

    /**
     * Remove completed/cancelled session after delay
     */
    scheduleSessionCleanup(sessionId, delay = 10000) {
        setTimeout(() => {
            const session = this.getSession(sessionId);
            if (session) {
                // Only remove if all files are done (completed, failed, or cancelled)
                const allDone = Array.from(session.files.values()).every(
                    f => ['complete', 'failed', 'cancelled'].includes(f.status)
                );
                if (allDone) {
                    AppState.uploads.sessions.delete(sessionId);
                    if (AppState.uploads.activeSessionId === sessionId) {
                        // Switch to another active session if available
                        const remaining = Array.from(AppState.uploads.sessions.keys());
                        AppState.uploads.activeSessionId = remaining.length > 0 ? remaining[0] : null;
                    }
                    this.updateUI();
                }
            }
        }, delay);
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
     * Check for large files and show warning if needed
     */
    checkLargeFiles(files) {
        const largeFiles = files.filter(file => file.size > this.LARGE_FILE_THRESHOLD);

        if (largeFiles.length > 0) {
            const largestFile = largeFiles.reduce((a, b) => a.size > b.size ? a : b);
            const sizeFormatted = UI.formatBytes(largestFile.size);

            if (largeFiles.length === 1) {
                UI.showNotification(`Large file detected (${sizeFormatted}). Upload may take a while.`, 'info');
            } else {
                UI.showNotification(`${largeFiles.length} large files detected. Upload may take a while.`, 'info');
            }
        }
    },

    /**
     * Start upload process - creates a new session for this batch
     */
    async startUpload(files) {
        if (files.length === 0) return;

        // Check for large files and show warning
        this.checkLargeFiles(files);

        // Create a new session for this upload batch
        const session = this.createSession();
        AppState.uploads.activeSessionId = session.id;

        // Show upload panel
        this.showUploadPanel();

        // Prepare upload queue
        const uploadQueue = this.prepareUploadQueue(files, session.id);
        session.total = uploadQueue.length;

        // Initialize upload tracking for this session
        uploadQueue.forEach(item => {
            session.files.set(item.id, {
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
        for (let i = 0; i < uploadQueue.length; i += this.MAX_PARALLEL_UPLOADS) {
            if (session.cancelled) break;

            const batch = uploadQueue.slice(i, i + this.MAX_PARALLEL_UPLOADS);

            const batchPromises = batch.map(async (item) => {
                try {
                    await this.uploadFileWithRetry(item, session);
                    session.completed++;
                    return { success: true };
                } catch (error) {
                    session.failed++;
                    return { success: false, error };
                }
            });

            await Promise.all(batchPromises);
        }

        // Show completion message for this session
        if (session.cancelled) {
            UI.showNotification(`Upload session cancelled`, 'info');
        } else {
            const message = `Upload complete: ${session.completed} uploaded${session.failed > 0 ? `, ${session.failed} failed` : ''}`;
            UI.showNotification(message, session.failed > 0 ? 'error' : 'success');
        }

        // Reload files
        setTimeout(() => {
            FileManager.loadFiles();
        }, 500);

        // Schedule session cleanup
        this.scheduleSessionCleanup(session.id, 5000);

        // Update UI to show completion state
        this.updateUI();
    },

    /**
     * Prepare upload queue with paths
     */
    prepareUploadQueue(files, sessionId) {
        return files.map((file, i) => {
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

            return {
                id,
                file,
                path: targetPath,
                sessionId,
                batchIndex: i + 1,
                batchTotal: files.length
            };
        });
    },

    /**
     * Upload single file with retry
     */
    async uploadFileWithRetry(item, session, retryCount = 0) {
        const upload = session.files.get(item.id);

        if (session.cancelled) {
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
            let result;

            // Use chunked upload for very large files (>90MB) to avoid proxy 413 errors
            if (item.file.size > this.CHUNKED_THRESHOLD) {
                console.log(`[UploadManager] Using chunked upload for ${item.file.name} (${(item.file.size / 1024 / 1024).toFixed(2)}MB)`);
                result = await API.uploadFileChunked(item.file, item.path, (chunkNum, totalChunks, percent) => {
                    // Update progress during chunked upload
                    upload.progress = Math.round((chunkNum / totalChunks) * 90); // Reserve last 10% for finalization
                    this.updateUI();
                });
            }
            // Use streaming upload for large files (>50MB but <=90MB)
            else if (item.file.size > this.STREAMING_THRESHOLD) {
                console.log(`[UploadManager] Using streaming upload for ${item.file.name} (${(item.file.size / 1024 / 1024).toFixed(2)}MB)`);
                result = await API.uploadFileStream(item.file, item.path);
            } else {
                result = await API.uploadFile(
                    item.file,
                    item.path,
                    item.batchIndex,
                    item.batchTotal
                );
            }

            if (!result) {
                throw new Error('Upload failed');
            }

            // Update progress
            session.totalBytesUploaded += item.file.size;
            upload.status = 'complete';
            upload.progress = 100;
            this.updateUI();

            return result;
        } catch (error) {
            if (session.cancelled) {
                upload.status = 'cancelled';
                upload.progress = 0;
                this.updateUI();
                throw error;
            }

            if (retryCount < this.MAX_RETRIES) {
                const delay = this.RETRY_DELAY_BASE * Math.pow(2, retryCount);
                console.warn(`Retrying ${item.file.name} in ${delay}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);

                await this.sleep(delay);
                return this.uploadFileWithRetry(item, session, retryCount + 1);
            }

            // Failed after retries
            upload.status = 'failed';
            upload.progress = 0;
            // Store the failed upload item for potential manual retry
            this.failedUploads.set(item.id, { item, sessionId: session.id });
            this.updateUI();
            throw error;
        }
    },

    /**
     * Cancel a specific session or the active session
     */
    cancelUpload(sessionId = null) {
        const targetId = sessionId || AppState.uploads.activeSessionId;
        if (!targetId) return;

        const session = this.getSession(targetId);
        if (session) {
            session.cancelled = true;
            UI.showNotification('Cancelling upload session...', 'info');
        }
    },

    /**
     * Cancel all active upload sessions
     */
    cancelAllUploads() {
        for (const session of AppState.uploads.sessions.values()) {
            session.cancelled = true;
        }
        UI.showNotification('Cancelling all uploads...', 'info');
    },

    /**
     * Retry a failed upload
     */
    async retryUpload(uploadId) {
        const failedData = this.failedUploads.get(uploadId);
        if (!failedData) {
            UI.showNotification('Upload item not found for retry', 'error');
            return;
        }

        const { item, sessionId } = failedData;
        const session = this.getSession(sessionId);

        if (!session) {
            UI.showNotification('Upload session expired', 'error');
            return;
        }

        // Remove from failed uploads
        this.failedUploads.delete(uploadId);

        // Reset upload state for this item
        const upload = session.files.get(uploadId);
        if (upload) {
            upload.status = 'pending';
            upload.progress = 0;
            this.updateUI();
        }

        // Reset cancelled flag for this session
        session.cancelled = false;

        try {
            await this.uploadFileWithRetry(item, session);
            session.completed++;
            session.failed--;
            UI.showNotification(`Successfully uploaded ${item.file.name}`, 'success');

            // Reload files
            setTimeout(() => {
                FileManager.loadFiles();
            }, 500);
        } catch (error) {
            UI.showNotification(`Failed to upload ${item.file.name}`, 'error');
        }

        this.updateUI();
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
        // Only hide if no active sessions
        if (AppState.uploads.sessions.size === 0) {
            document.getElementById('uploadPanel').classList.add('hidden');
        }
    },

    /**
     * Update upload UI - shows all sessions combined
     */
    updateUI() {
        // Combine all uploads from all sessions
        const allUploads = [];
        let totalCompleted = 0;
        let totalFailed = 0;
        let totalFiles = 0;
        let totalBytesUploaded = 0;
        let earliestStartTime = Date.now();
        let hasActiveSession = false;

        for (const session of AppState.uploads.sessions.values()) {
            for (const upload of session.files.values()) {
                allUploads.push({ ...upload, sessionId: session.id });
            }
            totalCompleted += session.completed;
            totalFailed += session.failed;
            totalFiles += session.total;
            totalBytesUploaded += session.totalBytesUploaded;
            if (session.startTime < earliestStartTime) {
                earliestStartTime = session.startTime;
            }
            // Check if session is still active (has pending/uploading files)
            const hasActive = Array.from(session.files.values()).some(
                f => ['pending', 'uploading', 'retrying'].includes(f.status)
            );
            if (hasActive) hasActiveSession = true;
        }

        // Hide panel if no sessions
        if (AppState.uploads.sessions.size === 0) {
            this.hideUploadPanel();
            return;
        }

        // Show/hide cancel button based on active uploads
        document.getElementById('cancelUploadBtn').style.display = hasActiveSession ? 'block' : 'none';

        // Update title with session count
        const sessionCount = AppState.uploads.sessions.size;
        const sessionText = sessionCount > 1 ? ` (${sessionCount} sessions)` : '';
        document.getElementById('uploadPanelTitle').textContent =
            `Uploading... (${totalCompleted}/${totalFiles})${sessionText}`;

        // Update overall progress
        const overallProgress = totalFiles > 0 ? (totalCompleted / totalFiles) * 100 : 0;
        document.getElementById('overallProgressFill').style.width = overallProgress + '%';

        // Update stats
        const elapsed = (Date.now() - earliestStartTime) / 1000;
        const speed = elapsed > 0 ? totalBytesUploaded / elapsed : 0;
        document.getElementById('uploadStatsText').textContent =
            `${totalCompleted} / ${totalFiles} files${totalFailed > 0 ? ` (${totalFailed} failed)` : ''}`;
        document.getElementById('uploadSpeedText').textContent =
            speed > 0 ? UI.formatSpeed(speed) : '-- MB/s';

        // Update upload list
        this.renderUploadList(allUploads);
    },

    /**
     * Render upload list
     */
    renderUploadList(uploads) {
        const list = document.getElementById('uploadList');

        list.innerHTML = uploads.map(upload => {
            let statusIcon, statusClass, progressClass;
            let retryButton = '';

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
                case 'failed':
                    statusIcon = '<i class="fas fa-times"></i>';
                    statusClass = 'failed';
                    progressClass = 'failed';
                    retryButton = `<button class="upload-retry-btn" onclick="UploadManager.retryUpload('${upload.id}')" title="Retry upload"><i class="fas fa-redo"></i></button>`;
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
                        <span class="upload-item-name" title="${upload.path}${upload.name}">${upload.name}</span>
                        <span class="upload-item-size">${UI.formatBytes(upload.size)}</span>
                        ${retryButton}
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
