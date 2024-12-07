/**
 * Streaming upload service for large files
 * Uploads chunks to Discord as they arrive without loading entire file in memory
 */

const { Transform } = require('stream');
const crypto = require('crypto');
const { AttachmentBuilder } = require('discord.js');
const { client } = require('../discord/client');
const { saveUserEnv } = require('../discord/channels');
const { generateUniqueId } = require('../../utils/hashUtils');
const { normalizePath, ensureFoldersExist } = require('../../utils/pathUtils');
const config = require('../../config/config');
const logger = require('../logger');

const CHUNK_SIZE = config.upload.chunkSize; // 8MB

/**
 * Get a unique filename by adding (1), (2), etc. if name already exists
 */
function getUniqueFilename(files, fileName, targetPath) {
    // Case-sensitive matching
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
 * Create a chunking transform stream that accumulates data and emits 8MB chunks
 */
class ChunkingStream extends Transform {
    constructor(options = {}) {
        super(options);
        this.buffer = Buffer.alloc(0);
        this.chunkIndex = 0;
        this.hash = crypto.createHash('sha256');
        this.totalBytes = 0;
    }

    _transform(chunk, encoding, callback) {
        // Update hash
        this.hash.update(chunk);
        this.totalBytes += chunk.length;

        // Append to buffer
        this.buffer = Buffer.concat([this.buffer, chunk]);

        // Emit complete chunks
        while (this.buffer.length >= CHUNK_SIZE) {
            const chunkToEmit = this.buffer.subarray(0, CHUNK_SIZE);
            this.buffer = this.buffer.subarray(CHUNK_SIZE);
            this.push({ type: 'chunk', data: chunkToEmit, index: this.chunkIndex++ });
        }

        callback();
    }

    _flush(callback) {
        // Emit remaining data as final chunk
        if (this.buffer.length > 0) {
            this.push({ type: 'chunk', data: this.buffer, index: this.chunkIndex++ });
        }

        // Emit final hash
        this.push({ type: 'complete', hash: this.hash.digest('hex'), totalBytes: this.totalBytes, totalChunks: this.chunkIndex });
        callback();
    }
}

/**
 * Upload a single chunk to Discord with retry
 */
async function uploadChunkToDiscord(channel, chunkBuffer, fileId, chunkIndex, retries = 3) {
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
            logger.warn(`Chunk ${chunkIndex} upload failed (attempt ${attempt}/${retries}): ${error.message}`);
            if (attempt === retries) throw error;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
}

/**
 * Process a streaming file upload
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {ReadableStream} fileStream - Incoming file stream from busboy
 * @param {string} fileName - File name
 * @param {string} rawPath - Target directory path
 * @param {Function} onProgress - Optional progress callback (chunkIndex, totalBytes)
 * @returns {Promise<Object>} Upload result
 */
async function processStreamingUpload(username, userEnv, fileStream, fileName, rawPath, onProgress) {
    const targetPath = normalizePath(rawPath);
    const fileId = generateUniqueId();
    const messageIds = [];

    // Ensure parent folders exist
    ensureFoldersExist(userEnv.state, targetPath);

    // Resolve filename conflicts by adding (1), (2), etc.
    const uniqueFileName = getUniqueFilename(userEnv.state.files, fileName, targetPath);

    if (uniqueFileName !== fileName) {
        logger.info(`[StreamUpload] Filename conflict resolved: ${fileName} -> ${uniqueFileName}`);
    }

    // Get Discord channel
    const channel = await client.channels.fetch(userEnv.dataId);

    logger.info(`[StreamUpload] Starting ${uniqueFileName} to ${targetPath}`);

    const chunker = new ChunkingStream({ objectMode: true });
    let fileHash = null;
    let totalBytes = 0;
    let totalChunks = 0;

    return new Promise((resolve, reject) => {
        chunker.on('data', async (item) => {
            if (item.type === 'chunk') {
                // Pause stream while uploading to Discord
                fileStream.pause();
                chunker.pause();

                try {
                    const msgId = await uploadChunkToDiscord(
                        channel,
                        item.data,
                        fileId,
                        item.index
                    );
                    messageIds.push(msgId);

                    logger.info(`[StreamUpload] Chunk ${item.index + 1} uploaded (${item.data.length} bytes)`);

                    if (onProgress) {
                        onProgress(item.index + 1, totalBytes);
                    }

                    // Resume stream
                    fileStream.resume();
                    chunker.resume();
                } catch (error) {
                    reject(error);
                }
            } else if (item.type === 'complete') {
                fileHash = item.hash;
                totalBytes = item.totalBytes;
                totalChunks = item.totalChunks;
            }
        });

        chunker.on('end', async () => {
            try {
                // Create file entry
                const fileEntry = {
                    id: fileId,
                    name: uniqueFileName,
                    path: targetPath,
                    size: totalBytes,
                    hash: fileHash,
                    channelId: userEnv.dataId,
                    messageIds: messageIds,
                    status: "FINISHED",
                    addedAt: new Date().toISOString()
                };

                userEnv.state.files.push(fileEntry);
                await saveUserEnv(username);

                logger.info(`[StreamUpload] Complete: ${uniqueFileName} (${(totalBytes / 1024 / 1024).toFixed(2)}MB, ${totalChunks} chunks)`);

                resolve({
                    success: true,
                    name: uniqueFileName,
                    path: targetPath,
                    size: totalBytes,
                    chunks: totalChunks,
                    entry: fileEntry
                });
            } catch (error) {
                reject(error);
            }
        });

        chunker.on('error', reject);
        fileStream.on('error', reject);

        // Pipe file stream through chunker
        fileStream.pipe(chunker);
    });
}

/**
 * Check if file should use streaming upload (based on expected size)
 * @param {number} contentLength - Content-Length header value
 * @returns {boolean}
 */
function shouldUseStreaming(contentLength) {
    // Use streaming for files > 50MB or when size is unknown
    const STREAMING_THRESHOLD = 50 * 1024 * 1024;
    return !contentLength || contentLength > STREAMING_THRESHOLD;
}

module.exports = {
    processStreamingUpload,
    shouldUseStreaming,
    ChunkingStream
};
