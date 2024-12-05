/**
 * File upload service
 */

const { uploadFileToDiscord } = require('../discord/storage');
const { saveUserEnv } = require('../discord/channels');
const { calculateBufferHash, generateUniqueId } = require('../../utils/hashUtils');
const { normalizePath, ensureFoldersExist } = require('../../utils/pathUtils');
const logger = require('../logger');

/**
 * Get a unique filename by adding (1), (2), etc. if name already exists
 * @param {Array} files - Existing files array
 * @param {string} fileName - Desired filename
 * @param {string} targetPath - Target directory path
 * @returns {string} Unique filename
 */
function getUniqueFilename(files, fileName, targetPath) {
    // Check if file with same name exists in same path
    const existingNames = files
        .filter(f => f.path === targetPath)
        .map(f => f.name.toLowerCase());

    if (!existingNames.includes(fileName.toLowerCase())) {
        return fileName;
    }

    // Split filename into name and extension
    const lastDot = fileName.lastIndexOf('.');
    let baseName, extension;

    if (lastDot === -1) {
        baseName = fileName;
        extension = '';
    } else {
        baseName = fileName.substring(0, lastDot);
        extension = fileName.substring(lastDot);
    }

    // Find the next available number
    let counter = 1;
    let newName;

    do {
        newName = `${baseName} (${counter})${extension}`;
        counter++;
    } while (existingNames.includes(newName.toLowerCase()));

    return newName;
}

/**
 * Upload a file buffer to Discord storage
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} targetPath - Target directory path
 * @returns {Promise<Object>} File entry object
 */
async function uploadFile(username, userEnv, fileBuffer, fileName, targetPath) {
    const fileSize = fileBuffer.length;
    const fileId = generateUniqueId();
    const fileHash = calculateBufferHash(fileBuffer);

    logger.info(
        `[Upload] Starting ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`
    );

    // Upload to Discord
    const messageIds = await uploadFileToDiscord(
        userEnv.dataId,
        fileBuffer,
        fileId,
        fileName
    );

    // Create file entry
    const fileEntry = {
        id: fileId,
        name: fileName,
        path: targetPath,
        size: fileSize,
        hash: fileHash,
        channelId: userEnv.dataId,
        messageIds: messageIds,
        status: "FINISHED",
        addedAt: new Date().toISOString()
    };

    userEnv.state.files.push(fileEntry);

    return fileEntry;
}

/**
 * Process file upload with filename conflict resolution
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name
 * @param {string} rawPath - Raw target path
 * @returns {Promise<Object>} Upload result
 */
async function processFileUpload(username, userEnv, fileBuffer, fileName, rawPath) {
    const targetPath = normalizePath(rawPath);

    // Ensure parent folders exist
    ensureFoldersExist(userEnv.state, targetPath);

    // Resolve filename conflicts by adding (1), (2), etc.
    const uniqueFileName = getUniqueFilename(userEnv.state.files, fileName, targetPath);

    if (uniqueFileName !== fileName) {
        logger.info(`[Upload] Filename conflict resolved: ${fileName} -> ${uniqueFileName}`);
    }

    // Upload new file
    const entry = await uploadFile(username, userEnv, fileBuffer, uniqueFileName, targetPath);
    logger.info(`[Upload] SUCCESS: ${uniqueFileName} -> ${targetPath}`);
    return { success: true, name: uniqueFileName, path: targetPath, entry };
}

/**
 * Process multiple file uploads in parallel batches
 * @param {string} username - Username
 * @param {Object} userEnv - User environment object
 * @param {Array} files - Array of {filename, fileBuffer, targetPath}
 * @param {number} parallelLimit - Max parallel uploads
 * @returns {Promise<Array>} Array of upload results
 */
async function processBatchUpload(username, userEnv, files, parallelLimit = 5) {
    const results = [];

    for (let i = 0; i < files.length; i += parallelLimit) {
        const batch = files.slice(i, i + parallelLimit);

        const batchPromises = batch.map(({ filename, fileBuffer, targetPath }) =>
            processFileUpload(username, userEnv, fileBuffer, filename, targetPath)
                .catch(err => {
                    logger.error(`[Upload] FAILED: ${filename}:`, err);
                    return { error: true, name: filename, message: err.message };
                })
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        logger.info(
            `[Batch] Completed ${Math.min(i + parallelLimit, files.length)}/${files.length} files`
        );
    }

    await saveUserEnv(username);
    return results;
}

module.exports = {
    uploadFile,
    processFileUpload,
    processBatchUpload
};
