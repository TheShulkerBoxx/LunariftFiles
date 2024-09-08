/**
 * User management service for Discord-based authentication
 */

const { AttachmentBuilder } = require('discord.js');
const { client } = require('./client');
const config = require('../../config/config');
const logger = require('../logger');

/**
 * Safely fetch JSON from a URL
 * @param {string} url - The URL to fetch from
 * @returns {Promise<Object|null>} Parsed JSON or null on error
 */
async function safeFetchJSON(url) {
    try {
        const res = await fetch(url);
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
            return await res.json();
        }
    } catch (error) {
        logger.error('Failed to fetch JSON:', { url, error: error.message });
    }
    return null;
}

/**
 * Get all registered users from Discord
 * @returns {Promise<Object>} User database object
 */
async function getMasterUsers() {
    try {
        const channel = await client.channels.fetch(config.discord.authChannelId);
        const msgs = await channel.messages.fetch({ limit: 5 });
        const file = msgs.find(m => m.attachments.first()?.name === 'users.json');

        if (!file) return {};
        const users = await safeFetchJSON(file.attachments.first().url);
        return users || {};
    } catch (error) {
        logger.error('Failed to get master users:', error);
        return {};
    }
}

/**
 * Save user database to Discord
 * @param {Object} users - User database object
 * @returns {Promise<void>}
 */
async function saveMasterUsers(users) {
    try {
        const channel = await client.channels.fetch(config.discord.authChannelId);
        const attachment = new AttachmentBuilder(
            Buffer.from(JSON.stringify(users)), 
            { name: 'users.json' }
        );
        await channel.send({ content: 'AUTH_DB_SYNC', files: [attachment] });
    } catch (error) {
        logger.error('Failed to save master users:', error);
        throw error;
    }
}

module.exports = {
    getMasterUsers,
    saveMasterUsers
};
