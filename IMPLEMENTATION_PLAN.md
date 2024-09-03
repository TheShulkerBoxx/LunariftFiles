# Lunarift Files - Full-Stack Rewrite Implementation Plan

## Overview

This document outlines a complete rewrite of Lunarift Files - a cloud storage application that uses Discord as the storage backend. This covers both the **backend** (Node.js/Express) and **frontend** (HTML/CSS/JS or a framework).

---

## Current State Analysis

### Backend Issues
| Issue | Description |
|-------|-------------|
| Single File | All code in one `server.js` (688 lines) |
| Mixed Concerns | Auth, Discord, storage, and routes are intertwined |
| Global State | `userRegistry` is a global object with no cleanup |
| Duplicate Code | Two upload endpoints with similar logic |
| No Download | File download functionality is missing |
| Memory Risk | Large files are held entirely in memory |

### Frontend Issues
| Issue | Description |
|-------|-------------|
| Single HTML File | Everything in one 1400-line `index.html` |
| Inline JavaScript | ~800 lines of JS in script tags |
| No Component Structure | UI elements are not reusable |
| CDN Dependencies | Tailwind via CDN, not compiled |
| No State Management | Global variables for state |
| No Offline Support | Requires constant connection |

---

## Technology Decisions

### Backend Stack
| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 20+ | Current, stable |
| Framework | Express.js | Simple, familiar |
| Discord | discord.js | Official library |
| Auth | JWT + bcrypt | Stateless, secure |
| Validation | Zod | Type-safe validation |
| Logging | Winston | Production-ready |

### Frontend Stack (Choose One)

**Option A: Vanilla JS (Recommended for simplicity)**
- Modern ES6+ modules
- Custom component system
- Compiled Tailwind CSS
- No build step for dev, optional for prod

**Option B: React/Vite**
- Component-based architecture
- Strong ecosystem
- TypeScript support
- Requires build step

**Recommendation**: Option A for this project - keeps it simple and fast.

---

## Project Structure

```
/lunarift-files
├── package.json
├── .env
├── .env.example
├── README.md
│
├── /src                      # Backend source
│   ├── index.js              # Entry point
│   ├── /config
│   │   ├── index.js          # Environment & constants
│   │   └── logger.js         # Winston setup
│   ├── /middleware
│   │   ├── auth.js           # JWT verification
│   │   ├── errorHandler.js   # Global error handler
│   │   └── security.js       # Helmet, CORS
│   ├── /routes
│   │   ├── index.js          # Route aggregator
│   │   ├── auth.routes.js    # Login, register
│   │   ├── files.routes.js   # Upload, download, sync
│   │   └── system.routes.js  # Ping, nuke
│   ├── /services
│   │   ├── /discord
│   │   │   ├── client.js     # Discord client singleton
│   │   │   ├── channels.js   # Channel management
│   │   │   ├── uploader.js   # Chunked upload
│   │   │   └── downloader.js # File reconstruction
│   │   ├── auth.service.js   # Auth logic
│   │   └── storage.service.js# State management
│   ├── /models
│   │   ├── FileEntry.js      # File data structure
│   │   └── UserState.js      # User state structure
│   └── /utils
│       ├── path.js           # Path normalization
│       ├── hash.js           # Hashing utilities
│       └── retry.js          # Retry with backoff
│
├── /public                   # Frontend (served statically)
│   ├── index.html            # Main HTML shell
│   ├── /css
│   │   ├── main.css          # Compiled Tailwind + custom
│   │   └── components.css    # Component styles
│   ├── /js
│   │   ├── app.js            # Main application
│   │   ├── /core
│   │   │   ├── api.js        # API client
│   │   │   ├── auth.js       # Auth state management
│   │   │   ├── router.js     # Simple client-side router
│   │   │   └── state.js      # Global state management
│   │   ├── /components
│   │   │   ├── Sidebar.js    # Sidebar component
│   │   │   ├── FileList.js   # File/folder list
│   │   │   ├── UploadPanel.js# Upload progress panel
│   │   │   ├── Modal.js      # Modal component
│   │   │   └── Notification.js# Toast notifications
│   │   ├── /pages
│   │   │   ├── LoginPage.js  # Auth page
│   │   │   └── FilesPage.js  # Main files page
│   │   └── /utils
│   │       ├── format.js     # Formatters (bytes, dates)
│   │       └── dom.js        # DOM helpers
│   └── /assets
│       └── /icons            # SVG icons (optional)
│
└── /tests
    ├── /backend
    └── /frontend
```

