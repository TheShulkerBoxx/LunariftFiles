/**
 * File operation routes
 */

const express = require('express');
const busboy = require('busboy');
const authMiddleware = require('../middleware/authMiddleware');
const { processFileUpload, processBatchUpload } = require('../services/files/uploadService');
const { processStreamingUpload } = require('../services/files/streamingUploadService');
const { initChunkedUpload, addChunk, isUploadComplete, finalizeUpload, cancelUpload, getUploadStatus } = require('../services/files/chunkedUploadService');
const { downloadFile, streamDownloadFile, getContentType } = require('../services/files/downloadService');
const { createFolder, deleteItem, nukeAllFiles, getFileList, moveItem } = require('../services/files/fileService');
const { saveUserEnv } = require('../services/discord/channels');
const config = require('../config/config');
const logger = require('../services/logger');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/sync
 * Get all files and folders for authenticated user
 * Supports optional pagination with query params: page, limit
 * Without pagination params, returns all files (backward compatibility)
 */
router.get('/sync', (req, res) => {
    const { page, limit } = req.query;

    // Pass pagination options if provided
    const options = {};
    if (page) options.page = page;
    if (limit) options.limit = limit;

    const fileList = getFileList(req.userEnv, options);
    res.json(fileList);
});

/**
 * GET /api/storage-info
 * Get detailed storage statistics for authenticated user
 */
router.get('/storage-info', (req, res) => {
    const { getDirectorySize } = require('../services/discord/metadataStorage');
    const sizeInfo = getDirectorySize(req.userEnv.state);
    const files = req.userEnv.state.files;
    const folders = req.userEnv.state.folders;

    // Calculate total storage used (sum of all file sizes)
    const totalStorageBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);

    // File type breakdown
    const typeCategories = {
        images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif', 'tiff'],
        videos: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'm4v'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
        documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'odt'],
        code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rb', 'php', 'html', 'css', 'json', 'xml', 'yaml', 'yml', 'sh'],
        archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz']
    };

    const breakdown = {
        images: { count: 0, size: 0 },
        videos: { count: 0, size: 0 },
        audio: { count: 0, size: 0 },
        documents: { count: 0, size: 0 },
        code: { count: 0, size: 0 },
        archives: { count: 0, size: 0 },
        other: { count: 0, size: 0 }
    };

    files.forEach(file => {
        const ext = (file.name || '').split('.').pop().toLowerCase();
        let category = 'other';

        for (const [cat, exts] of Object.entries(typeCategories)) {
            if (exts.includes(ext)) {
                category = cat;
                break;
            }
        }

        breakdown[category].count++;
        breakdown[category].size += file.size || 0;
    });

    // Get largest files (top 5)
    const largestFiles = [...files]
        .sort((a, b) => (b.size || 0) - (a.size || 0))
        .slice(0, 5)
        .map(f => ({
            name: f.name,
            size: f.size,
            path: f.path
        }));

    // Recent files (last 5 by addedAt)
    const recentFiles = [...files]
        .sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0))
        .slice(0, 5)
        .map(f => ({
            name: f.name,
            size: f.size,
            addedAt: f.addedAt
        }));

    // Average file size
    const avgFileSize = files.length > 0 ? totalStorageBytes / files.length : 0;

    res.json({
        summary: {
            fileCount: files.length,
            folderCount: folders.length,
            totalStorage: {
                bytes: totalStorageBytes,
                formatted: formatBytes(totalStorageBytes)
            },
            averageFileSize: {
                bytes: Math.round(avgFileSize),
                formatted: formatBytes(avgFileSize)
            }
        },
        breakdown,
        largestFiles,
        recentFiles,
        metadata: {
            bytes: sizeInfo.bytes,
            formatted: sizeInfo.mb + ' MB',
            percentage: sizeInfo.percentage,
            needsChunking: sizeInfo.needsChunking
        },
        warning: parseFloat(sizeInfo.percentage) > 50 ?
            'Your metadata is getting large. Consider archiving old files.' : null
    });
});

// Helper function for formatting bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
 * Extended timeout for large files
 */
