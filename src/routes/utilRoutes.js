/**
 * Utility routes (health check, ping, etc.)
 */

const express = require('express');
const { client } = require('../services/discord/client');
const logger = require('../services/logger');

const router = express.Router();

/**
 * GET /api/ping
 * Check Discord API latency
 */
router.get('/ping', async (req, res) => {
    const start = Date.now();
    try {
        await client.rest.get('/gateway');
        const latency = Date.now() - start;
        res.json({ latency });
    } catch (error) {
        logger.error('Ping failed:', error);
        res.status(500).json({ 
            error: error.message, 
            latency: Date.now() - start 
        });
    }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