---

# BACKEND IMPLEMENTATION

## Phase B1: Project Setup & Configuration

### Tasks

1. **Initialize project structure**
   ```bash
   mkdir -p src/{config,middleware,routes,services/discord,models,utils}
   mkdir -p public/{css,js/{core,components,pages,utils},assets}
   mkdir -p tests/{backend,frontend}
   ```

2. **Create `src/config/index.js`**
   ```javascript
   // Load and validate environment variables
   // Export frozen config object with all constants
   export const config = Object.freeze({
     PORT: process.env.PORT || 5050,
     DISCORD_TOKEN: process.env.DISCORD_BOT_TOKEN,
     GUILD_ID: process.env.GUILD_ID,
     AUTH_CHANNEL_ID: process.env.AUTH_CHANNEL_ID,
     JWT_SECRET: process.env.JWT_SECRET,
     JWT_EXPIRY: '7d',
     CHUNK_SIZE: 8 * 1024 * 1024,
     MAX_RETRIES: 3,
     RETRY_DELAY_BASE: 1000,
   });
   ```

3. **Create `src/config/logger.js`**
   - Winston logger with file and console transports
   - Different log levels for dev/prod

### Deliverables
- [ ] Project structure created
- [ ] Config module
- [ ] Logger module

---

## Phase B2: Discord Service Layer

### Tasks

1. **Discord client singleton** (`src/services/discord/client.js`)
   - Initialize Discord.js client
   - Handle login and ready events
   - Export singleton instance

2. **Channel service** (`src/services/discord/channels.js`)
   ```javascript
   export async function getOrCreateCategory(username) { ... }
   export async function getStorageChannel(username) { ... }
   export async function getMetadataChannel(username) { ... }
   ```

3. **Upload service** (`src/services/discord/uploader.js`)
   ```javascript
   export async function uploadChunk(channel, buffer, metadata) { ... }
   export async function uploadFile(channel, buffer, fileName) { ... }
   // Built-in retry with exponential backoff
   ```

4. **Download service** (`src/services/discord/downloader.js`) **[NEW!]**
   ```javascript
   export async function downloadFile(channel, messageIds) { ... }
   // Returns readable stream or buffer
   ```

### Deliverables
- [ ] Discord client module
- [ ] Channel management
- [ ] Upload with retry
- [ ] Download functionality

---

## Phase B3: Storage & State Management

### Tasks

1. **UserState model** (`src/models/UserState.js`)
   ```javascript
   class UserState {
     constructor() {
       this.files = [];
       this.folders = [];
     }
     addFile(entry) { ... }
     removeFile(id) { ... }
     findByHash(hash) { ... }
     toJSON() { ... }
   }
   ```

2. **Storage service** (`src/services/storage.service.js`)
   ```javascript
   const userCache = new Map();
   
   export async function getUserState(username) { ... }
   export async function saveUserState(username) { ... }
   export async function loadUserState(username) { ... }
   ```

### Deliverables
- [ ] UserState class
- [ ] Storage service with caching

---

## Phase B4: Authentication

### Tasks

1. **Auth service** (`src/services/auth.service.js`)
   ```javascript
   export async function register(username, password) { ... }
   export async function login(username, password) { ... }
   export function generateToken(username) { ... }
   export function verifyToken(token) { ... }
   ```

2. **Auth middleware** (`src/middleware/auth.js`)
   ```javascript
   export async function requireAuth(req, res, next) { ... }
   ```

3. **Auth routes** (`src/routes/auth.routes.js`)
   - POST /api/register
   - POST /api/login

### Deliverables
- [ ] Auth service
- [ ] Auth middleware
- [ ] Auth routes

---

## Phase B5: File Routes

### Tasks

1. **Files routes** (`src/routes/files.routes.js`)
   - `GET /api/sync` - Get file list
   - `POST /api/upload` - Upload files (streaming with busboy)
   - `GET /api/download/:id` - Download file **[NEW!]**
   - `POST /api/create-folder` - Create folder
   - `DELETE /api/item` - Delete file/folder

2. **System routes** (`src/routes/system.routes.js`)
   - `GET /api/ping` - Health check
   - `POST /api/nuke` - Delete all data

