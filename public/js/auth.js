/**
 * Authentication Module
 * Handles login, registration, and session management
 */

const Auth = {
    isRegisterMode: false,

    /**
     * Initialize authentication
     */
    init() {
        if (AppState.ui.isAuthenticated) {
            this.showMainApp();
        } else {
            this.showAuthPage();
        }
    },

    /**
     * Show authentication page
     */
    showAuthPage() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="auth-page">
                <div class="auth-container">
                    <h1 class="auth-title">LUNARIFT_FILES</h1>
                    <p class="auth-subtitle">Secure Cloud Storage</p>

                    <div id="authError" class="auth-error hidden"></div>

                    <input type="text" id="usernameInput" placeholder="Username" class="auth-input" autocomplete="username">
                    <input type="password" id="passwordInput" placeholder="Password" class="auth-input" autocomplete="current-password">

                    <button id="authButton" class="auth-button">
                        <span id="authButtonText">Sign In</span>
                        <div id="authSpinner" class="spinner hidden"></div>
                    </button>

                    <p class="auth-toggle" id="authToggle">
                        <span id="authToggleText">Need an account? Register</span>
                    </p>

                    <div class="auth-hint">
                        <p>Password must be 8+ characters with uppercase, lowercase, and number</p>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        document.getElementById('authButton').onclick = () => this.handleAuth();
        document.getElementById('authToggle').onclick = () => this.toggleMode();
        
        // Enter key support
        document.getElementById('usernameInput').onkeydown = (e) => {
            if (e.key === 'Enter') this.handleAuth();
        };
        document.getElementById('passwordInput').onkeydown = (e) => {
            if (e.key === 'Enter') this.handleAuth();
        };
    },

    /**
     * Toggle between login and register modes
     */
    toggleMode() {
        this.isRegisterMode = !this.isRegisterMode;
        const buttonText = document.getElementById('authButtonText');
        const toggleText = document.getElementById('authToggleText');

        if (this.isRegisterMode) {
            buttonText.textContent = 'Register';
            toggleText.textContent = 'Have an account? Sign In';
        } else {
            buttonText.textContent = 'Sign In';
            toggleText.textContent = 'Need an account? Register';
        }

        // Clear error
        this.hideError();
    },

    /**
     * Handle authentication (login or register)
     */
    async handleAuth() {
        const username = document.getElementById('usernameInput').value.trim();
        const password = document.getElementById('passwordInput').value;

        // Validation
        if (!username || !password) {
            this.showError('Please enter username and password');
            return;
        }

        if (username.length < 3 || username.length > 20) {
            this.showError('Username must be 3-20 characters');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            this.showError('Username can only contain letters, numbers, and underscores');
            return;
        }

        if (password.length < 8) {
            this.showError('Password must be at least 8 characters');
            return;
        }

        if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
            this.showError('Password must contain uppercase, lowercase, and number');
            return;
        }

        // Show loading
        this.setLoading(true);
        this.hideError();

        try {
            if (this.isRegisterMode) {
                await this.register(username, password);
            } else {
                await this.login(username, password);
            }
        } catch (error) {
            this.showError(error.message || 'Authentication failed');
            this.setLoading(false);
        }
    },

    /**
     * Login user
     */
    async login(username, password) {
        try {
            const result = await API.login(username, password);
            
            if (!result) {
                throw new Error('Login failed');
            }

            // Store credentials
            AppState.setUser(result.username, result.token);

            // Show main app
            this.showMainApp();
            UI.showNotification('Welcome back, ' + result.username + '!', 'success');

            // Load files
            FileManager.loadFiles();
        } catch (error) {
            throw new Error('Invalid credentials');
        }
    },

    /**
     * Register new user
     */
    async register(username, password) {
        try {
            const result = await API.register(username, password);
            
            if (!result || !result.success) {
                throw new Error('Registration failed');
            }

            // Auto-login after registration
            await this.login(username, password);
        } catch (error) {
            throw new Error('Username already exists or registration failed');
        }
    },

    /**
     * Logout user
     */
    logout() {
        AppState.clearUser();
        AppState.setFiles([], []);
        AppState.clearSelection();
        this.showAuthPage();
        UI.showNotification('Logged out successfully', 'info');
    },

    /**
     * Show main application
     */
    showMainApp() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="main-layout">
                <!-- Sidebar -->
                <div id="sidebar" class="sidebar">
                    <div class="sidebar-header">
                        <h1 class="sidebar-title">Lunarift Files</h1>
                        <p id="usernameDisplay" class="sidebar-username"></p>
                    </div>

                    <!-- Upload Panel (hidden by default) -->
                    <div id="uploadPanel" class="upload-panel hidden">
                        <div class="upload-panel-header">
                            <div class="upload-panel-title">
                                <i class="fas fa-cloud-upload-alt"></i>
                                <span id="uploadPanelTitle">Uploading...</span>
                            </div>
                            <button id="cancelUploadBtn" class="upload-cancel-btn">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>

                        <div class="overall-progress-bar">
                            <div id="overallProgressFill" class="overall-progress-fill"></div>
                        </div>

                        <div id="uploadList" class="upload-list"></div>

                        <div class="upload-stats">
                            <div class="upload-stats-row">
                                <span id="uploadStatsText">0 / 0 files</span>
                                <span id="uploadSpeedText">-- MB/s</span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="sidebar-actions">
                        <button id="newFolderBtn" class="sidebar-btn">
                            <i class="fas fa-folder-plus"></i> New Folder
                        </button>

                        <div class="upload-menu-container">
                            <button id="uploadMenuBtn" class="sidebar-btn primary">
                                <i class="fas fa-cloud-upload-alt"></i> Upload...
                            </button>
                            <div id="uploadMenu" class="upload-menu hidden">
                                <button id="uploadFilesBtn" class="upload-menu-item">
                                    <i class="fas fa-file"></i> Files
                                </button>
                                <button id="uploadFolderBtn" class="upload-menu-item">
                                    <i class="fas fa-folder"></i> Folder
                                </button>
                            </div>
                        </div>

                        <button id="storageInfoBtn" class="sidebar-btn">
                            <i class="fas fa-chart-pie"></i> Storage Info
                        </button>

                        <button id="nukeBtn" class="sidebar-btn danger">
                            <i class="fas fa-radiation"></i> Nuke Storage
                        </button>

                        <button id="latencyBtn" class="sidebar-btn">
                            <i class="fas fa-tachometer-alt"></i> Check Latency
                        </button>

                        <button id="logoutBtn" class="sidebar-btn secondary">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>

                    <!-- Hidden file inputs -->
                    <input type="file" id="fileInput" multiple class="hidden">
                    <input type="file" id="folderInput" webkitdirectory directory class="hidden">
                </div>

                <!-- Mobile Sidebar Overlay -->
                <div id="sidebarOverlay" class="sidebar-overlay hidden"></div>

                <!-- Main Content -->
                <div id="mainView" class="main-view">
                    <!-- Header -->
                    <header class="main-header">
                        <div class="main-header-left">
                            <button id="hamburgerBtn" class="hamburger-btn">
                                <i class="fas fa-bars"></i>
                            </button>
                            <button id="backBtn" class="back-btn">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <span id="pathDisplay" class="path-display">/</span>
                        </div>

                        <div id="selectionBar" class="selection-bar hidden">
                            <span id="selectionCount">0 selected</span>
                            <button id="bulkDownloadBtn" class="selection-action">
                                <i class="fas fa-download"></i>
                            </button>
                            <button id="bulkMoveBtn" class="selection-action">
                                <i class="fas fa-arrows-alt"></i>
                            </button>
                            <button id="bulkDeleteBtn" class="selection-action danger">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>

                        <button id="refreshBtn" class="refresh-btn">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </header>

                    <!-- File List -->
                    <div id="fileListContainer" class="file-list-container">
                        <!-- Drop Zone Overlay -->
                        <div id="dropZone" class="drop-zone hidden">
                            <div class="drop-zone-content">
                                <i class="fas fa-cloud-upload-alt"></i>
                                <p>Drop files here to upload</p>
                            </div>
                        </div>

                        <table class="file-table">
                            <thead>
                                <tr>
                                    <th class="col-checkbox">
                                        <div class="checkbox-container" id="selectAllCheckbox" role="checkbox" aria-checked="false" aria-label="Select all items" tabindex="0">
                                            <div class="checkmark"></div>
                                        </div>
                                    </th>
                                    <th class="col-name sortable" data-sort="name">
                                        Name <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="col-date sortable" data-sort="addedAt">
                                        Date Added <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="col-size sortable" data-sort="size">
                                        Size <i class="fas fa-sort"></i>
                                    </th>
                                    <th class="col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="fileListBody">
                                <!-- Files will be rendered here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Set username
        document.getElementById('usernameDisplay').textContent = AppState.user.username;

        // Initialize file manager
        FileManager.init();
        UploadManager.init();
        FileViewer.init();
    },

    /**
     * Show error message
     */
    showError(message) {
        const errorDiv = document.getElementById('authError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        }
    },

    /**
     * Hide error message
     */
    hideError() {
        const errorDiv = document.getElementById('authError');
        if (errorDiv) {
            errorDiv.classList.add('hidden');
        }
    },

    /**
     * Set loading state
     */
    setLoading(isLoading) {
        const button = document.getElementById('authButton');
        const buttonText = document.getElementById('authButtonText');
        const spinner = document.getElementById('authSpinner');

        if (isLoading) {
            button.disabled = true;
            buttonText.classList.add('hidden');
            spinner.classList.remove('hidden');
        } else {
            button.disabled = false;
            buttonText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    }
};
