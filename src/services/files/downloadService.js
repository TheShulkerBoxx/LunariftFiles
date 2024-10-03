/**
 * File download service
 * Reconstructs files from Discord chunks and streams to client
 */

const { client } = require('../discord/client');
const logger = require('../logger');

/**
 * Download a file by fetching all its chunks from Discord
 * @param {Object} fileEntry - File entry from user state
 * @returns {Promise<Buffer>} Complete file buffer
 */
async function downloadFile(fileEntry) {
    if (!fileEntry || !fileEntry.messageIds || !fileEntry.channelId) {
        throw new Error('Invalid file entry');
    }

    logger.info(`[Download] Starting ${fileEntry.name} (${fileEntry.messageIds.length} chunks)`);

    const channel = await client.channels.fetch(fileEntry.channelId);
    const chunks = [];

    for (let i = 0; i < fileEntry.messageIds.length; i++) {
        const msgId = fileEntry.messageIds[i];

        try {
            const message = await channel.messages.fetch(msgId);
            const attachment = message.attachments.first();

            if (!attachment) {
                throw new Error(`No attachment found for chunk ${i}`);
            }

            // Fetch the chunk data
            const response = await fetch(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch chunk ${i}: HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            chunks.push(Buffer.from(arrayBuffer));

            logger.debug(`[Download] Chunk ${i + 1}/${fileEntry.messageIds.length} fetched (${chunks[i].length} bytes)`);
        } catch (error) {
            logger.error(`[Download] Failed to fetch chunk ${i}:`, error);
            throw new Error(`Failed to download chunk ${i}: ${error.message}`);
        }
    }

    // Concatenate all chunks
    const fileBuffer = Buffer.concat(chunks);

    logger.info(`[Download] Complete: ${fileEntry.name} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

    return fileBuffer;
}

/**
 * Stream download a file (for large files)
 * Returns chunks as they are fetched
 * @param {Object} fileEntry - File entry from user state
 * @param {Function} onChunk - Callback called with each chunk
 * @returns {Promise<void>}
 */
async function streamDownloadFile(fileEntry, onChunk) {
    if (!fileEntry || !fileEntry.messageIds || !fileEntry.channelId) {
        throw new Error('Invalid file entry');
    }

    logger.info(`[Stream Download] Starting ${fileEntry.name} (${fileEntry.messageIds.length} chunks)`);

    const channel = await client.channels.fetch(fileEntry.channelId);

    for (let i = 0; i < fileEntry.messageIds.length; i++) {
        const msgId = fileEntry.messageIds[i];

        try {
            const message = await channel.messages.fetch(msgId);
            const attachment = message.attachments.first();

            if (!attachment) {
                throw new Error(`No attachment found for chunk ${i}`);
            }

            // Fetch the chunk data
            const response = await fetch(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch chunk ${i}: HTTP ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const chunk = Buffer.from(arrayBuffer);

            // Call the callback with the chunk
            await onChunk(chunk, i, fileEntry.messageIds.length);

            logger.debug(`[Stream Download] Chunk ${i + 1}/${fileEntry.messageIds.length} streamed`);
        } catch (error) {
            logger.error(`[Stream Download] Failed to fetch chunk ${i}:`, error);
            throw error;
        }
    }

    logger.info(`[Stream Download] Complete: ${fileEntry.name}`);
}

/**
 * Get content type from filename
 * @param {string} filename - File name
 * @returns {string} MIME type
 */
function getContentType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'heic': 'image/heic',
        'heif': 'image/heif',

        // Documents
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

        // Text
        'txt': 'text/plain',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'text/javascript',
        'json': 'application/json',
        'xml': 'application/xml',
        'md': 'text/markdown',

        // Archives
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',

        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',

        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',

        // Other
        'exe': 'application/x-msdownload',
        'dmg': 'application/x-apple-diskimage',
        'iso': 'application/x-iso9660-image'
    };

    return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
    downloadFile,
    streamDownloadFile,
    getContentType
};
