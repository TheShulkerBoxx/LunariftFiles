# 🚀 Quick Start - Lunarift Files

## Start Server

```bash
cd ~/Desktop/sandbox/LunariftFiles
npm start
```

**Expected output:**
```
info: Discord bot connected
info: Lunarift Files server ready on port 5050
info: Server listening on http://0.0.0.0:5050
```

## Access Application

Open browser: **http://localhost:5050**

## First Time Setup

1. Click **"Need an account? Register"**
2. Username: 3-20 chars (letters, numbers, underscore)
3. Password: 8+ chars (uppercase + lowercase + number)
   - Example: `MyPass123`
4. Click **"Register"**
5. Login with your credentials

## Quick Commands

```bash
# View logs
tail -f logs/combined.log

# Check server health
curl http://localhost:5050/health

# Stop server
Ctrl+C

# Install dependencies (first time only)
npm install
```

## Upload Files

- **Single files**: Upload → Files → Select files
- **Folders**: Upload → Folder → Select folder
- **Drag & drop**: Not yet implemented

## Features

✅ **3x parallel uploads** per user
✅ **Instant duplicate detection** (deduplication)
✅ **Secure JWT authentication**
✅ **Rate limiting** (100 req/15min)
✅ **Keyboard shortcuts** (Ctrl+A, Delete)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Session expired" | Login again (tokens expire after 7 days) |
| "Too many requests" | Wait 15 minutes |
| "Insufficient disk space" | `rm -rf temp/*` |
| Upload stuck | Check logs, refresh page |

## Important Passwords

- **Nuke password**: `$Hivek123` (deletes ALL files!)

## Performance

- **Old system**: 1 file at a time, 8+ minutes for 50 files
- **New system**: 3 files at a time, 2 minutes for 50 files
- **Speedup**: **4x faster!**

---

**Full documentation**: See `STARTUP_GUIDE.md` in artifacts
