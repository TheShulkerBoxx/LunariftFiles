/**
 * Application State Management
 * Centralized state for the entire application
 */

const AppState = {
    // User authentication
    user: {
        username: localStorage.getItem('username') || '',
        token: localStorage.getItem('token') || ''
    },

    // File system
    files: [],
    folders: [],
    currentPath: '/',

    // Selection state
    selection: {
        files: new Set(),
        folders: new Set(),
        lastSelected: null // { id: string, isFolder: boolean } - anchor for shift-select
    },

    // Sorting
    sort: {
        column: 'name',
        order: 1 // 1 = ascending, -1 = descending
    },

    // Upload tracking - supports multiple concurrent sessions
    uploads: {
        sessions: new Map(),  // sessionId -> { files: Map, cancelled, startTime, totalBytesUploaded }
        activeSessionId: null // Currently displayed session
    },

    // UI state
    ui: {
        isAuthenticated: false,
        isLoading: false,
        sidebarVisible: true,
        searchQuery: ''
    },

    /**
     * Initialize state from localStorage
     */
    init() {
        if (this.user.token) {
            this.ui.isAuthenticated = true;
        }
    },

    /**
     * Set user credentials
     */
    setUser(username, token) {
        this.user.username = username;
        this.user.token = token;
        this.ui.isAuthenticated = true;

        localStorage.setItem('username', username);
        localStorage.setItem('token', token);
    },

    /**
     * Clear user session
     */
    clearUser() {
        this.user.username = '';
        this.user.token = '';
        this.ui.isAuthenticated = false;

        localStorage.removeItem('username');
        localStorage.removeItem('token');
    },

    /**
     * Set files and folders
     */
    setFiles(files, folders) {
        this.files = files || [];
        this.folders = folders || [];
    },

    /**
     * Set search query for filtering files and folders
     * @param {string} query - The search query
     */
    setSearchQuery(query) {
        this.ui.searchQuery = query.trim();
    },

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selection.files.clear();
        this.selection.folders.clear();
        this.selection.lastSelected = null;
    },

    /**
     * Toggle file selection
     */
    toggleFileSelection(fileId) {
        if (this.selection.files.has(fileId)) {
            this.selection.files.delete(fileId);
        } else {
            this.selection.files.add(fileId);
        }
        this.selection.lastSelected = { id: fileId, isFolder: false };
    },

    /**
     * Toggle folder selection
     */
    toggleFolderSelection(folderPath) {
        if (this.selection.folders.has(folderPath)) {
            this.selection.folders.delete(folderPath);
        } else {
            this.selection.folders.add(folderPath);
        }
        this.selection.lastSelected = { id: folderPath, isFolder: true };
    },

    /**
     * Get ordered list of all items (folders first, then files)
     */
    getOrderedItems() {
        const items = [];

        // Add folders first
        const folders = this.getFolders().sort();
        folders.forEach(folderName => {
            const fullPath = this.currentPath + folderName + '/';
            items.push({ id: fullPath, isFolder: true, name: folderName });
        });

        // Add files
        const files = this.getSortedFiles();
        files.forEach(file => {
            items.push({ id: file.id, isFolder: false, name: file.name });
        });

        return items;
    },

    /**
     * Select range of items between lastSelected and targetId
     */
    selectRange(targetId, targetIsFolder) {
        if (!this.selection.lastSelected) {
            // No anchor, just select the target
            if (targetIsFolder) {
                this.selection.folders.add(targetId);
            } else {
                this.selection.files.add(targetId);
            }
            this.selection.lastSelected = { id: targetId, isFolder: targetIsFolder };
            return;
        }

        const items = this.getOrderedItems();
        const anchorIndex = items.findIndex(item =>
            item.id === this.selection.lastSelected.id &&
            item.isFolder === this.selection.lastSelected.isFolder
        );
        const targetIndex = items.findIndex(item =>
            item.id === targetId && item.isFolder === targetIsFolder
        );

        if (anchorIndex === -1 || targetIndex === -1) {
            // Fallback to simple selection
            if (targetIsFolder) {
                this.selection.folders.add(targetId);
            } else {
                this.selection.files.add(targetId);
            }
            return;
        }

        // Select all items in range
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);

        for (let i = start; i <= end; i++) {
            const item = items[i];
            if (item.isFolder) {
                this.selection.folders.add(item.id);
            } else {
                this.selection.files.add(item.id);
            }
        }
    },

    /**
     * Get selection count
     */
    getSelectionCount() {
        return this.selection.files.size + this.selection.folders.size;
    },

    /**
     * Check if all current items are selected
     */
    isAllSelected() {
        const currentFiles = this.files.filter(f => f.path === this.currentPath);
        const currentFolders = this.getFolders();

        return currentFiles.every(f => this.selection.files.has(f.id)) &&
               currentFolders.every(folder => {
                   const fullPath = this.currentPath + folder + '/';
                   return this.selection.folders.has(fullPath);
               });
    },

    /**
     * Select all items in current path
     */
    selectAll() {
        const currentFiles = this.files.filter(f => f.path === this.currentPath);
        const currentFolders = this.getFolders();

        currentFiles.forEach(f => this.selection.files.add(f.id));
        currentFolders.forEach(folder => {
            const fullPath = this.currentPath + folder + '/';
            this.selection.folders.add(fullPath);
        });
    },

    /**
     * Deselect all items
     */
    deselectAll() {
        const currentFiles = this.files.filter(f => f.path === this.currentPath);
        const currentFolders = this.getFolders();

        currentFiles.forEach(f => this.selection.files.delete(f.id));
        currentFolders.forEach(folder => {
            const fullPath = this.currentPath + folder + '/';
            this.selection.folders.delete(fullPath);
        });
    },

    /**
     * Get unique folders in current path (filtered by search query)
     */
    getFolders() {
        const folderSet = new Set();

        // Add explicit folders
        this.folders
            .filter(p => p.startsWith(this.currentPath) && p !== this.currentPath)
            .forEach(p => {
                const relativePath = p.replace(this.currentPath, '');
                const firstFolder = relativePath.split('/')[0];
                if (firstFolder) folderSet.add(firstFolder);
            });

        // Add folders from file paths
        this.files
            .filter(f => f.path.startsWith(this.currentPath) && f.path !== this.currentPath)
            .forEach(f => {
                const relativePath = f.path.replace(this.currentPath, '');
                const firstFolder = relativePath.split('/')[0];
                if (firstFolder) folderSet.add(firstFolder);
            });

        let folders = Array.from(folderSet);

        // Apply search filter if query exists
        if (this.ui.searchQuery) {
            const query = this.ui.searchQuery.toLowerCase();
            folders = folders.filter(folder => folder.toLowerCase().includes(query));
        }

        return folders;
    },

    /**
     * Navigate to a path
     */
    navigateTo(path) {
        this.currentPath = path;
        this.clearSelection();
        // Clear search when navigating
        this.ui.searchQuery = '';
    },

    /**
     * Go back one directory level
     */
    goBack() {
        const parts = this.currentPath.split('/').filter(p => p);
        parts.pop();
        this.currentPath = '/' + parts.join('/') + (parts.length > 0 ? '/' : '');
        this.clearSelection();
        // Clear search when navigating
        this.ui.searchQuery = '';
    },

    /**
     * Set sort column and order
     */
    setSort(column) {
        if (this.sort.column === column) {
            this.sort.order *= -1;
        } else {
            this.sort.column = column;
            this.sort.order = 1;
        }
    },

    /**
     * Get sorted files for current path (filtered by search query)
     */
    getSortedFiles() {
        let currentFiles = this.files.filter(f => f.path === this.currentPath);

        // Apply search filter if query exists
        if (this.ui.searchQuery) {
            const query = this.ui.searchQuery.toLowerCase();
            currentFiles = currentFiles.filter(f => f.name.toLowerCase().includes(query));
        }

        return currentFiles.sort((a, b) => {
            const aVal = a[this.sort.column];
            const bVal = b[this.sort.column];
            return (aVal > bVal ? 1 : -1) * this.sort.order;
        });
    },

    /**
     * Get all files in current path (unsorted)
     */
    getCurrentFiles() {
        return this.files.filter(f => f.path === this.currentPath);
    }
};

// Initialize state on load
AppState.init();
