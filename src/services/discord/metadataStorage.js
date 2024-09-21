/**
 * Metadata storage service with chunking support
 * Handles large directory.json files by splitting them across multiple Discord messages
 */

const { AttachmentBuilder } = require('discord.js');
const { client } = require('./client');
const logger = require('../logger');

// Discord file size limit (10MB, but we'll use 8MB to be safe)
const MAX_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Save directory state with automatic chunking if needed
 * @param {string} channelId - Metadata channel ID
 * @param {Object} state - User state object
 * @returns {Promise<void>}
 */
async function saveDirectoryState(channelId, state) {
    try {
        const channel = await client.channels.fetch(channelId);
        const stateJSON = JSON.stringify(state);
        const stateSize = Buffer.byteLength(stateJSON, 'utf8');

        logger.info(`Saving directory state: ${(stateSize / 1024).toFixed(2)} KB`);

        // Check if we need to chunk the data
        if (stateSize > MAX_CHUNK_SIZE) {
            logger.warn(`Directory state is large (${(stateSize / 1024 / 1024).toFixed(2)} MB), using chunked storage`);
            await saveChunkedDirectory(channel, state);
        } else {
            await saveSingleDirectory(channel, state);
        }

        // Cleanup old messages (keep only the latest set)
        await cleanupOldMessages(channel);
    } catch (error) {
        logger.error('Failed to save directory state:', error);
        throw error;
    }
}

/**
 * Save directory as a single file (normal case)
 * @param {Object} channel - Discord channel
 * @param {Object} state - User state
 * @returns {Promise<void>}
 */
async function saveSingleDirectory(channel, state) {
    const attachment = new AttachmentBuilder(
        Buffer.from(JSON.stringify(state)),
        { name: 'directory.json' }
    );
    await channel.send({ content: 'DIR_SYNC', files: [attachment] });
    logger.info('Directory saved as single file');
}

/**
 * Save directory split across multiple chunks
 * @param {Object} channel - Discord channel
 * @param {Object} state - User state
 * @returns {Promise<void>}
 */
async function saveChunkedDirectory(channel, state) {
    // Split files into chunks
    const filesPerChunk = Math.ceil(state.files.length / Math.ceil(JSON.stringify(state).length / MAX_CHUNK_SIZE));
    const chunks = [];

    for (let i = 0; i < state.files.length; i += filesPerChunk) {
        const chunkFiles = state.files.slice(i, i + filesPerChunk);
        chunks.push({
            files: chunkFiles,
            folders: i === 0 ? state.folders : [] // Only include folders in first chunk
        });
    }

    // Send header message
    await channel.send({
        content: `DIR_SYNC_CHUNKED | ${chunks.length} chunks`,
        files: []
    });

    // Send each chunk
    for (let i = 0; i < chunks.length; i++) {
        const chunkData = JSON.stringify(chunks[i]);
        const attachment = new AttachmentBuilder(
            Buffer.from(chunkData),
            { name: `directory_chunk_${i}.json` }
        );
        await channel.send({
            content: `DIR_CHUNK | ${i}/${chunks.length}`,
            files: [attachment]
        });
        logger.info(`Saved directory chunk ${i + 1}/${chunks.length} (${(Buffer.byteLength(chunkData) / 1024).toFixed(2)} KB)`);
    }

    logger.info(`Directory saved in ${chunks.length} chunks`);
}

/**
 * Load directory state (handles both single and chunked formats)
 * @param {string} channelId - Metadata channel ID
 * @returns {Promise<Object>} User state object
 */
async function loadDirectoryState(channelId) {
    try {
        const channel = await client.channels.fetch(channelId);
        const messages = await channel.messages.fetch({ limit: 50 });

        // Check for chunked format first
        const chunkedHeader = Array.from(messages.values()).find(m =>
            m.content.startsWith('DIR_SYNC_CHUNKED')
        );

        if (chunkedHeader) {
            return await loadChunkedDirectory(messages);
        }

        // Fall back to single file format
        return await loadSingleDirectory(messages);
    } catch (error) {
        logger.error('Failed to load directory state:', error);
        return { files: [], folders: [] };
    }
}

