const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Validate environment variables on startup
const requiredEnvVars = ['DISCORD_BOT_TOKEN', 'GUILD_ID', 'AUTH_CHANNEL_ID', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

const express = require('express');
const { Client, GatewayIntentBits, AttachmentBuilder, ChannelType } = require('discord.js');
const busboy = require('busboy');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const helmet = require('helmet');
const winston = require('winston');
const crypto = require('crypto');
const https = require('https');
const dns = require('dns');

// Force IPv4
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Keep-Alive
https.globalAgent = new https.Agent({ keepAlive: true });

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const app = express();
const PORT = process.env.PORT || 5050;

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (safe for Discord 25MB limit)
const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '7d';
const MAX_PARALLEL_UPLOADS = 5; // Number of files to upload in parallel
const MAX_RETRIES = 3; // Number of retries per chunk
const RETRY_DELAY_BASE = 1000; // Base delay for exponential backoff (ms)

// ============================================================================
// LOGGING SETUP
// ============================================================================

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

logger.add(new winston.transports.Console({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
}));

// Ensure logs directory exists
fs.ensureDirSync(path.join(__dirname, 'logs'));

// ============================================================================
// DISCORD CLIENT SETUP
// ============================================================================

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    rest: { timeout: 60000 }
});

const userRegistry = {}; // { username: { dataId, metaId, state } }

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

async function safeFetchJSON(url) {
    try {
        const res = await fetch(url);
        if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
            return await res.json();
        }
    } catch (error) {
        logger.error('Failed to fetch JSON:', { url, error: error.message });
    }
    return null;
}

function generateUniqueId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function calculateBufferHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// DISCORD OPERATIONS
// ============================================================================

async function getMasterUsers() {
    try {
        const channel = await client.channels.fetch(process.env.AUTH_CHANNEL_ID);
        const msgs = await channel.messages.fetch({ limit: 5 });
        const file = msgs.find(m => m.attachments.first()?.name === 'users.json');

        if (!file) return {};
        const users = await safeFetchJSON(file.attachments.first().url);
        return users || {};
    } catch (error) {
        logger.error('Failed to get master users:', error);
        return {};
    }
}

async function saveMasterUsers(users) {
    try {
        const channel = await client.channels.fetch(process.env.AUTH_CHANNEL_ID);
        const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(users)), { name: 'users.json' });
        await channel.send({ content: 'AUTH_DB_SYNC', files: [attachment] });
    } catch (error) {
        logger.error('Failed to save master users:', error);
        throw error;
    }
}

async function getUserEnv(username) {
    if (userRegistry[username]) return userRegistry[username];

    logger.info(`Initializing user environment: ${username}`);
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const catName = `Lunarift - ${username}`;
    let cat = guild.channels.cache.find(c => c.name === catName && c.type === ChannelType.GuildCategory);

    if (!cat) {
        cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
    }

    const getChan = async (name) => {
        let c = guild.channels.cache.find(ch => ch.name === name && ch.parentId === cat.id);
        if (!c) c = await guild.channels.create({ name, parent: cat.id });
        return c.id;
    };

    const env = {
        dataId: await getChan('storage'),
        metaId: await getChan('metadata'),
        state: { files: [], folders: [] }
    };

    userRegistry[username] = env;
    await fetchDirectory(username);
    return env;
}

async function saveUserEnv(username) {
    const env = userRegistry[username];
    if (!env) return;

    try {
        const channel = await client.channels.fetch(env.metaId);
        const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(env.state)), { name: 'directory.json' });
        await channel.send({ content: 'DIR_SYNC', files: [attachment] });

        // Cleanup old messages
        const old = await channel.messages.fetch({ limit: 5 });
        const toDelete = Array.from(old.values()).slice(1);
        if (toDelete.length > 0) {
            await channel.bulkDelete(toDelete.map(m => m.id), true).catch(() => { });
        }
    } catch (error) {
        logger.error(`Failed to save metadata for ${username}:`, error);
    }
}