### Deliverables
- [ ] All file routes working
- [ ] Download endpoint working

---

## Phase B6: Entry Point & Integration

### Tasks

1. **Main entry** (`src/index.js`)
   ```javascript
   import express from 'express';
   import { config } from './config/index.js';
   import { discordClient } from './services/discord/client.js';
   import { setupRoutes } from './routes/index.js';
   // ... setup and start server
   ```

2. **Route aggregator** (`src/routes/index.js`)

### Deliverables
- [ ] Server starts and runs
- [ ] All routes connected

---

# FRONTEND IMPLEMENTATION

## Phase F1: HTML Shell & Styles

### Tasks

1. **Create minimal HTML** (`public/index.html`)
   ```html
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <title>Lunarift Files</title>
     <link rel="stylesheet" href="/css/main.css">
   </head>
   <body>
     <div id="app"></div>
     <script type="module" src="/js/app.js"></script>
   </body>
   </html>
   ```

2. **Create CSS structure**
   - `public/css/main.css` - Base styles, variables, utilities
   - `public/css/components.css` - Component-specific styles

3. **Design system**
   ```css
   :root {
     --color-bg-primary: #020617;
     --color-bg-secondary: #0f172a;
     --color-accent: #3b82f6;
     --color-success: #10b981;
     --color-error: #ef4444;
     --color-text-primary: #f1f5f9;
     --color-text-secondary: #94a3b8;
     /* ... */
   }
   ```

### Deliverables
- [ ] HTML shell
- [ ] CSS design system
- [ ] Base styles working

---

## Phase F2: Core JavaScript Modules

### Tasks

1. **API Client** (`public/js/core/api.js`)
   ```javascript
   class APIClient {
     constructor(baseUrl = '') { ... }
     setToken(token) { ... }
     async get(endpoint) { ... }
     async post(endpoint, data) { ... }
     async upload(endpoint, formData, onProgress) { ... }
     async delete(endpoint, data) { ... }
   }
   export const api = new APIClient();
   ```

2. **Auth Manager** (`public/js/core/auth.js`)
   ```javascript
   class AuthManager {
     constructor() {
       this.token = localStorage.getItem('token');
       this.user = localStorage.getItem('user');
     }
     isLoggedIn() { ... }
     login(token, user) { ... }
     logout() { ... }
   }
   export const auth = new AuthManager();
   ```

3. **State Manager** (`public/js/core/state.js`)
   ```javascript
   class StateManager {
     constructor() {
       this.state = {};
       this.listeners = new Map();
     }
     set(key, value) { ... }
     get(key) { ... }
     subscribe(key, callback) { ... }
   }
   export const state = new StateManager();
   ```

4. **Simple Router** (`public/js/core/router.js`)
   ```javascript
   class Router {
     constructor() {
       this.routes = new Map();
     }
     register(path, handler) { ... }
     navigate(path) { ... }
   }
   export const router = new Router();
   ```

### Deliverables
- [ ] API client with auth headers
- [ ] Auth state management
- [ ] Simple state management
- [ ] Basic routing

---

## Phase F3: UI Components

### Tasks

1. **Base Component Pattern**
   ```javascript
   // public/js/components/Component.js
   export class Component {
     constructor(container) {
       this.container = container;
     }
     render() { throw new Error('Must implement render()'); }
     mount() { this.container.innerHTML = this.render(); this.afterMount(); }
     afterMount() {}
     destroy() {}
   }
   ```

2. **Notification Component** (`public/js/components/Notification.js`)
   ```javascript
   export function showNotification(message, type = 'info') { ... }
   ```

3. **Modal Component** (`public/js/components/Modal.js`)
   ```javascript
   export class Modal {
     static confirm(title, message) { ... }
     static prompt(title, defaultValue) { ... }
   }
   ```

4. **Sidebar Component** (`public/js/components/Sidebar.js`)
   - User info
   - Upload panel
   - Action buttons

5. **UploadPanel Component** (`public/js/components/UploadPanel.js`)
   - Progress tracking
   - File list with status
   - Cancel button
   - Speed/stats display

6. **FileList Component** (`public/js/components/FileList.js`)
   - Table with sorting
   - File/folder rows
   - Selection handling
   - Context menu (optional)

### Deliverables
- [ ] Component base class
- [ ] Notification system
- [ ] Modal dialogs
- [ ] Sidebar
- [ ] Upload panel
- [ ] File list

