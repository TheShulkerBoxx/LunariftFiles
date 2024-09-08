/**
 * Logging service for Lunarift Files
 * Provides Winston-based logging with file and console outputs
 */

const winston = require('winston');
const fs = require('fs-extra');
const config = require('../config/config');

// Ensure logs directory exists
fs.ensureDirSync(config.logging.logDir);

const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: `${config.logging.logDir}/error.log`, 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: `${config.logging.logDir}/combined.log` 
        })
    ]
});

// Add console transport in non-production environments
if (config.server.nodeEnv !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
} else {
    // Still show important logs in production
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        ),
        level: 'info'
    }));
}

module.exports = logger;
