/**
 * File operation routes
 */

const express = require('express');
const busboy = require('busboy');
const authMiddleware = require('../middleware/authMiddleware');
const { processFileUpload, processBatchUpload } = require('../services/files/uploadService');
const { downloadFile, streamDownloadFile, getContentType } = require('../services/files/downloadService');
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
 * GET /api/storage-info
 * Get storage statistics for authenticated user
 */
router.get('/storage-info', (req, res) => {
    const { getDirectorySize } = require('../services/discord/metadataStorage');
    const sizeInfo = getDirectorySize(req.userEnv.state);

    res.json({
        fileCount: req.userEnv.state.files.length,
        folderCount: req.userEnv.state.folders.length,
        metadataSize: {
            bytes: sizeInfo.bytes,
            kilobytes: sizeInfo.kb,
            megabytes: sizeInfo.mb,
            percentage: sizeInfo.percentage,
            needsChunking: sizeInfo.needsChunking
        },
        warning: parseFloat(sizeInfo.percentage) > 50 ?
            'Your metadata is getting large. Consider archiving old files.' : null
    });
});

/**
 * GET /api/download/:id
 * Download a file by its ID
 */
router.get('/download/:id', async (req, res) => {
    try {
        const fileId = req.params.id;
        const inline = req.query.inline === 'true'; // Optional: view in browser instead of download

        // Find the file in user's state
        const fileEntry = req.userEnv.state.files.find(f => f.id === fileId);

        if (!fileEntry) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if file has messageIds (actual uploaded file vs reference)
        if (!fileEntry.messageIds || fileEntry.messageIds.length === 0) {
            // This might be a deduplicated reference, find the original
            const originalFile = req.userEnv.state.files.find(
                f => f.hash === fileEntry.hash && f.messageIds && f.messageIds.length > 0
            );

            if (!originalFile) {
                return res.status(404).json({ error: 'File data not found' });
            }

            // Use the original file's data
            fileEntry.messageIds = originalFile.messageIds;
            fileEntry.channelId = originalFile.channelId;
        }

        logger.info(`[Download] Request for ${fileEntry.name} (${fileEntry.messageIds.length} chunks)`);

        // Set response headers
        const contentType = getContentType(fileEntry.name);
        const disposition = inline ? 'inline' : 'attachment';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(fileEntry.name)}"`);
        res.setHeader('Content-Length', fileEntry.size);
        res.setHeader('X-File-Name', encodeURIComponent(fileEntry.name));
        res.setHeader('X-File-Size', fileEntry.size);

        // Stream the file chunks to the response
        await streamDownloadFile(fileEntry, async (chunk, index, total) => {
            res.write(chunk);
        });

        res.end();
        logger.info(`[Download] Complete: ${fileEntry.name}`);
    } catch (error) {
        logger.error('[Download] Failed:', error);

        // Only send error if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed: ' + error.message });
        }
    }
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
