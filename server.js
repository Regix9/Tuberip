/**
 * TubeRip — Node.js + yt-dlp backend
 * 
 * Routes:
 *   GET  /api/info?url=...          → fetch video metadata
 *   POST /api/download/start        → queue a download job
 *   GET  /api/download/status/:id   → poll progress
 *   GET  /api/download/file/:id     → stream finished file
 *   DELETE /api/download/cancel/:id → kill a job
 */

const express    = require('express');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve frontend static files (when running locally side by side)
app.use(express.static(path.join(__dirname, '..')));

// Rate limit: 30 requests / 15 min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests — please wait a few minutes.' }
}));

// ── Storage dirs ────────────────────────────────────────────────────────────
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ── In-memory job store ─────────────────────────────────────────────────────
// { jobId: { status, percent, phase, speed, eta, downloaded, log, filePath, error, proc } }
const jobs = {};

// Auto-cleanup finished jobs after 24 h
function scheduleCleanup(jobId) {
  setTimeout(() => {
    const job = jobs[jobId];
    if (job) {
      if (job.filePath && fs.existsSync(job.filePath)) {
        fs.unlinkSync(job.filePath);
      }
      delete jobs[jobId];
    }
  }, 24 * 60 * 60 * 1000);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function generateJobId() {
  return crypto.randomBytes(8).toString('hex');
}

function buildYtdlpArgs(options, outputPath) {
  const { url, format, quality, trimStart, trimEnd, embedSubs, embedThumb } = options;
  const args = [];

  if (format === 'audio') {
    // Audio-only
    const abr = quality ? parseInt(quality) : 192;
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', String(abr) + 'k');
  } else {
    // Video: pick best format up to selected height
    const heightMap = { '4K': 2160, '1440p': 1440, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };
    const h = heightMap[quality] || 1080;
    args.push('-f', `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`);
    args.push('--merge-output-format', 'mp4');
  }

  // Trim
  if (trimStart || trimEnd) {
    const ss = trimStart || '00:00:00';
    const to = trimEnd   || '';
    args.push('--download-sections', to ? `*${ss}-${to}` : `*${ss}-inf`);
    args.push('--force-keyframes-at-cuts');
  }

  // Metadata options
  if (embedThumb) args.push('--embed-thumbnail');
  if (embedSubs)  args.push('--embed-subs', '--write-auto-subs', '--sub-lang', 'en');

  args.push('--add-metadata');
  args.push('--no-playlist');
  args.push('--newline');          // one progress line per line
  args.push('-o', outputPath);
  args.push(url);

  return args;
}

// Parse yt-dlp progress output
// Example: [download]  68.3% of  842.50MiB at   4.20MiB/s ETA 00:42
function parseProgress(line) {
  const m = line.match(/\[download\]\s+([\d.]+)%.*?at\s+([\d.]+\S+).*?ETA\s+(\S+)/);
  if (m) {
    return { percent: parseFloat(m[1]), speed: m[2] + '/s', eta: m[3] };
  }
  // Size downloaded
  const m2 = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\S+)/);
  if (m2) {
    return { percent: parseFloat(m2[1]), downloaded: m2[2] };
  }
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/info?url=...
 * Returns yt-dlp JSON metadata for the video.
 */
app.get('/api/info', async (req, res) => {
  const url = req.query.url;
  if (!url || !isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid or missing YouTube URL.' });
  }

  const args = ['--dump-json', '--no-playlist', url];
  let output = '';
  let errOutput = '';

  const proc = spawn('yt-dlp', args);
  proc.stdout.on('data', d => { output += d.toString(); });
  proc.stderr.on('data', d => { errOutput += d.toString(); });

  proc.on('close', code => {
    if (code !== 0) {
      console.error('yt-dlp info error:', errOutput);
      return res.status(500).json({
        error: 'Could not fetch video info. The video may be private, age-restricted, or unavailable.',
        detail: errOutput.slice(0, 300)
      });
    }
    try {
      const data = JSON.parse(output);
      // Return only what the frontend needs
      res.json({
        title:        data.title,
        uploader:     data.uploader || data.channel,
        thumbnail:    data.thumbnail,
        duration:     data.duration,
        view_count:   data.view_count,
        upload_date:  data.upload_date,
        height:       data.height,
        width:        data.width,
        formats:      (data.formats || []).map(f => ({ format_id: f.format_id, ext: f.ext, height: f.height })),
        videoId:      data.id,
      });
    } catch {
      res.status(500).json({ error: 'Failed to parse video metadata.' });
    }
  });
});

/**
 * POST /api/download/start
 * Body: { url, format, quality, trimStart, trimEnd, embedSubs, embedThumb, title }
 * Returns: { jobId }
 */
