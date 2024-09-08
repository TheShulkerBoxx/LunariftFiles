/**
 * Discord storage operations for file chunks
 */

const { AttachmentBuilder } = require('discord.js');
const { client } = require('./client');
const config = require('../../config/config');
const logger = require('../logger');

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload a single chunk with retry logic
 * @param {Object} channel - Discord channel object
 * @param {Buffer} buffer - Chunk buffer
 * @param {string} fileId - Unique file identifier
 * @param {number} chunkIndex - Chunk index
 * @param {number} totalParts - Total number of chunks
 * @returns {Promise<string>} Message ID of uploaded chunk
 */
async function uploadChunkWithRetry(channel, buffer, fileId, chunkIndex, totalParts) {
    let lastError = null;

    for (let attempt = 1; attempt <= config.upload.maxRetries; attempt++) {
        try {
            const attachment = new AttachmentBuilder(buffer, { 
                name: `part_${chunkIndex}.bin` 
            });

            const msg = await channel.send({
                content: `DATA | ${fileId} | Chunk ${chunkIndex}/${totalParts}`,
                files: [attachment]
            });

            return msg.id;
        } catch (error) {
            lastError = error;
            logger.warn(
                `Chunk ${chunkIndex}/${totalParts} failed ` +
                `(attempt ${attempt}/${config.upload.maxRetries}): ${error.message}`
            );

            if (attempt < config.upload.maxRetries) {
                const delay = config.upload.retryDelayBase * Math.pow(2, attempt - 1);
                logger.info(`Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(
        `Failed to upload chunk ${chunkIndex} after ${config.upload.maxRetries} attempts: ` +
        `${lastError?.message}`
    );
}

/**
 * Upload entire file buffer to Discord in chunks
 * @param {string} channelId - Discord channel ID
 * @param {Buffer} fileBuffer - Complete file buffer
 * @param {string} fileId - Unique file identifier
 * @param {string} fileName - File name for logging
 * @returns {Promise<Array<string>>} Array of message IDs
 */
async function uploadFileToDiscord(channelId, fileBuffer, fileId, fileName) {
    const channel = await client.channels.fetch(channelId);
    
    const fileSize = fileBuffer.length;
    const totalParts = Math.ceil(fileSize / config.upload.chunkSize);
    const messageIds = [];

    logger.info(
        `[Upload] Starting ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) - ` +
        `${totalParts} chunks`
    );

    const uploadStart = Date.now();

    for (let i = 0; i < totalParts; i++) {
        const chunkStart = Date.now();
        const start = i * config.upload.chunkSize;
        const end = Math.min(start + config.upload.chunkSize, fileSize);
        const chunkBuffer = fileBuffer.subarray(start, end);

        const msgId = await uploadChunkWithRetry(
            channel, 
            chunkBuffer, 
            fileId, 
            i, 
            totalParts
        );
        messageIds.push(msgId);

        const chunkTime = Date.now() - chunkStart;
        const speed = (chunkBuffer.length / 1024 / 1024) / (chunkTime / 1000);
        logger.info(
            `[Upload] Chunk ${i + 1}/${totalParts} sent in ${chunkTime}ms ` +
            `(${speed.toFixed(2)} MB/s)`
        );
    }

    const totalTime = (Date.now() - uploadStart) / 1000;
    const avgSpeed = (fileSize / 1024 / 1024) / totalTime;
    logger.info(
        `[Upload] Complete: ${fileName} in ${totalTime.toFixed(2)}s ` +
        `(~${avgSpeed.toFixed(2)} MB/s)`
    );

    return messageIds;
}

module.exports = {
    uploadChunkWithRetry,
    uploadFileToDiscord,
    sleep
};