async function fetchDirectory(username) {
    const env = userRegistry[username];
    if (!env) return;

    try {
        const metaChannel = await client.channels.fetch(env.metaId);
        const metaMsgs = await metaChannel.messages.fetch({ limit: 5 });
        const lastMeta = metaMsgs.find(m => m.attachments.first()?.name === 'directory.json');

        if (lastMeta) {
            const data = await safeFetchJSON(lastMeta.attachments.first().url);
            if (data) env.state = data;
        }
    } catch (error) {
        logger.error(`Failed to fetch directory for ${username}:`, error);
    }
}

// ============================================================================
// CHUNK UPLOAD WITH RETRY
// ============================================================================

async function uploadChunkWithRetry(channel, buffer, fileId, chunkIndex, totalParts) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const attachment = new AttachmentBuilder(buffer, { name: `part_${chunkIndex}.bin` });

            const msg = await channel.send({
                content: `DATA | ${fileId} | Chunk ${chunkIndex}/${totalParts}`,
                files: [attachment]
            });

            return msg.id;
        } catch (error) {
            lastError = error;
            logger.warn(`Chunk ${chunkIndex}/${totalParts} failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

            if (attempt < MAX_RETRIES) {
                const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
                logger.info(`Retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw new Error(`Failed to upload chunk ${chunkIndex} after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

// ============================================================================
// STREAMING FILE UPLOAD (NO LOCAL STORAGE)
// ============================================================================

async function uploadBufferToDiscord(username, fileBuffer, fileName, targetPath) {
    const env = userRegistry[username];
    const channel = await client.channels.fetch(env.dataId);

    const fileSize = fileBuffer.length;
    const totalParts = Math.ceil(fileSize / CHUNK_SIZE);
    const fileId = generateUniqueId();
    const messageIds = [];
    const fileHash = calculateBufferHash(fileBuffer);

    logger.info(`[Upload] Starting ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) - ${totalParts} chunks`);

    const uploadStart = Date.now();

    for (let i = 0; i < totalParts; i++) {
        const chunkStart = Date.now();
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunkBuffer = fileBuffer.subarray(start, end);

        const msgId = await uploadChunkWithRetry(channel, chunkBuffer, fileId, i, totalParts);
        messageIds.push(msgId);

        const chunkTime = Date.now() - chunkStart;
        const speed = (chunkBuffer.length / 1024 / 1024) / (chunkTime / 1000);
        logger.info(`[Upload] Chunk ${i + 1}/${totalParts} sent in ${chunkTime}ms (${speed.toFixed(2)} MB/s)`);
    }

    const totalTime = (Date.now() - uploadStart) / 1000;
    const avgSpeed = (fileSize / 1024 / 1024) / totalTime;
    logger.info(`[Upload] Complete: ${fileName} in ${totalTime.toFixed(2)}s (~${avgSpeed.toFixed(2)} MB/s)`);

    const fileEntry = {
        id: fileId,
        name: fileName,
        path: targetPath,
        size: fileSize,
        hash: fileHash,
        channelId: env.dataId,
        messageIds: messageIds,
        status: "FINISHED",
        addedAt: new Date().toISOString()
    };

    env.state.files.push(fileEntry);

    return fileEntry;
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

const auth = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'No token provided' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.username = decoded.username;
        req.userEnv = await getUserEnv(decoded.username);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ============================================================================
// API ROUTES
// ============================================================================

// Network Check
app.get('/api/ping', async (req, res) => {
    const start = Date.now();
    try {
        await client.rest.get('/gateway');
        const latency = Date.now() - start;
        res.json({ latency });
    } catch (e) {
        res.status(500).json({ error: e.message, latency: Date.now() - start });
    }
});

app.post('/api/register',
    body('username').isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_]+$/),
    body('password').isLength({ min: 8 }),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid input' });

        try {
            const { username, password } = req.body;
            const users = await getMasterUsers();
            if (users[username]) return res.status(400).json({ error: 'Username exists' });

            users[username] = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await saveMasterUsers(users);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Registration failed' });
        }
    }
);

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await getMasterUsers();
        if (!users[username] || !await bcrypt.compare(password, users[username])) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.json({ token, username });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/sync', auth, (req, res) => {
    res.json({ files: req.userEnv.state.files, folders: req.userEnv.state.folders });
});

// ============================================================================
// PARALLEL UPLOAD ENDPOINT (STREAMING - NO LOCAL STORAGE)
// ============================================================================

app.post('/api/upload', auth, (req, res) => {
    const username = req.username;
    const userEnv = req.userEnv;

    const bb = busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 * 1024 } });

    let targetPath = '/';
    const filePromises = [];

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
            const fileHash = calculateBufferHash(fileBuffer);

            // Check for deduplication
            const existing = userEnv.state.files.find(f => f.hash === fileHash);

            if (existing) {
                // Deduplicate - just add a reference
                const newEntry = {
                    ...existing,
                    id: generateUniqueId(),
                    name: filename,
                    path: targetPath,
                    isReference: true,
                    addedAt: new Date().toISOString()
                };
                userEnv.state.files.push(newEntry);
                logger.info(`[Dedup] ${filename} matched existing file`);
                filePromises.push(Promise.resolve({ deduplicated: true, name: filename }));
            } else {
                // Upload to Discord
                const uploadPromise = uploadBufferToDiscord(username, fileBuffer, filename, targetPath)
                    .then(entry => ({ success: true, name: filename, entry }))
                    .catch(err => {
                        logger.error(`Upload failed for ${filename}:`, err);
                        throw err;
                    });

                filePromises.push(uploadPromise);
            }
        });
    });

    bb.on('close', async () => {
        try {
            const results = await Promise.all(filePromises);
            await saveUserEnv(username);

            const dedupCount = results.filter(r => r.deduplicated).length;
            const uploadCount = results.filter(r => r.success && !r.deduplicated).length;

            res.json({
                success: true,
                uploaded: uploadCount,
                deduplicated: dedupCount,
                total: results.length
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

// ============================================================================
// BATCH PARALLEL UPLOAD ENDPOINT
// ============================================================================

app.post('/api/upload-batch', auth, (req, res) => {
    const username = req.username;
    const userEnv = req.userEnv;

    const bb = busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 * 1024 } });

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
            const results = [];
            let dedupCount = 0;

            // Process files in parallel batches
            for (let i = 0; i < pendingFiles.length; i += MAX_PARALLEL_UPLOADS) {
                const batch = pendingFiles.slice(i, i + MAX_PARALLEL_UPLOADS);

                const batchPromises = batch.map(async ({ filename, fileBuffer, targetPath }) => {
                    const fileHash = calculateBufferHash(fileBuffer);

                    // Check deduplication
                    const existing = userEnv.state.files.find(f => f.hash === fileHash);

                    if (existing) {
                        const newEntry = {
                            ...existing,
                            id: generateUniqueId(),
                            name: filename,
                            path: targetPath,
                            isReference: true,
                            addedAt: new Date().toISOString()
                        };
                        userEnv.state.files.push(newEntry);
                        logger.info(`[Dedup] ${filename} matched existing file`);
                        dedupCount++;
                        return { deduplicated: true, name: filename };
                    }

                    // Upload with retry
                    const entry = await uploadBufferToDiscord(username, fileBuffer, filename, targetPath);
                    return { success: true, name: filename, entry };
                });

                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);

                logger.info(`[Batch] Completed ${Math.min(i + MAX_PARALLEL_UPLOADS, pendingFiles.length)}/${pendingFiles.length} files`);
            }

            await saveUserEnv(username);

            res.json({
                success: true,
                uploaded: results.filter(r => r.success && !r.deduplicated).length,
                deduplicated: dedupCount,
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

app.post('/api/create-folder', auth, async (req, res) => {
    req.userEnv.state.folders.push(req.body.path);
    await saveUserEnv(req.username);
    res.json({ success: true });
});

app.delete('/api/item', auth, async (req, res) => {
    const { id, isFolder } = req.body;
    if (isFolder) {
        req.userEnv.state.folders = req.userEnv.state.folders.filter(f => f !== id);
    } else {
        req.userEnv.state.files = req.userEnv.state.files.filter(f => f.id !== id);
    }
    await saveUserEnv(req.username);
    res.json({ success: true });
});

app.post('/api/nuke', auth, async (req, res) => {
    req.userEnv.state = { files: [], folders: [] };
    await saveUserEnv(req.username);
    res.json({ success: true });
});

// Start Server
client.login(process.env.DISCORD_BOT_TOKEN).then(() => {
    logger.info('Discord client ready');
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
});
