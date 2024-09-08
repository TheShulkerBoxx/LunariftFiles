/**
 * Lunarift Files - Secure Cloud Storage
 * Main server entry point
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');

// Services
const { initializeDiscord } = require('./src/services/discord/client');
const logger = require('./src/services/logger');
const config = require('./src/config/config');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const fileRoutes = require('./src/routes/fileRoutes');
const utilRoutes = require('./src/routes/utilRoutes');

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
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"]
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
        
        // Start Express server
        app.listen(config.server.port, '0.0.0.0', () => {
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

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down gracefully...');
    process.exit(0);
});
