/**
 * File Manager Module
 * Handles file operations, navigation, and rendering
 */

const FileManager = {
    /**
     * Get appropriate Font Awesome icon class and color for a file based on its extension
     * @param {string} filename - The name of the file
     * @returns {object} - Object with icon class and color class
     */
    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();

        // Image files
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'].includes(ext)) {
            return { icon: 'fa-file-image', color: 'text-green-500' };
        }

        // Video files
        if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v'].includes(ext)) {
            return { icon: 'fa-file-video', color: 'text-purple-500' };
        }

        // Audio files
        if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'].includes(ext)) {
            return { icon: 'fa-file-audio', color: 'text-pink-500' };
        }

        // PDF files
        if (ext === 'pdf') {
            return { icon: 'fa-file-pdf', color: 'text-red-500' };
        }

        // Word documents
        if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
            return { icon: 'fa-file-word', color: 'text-blue-500' };
        }

        // Excel spreadsheets
        if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
            return { icon: 'fa-file-excel', color: 'text-green-600' };
        }

        // PowerPoint presentations
        if (['ppt', 'pptx', 'odp'].includes(ext)) {
            return { icon: 'fa-file-powerpoint', color: 'text-orange-500' };
        }

        // Code files
        if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt', 'rs', 'scala', 'vue', 'html', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bash', 'ps1', 'bat'].includes(ext)) {
            return { icon: 'fa-file-code', color: 'text-yellow-500' };
        }

        // Archive files
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz'].includes(ext)) {
            return { icon: 'fa-file-archive', color: 'text-amber-600' };
        }

        // Text files
        if (['txt', 'md', 'log', 'ini', 'cfg', 'conf'].includes(ext)) {
            return { icon: 'fa-file-alt', color: 'text-gray-400' };
        }

        // Default
        return { icon: 'fa-file', color: 'text-gray-400' };
    },

    /**
     * Initialize file manager
     */
    init() {
        this.attachEventListeners();
        this.createSearchInput();
        this.setupMobileMenu();
        this.setupDragAndDrop();
        this.loadFiles();

        // Auto-refresh every 5 seconds
        setInterval(() => {
            this.loadFiles(true);
        }, 5000);
    },

    /**
     * Setup mobile hamburger menu
     */
    setupMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (!hamburgerBtn || !sidebar || !overlay) return;

        hamburgerBtn.onclick = () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('hidden');
        };

        overlay.onclick = () => {
            sidebar.classList.remove('open');
            overlay.classList.add('hidden');
        };
    },

    /**
     * Setup drag and drop upload
     */
    setupDragAndDrop() {
        const container = document.getElementById('fileListContainer');
        const dropZone = document.getElementById('dropZone');

        if (!container || !dropZone) return;

        let dragCounter = 0;

        container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter++;
            dropZone.classList.remove('hidden');
        });

        container.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter--;
            if (dragCounter === 0) {
                dropZone.classList.add('hidden');
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounter = 0;
            dropZone.classList.add('hidden');

            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                UploadManager.startUpload(files);
            }
        });
    },

    /**
     * Create and attach search input to the header
     */
    createSearchInput() {
        const mainHeader = document.querySelector('.main-header');
        if (!mainHeader) return;

        // Create search container
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <div class="search-input-wrapper">
                <i class="fas fa-search search-icon"></i>
                <input type="text" id="searchInput" class="search-input" placeholder="Search files and folders..." aria-label="Search files and folders" />
                <button id="clearSearchBtn" class="clear-search-btn hidden" aria-label="Clear search">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Insert after the path display or at the end
        const pathDisplay = mainHeader.querySelector('#pathDisplay');
        if (pathDisplay && pathDisplay.parentElement) {
            pathDisplay.parentElement.insertAdjacentElement('afterend', searchContainer);
        } else {
            mainHeader.appendChild(searchContainer);
        }

        // Attach search input event with debouncing
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        let debounceTimer;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;

            // Show/hide clear button
            if (query) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }

            // Debounce the search
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                AppState.setSearchQuery(query);
                this.render();
            }, 300);
        });

        // Clear search button
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            AppState.setSearchQuery('');
            this.render();
        });

        // Allow Escape key to clear search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                clearBtn.classList.add('hidden');
                AppState.setSearchQuery('');
                this.render();
                searchInput.blur();
            }
        });
    },

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Navigation
        document.getElementById('backBtn').onclick = () => this.goBack();
        document.getElementById('refreshBtn').onclick = () => this.loadFiles();

        // Actions
        document.getElementById('newFolderBtn').onclick = () => this.createFolder();
        document.getElementById('nukeBtn').onclick = () => this.nukeStorage();
        document.getElementById('latencyBtn').onclick = () => this.checkLatency();
        document.getElementById('logoutBtn').onclick = () => Auth.logout();
        document.getElementById('storageInfoBtn').onclick = () => this.showStorageInfo();

        // Selection
        document.getElementById('selectAllCheckbox').onclick = () => this.toggleSelectAll();
        document.getElementById('selectAllCheckbox').onkeydown = (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this.toggleSelectAll();
            }
        };
        document.getElementById('bulkDownloadBtn').onclick = () => this.bulkDownload();
        document.getElementById('bulkMoveBtn').onclick = () => this.bulkMove();
        document.getElementById('bulkDeleteBtn').onclick = () => this.bulkDelete();

        // Sorting
        document.querySelectorAll('.sortable').forEach(th => {
            th.onclick = () => {
                const column = th.dataset.sort;
                AppState.setSort(column);
                this.render();
            };
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (AppState.ui.isAuthenticated) {
                if (e.ctrlKey && e.key === 'a') {
                    e.preventDefault();
                    this.toggleSelectAll();
                } else if (e.key === 'Delete') {
                    if (AppState.getSelectionCount() > 0) {
                        this.bulkDelete();
                    }
                }
            }
        });
    },

    /**
     * Load files from server
     */
    async loadFiles(silent = false) {
        try {
            // Show skeleton loading state for non-silent loads
            if (!silent) {
                this.showSkeletonLoading();
            }

            const data = await API.sync();
            if (data) {
                AppState.setFiles(data.files, data.folders);
                this.render();
            }
        } catch (error) {
            if (!silent) {
                UI.showNotification('Failed to load files', 'error');
                // Clear skeleton on error
                this.render();
            }
            console.error('Load files error:', error);
        }
    },

    /**
     * Show skeleton loading state
     */
    showSkeletonLoading() {
        const tbody = document.getElementById('fileListBody');
        const skeletonRows = [];

        // Generate 5 skeleton rows
        for (let i = 0; i < 5; i++) {
            skeletonRows.push(`
                <tr class="file-row skeleton-row">
                    <td class="col-checkbox">
                        <div class="skeleton skeleton-checkbox"></div>
                    </td>
                    <td class="col-name">
                        <div class="skeleton skeleton-icon"></div>
                        <div class="skeleton skeleton-text" style="width: ${60 + Math.random() * 30}%"></div>
                    </td>
                    <td class="col-date">
                        <div class="skeleton skeleton-text" style="width: 80%"></div>
                    </td>
                    <td class="col-size">
                        <div class="skeleton skeleton-text" style="width: 60%"></div>
                    </td>
                    <td class="col-actions">
                        <div class="skeleton skeleton-actions"></div>
                    </td>
                </tr>
            `);
        }

        tbody.innerHTML = skeletonRows.join('');
    },

    /**
     * Create new folder
     */
    async createFolder() {
        const folderName = await UI.showPrompt('Enter folder name:');

        if (!folderName) return;

        // Validate folder name
        if (!/^[a-zA-Z0-9_\-\s]+$/.test(folderName)) {
            UI.showNotification('Invalid folder name. Use only letters, numbers, spaces, _ and -', 'error');
            return;
        }

        const folderPath = AppState.currentPath + folderName + '/';

        try {
            await API.createFolder(folderPath);
            UI.showNotification('Folder created', 'success');
            await this.loadFiles();
        } catch (error) {
            UI.showNotification('Failed to create folder', 'error');
        }
    },

    /**
     * Delete item (file or folder)
     */
    async deleteItem(id, isFolder) {
        const itemName = isFolder ? id.split('/').filter(p => p).pop() :
            AppState.files.find(f => f.id === id)?.name;

        const confirmed = await UI.showConfirm(
            'Delete Item',
            `Are you sure you want to delete "${itemName}"?`
        );

        if (!confirmed) return;

        try {
            await API.deleteItem(id, isFolder);
            UI.showNotification('Item deleted', 'success');
            await this.loadFiles();
        } catch (error) {
            UI.showNotification('Failed to delete item', 'error');
        }
    },

    /**
     * Bulk delete selected items
     */
    async bulkDelete() {
        const count = AppState.getSelectionCount();

        const confirmed = await UI.showConfirm(
            'Delete Items',
            `Are you sure you want to delete ${count} item(s)?`
        );

        if (!confirmed) return;

        try {
            // Delete files
            for (const fileId of AppState.selection.files) {
                await API.deleteItem(fileId, false);
            }

            // Delete folders
            for (const folderPath of AppState.selection.folders) {
                await API.deleteItem(folderPath, true);
            }

            AppState.clearSelection();
            UI.showNotification(`${count} item(s) deleted`, 'success');
            await this.loadFiles();
        } catch (error) {
            UI.showNotification('Failed to delete items', 'error');
        }
    },

    /**
     * Bulk download selected files
     */
    async bulkDownload() {
        const fileIds = Array.from(AppState.selection.files);

        if (fileIds.length === 0) {
            UI.showNotification('No files selected', 'info');
            return;
        }

        // Clear any previous download tracking
        API.clearDownloadTracking();

        UI.showNotification(`Downloading ${fileIds.length} file(s)...`, 'info');

        for (const fileId of fileIds) {
            const file = AppState.files.find(f => f.id === fileId);
            if (file) {
                try {
                    await API.downloadFile(fileId, file.name);
                    // Small delay between downloads to prevent browser throttling
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    UI.showNotification(`Failed to download ${file.name}`, 'error');
                }
            }
        }

        // Clear tracking after bulk download
        API.clearDownloadTracking();
        UI.showNotification('Downloads complete', 'success');
    },

    /**
     * Bulk move selected items
     */
    async bulkMove() {
        const count = AppState.getSelectionCount();
        if (count === 0) {
            UI.showNotification('No items selected', 'info');
            return;
        }

        // Show folder picker
        const targetPath = await this.showFolderPicker('Move to...');
        if (!targetPath) return;

        try {
            let moved = 0;

            // Move files
            for (const fileId of AppState.selection.files) {
                const file = AppState.files.find(f => f.id === fileId);
                if (file && file.path !== targetPath) {
                    await API.moveItem(fileId, false, targetPath);
                    moved++;
                }
            }

            // Move folders
            for (const folderPath of AppState.selection.folders) {
                // Calculate new path - extract folder name and append to target
                const folderName = folderPath.split('/').filter(p => p).pop();
                const newPath = targetPath + folderName + '/';

                if (folderPath !== newPath && !newPath.startsWith(folderPath)) {
                    await API.moveItem(folderPath, true, newPath);
                    moved++;
                }
            }

            AppState.clearSelection();
            UI.showNotification(`Moved ${moved} item(s) to ${targetPath}`, 'success');
            await this.loadFiles();
        } catch (error) {
            console.error('Move failed:', error);
            UI.showNotification('Failed to move items: ' + error.message, 'error');
        }
    },

    /**
     * Move a single item to a folder
     */
    async moveItemToFolder(id, isFolder, targetPath) {
        try {
            if (isFolder) {
                // For folders, calculate new path
                const folderName = id.split('/').filter(p => p).pop();
                const newPath = targetPath + folderName + '/';

                // Don't move into itself
                if (newPath.startsWith(id)) {
                    UI.showNotification("Cannot move folder into itself", 'error');
                    return;
                }

                await API.moveItem(id, true, newPath);
            } else {
                // For files, just move to the target path
                const file = AppState.files.find(f => f.id === id);
                if (file && file.path !== targetPath) {
                    await API.moveItem(id, false, targetPath);
                }
            }

            UI.showNotification('Item moved', 'success');
            await this.loadFiles();
        } catch (error) {
            console.error('Move failed:', error);
            UI.showNotification('Failed to move item: ' + error.message, 'error');
        }
    },

    /**
     * Show folder picker dialog
     */
    async showFolderPicker(title = 'Select folder') {
        return new Promise((resolve) => {
            // Get all folders
            const allFolders = ['/'];
            AppState.folders.forEach(f => allFolders.push(f));

            // Also add folders from file paths
            AppState.files.forEach(f => {
                if (!allFolders.includes(f.path)) {
                    allFolders.push(f.path);
                }
            });

            // Sort folders
            allFolders.sort();

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.id = 'folderPickerModal';

            const folderOptions = allFolders.map(f => `
                <div class="folder-option" data-path="${f}">
                    <i class="fas fa-folder text-yellow-500"></i>
                    <span>${f === '/' ? 'Root (/)' : f}</span>
                </div>
            `).join('');

            modal.innerHTML = `
                <div class="modal-content folder-picker-modal">
                    <h3>${title}</h3>
                    <div class="folder-list">
                        ${folderOptions}
                    </div>
                    <div class="modal-buttons">
                        <button class="btn btn-secondary" id="folderPickerCancel">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Handle folder selection
            modal.querySelectorAll('.folder-option').forEach(opt => {
                opt.onclick = () => {
                    modal.remove();
                    resolve(opt.dataset.path);
                };
            });

            // Handle cancel
            modal.querySelector('#folderPickerCancel').onclick = () => {
                modal.remove();
                resolve(null);
            };

            // Close on backdrop click
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            };
        });
    },

    /**
     * Nuke all storage
     */
    async nukeStorage() {
        const password = await UI.showPrompt('Enter nuke password to delete ALL files:');

        if (!password) return;

        // Verify nuke password (for safety)
        const confirmed = await UI.showConfirm(
            'DANGER: Nuke Storage',
            'This will DELETE ALL FILES permanently. Are you absolutely sure?'
        );

        if (!confirmed) return;

        try {
            await API.nuke();
            AppState.setFiles([], []);
            AppState.clearSelection();
            UI.showNotification('All files deleted', 'success');
            this.render();
        } catch (error) {
            UI.showNotification('Failed to nuke storage', 'error');
        }
    },

    /**
     * Check API latency
     */
    async checkLatency() {
        try {
            const result = await API.ping();
            if (result) {
                UI.showNotification(
                    `Latency: ${result.clientLatency}ms (Server: ${result.latency || 'N/A'}ms)`,
                    'info'
                );
            }
        } catch (error) {
            UI.showNotification('Failed to check latency', 'error');
        }
    },

    /**
     * Show storage info
     */
    async showStorageInfo() {
        try {
            const info = await API.getStorageInfo();
            if (info) {
                this.displayStorageModal(info);
            }
        } catch (error) {
            UI.showNotification('Failed to get storage info', 'error');
        }
    },

    /**
     * Display storage info in a detailed modal
     */
    displayStorageModal(info) {
        // Remove existing modal if any
        const existing = document.getElementById('storageInfoModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'storageInfoModal';
        modal.className = 'modal active';

        // Build breakdown rows
        const breakdownRows = Object.entries(info.breakdown)
            .filter(([_, data]) => data.count > 0)
            .sort((a, b) => b[1].size - a[1].size)
            .map(([type, data]) => {
                const icons = {
                    images: 'fa-image',
                    videos: 'fa-video',
                    audio: 'fa-music',
                    documents: 'fa-file-alt',
                    code: 'fa-code',
                    archives: 'fa-file-archive',
                    other: 'fa-file'
                };
                const colors = {
                    images: '#22c55e',
                    videos: '#a855f7',
                    audio: '#ec4899',
                    documents: '#3b82f6',
                    code: '#eab308',
                    archives: '#f59e0b',
                    other: '#64748b'
                };
                return `
                    <div class="storage-breakdown-row">
                        <div class="storage-type">
                            <i class="fas ${icons[type]}" style="color: ${colors[type]}"></i>
                            <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                        </div>
                        <div class="storage-stats">
                            <span class="storage-count">${data.count} files</span>
                            <span class="storage-size">${UI.formatBytes(data.size)}</span>
                        </div>
                    </div>
                `;
            }).join('');

        // Build largest files list
        const largestFilesRows = info.largestFiles.map(f => `
            <div class="storage-file-row">
                <span class="storage-file-name" title="${f.path}${f.name}">${f.name}</span>
                <span class="storage-file-size">${UI.formatBytes(f.size)}</span>
            </div>
        `).join('') || '<div class="storage-empty">No files yet</div>';

        // Build recent files list
        const recentFilesRows = info.recentFiles.map(f => `
            <div class="storage-file-row">
                <span class="storage-file-name">${f.name}</span>
                <span class="storage-file-date">${UI.formatDate(f.addedAt)}</span>
            </div>
        `).join('') || '<div class="storage-empty">No files yet</div>';

        modal.innerHTML = `
            <div class="modal-content storage-modal">
                <div class="storage-header">
                    <h3><i class="fas fa-chart-pie"></i> Storage Information</h3>
                    <button class="storage-close-btn"><i class="fas fa-times"></i></button>
                </div>

                <div class="storage-summary">
                    <div class="storage-stat-card">
                        <div class="storage-stat-value">${info.summary.totalStorage.formatted}</div>
                        <div class="storage-stat-label">Total Storage</div>
                    </div>
                    <div class="storage-stat-card">
                        <div class="storage-stat-value">${info.summary.fileCount}</div>
                        <div class="storage-stat-label">Files</div>
                    </div>
                    <div class="storage-stat-card">
                        <div class="storage-stat-value">${info.summary.folderCount}</div>
                        <div class="storage-stat-label">Folders</div>
                    </div>
                    <div class="storage-stat-card">
                        <div class="storage-stat-value">${info.summary.averageFileSize.formatted}</div>
                        <div class="storage-stat-label">Avg File Size</div>
                    </div>
                </div>

                <div class="storage-sections">
                    <div class="storage-section">
                        <h4><i class="fas fa-folder-open"></i> Storage by Type</h4>
                        <div class="storage-breakdown">
                            ${breakdownRows || '<div class="storage-empty">No files yet</div>'}
                        </div>
                    </div>

                    <div class="storage-section">
                        <h4><i class="fas fa-weight-hanging"></i> Largest Files</h4>
                        <div class="storage-files-list">
                            ${largestFilesRows}
                        </div>
                    </div>

                    <div class="storage-section">
                        <h4><i class="fas fa-clock"></i> Recent Uploads</h4>
                        <div class="storage-files-list">
                            ${recentFilesRows}
                        </div>
                    </div>
                </div>

                <div class="storage-footer">
                    <div class="storage-metadata">
                        <i class="fas fa-database"></i>
                        Metadata: ${info.metadata.formatted} (${info.metadata.percentage}% of limit)
                    </div>
                    ${info.warning ? `<div class="storage-warning"><i class="fas fa-exclamation-triangle"></i> ${info.warning}</div>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.storage-close-btn').onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    },

    /**
     * Go back one directory level
     */
    goBack() {
        AppState.goBack();
        this.render();
    },

    /**
     * Navigate to folder
     */
    navigateToFolder(folderPath) {
        AppState.navigateTo(folderPath);
        this.render();
    },

    /**
     * Toggle select all
     */
    toggleSelectAll() {
        if (AppState.isAllSelected()) {
            AppState.deselectAll();
        } else {
            AppState.selectAll();
        }
        this.render();
    },

    /**
     * Toggle item selection (with shift-select support)
     */
    toggleSelection(id, isFolder, event) {
        event.stopPropagation();

        if (event.shiftKey && AppState.selection.lastSelected) {
            // Shift+click: select range
            AppState.selectRange(id, isFolder);
        } else {
            // Normal click: toggle single item
            if (isFolder) {
                AppState.toggleFolderSelection(id);
            } else {
                AppState.toggleFileSelection(id);
            }
        }

        this.render();
    },

    /**
     * Handle checkbox keyboard events for accessibility
     */
    handleCheckboxKeydown(e, id, isFolder) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (isFolder) {
                AppState.toggleFolderSelection(id);
            } else {
                AppState.toggleFileSelection(id);
            }
            this.render();
        }
    },

    /**
     * Render file list
     */
    render() {
        this.renderPath();
        this.renderBackButton();
        this.renderSelectionBar();
        this.renderFileList();
        this.updateSelectAllCheckbox();

        // Pre-fetch files for instant viewing
        if (typeof FileViewer !== 'undefined' && FileViewer.prefetchCurrentDirectory) {
            // Delay slightly to not block rendering
            setTimeout(() => FileViewer.prefetchCurrentDirectory(), 100);
        }
    },

    /**
     * Render current path
     */
    renderPath() {
        document.getElementById('pathDisplay').textContent = AppState.currentPath;
    },

    /**
     * Render back button
     */
    renderBackButton() {
        const backBtn = document.getElementById('backBtn');
        backBtn.style.display = AppState.currentPath === '/' ? 'none' : 'block';
    },

    /**
     * Render selection bar
     */
    renderSelectionBar() {
        const selectionBar = document.getElementById('selectionBar');
        const selectionCount = document.getElementById('selectionCount');
        const count = AppState.getSelectionCount();

        if (count > 0) {
            selectionBar.classList.remove('hidden');
            selectionCount.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        } else {
            selectionBar.classList.add('hidden');
        }
    },

    /**
     * Update select all checkbox state
     */
    updateSelectAllCheckbox() {
        const checkbox = document.getElementById('selectAllCheckbox');
        const isChecked = AppState.isAllSelected();
        if (isChecked) {
            checkbox.classList.add('checked');
        } else {
            checkbox.classList.remove('checked');
        }
        // Update accessibility attributes
        checkbox.setAttribute('aria-checked', isChecked.toString());
    },

    /**
     * Render file list
     */
    renderFileList() {
        const tbody = document.getElementById('fileListBody');
        tbody.innerHTML = '';

        // Render folders
        const folders = AppState.getFolders().sort();
        folders.forEach(folderName => {
            const fullPath = AppState.currentPath + folderName + '/';
            const isSelected = AppState.selection.folders.has(fullPath);
            const hasPending = AppState.files.some(f =>
                f.path.startsWith(fullPath) && f.status === 'PENDING'
            );

            const row = this.createFolderRow(folderName, fullPath, isSelected, hasPending);
            tbody.appendChild(row);
        });

        // Render files
        const files = AppState.getSortedFiles();
        files.forEach(file => {
            const isSelected = AppState.selection.files.has(file.id);
            const row = this.createFileRow(file, isSelected);
            tbody.appendChild(row);
        });

        // Show empty state if no items
        if (folders.length === 0 && files.length === 0) {
            const searchQuery = AppState.ui.searchQuery;
            const emptyMessage = searchQuery
                ? `No results found for "${searchQuery}"`
                : 'This folder is empty';
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fas ${searchQuery ? 'fa-search' : 'fa-folder-open'}"></i>
                        <p>${emptyMessage}</p>
                    </td>
                </tr>
            `;
        }
    },

    /**
     * Create folder row
     */
    createFolderRow(folderName, fullPath, isSelected, hasPending) {
        const tr = document.createElement('tr');
        tr.className = 'file-row' + (isSelected ? ' selected' : '');
        tr.draggable = true;
        tr.dataset.itemId = fullPath;
        tr.dataset.isFolder = 'true';

        tr.innerHTML = `
            <td class="col-checkbox">
                <div class="checkbox-container ${isSelected ? 'checked' : ''}"
                     role="checkbox"
                     aria-checked="${isSelected}"
                     aria-label="Select folder ${folderName}"
                     tabindex="0">
                    <div class="checkmark"></div>
                </div>
            </td>
            <td class="col-name">
                <i class="fas fa-folder text-yellow-500"></i>
                <span class="item-name">${folderName}</span>
                ${hasPending ? '<span class="badge badge-pending">SYNCING</span>' : ''}
            </td>
            <td class="col-date">--</td>
            <td class="col-size">Folder</td>
            <td class="col-actions">
                <button class="action-btn delete-btn" title="Delete" aria-label="Delete folder ${folderName}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        const checkboxContainer = tr.querySelector('.checkbox-container');

        // Checkbox click
        checkboxContainer.onclick = (e) => {
            this.toggleSelection(fullPath, true, e);
        };

        // Checkbox keyboard handler
        checkboxContainer.onkeydown = (e) => {
            this.handleCheckboxKeydown(e, fullPath, true);
        };

        // Row click - navigate
        tr.onclick = (e) => {
            if (!e.target.closest('.checkbox-container') && !e.target.closest('.action-btn')) {
                this.navigateToFolder(fullPath);
            }
        };

        // Delete button
        tr.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            this.deleteItem(fullPath, true);
        };

        // Drag start - for moving this folder
        tr.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                id: fullPath,
                isFolder: true,
                name: folderName
            }));
            e.dataTransfer.effectAllowed = 'move';
            tr.classList.add('dragging');
        };

        tr.ondragend = () => {
            tr.classList.remove('dragging');
        };

        // Drop target - for receiving items
        tr.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only allow drop if not dragging onto itself
            const data = e.dataTransfer.types.includes('text/plain');
            if (data) {
                e.dataTransfer.dropEffect = 'move';
                tr.classList.add('drop-target');
            }
        };

        tr.ondragleave = (e) => {
            e.preventDefault();
            tr.classList.remove('drop-target');
        };

        tr.ondrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            tr.classList.remove('drop-target');

            try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));

                // Don't drop onto itself or into a subfolder of itself
                if (data.id === fullPath) return;
                if (data.isFolder && fullPath.startsWith(data.id)) {
                    UI.showNotification("Cannot move folder into itself", 'error');
                    return;
                }

                await this.moveItemToFolder(data.id, data.isFolder, fullPath);
            } catch (err) {
                console.error('Drop error:', err);
            }
        };

        return tr;
    },

    /**
     * Create file row
     */
    createFileRow(file, isSelected) {
        const tr = document.createElement('tr');
        tr.className = 'file-row' + (isSelected ? ' selected' : '') +
            (file.status === 'PENDING' ? ' pending' : '');
        tr.draggable = true;
        tr.dataset.itemId = file.id;
        tr.dataset.isFolder = 'false';

        const isPending = file.status === 'PENDING';

        // Get file icon based on extension
        const fileIcon = this.getFileIcon(file.name);

        tr.innerHTML = `
            <td class="col-checkbox">
                <div class="checkbox-container ${isSelected ? 'checked' : ''}"
                     role="checkbox"
                     aria-checked="${isSelected}"
                     aria-label="Select file ${file.name}"
                     tabindex="0">
                    <div class="checkmark"></div>
                </div>
            </td>
            <td class="col-name">
                <i class="fas ${fileIcon.icon} ${fileIcon.color}"></i>
                <span class="item-name">${file.name}</span>
                ${isPending ? '<span class="badge badge-pending">UPLOAD...</span>' : ''}
            </td>
            <td class="col-date">${UI.formatDate(file.addedAt)}</td>
            <td class="col-size">${UI.formatBytes(file.size)}</td>
            <td class="col-actions">
                ${!isPending ? `
                    <button class="action-btn download-btn" title="Download" aria-label="Download file ${file.name}">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn preview-btn" title="Preview" aria-label="Preview file ${file.name}">
                        <i class="fas fa-eye"></i>
                    </button>
                ` : ''}
                <button class="action-btn delete-btn" title="Delete" aria-label="Delete file ${file.name}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        const checkboxContainer = tr.querySelector('.checkbox-container');

        // Checkbox click
        checkboxContainer.onclick = (e) => {
            this.toggleSelection(file.id, false, e);
        };

        // Checkbox keyboard handler
        checkboxContainer.onkeydown = (e) => {
            this.handleCheckboxKeydown(e, file.id, false);
        };

        // Download button
        if (!isPending) {
            tr.querySelector('.download-btn').onclick = async (e) => {
                e.stopPropagation();
                console.log('[FileManager] Download clicked for:', file.name);
                try {
                    UI.showNotification(`Downloading ${file.name}...`, 'info');
                    await API.downloadFile(file.id, file.name);
                    UI.showNotification('Download started', 'success');
                } catch (error) {
                    UI.showNotification('Download failed', 'error');
                }
            };

            tr.querySelector('.preview-btn').onclick = (e) => {
                e.stopPropagation();
                console.log('[FileManager] Preview clicked for:', file.name);
                FileViewer.open(file);
            };

            // Also open viewer on name click
            tr.querySelector('.col-name').onclick = (e) => {
                e.stopPropagation();
                console.log('[FileManager] Name clicked for:', file.name);
                FileViewer.open(file);
            };
        }

        // Delete button
        tr.querySelector('.delete-btn').onclick = (e) => {
            e.stopPropagation();
            this.deleteItem(file.id, false);
        };

        // Drag start - for moving this file
        tr.ondragstart = (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify({
                id: file.id,
                isFolder: false,
                name: file.name
            }));
            e.dataTransfer.effectAllowed = 'move';
            tr.classList.add('dragging');
        };

        tr.ondragend = () => {
            tr.classList.remove('dragging');
        };

        return tr;
    }
};