# 🎬 TubeRip

Premium YouTube Downloader — original UI fully preserved + working backend.

## Pages
| File | Description |
|------|-------------|
| `index.html` | Landing page — URL input + format/quality selector |
| `preview.html` | Video preview — thumbnail, specs, proceed button |
| `processing.html` | Real-time download progress (polls backend) |
| `done.html` | Download complete — file download button |
| `history.html` | ✨ Archive of past downloads (localStorage) |
| `404.html` | ✨ Custom not-found page |

## Setup

### 1. Install prerequisites
```bash
pip install yt-dlp          # YouTube extractor
sudo apt install ffmpeg     # Video merging (Ubuntu)
# macOS: brew install yt-dlp ffmpeg
```

### 2. Start backend
```bash
cd server
npm install
npm start
# → http://localhost:3001
```

### 3. Open browser
Go to `http://localhost:3001` — done!

---

## GitHub Pages Deployment

GitHub Pages = static only. Backend must be deployed separately.

### Deploy backend (free options)
- **Railway**: push `server/` folder, set start command `node server.js`
- **Render**: same, add a `Dockerfile` in root
- **Fly.io**: use included `Dockerfile`

### Update backend URL
In ALL 4 main HTML files, find this line:
```js
: 'https://YOUR-BACKEND-URL.com'
```
Replace with your deployed backend URL.

Then push to GitHub → Settings → Pages → main branch → Save.

Your site: `https://USERNAME.github.io/tuberip/`
