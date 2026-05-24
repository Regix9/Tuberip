# 🎬 TubeRip

Premium YouTube video & audio downloader — multi-page frontend (GitHub Pages) + Node.js/yt-dlp backend.

---

## 📁 Project Structure

```
tuberip/
├── index.html          ← Landing page & URL input
├── preview.html        ← Video preview & download options
├── processing.html     ← Real-time download progress
├── done.html           ← Download complete & file save
├── assets/
│   ├── style.css       ← Shared design system
│   └── app.js          ← Shared utilities & helpers
└── server/
    ├── server.js       ← Node.js Express API
    ├── package.json
    └── downloads/      ← Temp files (auto-created, auto-cleaned)
```

---

## 🚀 Setup & Run

### 1. Install Prerequisites

```bash
# Node.js (v16+)
node --version

# yt-dlp (Python-based)
pip install yt-dlp
# or
brew install yt-dlp        # macOS
sudo apt install yt-dlp    # Ubuntu/Debian

# ffmpeg (required for merging video+audio)
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Ubuntu/Debian
```

### 2. Install Node Dependencies

```bash
cd server
npm install
```

### 3. Start the Backend

```bash
cd server
npm start
# Server starts at http://localhost:3001
```

### 4. Open Frontend

Either open `index.html` directly in a browser, **or** the server already serves it:

```
http://localhost:3001
```

---

## 🌐 GitHub Pages Deployment

GitHub Pages hosts **only static files** (no Node.js). You have two options:

### Option A — Frontend on GitHub Pages + Backend on a VPS/Cloud

1. Push all files to GitHub.
2. Enable GitHub Pages (Settings → Pages → Branch: `main`, Root: `/`).
3. Deploy `server/` to a cloud host (Railway, Render, Fly.io, DigitalOcean).
4. Edit `assets/app.js` line 4 — replace the empty string with your server URL:

```js
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://YOUR-SERVER-URL.com';   // ← put your deployed backend here
```

### Option B — Run Everything Locally

Just run `npm start` in `server/` and open `http://localhost:3001`.

---

## ☁️ Deploying Backend (Free Options)

| Platform | Free Tier | Notes |
|----------|-----------|-------|
| **Railway** | 500 hrs/month | Easiest, auto-detects Node |
| **Render** | 750 hrs/month | Sleeps after inactivity |
| **Fly.io** | 3 shared VMs | Needs `fly.toml` |

For Railway/Render:
1. Point to `server/` as root directory.
2. Start command: `node server.js`
3. yt-dlp & ffmpeg must be available — add a `Dockerfile` (see below).

### Dockerfile (for cloud deployments that need yt-dlp + ffmpeg)

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg \
    && pip3 install yt-dlp --break-system-packages \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

---

## ⚙️ API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/info?url=...` | Fetch video metadata |
| `POST` | `/api/download/start` | Start a download job |
| `GET` | `/api/download/status/:id` | Poll progress |
| `GET` | `/api/download/file/:id` | Stream finished file |
| `DELETE` | `/api/download/cancel/:id` | Cancel & cleanup |
| `GET` | `/api/health` | Health check |

---

## 📝 Notes

- Downloaded files are **auto-deleted after 24 hours**.
- Rate limited to **30 requests per 15 minutes per IP**.
- yt-dlp is updated frequently — run `pip install -U yt-dlp` periodically.
- This tool is for **personal/educational use only**. Respect YouTube's Terms of Service.