router.post('/upload', (req, res) => {
    // Extend timeout for large file uploads (10 minutes)
    req.setTimeout(600000);
    res.setTimeout(600000);

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

            const batchIndex = fields['batchIndex'];
            const batchTotal = fields['batchTotal'];
            const progressStr = (batchIndex && batchTotal) ? `(File ${batchIndex}/${batchTotal})` : '';

            logger.info(`[Upload] Request complete: ${uploadCount} uploaded, ${dedupCount} deduplicated, ${errorCount} errors ${progressStr}`);

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
 * Extended timeout for large files
 */
router.post('/upload-batch', (req, res) => {
    // Extend timeout for large file uploads (10 minutes)
    req.setTimeout(600000);
    res.setTimeout(600000);

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
 * POST /api/upload-stream
 * Streaming upload for large files (>50MB)
 * Uploads chunks to Discord as they arrive without loading entire file in memory
 * IMPORTANT: Client must send 'path' field BEFORE 'file' in FormData
 */
router.post('/upload-stream', (req, res) => {
    // Extended timeout for streaming uploads (30 minutes for very large files)
    req.setTimeout(1800000);
    res.setTimeout(1800000);

    const username = req.username;
    const userEnv = req.userEnv;

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: config.upload.maxFileSize }
    });

    let targetPath = null;  // Start as null to detect if path arrived
    let pendingFile = null; // Store file info if it arrives before path
    let streamingPromise = null;
    let pathReceived = false;

    bb.on('field', (name, val) => {
        if (name === 'path') {
            targetPath = val || '/';
            pathReceived = true;
            logger.info(`[StreamUpload] Path received: "${targetPath}"`);

            // If file was waiting for path, start processing now
            if (pendingFile && !streamingPromise) {
                logger.info(`[StreamUpload] Starting deferred upload for: ${pendingFile.filename}`);
                streamingPromise = processStreamingUpload(
                    username,
                    userEnv,
                    pendingFile.stream,
                    pendingFile.filename,
                    targetPath,
                    (chunkNum, totalBytes) => {
                        logger.debug(`[StreamUpload] Progress: chunk ${chunkNum}, ${totalBytes} bytes`);
                    }
                );
            }
        }
        logger.debug(`[StreamUpload] Field: ${name} = "${val}"`);
    });

    bb.on('file', (name, file, info) => {
        const { filename } = info;

        if (pathReceived && targetPath !== null) {
            // Path already received - start immediately
            logger.info(`[StreamUpload] Starting streaming upload: ${filename} to ${targetPath}`);
            streamingPromise = processStreamingUpload(
                username,
                userEnv,
                file,
                filename,
                targetPath,
                (chunkNum, totalBytes) => {
                    logger.debug(`[StreamUpload] Progress: chunk ${chunkNum}, ${totalBytes} bytes`);
                }
            );
        } else {
            // Path not yet received - defer processing
            logger.warn(`[StreamUpload] File arrived before path - deferring: ${filename}`);
            pendingFile = { stream: file, filename };

            // Pause the stream until we get the path
            file.pause();

            // Set a timeout - if path doesn't arrive in 5 seconds, use default
            setTimeout(() => {
                if (!pathReceived && pendingFile && !streamingPromise) {
                    logger.warn(`[StreamUpload] Path timeout - using default "/" for: ${filename}`);
                    targetPath = '/';
                    file.resume();
                    streamingPromise = processStreamingUpload(
                        username,
                        userEnv,
                        file,
                        filename,
                        targetPath,
                        (chunkNum, totalBytes) => {
                            logger.debug(`[StreamUpload] Progress: chunk ${chunkNum}, ${totalBytes} bytes`);
                        }
                    );
                }
            }, 5000);
        }
    });

    bb.on('close', async () => {
        try {
            // Resume paused file stream if path was received
            if (pendingFile && pathReceived && !streamingPromise) {
                pendingFile.stream.resume();
                streamingPromise = processStreamingUpload(
                    username,
                    userEnv,
                    pendingFile.stream,
                    pendingFile.filename,
                    targetPath || '/',
                    (chunkNum, totalBytes) => {
                        logger.debug(`[StreamUpload] Progress: chunk ${chunkNum}, ${totalBytes} bytes`);
                    }
                );
            }

            if (streamingPromise) {
                const result = await streamingPromise;
                logger.info(`[StreamUpload] Complete: ${result.name} -> ${result.path} (${result.chunks} chunks, ${(result.size / 1024 / 1024).toFixed(2)}MB)`);

                res.json({
                    success: true,
                    uploaded: 1,
                    name: result.name,
                    path: result.path,
                    size: result.size,
                    chunks: result.chunks
                });
            } else {
                res.status(400).json({ error: 'No file received' });
            }
        } catch (error) {
            logger.error('[StreamUpload] Failed:', error);
            res.status(500).json({ error: 'Streaming upload failed: ' + error.message });
        }
    });

    bb.on('error', (error) => {
        logger.error('[StreamUpload] Busboy error:', error);
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

/**
 * POST /api/move
 * Move a file or folder to a new path
 */
router.post('/move', async (req, res) => {
    try {
        const { id, isFolder, newPath } = req.body;

        if (!id || newPath === undefined) {
            return res.status(400).json({ error: 'Missing required fields: id and newPath' });
        }

        await moveItem(req.username, req.userEnv, id, isFolder, newPath);
        res.json({ success: true });
    } catch (error) {
        logger.error('Move item failed:', error);
        res.status(500).json({ error: 'Failed to move item: ' + error.message });
    }
});

/**
 * POST /api/upload-chunked/init
 * Initialize a chunked upload session for large files
 * Body: { filename, totalChunks, totalSize, path }
 */
router.post('/upload-chunked/init', async (req, res) => {
    try {
        const { filename, totalChunks, totalSize, path } = req.body;

        if (!filename || !totalChunks || !totalSize) {
            return res.status(400).json({
                error: 'Missing required fields: filename, totalChunks, totalSize'
            });
        }

        // Generate unique upload ID
        const uploadId = `${req.username}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const result = await initChunkedUpload(uploadId, {
            filename,
            totalChunks,
            totalSize,
            path: path || '/',
            username: req.username
        }, req.userEnv);

        res.json(result);
    } catch (error) {
        logger.error('Chunked upload init failed:', error);
        res.status(500).json({ error: 'Failed to initialize chunked upload: ' + error.message });
    }
});

/**
 * POST /api/upload-chunked/chunk
 * Upload a single chunk
 * FormData: uploadId, chunkIndex, chunk (file)
 */
router.post('/upload-chunked/chunk', (req, res) => {
    // Extended timeout for chunk uploads
    req.setTimeout(300000);
    res.setTimeout(300000);

    const bb = busboy({
        headers: req.headers,
        limits: { fileSize: 100 * 1024 * 1024 } // 100MB per chunk max
    });

    let uploadId = null;
    let chunkIndex = null;
    let chunkBuffer = null;

    bb.on('field', (name, val) => {
        if (name === 'uploadId') uploadId = val;
        if (name === 'chunkIndex') chunkIndex = parseInt(val);
    });

    bb.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
            chunkBuffer = Buffer.concat(chunks);
        });
    });

    bb.on('close', async () => {
        try {
            if (!uploadId || chunkIndex === null || !chunkBuffer) {
                return res.status(400).json({
                    error: 'Missing required fields: uploadId, chunkIndex, chunk'
                });
            }

            const result = await addChunk(uploadId, chunkIndex, chunkBuffer);
            res.json(result);
        } catch (error) {
            logger.error('Chunk upload failed:', error);
            res.status(500).json({ error: 'Failed to upload chunk: ' + error.message });
        }
    });

    bb.on('error', (error) => {
        logger.error('Chunk upload busboy error:', error);
        res.status(500).json({ error: 'Chunk upload parsing failed' });
    });

    req.pipe(bb);
});

/**
 * POST /api/upload-chunked/finalize
 * Finalize a chunked upload after all chunks received
 * Body: { uploadId }
 */
router.post('/upload-chunked/finalize', async (req, res) => {
    // Extended timeout for finalization (processing can take a while)
    req.setTimeout(1800000);
    res.setTimeout(1800000);

    try {
        const { uploadId } = req.body;

        if (!uploadId) {
            return res.status(400).json({ error: 'Missing uploadId' });
        }

        // Check if upload is complete
        if (!isUploadComplete(uploadId)) {
            const status = getUploadStatus(uploadId);
            if (!status) {
                return res.status(404).json({ error: 'Upload session not found' });
            }
            return res.status(400).json({
                error: 'Upload incomplete',
                receivedChunks: status.receivedChunks,
                totalChunks: status.totalChunks
            });
        }

        // Finalize and process the upload
        const result = await finalizeUpload(uploadId, req.userEnv);
        res.json(result);
    } catch (error) {
        logger.error('Chunked upload finalize failed:', error);
        res.status(500).json({ error: 'Failed to finalize upload: ' + error.message });
    }
});

/**
 * GET /api/upload-chunked/status/:id
 * Get status of a chunked upload
 */
router.get('/upload-chunked/status/:id', (req, res) => {
    const status = getUploadStatus(req.params.id);

    if (!status) {
        return res.status(404).json({ error: 'Upload session not found' });
    }

    res.json(status);
});

/**
 * DELETE /api/upload-chunked/:id
 * Cancel a chunked upload
 */
router.delete('/upload-chunked/:id', (req, res) => {
    const cancelled = cancelUpload(req.params.id);

    if (!cancelled) {
        return res.status(404).json({ error: 'Upload session not found' });
    }

    res.json({ success: true, message: 'Upload cancelled' });
});

module.exports = router;
