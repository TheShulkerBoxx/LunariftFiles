/**
 * Authentication middleware for protected routes
 */

const { verifyToken } = require('../services/auth/authService');
const { getUserEnv } = require('../services/discord/channels');
const logger = require('../services/logger');

/**
 * Authentication middleware
 * Verifies JWT token and loads user environment
 */
async function authMiddleware(req, res, next) {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = verifyToken(token);
        req.username = decoded.username;
        req.userEnv = await getUserEnv(decoded.username);
        
        next();
    } catch (error) {
        logger.error('Authentication failed:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
}

module.exports = authMiddleware;