app.post('/api/download/start', (req, res) => {
  const options = req.body;

  if (!options.url || !isValidYouTubeUrl(options.url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL.' });
  }

  const jobId     = generateJobId();
  const ext       = options.format === 'audio' ? 'mp3' : 'mp4';
  const safeTitle = (options.title || jobId).replace(/[^\w\-]/g, '_').slice(0, 80);
  const fileName  = `${safeTitle}_${jobId}.${ext}`;
  const outputPath = path.join(DOWNLOADS_DIR, fileName);

  jobs[jobId] = {
    status:     'running',
    percent:    0,
    phase:      'Initialising',
    speed:      null,
    eta:        null,
    downloaded: null,
    log:        null,
    filePath:   outputPath,
    error:      null,
    proc:       null,
  };

  const args = buildYtdlpArgs(options, outputPath);
  console.log(`[${jobId}] Starting: yt-dlp`, args.join(' '));

  const proc = spawn('yt-dlp', args);
  jobs[jobId].proc = proc;

  proc.stdout.on('data', data => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      const prog = parseProgress(line);
      if (prog) {
        if (prog.percent  !== undefined) jobs[jobId].percent    = prog.percent;
        if (prog.speed)                  jobs[jobId].speed      = prog.speed;
        if (prog.eta)                    jobs[jobId].eta        = prog.eta;
        if (prog.downloaded)             jobs[jobId].downloaded = prog.downloaded;
      }
      // Extract phase from yt-dlp output
      if (line.includes('[youtube]'))   jobs[jobId].phase = 'Fetching metadata';
      if (line.includes('[info]'))      jobs[jobId].phase = 'Analysing streams';
      if (line.includes('[download]'))  jobs[jobId].phase = 'Downloading';
      if (line.includes('[ffmpeg]'))    jobs[jobId].phase = 'Merging streams';
      if (line.includes('[ExtractAudio]')) jobs[jobId].phase = 'Extracting audio';
      if (line.includes('[EmbedThumbnail]')) jobs[jobId].phase = 'Embedding thumbnail';
      if (line.includes('[Metadata]'))  jobs[jobId].phase = 'Writing metadata';

      jobs[jobId].log = line.slice(0, 200);
      console.log(`[${jobId}]`, line);
    });
  });

  proc.stderr.on('data', data => {
    const line = data.toString().trim();
    if (line) {
      jobs[jobId].log = line.slice(0, 200);
      console.error(`[${jobId}] stderr:`, line);
    }
  });

  proc.on('close', code => {
    if (code === 0) {
      jobs[jobId].status  = 'done';
      jobs[jobId].percent = 100;
      jobs[jobId].phase   = 'Complete';
      // Generate SHA-256 of file
      try {
        const buf  = fs.readFileSync(outputPath);
        jobs[jobId].sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      } catch {}
      scheduleCleanup(jobId);
      console.log(`[${jobId}] Done!`);
    } else {
      jobs[jobId].status = 'error';
      jobs[jobId].error  = `yt-dlp exited with code ${code}`;
      console.error(`[${jobId}] Failed with code`, code);
    }
  });

  res.json({ jobId, status: 'running' });
});

/**
 * GET /api/download/status/:jobId
 */
app.get('/api/download/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json({
    status:      job.status,
    percent:     job.percent,
    phase:       job.phase,
    speed:       job.speed,
    eta:         job.eta,
    downloaded:  job.downloaded,
    log:         job.log,
    error:       job.error,
    sha256:      job.sha256,
    downloadUrl: job.status === 'done' ? `/api/download/file/${req.params.jobId}` : null,
  });
});

/**
 * GET /api/download/file/:jobId
 * Streams the finished file to the client.
 */
app.get('/api/download/file/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job)                    return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'done')   return res.status(409).json({ error: 'Download not ready yet.' });
  if (!fs.existsSync(job.filePath)) return res.status(410).json({ error: 'File has expired.' });

  const stat     = fs.statSync(job.filePath);
  const ext      = path.extname(job.filePath).slice(1);
  const mimeMap  = { mp4: 'video/mp4', mp3: 'audio/mpeg', webm: 'video/webm', m4a: 'audio/mp4' };
  const mime     = mimeMap[ext] || 'application/octet-stream';
  const filename = path.basename(job.filePath);

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  fs.createReadStream(job.filePath).pipe(res);
});

/**
 * DELETE /api/download/cancel/:jobId
 */
app.delete('/api/download/cancel/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found.' });

  if (job.proc) {
    try { job.proc.kill('SIGTERM'); } catch {}
  }
  if (job.filePath && fs.existsSync(job.filePath)) {
    try { fs.unlinkSync(job.filePath); } catch {}
  }
  delete jobs[req.params.jobId];
  res.json({ cancelled: true });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, jobs: Object.keys(jobs).length }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 TubeRip server running on http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser\n`);
});
