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
        const newPath = await UI.showPrompt('Enter destination path:', AppState.currentPath);

        if (!newPath) return;

        // Note: Move operation not implemented in backend yet
        UI.showNotification('Move operation not yet implemented', 'info');
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
                const message = `Files: ${info.fileCount} | Folders: ${info.folderCount} | Metadata: ${info.metadataSize.megabytes} MB (${info.metadataSize.percentage}%)`;
                UI.showNotification(message, 'info');
            }
        } catch (error) {
            UI.showNotification('Failed to get storage info', 'error');
        }
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
     * Toggle item selection
     */
    toggleSelection(id, isFolder, event) {
        event.stopPropagation();

        if (isFolder) {
            AppState.toggleFolderSelection(id);
        } else {
            AppState.toggleFileSelection(id);
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

        return tr;
    },

    /**
     * Create file row
     */
    createFileRow(file, isSelected) {
        const tr = document.createElement('tr');
        tr.className = 'file-row' + (isSelected ? ' selected' : '') +
            (file.status === 'PENDING' ? ' pending' : '');

        const isPending = file.status === 'PENDING';
        const isDedup = file.isReference;

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
                ${isDedup ? '<span class="badge badge-dedup">DEDUP</span>' : ''}
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

        return tr;
    }
};
