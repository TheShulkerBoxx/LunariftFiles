/**
 * Discord channel management for user environments
 */

const { ChannelType } = require('discord.js');
const { client } = require('./client');
const config = require('../../config/config');
const logger = require('../logger');
const { saveDirectoryState, loadDirectoryState, getDirectorySize } = require('./metadataStorage');

// In-memory registry of user environments
const userRegistry = {};

/**
 * Get or create user environment (channels and state)
 * @param {string} username - The username
 * @returns {Promise<Object>} User environment object
 */
async function getUserEnv(username) {
    if (userRegistry[username]) {
        return userRegistry[username];
    }

    logger.info(`Initializing user environment: ${username}`);
    const guild = await client.guilds.fetch(config.discord.guildId);
    const catName = `Lunarift - ${username}`;
    
    // Find or create category
    let cat = guild.channels.cache.find(
        c => c.name === catName && c.type === ChannelType.GuildCategory
    );

    if (!cat) {
        cat = await guild.channels.create({ 
            name: catName, 
            type: ChannelType.GuildCategory 
        });
    }

    // Helper to get or create channel
    const getChan = async (name) => {
        let c = guild.channels.cache.find(
            ch => ch.name === name && ch.parentId === cat.id
        );
        if (!c) {
            c = await guild.channels.create({ name, parent: cat.id });
        }
        return c.id;
    };

    const env = {
        dataId: await getChan('storage'),
        metaId: await getChan('metadata'),
        state: { files: [], folders: [] }
    };

    userRegistry[username] = env;
    
    // Fetch existing directory structure
    await fetchDirectory(username);
    
    return env;
}

/**
 * Fetch directory structure from Discord
 * @param {string} username - The username
 * @returns {Promise<void>}
 */
async function fetchDirectory(username) {
    const env = userRegistry[username];
    if (!env) return;

    try {
        const state = await loadDirectoryState(env.metaId);
        if (state) {
            env.state = state;
            const sizeInfo = getDirectorySize(state);
            logger.info(`Loaded directory for ${username}: ${state.files.length} files, ${sizeInfo.kb} KB`);
        }
    } catch (error) {
        logger.error(`Failed to fetch directory for ${username}:`, error);
    }
}

/**
 * Save user environment state to Discord
 * @param {string} username - The username
 * @returns {Promise<void>}
 */
async function saveUserEnv(username) {
    const env = userRegistry[username];
    if (!env) return;

    try {
        const sizeInfo = getDirectorySize(env.state);
        
        // Log warning if approaching limit
        if (parseFloat(sizeInfo.percentage) > 50) {
            logger.warn(
                `Directory size for ${username} is ${sizeInfo.percentage}% of chunk limit ` +
                `(${sizeInfo.mb} MB, ${env.state.files.length} files)`
            );
        }

        await saveDirectoryState(env.metaId, env.state);
        logger.info(`Saved directory for ${username}: ${env.state.files.length} files, ${sizeInfo.kb} KB`);
    } catch (error) {
        logger.error(`Failed to save metadata for ${username}:`, error);
        throw error;
    }
}

/**
 * Get user registry (for internal use)
 * @returns {Object} User registry object
 */
function getUserRegistry() {
    return userRegistry;
}

module.exports = {
    getUserEnv,
    saveUserEnv,
    fetchDirectory,
    getUserRegistry
};
