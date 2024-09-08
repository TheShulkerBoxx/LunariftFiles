/**
 * Authentication service for user registration and login
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getMasterUsers, saveMasterUsers } = require('../discord/users');
const config = require('../../config/config');
const logger = require('../logger');

/**
 * Register a new user
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} Success result
 */
async function registerUser(username, password) {
    try {
        const users = await getMasterUsers();
        
        if (users[username]) {
            throw new Error('Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
        users[username] = hashedPassword;
        
        await saveMasterUsers(users);
        
        logger.info(`User registered: ${username}`);
        return { success: true };
    } catch (error) {
        logger.error('Registration failed:', error);
        throw error;
    }
}

/**
 * Login user and generate JWT token
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} Token and username
 */
async function loginUser(username, password) {
    try {
        const users = await getMasterUsers();
        
        if (!users[username]) {
            throw new Error('Invalid credentials');
        }

        const isValid = await bcrypt.compare(password, users[username]);
        
        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const token = jwt.sign(
            { username }, 
            config.security.jwtSecret, 
            { expiresIn: config.security.jwtExpiry }
        );

        logger.info(`User logged in: ${username}`);
        return { token, username };
    } catch (error) {
        logger.error('Login failed:', error);
        throw error;
    }
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, config.security.jwtSecret);
    } catch (error) {
        throw new Error('Invalid token');
    }
}

module.exports = {
    registerUser,
    loginUser,
    verifyToken
};
