/**
 * Chunked Upload Service
 * Handles reassembly of large files uploaded in chunks to bypass proxy limits (e.g., Cloudflare 100MB)
 * Chunks are stored in memory temporarily and processed when complete
 */

const crypto = require('crypto');
const { processFileUpload } = require('./uploadService');
const { saveUserEnv } = require('../discord/channels');
const logger = require('../logger');

// In-memory storage for pending chunked uploads
// Key: uploadId, Value: { chunks: Map<index, Buffer>, metadata: {...}, lastActivity: Date }
const pendingUploads = new Map();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
// Upload timeout (30 minutes of inactivity)
const UPLOAD_TIMEOUT = 30 * 60 * 1000;

/**
 * Initialize a new chunked upload session
 * @param {string} uploadId - Unique identifier for this upload
 * @param {Object} metadata - File metadata (filename, totalChunks, totalSize, path)
 * @returns {Object} Session info
 */
function initChunkedUpload(uploadId, metadata) {
    if (pendingUploads.has(uploadId)) {
        logger.warn(`[ChunkedUpload] Upload ${uploadId} already exists, resetting`);
    }

    pendingUploads.set(uploadId, {
        chunks: new Map(),
        metadata: {
            filename: metadata.filename,
            totalChunks: parseInt(metadata.totalChunks),
            totalSize: parseInt(metadata.totalSize),
            path: metadata.path || '/',
            username: metadata.username
        },
        lastActivity: Date.now(),
        receivedBytes: 0
    });

    logger.info(`[ChunkedUpload] Initialized upload ${uploadId}: ${metadata.filename} (${metadata.totalChunks} chunks, ${(metadata.totalSize / 1024 / 1024).toFixed(2)}MB)`);

    return {
        uploadId,
        status: 'initialized',
        expectedChunks: parseInt(metadata.totalChunks)
    };
}

/**
 * Add a chunk to a pending upload
 * @param {string} uploadId - Upload session ID
 * @param {number} chunkIndex - Index of this chunk (0-based)
 * @param {Buffer} chunkData - Chunk data
 * @returns {Object} Status of the upload
 */
function addChunk(uploadId, chunkIndex, chunkData) {
    const upload = pendingUploads.get(uploadId);

    if (!upload) {
        throw new Error(`Upload session ${uploadId} not found. Initialize first.`);
    }

    // Update activity timestamp
    upload.lastActivity = Date.now();

    // Store chunk
    upload.chunks.set(chunkIndex, chunkData);
    upload.receivedBytes += chunkData.length;

    const receivedChunks = upload.chunks.size;
    const totalChunks = upload.metadata.totalChunks;

    logger.info(`[ChunkedUpload] ${uploadId}: Received chunk ${chunkIndex + 1}/${totalChunks} (${(chunkData.length / 1024 / 1024).toFixed(2)}MB)`);

    return {
        uploadId,
        chunkIndex,
        receivedChunks,
        totalChunks,
        complete: receivedChunks === totalChunks,
        progress: Math.round((receivedChunks / totalChunks) * 100)
    };
}

/**
 * Check if upload is complete and ready for processing
 * @param {string} uploadId - Upload session ID
 * @returns {boolean}
 */
function isUploadComplete(uploadId) {
    const upload = pendingUploads.get(uploadId);
    if (!upload) return false;
    return upload.chunks.size === upload.metadata.totalChunks;
}

/**
 * Reassemble chunks and process the complete file
 * @param {string} uploadId - Upload session ID
 * @param {Object} userEnv - User environment
 * @returns {Promise<Object>} Upload result
 */
async function finalizeUpload(uploadId, userEnv) {
    const upload = pendingUploads.get(uploadId);

    if (!upload) {
        throw new Error(`Upload session ${uploadId} not found`);
    }

    if (!isUploadComplete(uploadId)) {
        const missing = [];
        for (let i = 0; i < upload.metadata.totalChunks; i++) {
            if (!upload.chunks.has(i)) {
                missing.push(i);
            }
        }
        throw new Error(`Upload incomplete. Missing chunks: ${missing.join(', ')}`);
    }

    logger.info(`[ChunkedUpload] Finalizing ${uploadId}: ${upload.metadata.filename}`);

    try {
        // Reassemble chunks in order
        const sortedChunks = [];
        for (let i = 0; i < upload.metadata.totalChunks; i++) {
            const chunk = upload.chunks.get(i);
            if (!chunk) {
                throw new Error(`Missing chunk ${i}`);
            }
            sortedChunks.push(chunk);
        }

        const fileBuffer = Buffer.concat(sortedChunks);
        logger.info(`[ChunkedUpload] Reassembled ${upload.metadata.filename}: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);

        // Verify size matches expected
        if (fileBuffer.length !== upload.metadata.totalSize) {
            logger.warn(`[ChunkedUpload] Size mismatch: expected ${upload.metadata.totalSize}, got ${fileBuffer.length}`);
        }

        // Process the file using existing upload service
        const result = await processFileUpload(
            upload.metadata.username,
            userEnv,
            fileBuffer,
            upload.metadata.filename,
            upload.metadata.path
        );

        // Save user state
        await saveUserEnv(upload.metadata.username);

        // Cleanup
        pendingUploads.delete(uploadId);

        logger.info(`[ChunkedUpload] Complete: ${upload.metadata.filename} -> ${upload.metadata.path}`);

        return {
            success: true,
            ...result,
            chunkedUpload: true
        };

    } catch (error) {
        // Cleanup on error
        pendingUploads.delete(uploadId);
        logger.error(`[ChunkedUpload] Failed to finalize ${uploadId}:`, error);
        throw error;
    }
}

/**
 * Cancel and cleanup a pending upload
 * @param {string} uploadId - Upload session ID
 */
function cancelUpload(uploadId) {
    if (pendingUploads.has(uploadId)) {
        const upload = pendingUploads.get(uploadId);
        logger.info(`[ChunkedUpload] Cancelled: ${uploadId} (${upload.metadata.filename})`);
        pendingUploads.delete(uploadId);
        return true;
    }
    return false;
}

/**
 * Get status of a pending upload
 * @param {string} uploadId - Upload session ID
 * @returns {Object|null} Upload status or null if not found
 */
function getUploadStatus(uploadId) {
    const upload = pendingUploads.get(uploadId);
    if (!upload) return null;

    return {
        uploadId,
        filename: upload.metadata.filename,
        path: upload.metadata.path,
        totalChunks: upload.metadata.totalChunks,
        receivedChunks: upload.chunks.size,
        receivedBytes: upload.receivedBytes,
        totalSize: upload.metadata.totalSize,
        progress: Math.round((upload.chunks.size / upload.metadata.totalChunks) * 100),
        complete: upload.chunks.size === upload.metadata.totalChunks,
        lastActivity: upload.lastActivity
    };
}

/**
 * Cleanup stale uploads (called periodically)
 */
function cleanupStaleUploads() {
    const now = Date.now();
    let cleaned = 0;

    for (const [uploadId, upload] of pendingUploads) {
        if (now - upload.lastActivity > UPLOAD_TIMEOUT) {
            logger.info(`[ChunkedUpload] Cleaning up stale upload: ${uploadId} (${upload.metadata.filename})`);
            pendingUploads.delete(uploadId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.info(`[ChunkedUpload] Cleaned up ${cleaned} stale uploads`);
    }
}

// Start cleanup interval
setInterval(cleanupStaleUploads, CLEANUP_INTERVAL);

module.exports = {
    initChunkedUpload,
    addChunk,
    isUploadComplete,
    finalizeUpload,
    cancelUpload,
    getUploadStatus
};
