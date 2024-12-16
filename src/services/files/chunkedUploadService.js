/**
 * Chunked Upload Service
 * Handles large file uploads in chunks to bypass proxy limits (e.g., Cloudflare 100MB)
 * Each chunk is immediately split into 8MB Discord chunks and uploaded - no RAM storage
 */

const crypto = require('crypto');
const { AttachmentBuilder } = require('discord.js');
const { client } = require('../discord/client');
const { saveUserEnv } = require('../discord/channels');
const { generateUniqueId } = require('../../utils/hashUtils');
const { normalizePath, ensureFoldersExist } = require('../../utils/pathUtils');
const config = require('../../config/config');
const logger = require('../logger');

const DISCORD_CHUNK_SIZE = config.upload.chunkSize; // 8MB

// In-memory storage for pending chunked uploads (only metadata, not file data)
const pendingUploads = new Map();

// Cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
// Upload timeout (30 minutes of inactivity)
const UPLOAD_TIMEOUT = 30 * 60 * 1000;

/**
 * Get a unique filename by adding (1), (2), etc. if name already exists
 */
function getUniqueFilename(files, fileName, targetPath) {
    const existingNames = files
        .filter(f => f.path === targetPath)
        .map(f => f.name);

    if (!existingNames.includes(fileName)) {
        return fileName;
    }

    const lastDot = fileName.lastIndexOf('.');
    let baseName, extension;

    if (lastDot === -1) {
        baseName = fileName;
        extension = '';
    } else {
        baseName = fileName.substring(0, lastDot);
        extension = fileName.substring(lastDot);
    }

    let counter = 1;
    let newName;

    do {
        newName = `${baseName} (${counter})${extension}`;
        counter++;
    } while (existingNames.includes(newName));

    return newName;
}

/**
 * Upload a single 8MB chunk to Discord with retry
 */
