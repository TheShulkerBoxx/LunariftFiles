/**
 * Authentication routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { registerUser, loginUser } = require('../services/auth/authService');
const logger = require('../services/logger');

const router = express.Router();

/**
 * POST /api/register
 * Register a new user
 */
router.post('/register',
    body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
    body('password').isLength({ min: 8 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        try {
            const { username, password } = req.body;
            await registerUser(username, password);
            res.json({ success: true });
        } catch (error) {
            logger.error('Registration error:', error);
            res.status(500).json({ error: error.message || 'Registration failed' });
        }
    }
);

/**
 * POST /api/login
 * Login user and return JWT token
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await loginUser(username, password);
        res.json(result);
    } catch (error) {
        logger.error('Login error:', error);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

module.exports = router;
