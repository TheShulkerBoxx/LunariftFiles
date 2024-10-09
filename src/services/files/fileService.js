/**
 * File service for CRUD operations
 */

const { saveUserEnv, nukeUserChannels } = require('../discord/channels');
const logger = require('../logger');

/**
 * Create a new folder
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {string} folderPath - Folder path
 * @returns {Promise<Object>} Success result
 */
async function createFolder(username, userEnv, folderPath) {
    if (!userEnv.state.folders.includes(folderPath)) {
        userEnv.state.folders.push(folderPath);
        await saveUserEnv(username);
        logger.info(`Created folder: ${folderPath} for user ${username}`);
    }
    return { success: true };
}

/**
 * Delete a file or folder
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {string} id - Item ID or path
 * @param {boolean} isFolder - Whether item is a folder
 * @returns {Promise<Object>} Success result
 */
async function deleteItem(username, userEnv, id, isFolder) {
    if (isFolder) {
        userEnv.state.folders = userEnv.state.folders.filter(f => f !== id);
        logger.info(`Deleted folder: ${id} for user ${username}`);
    } else {
        userEnv.state.files = userEnv.state.files.filter(f => f.id !== id);
        logger.info(`Deleted file: ${id} for user ${username}`);
    }

    await saveUserEnv(username);
    return { success: true };
}

/**
 * Nuke all files and folders for a user
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @returns {Promise<Object>} Success result
 */
async function nukeAllFiles(username, userEnv) {
    await nukeUserChannels(username);
    userEnv.state = { files: [], folders: [] };
    logger.warn(`NUKE: Environment destroyed for user ${username}`);
    return { success: true };
}

/**
 * Get file and folder list
 * @param {Object} userEnv - User environment object
 * @returns {Object} Files and folders
 */
function getFileList(userEnv) {
    return {
        files: userEnv.state.files,
        folders: userEnv.state.folders
    };
}

module.exports = {
    createFolder,
    deleteItem,
    nukeAllFiles,
    getFileList
};