---

## Phase F4: Pages

### Tasks

1. **Login Page** (`public/js/pages/LoginPage.js`)
   - Login/register form
   - Validation
   - Error display
   - Toggle between modes

2. **Files Page** (`public/js/pages/FilesPage.js`)
   - Sidebar + main content layout
   - File/folder navigation
   - Upload handling
   - Selection management

### Deliverables
- [ ] Login page working
- [ ] Files page working

---

## Phase F5: Upload System

### Tasks

1. **Upload Manager**
   ```javascript
   class UploadManager {
     constructor() {
       this.queue = [];
       this.active = new Map();
       this.maxParallel = 5;
     }
     addFiles(files, targetPath) { ... }
     start() { ... }
     cancel() { ... }
     onProgress(callback) { ... }
   }
   ```

2. **Features**
   - Parallel uploads (configurable limit)
   - Per-file retry with backoff
   - Progress tracking
   - Cancel support
   - Path normalization

### Deliverables
- [ ] Upload manager
- [ ] Progress UI updates
- [ ] Retry logic

---

## Phase F6: Main Application

### Tasks

1. **App Entry** (`public/js/app.js`)
   ```javascript
   import { auth } from './core/auth.js';
   import { router } from './core/router.js';
   import { LoginPage } from './pages/LoginPage.js';
   import { FilesPage } from './pages/FilesPage.js';
   
   function init() {
     if (auth.isLoggedIn()) {
       new FilesPage(document.getElementById('app')).mount();
     } else {
       new LoginPage(document.getElementById('app')).mount();
     }
   }
   
   document.addEventListener('DOMContentLoaded', init);
   ```

### Deliverables
- [ ] App initializes correctly
- [ ] Auth flow works
- [ ] All features functional

---

# TESTING & POLISH

## Phase T1: Backend Testing

- [ ] Unit tests for utilities (path, hash)
- [ ] Integration tests for auth flow
- [ ] Integration tests for upload/download

## Phase T2: Frontend Testing

- [ ] Component tests
- [ ] E2E tests for critical flows

## Phase T3: Polish

- [ ] Keyboard shortcuts
- [ ] Drag-and-drop upload
- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Mobile responsive

---

# API REFERENCE

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/ping` | Health check | No |
| POST | `/api/register` | Create user | No |
| POST | `/api/login` | Login | No |
| GET | `/api/sync` | Get files/folders | Yes |
| POST | `/api/upload` | Upload files | Yes |
| GET | `/api/download/:id` | Download file | Yes |
| POST | `/api/create-folder` | Create folder | Yes |
| DELETE | `/api/item` | Delete item | Yes |
| POST | `/api/nuke` | Delete all | Yes |

---

# TIMELINE ESTIMATE

| Phase | Description | Time |
|-------|-------------|------|
| B1 | Backend Setup | 30 min |
| B2 | Discord Services | 1.5 hr |
| B3 | Storage Service | 1 hr |
| B4 | Authentication | 45 min |
| B5 | File Routes | 1.5 hr |
| B6 | Integration | 30 min |
| F1 | HTML/CSS | 1 hr |
| F2 | Core JS | 1.5 hr |
| F3 | Components | 2 hr |
| F4 | Pages | 1 hr |
| F5 | Upload System | 1 hr |
| F6 | App Integration | 30 min |
| T1-T3 | Testing/Polish | 2 hr |
| **Total** | | **~14 hours** |

---

# MIGRATION CHECKLIST

- [ ] All API endpoints functional
- [ ] Login/register works
- [ ] File upload works
- [ ] File download works (NEW)
- [ ] Folder creation works
- [ ] File/folder deletion works
- [ ] Deduplication works
- [ ] Upload progress shows
- [ ] Multiple file upload works
- [ ] Folder upload works
- [ ] Path normalization works
- [ ] Retry on failure works
- [ ] Nuke storage works
- [ ] Mobile responsive

---

# FUTURE ENHANCEMENTS

After the rewrite, consider:

1. **Performance**
   - Streaming downloads (don't buffer entire file)
   - Web Workers for hashing
   - Service Worker for offline

2. **Features**
   - File preview (images, PDFs)
   - File sharing (public links)
   - Search
   - File versioning
   - Trash/recycle bin

3. **Developer Experience**
   - TypeScript migration
   - API documentation (Swagger)
   - Docker containerization
