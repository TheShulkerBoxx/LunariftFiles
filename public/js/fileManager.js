/**
 * File Manager Module
 * Handles file operations, navigation, and rendering
 */

const FileManager = {
    /**
     * Initialize file manager
     */
    init() {
        this.attachEventListeners();
        this.loadFiles();

        // Auto-refresh every 5 seconds
        setInterval(() => {
            this.loadFiles(true);
        }, 5000);
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
            const data = await API.sync();
            if (data) {
                AppState.setFiles(data.files, data.folders);
                this.render();
            }
        } catch (error) {
            if (!silent) {
                UI.showNotification('Failed to load files', 'error');
            }
            console.error('Load files error:', error);
        }
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
     * Render file list
     */
    render() {
        this.renderPath();
        this.renderBackButton();
        this.renderSelectionBar();
        this.renderFileList();
        this.updateSelectAllCheckbox();
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
        if (AppState.isAllSelected()) {
            checkbox.classList.add('checked');
        } else {
            checkbox.classList.remove('checked');
        }
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
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <p>This folder is empty</p>
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
                <div class="checkbox-container ${isSelected ? 'checked' : ''}">
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
                <button class="action-btn delete-btn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        // Checkbox click
        tr.querySelector('.checkbox-container').onclick = (e) => {
            this.toggleSelection(fullPath, true, e);
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

        tr.innerHTML = `
            <td class="col-checkbox">
                <div class="checkbox-container ${isSelected ? 'checked' : ''}">
                    <div class="checkmark"></div>
                </div>
            </td>
            <td class="col-name">
                <i class="fas fa-file-alt text-blue-500"></i>
                <span class="item-name">${file.name}</span>
                ${isPending ? '<span class="badge badge-pending">UPLOAD...</span>' : ''}
                ${isDedup ? '<span class="badge badge-dedup">DEDUP</span>' : ''}
            </td>
            <td class="col-date">${UI.formatDate(file.addedAt)}</td>
            <td class="col-size">${UI.formatBytes(file.size)}</td>
            <td class="col-actions">
                ${!isPending ? `
                    <button class="action-btn download-btn" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn preview-btn" title="Preview">
                        <i class="fas fa-eye"></i>
                    </button>
                ` : ''}
                <button class="action-btn delete-btn" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        // Checkbox click
        tr.querySelector('.checkbox-container').onclick = (e) => {
            this.toggleSelection(file.id, false, e);
        };

        // Download button
        if (!isPending) {
            tr.querySelector('.download-btn').onclick = async (e) => {
                e.stopPropagation();
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
                FileViewer.open(file);
            };

            // Also open viewer on name click
            tr.querySelector('.col-name').onclick = (e) => {
                e.stopPropagation();
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
