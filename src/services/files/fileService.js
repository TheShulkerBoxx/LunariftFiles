/**
 * File service for CRUD operations
 */

const { saveUserEnv, nukeUserChannels } = require('../discord/channels');
const logger = require('../logger');

/**
 * Move a file or folder to a new path
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {string} id - Item ID (file id or folder path)
 * @param {boolean} isFolder - Whether item is a folder
 * @param {string} newPath - New path for the item
 * @returns {Promise<Object>} Success result
 */
async function moveItem(username, userEnv, id, isFolder, newPath) {
    if (isFolder) {
        // Find the old folder path
        const oldFolderPath = id;
        const folderIndex = userEnv.state.folders.indexOf(oldFolderPath);

        if (folderIndex === -1) {
            throw new Error(`Folder not found: ${oldFolderPath}`);
        }

        // Update the folder path
        userEnv.state.folders[folderIndex] = newPath;

        // Update all files that have paths starting with the old folder path
        for (const file of userEnv.state.files) {
            if (file.path === oldFolderPath) {
                file.path = newPath;
            } else if (file.path.startsWith(oldFolderPath + '/')) {
                // Handle nested files - replace the old prefix with new path
                file.path = newPath + file.path.slice(oldFolderPath.length);
            }
        }

        // Update all subfolders that are nested within the moved folder
        for (let i = 0; i < userEnv.state.folders.length; i++) {
            const folder = userEnv.state.folders[i];
            if (folder !== newPath && folder.startsWith(oldFolderPath + '/')) {
                userEnv.state.folders[i] = newPath + folder.slice(oldFolderPath.length);
            }
        }

        logger.info(`Moved folder: ${oldFolderPath} -> ${newPath} for user ${username}`);
    } else {
        // Find the file by ID
        const file = userEnv.state.files.find(f => f.id === id);

        if (!file) {
            throw new Error(`File not found: ${id}`);
        }

        const oldPath = file.path;
        file.path = newPath;

        logger.info(`Moved file: ${file.name} from ${oldPath} to ${newPath} for user ${username}`);
    }

    await saveUserEnv(username);
    return { success: true };
}

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
        const folderPath = id;

        // Delete the folder itself
        userEnv.state.folders = userEnv.state.folders.filter(f => f !== folderPath);

        // Delete all subfolders that start with this folder path
        userEnv.state.folders = userEnv.state.folders.filter(f => !f.startsWith(folderPath));

        // Delete all files inside this folder (and subfolders)
        const filesToDelete = userEnv.state.files.filter(f => f.path.startsWith(folderPath));
        const fileCount = filesToDelete.length;
        userEnv.state.files = userEnv.state.files.filter(f => !f.path.startsWith(folderPath));

        logger.info(`Deleted folder: ${folderPath} (including ${fileCount} files) for user ${username}`);
    } else {
        // Find the file to be deleted
        const fileToDelete = userEnv.state.files.find(f => f.id === id);

        if (fileToDelete) {
            // Check if this file has messageIds (is an "original" file with actual data)
            if (fileToDelete.messageIds && fileToDelete.messageIds.length > 0 && fileToDelete.hash) {
                // Find all files that reference this one (same hash, isReference=true, no messageIds)
                const references = userEnv.state.files.filter(f =>
                    f.id !== id &&
                    f.hash === fileToDelete.hash &&
                    (f.isReference === true || !f.messageIds || f.messageIds.length === 0)
                );

                if (references.length > 0) {
                    // Transfer the messageIds and channelId to the first reference
                    const newOriginal = references[0];
                    newOriginal.messageIds = fileToDelete.messageIds;
                    newOriginal.channelId = fileToDelete.channelId;
                    newOriginal.isReference = false;

                    logger.info(`Transferred messageIds from ${fileToDelete.name} to ${newOriginal.name} (dedup reference integrity)`);
                }
            }

            // Now remove the file
            userEnv.state.files = userEnv.state.files.filter(f => f.id !== id);
            logger.info(`Deleted file: ${id} for user ${username}`);
        }
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
 * Get file and folder list with optional pagination
 * @param {Object} userEnv - User environment object
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @returns {Object} Files, folders, and pagination info
 */
function getFileList(userEnv, options = {}) {
    const { page, limit } = options;

    // If no pagination params provided, return all files (backward compatibility)
    if (!page && !limit) {
        return {
            files: userEnv.state.files,
            folders: userEnv.state.folders
        };
    }

    // Apply pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(1000, parseInt(limit) || 100));

    const allFiles = userEnv.state.files;
    const allFolders = userEnv.state.folders;

    // Calculate total counts
    const totalFiles = allFiles.length;
    const totalFolders = allFolders.length;
    const totalItems = totalFiles + totalFolders;
    const totalPages = Math.ceil(totalItems / limitNum);

    // Calculate offset
    const offset = (pageNum - 1) * limitNum;

    // Paginate: folders first, then files
    let paginatedFolders = [];
    let paginatedFiles = [];

    if (offset < totalFolders) {
        // We're still in the folders range
        const folderEnd = Math.min(offset + limitNum, totalFolders);
        paginatedFolders = allFolders.slice(offset, folderEnd);

        // If we have room for files
        const remainingLimit = limitNum - paginatedFolders.length;
        if (remainingLimit > 0) {
            paginatedFiles = allFiles.slice(0, remainingLimit);
        }
    } else {
        // We're past all folders, only returning files
        const fileOffset = offset - totalFolders;
        paginatedFiles = allFiles.slice(fileOffset, fileOffset + limitNum);
    }

    return {
        files: paginatedFiles,
        folders: paginatedFolders,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: totalItems,
            totalFiles,
            totalFolders,
            totalPages,
            hasNextPage: pageNum < totalPages,
            hasPrevPage: pageNum > 1
        }
    };
}

module.exports = {
    moveItem,
    createFolder,
    deleteItem,
    nukeAllFiles,
    getFileList
};
