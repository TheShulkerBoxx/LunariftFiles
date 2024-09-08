/**
 * Discord channel management for user environments
 */

const { ChannelType } = require('discord.js');
const { client } = require('./client');
const config = require('../../config/config');
const logger = require('../logger');

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
        const metaChannel = await client.channels.fetch(env.metaId);
        const metaMsgs = await metaChannel.messages.fetch({ limit: 5 });
        const lastMeta = metaMsgs.find(m => m.attachments.first()?.name === 'directory.json');

        if (lastMeta) {
            const res = await fetch(lastMeta.attachments.first().url);
            if (res.ok) {
                const data = await res.json();
                if (data) env.state = data;
            }
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
        const { AttachmentBuilder } = require('discord.js');
        const channel = await client.channels.fetch(env.metaId);
        const attachment = new AttachmentBuilder(
            Buffer.from(JSON.stringify(env.state)), 
            { name: 'directory.json' }
        );
        await channel.send({ content: 'DIR_SYNC', files: [attachment] });

        // Cleanup old messages
        const old = await channel.messages.fetch({ limit: 5 });
        const toDelete = Array.from(old.values()).slice(1);
        if (toDelete.length > 0) {
            await channel.bulkDelete(toDelete.map(m => m.id), true).catch(() => {});
        }
    } catch (error) {
        logger.error(`Failed to save metadata for ${username}:`, error);
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
