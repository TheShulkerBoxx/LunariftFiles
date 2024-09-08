/**
 * Configuration management for Lunarift Files
 * Validates and exports environment variables
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Validate required environment variables
const requiredEnvVars = ['DISCORD_BOT_TOKEN', 'GUILD_ID', 'AUTH_CHANNEL_ID', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

const config = {
    // Discord Configuration
    discord: {
        botToken: process.env.DISCORD_BOT_TOKEN,
        guildId: process.env.GUILD_ID,
        authChannelId: process.env.AUTH_CHANNEL_ID,
        timeout: 60000
    },

    // Security Configuration
    security: {
        jwtSecret: process.env.JWT_SECRET,
        jwtExpiry: '7d',
        bcryptRounds: 10,
        nukePassword: process.env.NUKE_PASSWORD
    },

    // Server Configuration
    server: {
        port: process.env.PORT || 5050,
        nodeEnv: process.env.NODE_ENV || 'development',
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || []
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        logDir: path.join(__dirname, '../../logs')
    },

    // Upload Configuration
    upload: {
        chunkSize: 8 * 1024 * 1024, // 8MB chunks (safe for Discord 25MB limit)
        maxParallelUploads: 5,
        maxRetries: 3,
        retryDelayBase: 1000,
        maxFileSize: 20 * 1024 * 1024 * 1024 // 20GB
    }
};

module.exports = config;
