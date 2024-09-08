/**
 * Path utilities for safe path handling
 */

const logger = require('../services/logger');

/**
 * Normalize and validate a file path
 * - Ensures path starts with /
 * - Ensures path ends with /
 * - Removes duplicate slashes
 * - Prevents path traversal attacks
 * @param {string} inputPath - Input path
 * @returns {string} Normalized path
 */
function normalizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
        return '/';
    }

    // Remove any null bytes or control characters
    let normalized = inputPath.replace(/[\x00-\x1f\x7f]/g, '');

    // Replace backslashes with forward slashes
    normalized = normalized.replace(/\\/g, '/');

    // Remove duplicate slashes
    normalized = normalized.replace(/\/+/g, '/');

    // Ensure starts with /
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }

    // Ensure ends with / (it's a directory path)
    if (!normalized.endsWith('/')) {
        normalized = normalized + '/';
    }

    // Prevent path traversal
    const parts = normalized.split('/').filter(p => p && p !== '.' && p !== '..');
    normalized = '/' + parts.join('/') + (parts.length > 0 ? '/' : '');

    // Final validation - if empty or just slashes, default to root
    if (!normalized || normalized === '//' || normalized.trim() === '') {
        return '/';
    }

    logger.debug(`Path normalized: "${inputPath}" -> "${normalized}"`);
    return normalized;
}

/**
 * Ensure all parent folders exist in the state
 * @param {Object} state - User state object
 * @param {string} targetPath - Target path
 */
function ensureFoldersExist(state, targetPath) {
    if (!targetPath || targetPath === '/') return;

    const parts = targetPath.split('/').filter(p => p);
    let currentPath = '/';

    for (const part of parts) {
        currentPath += part + '/';
        if (!state.folders.includes(currentPath)) {
            state.folders.push(currentPath);
            logger.debug(`Auto-created folder: ${currentPath}`);
        }
    }
}

module.exports = {
    normalizePath,
    ensureFoldersExist
};