/**
 * Load directory from a single file
 * @param {Collection} messages - Discord messages
 * @returns {Promise<Object>} User state
 */
async function loadSingleDirectory(messages) {
    const lastMeta = Array.from(messages.values()).find(m =>
        m.attachments.first()?.name === 'directory.json'
    );

    if (!lastMeta) {
        return { files: [], folders: [] };
    }

    const res = await fetch(lastMeta.attachments.first().url);
    if (res.ok) {
        const data = await res.json();
        logger.info('Loaded directory from single file');
        return data;
    }

    return { files: [], folders: [] };
}

/**
 * Load and merge chunked directory
 * @param {Collection} messages - Discord messages
 * @returns {Promise<Object>} Merged user state
 */
async function loadChunkedDirectory(messages) {
    const chunkMessages = Array.from(messages.values())
        .filter(m => m.content.startsWith('DIR_CHUNK'))
        .sort((a, b) => {
            const aIndex = parseInt(a.content.split('|')[1].split('/')[0].trim());
            const bIndex = parseInt(b.content.split('|')[1].split('/')[0].trim());
            return aIndex - bIndex;
        });

    const state = { files: [], folders: [] };

    for (const msg of chunkMessages) {
        const attachment = msg.attachments.first();
        if (attachment) {
            const res = await fetch(attachment.url);
            if (res.ok) {
                const chunkData = await res.json();
                state.files.push(...chunkData.files);
                if (chunkData.folders && chunkData.folders.length > 0) {
                    state.folders = chunkData.folders;
                }
            }
        }
    }

    logger.info(`Loaded directory from ${chunkMessages.length} chunks (${state.files.length} files)`);
    return state;
}

/**
 * Clean up old directory messages (keep only latest set)
 * @param {Object} channel - Discord channel
 * @returns {Promise<void>}
 */
async function cleanupOldMessages(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const messageArray = Array.from(messages.values());

        // Find the latest DIR_SYNC or DIR_SYNC_CHUNKED message
        const latestSyncIndex = messageArray.findIndex(m =>
            m.content.startsWith('DIR_SYNC')
        );

        if (latestSyncIndex === -1) return;

        // Find the next DIR_SYNC message (old one)
        const oldSyncIndex = messageArray.findIndex((m, i) =>
            i > latestSyncIndex && m.content.startsWith('DIR_SYNC')
        );

        if (oldSyncIndex === -1) return;

        // Delete all messages from old sync onwards
        const toDelete = messageArray.slice(oldSyncIndex);
        if (toDelete.length > 0 && toDelete.length <= 100) {
            await channel.bulkDelete(toDelete.map(m => m.id), true).catch(() => {
                logger.warn('Could not bulk delete old messages, they may be too old');
            });
            logger.info(`Cleaned up ${toDelete.length} old directory messages`);
        }
    } catch (error) {
        logger.warn('Failed to cleanup old messages:', error.message);
    }
}

/**
 * Get directory size estimate
 * @param {Object} state - User state
 * @returns {Object} Size information
 */
function getDirectorySize(state) {
    const sizeBytes = Buffer.byteLength(JSON.stringify(state), 'utf8');
    return {
        bytes: sizeBytes,
        kb: (sizeBytes / 1024).toFixed(2),
        mb: (sizeBytes / 1024 / 1024).toFixed(2),
        percentage: ((sizeBytes / MAX_CHUNK_SIZE) * 100).toFixed(1),
        needsChunking: sizeBytes > MAX_CHUNK_SIZE
    };
}

module.exports = {
    saveDirectoryState,
    loadDirectoryState,
    getDirectorySize,
    MAX_CHUNK_SIZE
};
