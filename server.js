/**
 * Lunarift Files - Secure Cloud Storage
 * Main server entry point
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');

// Services
const { initializeDiscord, client } = require('./src/services/discord/client');
const logger = require('./src/services/logger');
const config = require('./src/config/config');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const fileRoutes = require('./src/routes/fileRoutes');
const utilRoutes = require('./src/routes/utilRoutes');

// Store server reference for graceful shutdown
let server = null;

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.mathjax.org", "https://static.cloudflareinsights.com"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "https://unpkg.com"],
            frameSrc: ["'self'", "blob:"],
            objectSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:"]
        }
    }
}));

// Body parsing
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// API ROUTES
// ============================================================================

app.use('/api', authRoutes);
app.use('/api', fileRoutes);
app.use('/api', utilRoutes);
app.use('/', utilRoutes); // For /health endpoint

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
    try {
        // Initialize Discord client first
        await initializeDiscord();

        // Start Express server and store reference for graceful shutdown
        server = app.listen(config.server.port, '0.0.0.0', () => {
            logger.info(`Lunarift Files server ready on port ${config.server.port}`);
            logger.info(`Server listening on http://0.0.0.0:${config.server.port}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Graceful shutdown handler
 * - Stops accepting new connections
 * - Waits for existing connections to finish (max 10 seconds)
 * - Disconnects Discord client
 * - Exits process
 */
async function gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Maximum time to wait for connections to close
    const SHUTDOWN_TIMEOUT = 10000;
    let forceExit = false;

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimer = setTimeout(() => {
        logger.warn('Graceful shutdown timeout exceeded. Forcing exit...');
        forceExit = true;
        process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
        // Stop accepting new connections
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        logger.error('Error closing server:', err);
                        reject(err);
                    } else {
                        logger.info('Server stopped accepting new connections');
                        resolve();
                    }
                });
            });
        }

        // Disconnect Discord client
        if (client) {
            logger.info('Disconnecting Discord client...');
            client.destroy();
            logger.info('Discord client disconnected');
        }

        clearTimeout(forceExitTimer);

        if (!forceExit) {
            logger.info('Graceful shutdown complete');
            process.exit(0);
        }
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        clearTimeout(forceExitTimer);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
