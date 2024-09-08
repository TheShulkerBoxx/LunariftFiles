/**
 * Discord client initialization and management
 */

const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const dns = require('dns');
const config = require('../../config/config');
const logger = require('../logger');

// Force IPv4
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Keep-Alive
https.globalAgent = new https.Agent({ keepAlive: true });

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    rest: { timeout: config.discord.timeout }
});

/**
 * Initialize and login to Discord
 * @returns {Promise<Client>} The logged-in Discord client
 */
async function initializeDiscord() {
    try {
        await client.login(config.discord.botToken);
        logger.info('Discord client ready');
        return client;
    } catch (error) {
        logger.error('Failed to initialize Discord client:', error);
        throw error;
    }
}

module.exports = {
    client,
    initializeDiscord
};
