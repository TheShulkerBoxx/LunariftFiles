# Frontend Rewrite - Implementation Plan

## Current State Analysis
- **Size**: 1,421 lines in a single HTML file
- **Structure**: Monolithic with inline styles, HTML, and JavaScript
- **Issues**: 
  - Hard to maintain and test
  - No component separation
  - Mixed concerns (styling, logic, markup)
  - No build process or modern tooling
  - Difficult to extend

## Goals
1. **Modular Architecture**: Separate files for HTML, CSS, and JavaScript
2. **Component-Based**: Reusable UI components
3. **Clean Code**: Better organization and maintainability
4. **Modern Practices**: ES6+ features, async/await
5. **Testing**: Easy to test individual components
6. **Performance**: Optimize rendering and state management

## New Architecture

### Directory Structure
```
public/
├── index.html (minimal, loads resources)
├── css/
│   ├── main.css (base styles, variables)
│   ├── components.css (UI components)
│   └── animations.css (transitions, keyframes)
├── js/
│   ├── app.js (main initialization)
│   ├── api.js (API communication)
│   ├── auth.js (authentication logic)
│   ├── fileManager.js (file operations)
│   ├── uploadManager.js (upload handling)
│   ├── ui.js (UI utilities, notifications)
│   └── state.js (application state)
└── components/
    ├── auth-page.html (authentication UI)
    ├── sidebar.html (navigation sidebar)
    ├── file-list.html (file browser)
    └── upload-panel.html (upload progress)
```

## Implementation Phases

### Phase 1: Project Structure Setup
- [ ] Create new directory structure
- [ ] Set up minimal index.html
- [ ] Create placeholder files for all modules

### Phase 2: Core Modules
- [ ] **state.js**: Application state management
  - Current path tracking
  - File/folder lists
  - Selection state
  - Upload tracking
  
- [ ] **api.js**: API communication
  - Centralized fetch wrapper
  - Token management
  - Error handling
  - Response parsing

- [ ] **ui.js**: UI utilities
  - Notification system
  - Modal dialogs (confirm, prompt)
  - Loading states
  - Format helpers (bytes, dates)

### Phase 3: Authentication System
- [ ] **auth.js**: Authentication logic
  - Login/register functionality
  - Token storage
  - Session management
  - Auto-logout
  
- [ ] **auth-page.html**: Authentication UI
  - Login form
  - Registration form
  - Error display
  - Mode toggling

### Phase 4: File Management
- [ ] **fileManager.js**: File operations
  - Load files/folders
  - Create folders
  - Delete items
  - Bulk operations
  - Sorting and filtering
  - Navigation (go back, path handling)

- [ ] **file-list.html**: File browser UI
  - Table structure
  - Row rendering
  - Selection handling
  - Context actions

### Phase 5: Upload System
- [ ] **uploadManager.js**: Upload handling
  - File selection processing
  - Parallel upload queue
  - Retry logic
  - Progress tracking
  - Deduplication handling
  - Path normalization
  
- [ ] **upload-panel.html**: Upload UI
  - Progress panel
  - Individual file progress
  - Overall progress
  - Status indicators
  - Cancel functionality

### Phase 6: Sidebar & Navigation
- [ ] **sidebar.html**: Navigation UI
  - User info display
  - Action buttons
  - Upload menu
  - Storage stats (NEW)
  - Settings (NEW)

### Phase 7: Styling
- [ ] **main.css**: Base styles
  - CSS variables (colors, spacing)
  - Typography
  - Layout utilities
  - Scrollbar styling
  
- [ ] **components.css**: Component styles
  - Buttons
  - Forms
  - Tables
  - Cards
  - Modals
  
- [ ] **animations.css**: Animations
  - Transitions
  - Keyframe animations
  - Loading spinners

### Phase 8: Integration & Testing
- [ ] Integrate all modules in app.js
- [ ] Test authentication flow
- [ ] Test file operations (CRUD)
- [ ] Test upload functionality
- [ ] Test selection and bulk operations
- [ ] Test keyboard shortcuts
- [ ] Test error handling
- [ ] Test responsive behavior

### Phase 9: New Features
- [ ] Storage info display (file count, metadata size)
- [ ] Settings panel
- [ ] Dark/light theme toggle (optional)
- [ ] Drag & drop upload
- [ ] File preview (optional)
- [ ] Search functionality (optional)

### Phase 10: Polish & Optimization
- [ ] Code review and cleanup
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Browser compatibility testing
- [ ] Documentation

## Key Improvements Over Current Frontend

### 1. **Separation of Concerns**
- CSS: All styling in separate files
- HTML: Semantic markup without inline styles
- JS: Modular, single-responsibility functions

### 2. **State Management**
```javascript
// Centralized state object
const state = {
  user: { username: '', token: '' },
  files: [],
  folders: [],
  currentPath: '/',
  selection: { files: new Set(), folders: new Set() },
  uploads: new Map(),
  sort: { column: 'name', order: 1 }
};
```

### 3. **Component Pattern**
```javascript
// Reusable components
class FileRow {
  constructor(file) { this.file = file; }
  render() { /* returns HTML */ }
  onClick() { /* handle click */ }
}
```

### 4. **Event-Driven Architecture**
```javascript
// Custom events for loose coupling
document.dispatchEvent(new CustomEvent('files:loaded', { detail: files }));
document.addEventListener('files:loaded', updateUI);
```

### 5. **Error Boundaries**
```javascript
// Graceful error handling
try {
  await operation();
} catch (error) {
  logError(error);
  showNotification(error.message, 'error');
  rollbackState();
}
```

## Testing Strategy

### Manual Testing Checklist
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Register new account
- [ ] Upload single file
- [ ] Upload multiple files
- [ ] Upload folder
- [ ] Create new folder
- [ ] Navigate into folder
- [ ] Navigate back to root
- [ ] Select single item
- [ ] Select all items
- [ ] Delete single item
- [ ] Delete multiple items
- [ ] Bulk move operation
- [ ] Cancel upload
- [ ] Upload with retry on failure
- [ ] Deduplication detection
- [ ] Sort by name
- [ ] Sort by date
- [ ] Sort by size
- [ ] Keyboard shortcuts (Ctrl+A, Delete)
- [ ] Session persistence
- [ ] Logout
- [ ] Nuke storage

## Success Criteria

1. **Functionality**: All existing features work correctly
2. **Code Quality**: Clean, maintainable, well-documented code
3. **Performance**: Fast rendering, responsive UI
4. **User Experience**: Smooth interactions, clear feedback
5. **Reliability**: Proper error handling, no crashes
6. **Maintainability**: Easy to add new features
7. **Testability**: Components can be tested independently

## Notes

- Keep backward compatibility with existing API
- Maintain current UI/UX design aesthetics
- No external dependencies (keep it vanilla JS)
- Progressive enhancement approach
- Mobile-responsive design