async function uploadDiscordChunk(channel, chunkBuffer, fileId, chunkIndex, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const attachment = new AttachmentBuilder(chunkBuffer, {
                name: `part_${chunkIndex}.bin`
            });

            const msg = await channel.send({
                content: `DATA | ${fileId} | Chunk ${chunkIndex}`,
                files: [attachment]
            });

            return msg.id;
        } catch (error) {
            logger.warn(`[ChunkedUpload] Discord chunk ${chunkIndex} failed (attempt ${attempt}/${retries}): ${error.message}`);
            if (attempt === retries) throw error;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

/**
 * Initialize a new chunked upload session
 * @param {string} uploadId - Unique identifier for this upload
 * @param {Object} metadata - File metadata (filename, totalChunks, totalSize, path)
 * @param {Object} userEnv - User environment for Discord channel
 * @returns {Promise<Object>} Session info
 */
async function initChunkedUpload(uploadId, metadata, userEnv) {
    if (pendingUploads.has(uploadId)) {
        logger.warn(`[ChunkedUpload] Upload ${uploadId} already exists, resetting`);
        pendingUploads.delete(uploadId);
    }

    const targetPath = normalizePath(metadata.path || '/');

    // Ensure parent folders exist
    ensureFoldersExist(userEnv.state, targetPath);

    // Resolve filename conflicts
    const uniqueFilename = getUniqueFilename(userEnv.state.files, metadata.filename, targetPath);

    if (uniqueFilename !== metadata.filename) {
        logger.info(`[ChunkedUpload] Filename conflict resolved: ${metadata.filename} -> ${uniqueFilename}`);
    }

    // Get Discord channel
    const channel = await client.channels.fetch(userEnv.dataId);

    const fileId = generateUniqueId();

    pendingUploads.set(uploadId, {
        metadata: {
            fileId,
            filename: uniqueFilename,
            originalFilename: metadata.filename,
            totalChunks: parseInt(metadata.totalChunks),
            totalSize: parseInt(metadata.totalSize),
            path: targetPath,
            username: metadata.username,
            channelId: userEnv.dataId
        },
        // Track Discord uploads (no file data stored)
        messageIds: [],
        discordChunkIndex: 0,
        hash: crypto.createHash('sha256'),
        receivedBytes: 0,
        receivedChunks: 0,
        channel,
        lastActivity: Date.now()
    });

    logger.info(`[ChunkedUpload] Initialized ${uploadId}: ${uniqueFilename} (${metadata.totalChunks} chunks, ${(metadata.totalSize / 1024 / 1024).toFixed(2)}MB)`);

    return {
        uploadId,
        status: 'initialized',
        expectedChunks: parseInt(metadata.totalChunks),
        filename: uniqueFilename
    };
}

/**
 * Process a chunk: split into 8MB pieces and upload to Discord immediately
 * @param {string} uploadId - Upload session ID
 * @param {number} chunkIndex - Index of this chunk (0-based)
 * @param {Buffer} chunkData - Chunk data (up to 96MB)
 * @returns {Promise<Object>} Status of the upload
 */
async function addChunk(uploadId, chunkIndex, chunkData) {
    const upload = pendingUploads.get(uploadId);

    if (!upload) {
        throw new Error(`Upload session ${uploadId} not found. Initialize first.`);
    }

    // Update activity timestamp
    upload.lastActivity = Date.now();

    // Update hash with this chunk's data
    upload.hash.update(chunkData);
    upload.receivedBytes += chunkData.length;
    upload.receivedChunks++;

    logger.info(`[ChunkedUpload] ${uploadId}: Processing chunk ${chunkIndex + 1}/${upload.metadata.totalChunks} (${(chunkData.length / 1024 / 1024).toFixed(2)}MB)`);

    // Split into 8MB Discord chunks and upload immediately
    let offset = 0;
    const uploadPromises = [];

    while (offset < chunkData.length) {
        const end = Math.min(offset + DISCORD_CHUNK_SIZE, chunkData.length);
        const discordChunk = chunkData.subarray(offset, end);
        const discordChunkIndex = upload.discordChunkIndex++;

        // Upload to Discord concurrently
        const uploadPromise = uploadDiscordChunk(
            upload.channel,
            discordChunk,
            upload.metadata.fileId,
            discordChunkIndex
        ).then(msgId => {
            upload.messageIds.push({ index: discordChunkIndex, msgId });
            logger.debug(`[ChunkedUpload] Discord chunk ${discordChunkIndex} uploaded (${discordChunk.length} bytes)`);
        });

        uploadPromises.push(uploadPromise);
        offset = end;
    }

    // Wait for all Discord uploads from this chunk to complete
    await Promise.all(uploadPromises);

    const totalChunks = upload.metadata.totalChunks;
    const progress = Math.round((upload.receivedChunks / totalChunks) * 100);

    logger.info(`[ChunkedUpload] ${uploadId}: Chunk ${chunkIndex + 1}/${totalChunks} uploaded to Discord (${upload.messageIds.length} total Discord chunks)`);

    return {
        uploadId,
        chunkIndex,
        receivedChunks: upload.receivedChunks,
        totalChunks,
        discordChunks: upload.messageIds.length,
        complete: upload.receivedChunks === totalChunks,
        progress
    };
}

/**
 * Check if upload is complete and ready for finalization
 * @param {string} uploadId - Upload session ID
 * @returns {boolean}
 */
function isUploadComplete(uploadId) {
    const upload = pendingUploads.get(uploadId);
    if (!upload) return false;
    return upload.receivedChunks === upload.metadata.totalChunks;
}

/**
 * Finalize the upload - create file entry (data already in Discord)
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
        throw new Error(`Upload incomplete. Received ${upload.receivedChunks}/${upload.metadata.totalChunks} chunks`);
    }

    logger.info(`[ChunkedUpload] Finalizing ${uploadId}: ${upload.metadata.filename}`);

    try {
        // Sort message IDs by chunk index to ensure correct order
        upload.messageIds.sort((a, b) => a.index - b.index);
        const orderedMessageIds = upload.messageIds.map(m => m.msgId);

        // Finalize hash
        const fileHash = upload.hash.digest('hex');

        // Create file entry
        const fileEntry = {
            id: upload.metadata.fileId,
            name: upload.metadata.filename,
            path: upload.metadata.path,
            size: upload.receivedBytes,
            hash: fileHash,
            channelId: upload.metadata.channelId,
            messageIds: orderedMessageIds,
            status: "FINISHED",
            addedAt: new Date().toISOString()
        };

        userEnv.state.files.push(fileEntry);
        await saveUserEnv(upload.metadata.username);

        // Cleanup
        pendingUploads.delete(uploadId);

        logger.info(`[ChunkedUpload] Complete: ${upload.metadata.filename} -> ${upload.metadata.path} (${orderedMessageIds.length} Discord chunks)`);

        return {
            success: true,
            name: upload.metadata.filename,
            path: upload.metadata.path,
            size: upload.receivedBytes,
            chunks: orderedMessageIds.length,
            chunkedUpload: true,
            entry: fileEntry
        };

    } catch (error) {
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
        // Note: Already uploaded Discord chunks remain (cleanup would require deletion)
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
        receivedChunks: upload.receivedChunks,
        receivedBytes: upload.receivedBytes,
        totalSize: upload.metadata.totalSize,
        discordChunks: upload.messageIds.length,
        progress: Math.round((upload.receivedChunks / upload.metadata.totalChunks) * 100),
        complete: upload.receivedChunks === upload.metadata.totalChunks,
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
