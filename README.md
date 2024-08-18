# Lunarift Files - Secure Cloud Storage

Discord-based cloud storage system with enterprise-grade security, parallel uploads, and file deduplication.

## Features

- ✅ **Secure Authentication**: JWT tokens with bcrypt password hashing
- ✅ **Parallel Processing**: 3 concurrent uploads per user, 3 chunks per file
- ✅ **File Deduplication**: SHA-256 hash-based deduplication saves storage
- ✅ **Rate Limiting**: Protection against brute force and DoS attacks
- ✅ **Input Validation**: All user inputs sanitized and validated
- ✅ **Structured Logging**: Winston-based logging with error tracking
- ✅ **Graceful Shutdown**: Proper cleanup on server restart
- ✅ **Modern UI**: Custom modals, notifications, keyboard shortcuts

## Installation

### Prerequisites

- Node.js 22+ (LTS)
- Discord bot with message permissions
- Discord server with 2 channels per user

### Step 1: System Preparation

```bash
# Install Node.js 22 (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Navigate to project directory
cd ~/lunarift-files

# Install dependencies
npm install
```

### Step 2: Configuration

```bash
# Copy environment template
cp .env.example .env

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Edit .env and fill in:
# - DISCORD_BOT_TOKEN (from Discord Developer Portal)
# - GUILD_ID (your Discord server ID)
# - AUTH_CHANNEL_ID (channel for user database)
# - JWT_SECRET (generated above)
# - NUKE_PASSWORD (choose a secure password)
nano .env
```

### Step 3: Create Log Directory

```bash
mkdir -p logs
```

### Step 4: Start Server

```bash
# Development mode (with console logs)
NODE_ENV=development npm start

# Production mode
npm start
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Discord bot token | `MTQ1MjAzNTI...` |
| `GUILD_ID` | Discord server ID | `1140384630994911272` |
| `AUTH_CHANNEL_ID` | Channel for user database | `1452045296358916286` |
| `JWT_SECRET` | 64-char random hex string | Generate with crypto |
| `NUKE_PASSWORD` | Password for storage wipe | Choose secure password |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5050` |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5050` |

## Security Improvements

### Fixed Vulnerabilities

1. ✅ **Authentication**: Replaced hardcoded token with JWT
2. ✅ **Password Storage**: Bcrypt hashing instead of plaintext
3. ✅ **Secrets Management**: Moved to environment variables
4. ✅ **Rate Limiting**: 100 requests per 15 minutes
5. ✅ **Input Validation**: All endpoints validated with express-validator
6. ✅ **CORS**: Restricted to allowed origins only
7. ✅ **Download Auth**: Requires valid JWT token
8. ✅ **Session Expiry**: Tokens expire after 7 days

### Security Headers (Helmet)

- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security

## Performance Optimizations

### Upload Speed

- **3x parallel file uploads** per user (vs 1x sequential)
- **3x parallel chunk uploads** per file (vs 1x sequential)
- **Batched metadata saves** every 5 seconds (vs per-chunk)
- **File descriptor reuse** during upload (vs open/close per chunk)

### Deduplication

- SHA-256 hash calculation on upload
- Instant "upload" for duplicate files
- Reference counting for shared chunks
- Automatic cleanup when last reference deleted

### Memory Management

- User cache cleared after 5 minutes idle
- Periodic cleanup every 1 minute
- Metadata saves batched to reduce Discord API calls

## API Endpoints

### Authentication

- `POST /api/register` - Create new account
- `POST /api/login` - Login and get JWT token

### File Operations

- `GET /api/sync` - Get all files and folders
- `POST /api/upload` - Upload file (multipart/form-data)
- `DELETE /api/item` - Delete file or folder
- `POST /api/move-item` - Move file or folder
- `GET /download/:id` - Download file (requires auth)

### Queue Management

- `GET /api/queue` - Get upload queue status
- `POST /api/queue/control` - Pause/cancel uploads

### Utilities

- `POST /api/create-folder` - Create new folder
- `POST /api/nuke` - Wipe all storage (requires password)
- `GET /health` - Health check endpoint

## Usage

### First Time Setup

1. Navigate to `http://localhost:5050`
2. Click "Need an account? Register"
3. Create username (3-20 chars, alphanumeric + underscore)
4. Create password (8+ chars, must include uppercase, lowercase, number)
5. Click "Register"
6. Login with your credentials

### Uploading Files

- **Single files**: Click "Upload..." → "Files"
- **Multiple files**: Select multiple files in file picker
- **Folders**: Click "Upload..." → "Folder"

### Deduplication

When uploading a file that already exists:
- File is instantly "uploaded" (no data transfer)
- Shows green "DEDUP" badge in file list
- Saves bandwidth and storage space

### Keyboard Shortcuts

- `Ctrl+A` - Select all files in current folder
- `Delete` - Delete selected files

## Monitoring

### Logs

```bash
# View all logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log
```

### Health Check

```bash
curl http://localhost:5050/health
```

Returns:
```json
{
  "status": "ok",
  "uptime": 12345,
  "memory": { ... },
  "activeUsers": 3
}
```

## Troubleshooting

### "Missing required environment variables"

Ensure all required variables are set in `.env`:
- DISCORD_BOT_TOKEN
- GUILD_ID
- AUTH_CHANNEL_ID
- JWT_SECRET

### "Insufficient disk space"

Server requires at least 5GB free disk space. Clear temp files:

```bash
rm -rf ~/lunarift-files/temp/*
```

### "Token expired"

JWT tokens expire after 7 days. Simply login again to get a new token.

### "Too many requests"

Rate limit hit. Wait 15 minutes or adjust `express-rate-limit` settings in `server.js`.

## Development

### Running in Development Mode

```bash
NODE_ENV=development npm start
```

This enables:
- Console logging (in addition to file logs)
- Detailed error messages
- Auto-reload on file changes (if using nodemon)

### Adding New Dependencies

```bash
npm install <package-name>
```

## License

ISC

## Credits

Built with:
- Express.js
- Discord.js
- JWT
- Bcrypt
- Winston
- Helmet
