/**
 * Hash utilities for file deduplication
 */

const crypto = require('crypto');

/**
 * Calculate SHA-256 hash of a buffer
 * @param {Buffer} buffer - File buffer
 * @returns {string} Hex hash string
 */
function calculateBufferHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate unique file ID
 * @returns {string} Unique identifier
 */
function generateUniqueId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

module.exports = {
    calculateBufferHash,
    generateUniqueId
};
