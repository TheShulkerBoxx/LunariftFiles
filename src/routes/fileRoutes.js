/**
 * File operation routes
 */

const express = require('express');
const busboy = require('busboy');
const authMiddleware = require('../middleware/authMiddleware');
const { processFileUpload, processBatchUpload } = require('../services/files/uploadService');
const { createFolder, deleteItem, nukeAllFiles, getFileList } = require('../services/files/fileService');
const { saveUserEnv } = require('../services/discord/channels');
const config = require('../config/config');
const logger = require('../services/logger');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/sync
 * Get all files and folders for authenticated user
 */
router.get('/sync', (req, res) => {
    const fileList = getFileList(req.userEnv);
    res.json(fileList);
});

/**
 * POST /api/upload
 * Upload files with streaming (no local storage)
 */
router.post('/upload', (req, res) => {
    const username = req.username;
    const userEnv = req.userEnv;

    const bb = busboy({ 
        headers: req.headers, 
        limits: { fileSize: config.upload.maxFileSize } 
    });

    const fields = {};
    const filePromises = [];
    const pendingFiles = [];

    bb.on('field', (name, val) => {
        fields[name] = val;
        logger.debug(`[Upload] Received field: ${name} = "${val}"`);
    });

    bb.on('file', (name, file, info) => {
        const { filename } = info;
        const chunks = [];

        logger.info(`[Upload] Starting file receive: ${filename}`);

        file.on('data', (data) => {
            chunks.push(data);
        });

        file.on('end', () => {
            const fileBuffer = Buffer.concat(chunks);
            pendingFiles.push({ filename, fileBuffer });
            logger.info(`[Upload] File received: ${filename} (${fileBuffer.length} bytes)`);
        });
    });

    bb.on('close', async () => {
        try {
            const rawPath = fields['path'] || '/';
            logger.info(`[Upload] Processing ${pendingFiles.length} files for path: "${rawPath}"`);

            // Process each pending file
            for (const { filename, fileBuffer } of pendingFiles) {
                const uploadPromise = processFileUpload(username, userEnv, fileBuffer, filename, rawPath)
                    .catch(err => {
                        logger.error(`[Upload] FAILED: ${filename}:`, err);
                        return { error: true, name: filename, message: err.message };
                    });

                filePromises.push(uploadPromise);
            }

            const results = await Promise.all(filePromises);
            await saveUserEnv(username);

            const dedupCount = results.filter(r => r.deduplicated).length;
            const uploadCount = results.filter(r => r.success && !r.deduplicated).length;
            const errorCount = results.filter(r => r.error).length;

            logger.info(`[Upload] Batch complete: ${uploadCount} uploaded, ${dedupCount} deduplicated, ${errorCount} errors`);

            res.json({
                success: true,
                uploaded: uploadCount,
                deduplicated: dedupCount,
                errors: errorCount,
                total: results.length,
                path: rawPath
            });
        } catch (error) {
            logger.error('Upload batch failed:', error);
            res.status(500).json({ error: 'Upload failed: ' + error.message });
        }
    });

    bb.on('error', (error) => {
        logger.error('Busboy error:', error);
        res.status(500).json({ error: 'Upload parsing failed' });
    });

    req.pipe(bb);
});

/**
 * POST /api/upload-batch
 * Batch upload with parallel processing
 */
router.post('/upload-batch', (req, res) => {
    const username = req.username;
    const userEnv = req.userEnv;

    const bb = busboy({ 
        headers: req.headers, 
        limits: { fileSize: config.upload.maxFileSize } 
    });

    let targetPath = '/';
    const pendingFiles = [];

    bb.on('field', (name, val) => {
        if (name === 'path') targetPath = val;
    });

    bb.on('file', (name, file, info) => {
        const { filename } = info;
        const chunks = [];

        file.on('data', (data) => {
            chunks.push(data);
        });

        file.on('end', () => {
            const fileBuffer = Buffer.concat(chunks);
            pendingFiles.push({ filename, fileBuffer, targetPath });
        });
    });

    bb.on('close', async () => {
        try {
            const results = await processBatchUpload(
                username, 
                userEnv, 
                pendingFiles, 
                config.upload.maxParallelUploads
            );

            const dedupCount = results.filter(r => r.deduplicated).length;
            const uploadCount = results.filter(r => r.success && !r.deduplicated).length;
            const errorCount = results.filter(r => r.error).length;

            res.json({
                success: true,
                uploaded: uploadCount,
                deduplicated: dedupCount,
                errors: errorCount,
                total: results.length
            });
        } catch (error) {
            logger.error('Batch upload failed:', error);
            res.status(500).json({ error: 'Batch upload failed: ' + error.message });
        }
    });

    bb.on('error', (error) => {
        logger.error('Busboy error:', error);
        res.status(500).json({ error: 'Upload parsing failed' });
    });

    req.pipe(bb);
});

/**
 * POST /api/create-folder
 * Create a new folder
 */
router.post('/create-folder', async (req, res) => {
    try {
        await createFolder(req.username, req.userEnv, req.body.path);
        res.json({ success: true });
    } catch (error) {
        logger.error('Create folder failed:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

/**
 * DELETE /api/item
 * Delete a file or folder
 */
router.delete('/item', async (req, res) => {
    try {
        const { id, isFolder } = req.body;
        await deleteItem(req.username, req.userEnv, id, isFolder);
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete item failed:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

/**
 * POST /api/nuke
 * Delete all files and folders
 */
router.post('/nuke', async (req, res) => {
    try {
        await nukeAllFiles(req.username, req.userEnv);
        res.json({ success: true });
    } catch (error) {
        logger.error('Nuke failed:', error);
        res.status(500).json({ error: 'Failed to nuke files' });
    }
});

module.exports = router;
