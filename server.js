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
const multer = require('multer');
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
const tempPath = path.join(__dirname, 'temp/');
fs.ensureDirSync(tempPath);

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (safe for Discord 25MB limit)
const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '7d';

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

const upload = multer({
    dest: tempPath,
    limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB
});

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

function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
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
        dataId: await getChan('storage'), // Single storage channel
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
// FILE PROCESSING (SEQUENTIAL)
// ============================================================================

async function uploadFileToDiscord(username, file, targetPath) {
    const env = userRegistry[username];
    const channel = await client.channels.fetch(env.dataId);

    const stats = await fs.stat(file.path);
    const totalParts = Math.ceil(stats.size / CHUNK_SIZE);
    const fileId = generateUniqueId();
    const messageIds = [];

    logger.info(`[Upload] Starting ${file.originalname} (${(stats.size / 1024 / 1024).toFixed(2)}MB) - ${totalParts} chunks`);

    const fd = await fs.open(file.path, 'r');
    const uploadStart = Date.now();

    try {
        for (let i = 0; i < totalParts; i++) {
            const chunkStart = Date.now();
            const buffer = Buffer.alloc(CHUNK_SIZE);
            const { bytesRead } = await fs.read(fd, buffer, 0, CHUNK_SIZE, i * CHUNK_SIZE);

            const attachment = new AttachmentBuilder(
                buffer.subarray(0, bytesRead),
                { name: `part_${i}.bin` }
            );

            const msg = await channel.send({
                content: `DATA | ${fileId} | Chunk ${i}/${totalParts}`,
                files: [attachment]
            });

            const chunkTime = Date.now() - chunkStart;
            const speed = (bytesRead / 1024 / 1024) / (chunkTime / 1000);

            messageIds.push(msg.id);
            logger.info(`[Debug-Net] Chunk ${i + 1}/${totalParts} sent in ${chunkTime}ms (${speed.toFixed(2)} MB/s)`);
        }
    } finally {
        await fs.close(fd);
    }

    const totalTime = (Date.now() - uploadStart) / 1000;
    const avgSpeed = (stats.size / 1024 / 1024) / totalTime;
    logger.info(`[Debug-Net] Upload complete: ${file.originalname} in ${totalTime.toFixed(2)}s (~${avgSpeed.toFixed(2)} MB/s)`);

    // Update state
    const fileEntry = {
        id: fileId,
        name: file.originalname,
        path: targetPath,
        size: stats.size,
        hash: await calculateFileHash(file.path),
        channelId: env.dataId,
        messageIds: messageIds,
        status: "FINISHED",
        addedAt: new Date().toISOString()
    };

    env.state.files.push(fileEntry);
    await saveUserEnv(username);

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
        // Just fetch the gateway info as a lightweight test
        await client.rest.get('/gateway');
        const latency = Date.now() - start;
        res.json({ latency });
    } catch (e) {
        res.status(500).json({ error: e.message, latency: Date.now() - start });
    }
});

// Network Check
app.get('/api/ping', async (req, res) => {
    const start = Date.now();
    try {
        // Just fetch the gateway info as a lightweight test
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

app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const fileHash = await calculateFileHash(req.file.path);

        // Simple Deduplication
        const existing = req.userEnv.state.files.find(f => f.hash === fileHash);
        if (existing) {
            const newEntry = { ...existing, id: generateUniqueId(), name: req.file.originalname, path: req.body.path, addedAt: new Date().toISOString() };
            req.userEnv.state.files.push(newEntry);
            await saveUserEnv(req.username);
            await fs.remove(req.file.path);
            return res.json({ success: true, deduplicated: true });
        }

        // Upload to Discord (Synchronous)
        await uploadFileToDiscord(req.username, req.file, req.body.path);
        await fs.remove(req.file.path);

        res.json({ success: true });
    } catch (error) {
        logger.error(`Upload failed for ${req.file.originalname}:`, error);
        await fs.remove(req.file.path).catch(() => { });
        res.status(500).json({ error: 'Upload failed' });
    }
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
        const file = req.userEnv.state.files.find(f => f.id === id);
        if (file) {
            // We don't delete from Discord to allow deduplication to keep working for others/same user
            // But if we wanted to be strict, we could. For now, just remove from index.
            req.userEnv.state.files = req.userEnv.state.files.filter(f => f.id !== id);
        }
    }
    await saveUserEnv(req.username);
    res.json({ success: true });
});

app.post('/api/nuke', auth, async (req, res) => {
    // Simplified nuke - just clears index. Real nuke would delete messages too.
    req.userEnv.state = { files: [], folders: [] };
    await saveUserEnv(req.username);
    res.json({ success: true });
});

// Start Server
client.login(process.env.DISCORD_BOT_TOKEN).then(() => {
    logger.info('Discord client ready');
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
});
