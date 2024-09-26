/**
 * Main Application Entry Point
 * Initializes the application
 */

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Lunarift Files - Starting...');
    
    // Initialize authentication
    Auth.init();
});

// Handle page visibility change to refresh data
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && AppState.ui.isAuthenticated) {
        FileManager.loadFiles(true);
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    UI.showNotification('An unexpected error occurred', 'error');
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
});
