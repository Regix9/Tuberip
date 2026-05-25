const express   = require('express');
const { spawn } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const cors      = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const jobs = {};

function isValidYouTubeUrl(url) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function scheduleCleanup(jobId) {
    setTimeout(() => {
        const job = jobs[jobId];
        if (job?.filePath && fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
        delete jobs[jobId];
    }, 24 * 60 * 60 * 1000);
}

// GET /api/info
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    if (!url || !isValidYouTubeUrl(url))
        return res.status(400).json({ error: 'Invalid YouTube URL.' });

    let out = '', err = '';
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url]);
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d);
    proc.on('close', code => {
        if (code !== 0)
            return res.status(500).json({ error: 'Could not fetch video info. The video may be private or unavailable.', detail: err.slice(0,300) });
        try {
            const d = JSON.parse(out);
            res.json({ title:d.title, uploader:d.uploader||d.channel, thumbnail:d.thumbnail, duration:d.duration, view_count:d.view_count, upload_date:d.upload_date, height:d.height, width:d.width, id:d.id, videoId:d.id });
        } catch { res.status(500).json({ error: 'Failed to parse video metadata.' }); }
    });
});

// POST /api/download/start
app.post('/api/download/start', (req, res) => {
    const { url, format, quality, trimStart, trimEnd, title } = req.body;
    if (!url || !isValidYouTubeUrl(url))
        return res.status(400).json({ error: 'Invalid YouTube URL.' });

    const jobId = crypto.randomBytes(8).toString('hex');
    const ext   = format === 'audio' ? 'mp3' : 'mp4';
    const safe  = (title||jobId).replace(/[^\w\-\s]/g,'_').slice(0,80);
    const file  = path.join(DOWNLOADS_DIR, `${safe}_${jobId}.${ext}`);

    jobs[jobId] = { status:'running', percent:0, phase:'Initialising', speed:null, eta:null, downloaded:null, log:null, filePath:file, error:null, proc:null };

    const args = [];
    if (format === 'audio') {
        const abr = parseInt(quality)||192;
        args.push('-x','--audio-format','mp3','--audio-quality', abr+'k');
    } else {
        const hMap = {'4K':2160,'1440p':1440,'1080p':1080,'720p':720,'480p':480,'360p':360};
        const h = hMap[quality]||1080;
        args.push('-f',`bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,'--merge-output-format','mp4');
    }
    if (trimStart||trimEnd) {
        const ss = trimStart||'00:00:00', to = trimEnd||'';
        args.push('--download-sections', to?`*${ss}-${to}`:`*${ss}-inf`,'--force-keyframes-at-cuts');
    }
    args.push('--add-metadata','--no-playlist','--newline','-o',file,url);

    const proc = spawn('yt-dlp', args);
    jobs[jobId].proc = proc;

    proc.stdout.on('data', data => {
        data.toString().split('\n').filter(Boolean).forEach(line => {
            const m = line.match(/\[download\]\s+([\d.]+)%.*?at\s+([\S]+).*?ETA\s+(\S+)/);
            if (m) { jobs[jobId].percent=parseFloat(m[1]); jobs[jobId].speed=m[2]+'/s'; jobs[jobId].eta=m[3]; }
            const m2 = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([\S]+)/);
            if (m2) { jobs[jobId].percent=parseFloat(m2[1]); jobs[jobId].downloaded=m2[2]; }
            if (line.includes('[youtube]'))       jobs[jobId].phase='Fetching metadata';
            if (line.includes('[download]'))      jobs[jobId].phase='Downloading';
            if (line.includes('[ffmpeg]'))        jobs[jobId].phase='Merging streams';
            if (line.includes('[ExtractAudio]'))  jobs[jobId].phase='Extracting audio';
            if (line.includes('[EmbedThumbnail]'))jobs[jobId].phase='Embedding thumbnail';
            if (line.includes('[Metadata]'))      jobs[jobId].phase='Writing metadata';
            jobs[jobId].log = line.slice(0,200);
        });
    });
    proc.stderr.on('data', d => { jobs[jobId].log = d.toString().trim().slice(0,200); });
    proc.on('close', code => {
        if (code === 0) {
            jobs[jobId].status = 'done'; jobs[jobId].percent = 100; jobs[jobId].phase = 'Complete';
            try { const buf = fs.readFileSync(file); jobs[jobId].sha256 = crypto.createHash('sha256').update(buf).digest('hex'); } catch {}
            scheduleCleanup(jobId);
        } else {
            jobs[jobId].status = 'error'; jobs[jobId].error = `yt-dlp exited with code ${code}`;
        }
    });

    res.json({ jobId, status:'running' });
});

// GET /api/download/status/:id
app.get('/api/download/status/:id', (req, res) => {
    const job = jobs[req.params.id];
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ status:job.status, percent:job.percent, phase:job.phase, speed:job.speed, eta:job.eta, downloaded:job.downloaded, log:job.log, error:job.error, sha256:job.sha256, downloadUrl: job.status==='done'?`/api/download/file/${req.params.id}`:null });
});

// GET /api/download/file/:id
app.get('/api/download/file/:id', (req, res) => {
    const job = jobs[req.params.id];
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.status !== 'done') return res.status(409).json({ error: 'Not ready yet.' });
    if (!fs.existsSync(job.filePath)) return res.status(410).json({ error: 'File expired.' });
    const stat = fs.statSync(job.filePath);
    const ext  = path.extname(job.filePath).slice(1);
    const mime = { mp4:'video/mp4', mp3:'audio/mpeg', webm:'video/webm' }[ext]||'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(job.filePath)}"`);
    fs.createReadStream(job.filePath).pipe(res);
});

// DELETE /api/download/cancel/:id
app.delete('/api/download/cancel/:id', (req, res) => {
    const job = jobs[req.params.id];
    if (!job) return res.status(404).json({ error: 'Not found.' });
    try { job.proc?.kill('SIGTERM'); } catch {}
    if (job.filePath && fs.existsSync(job.filePath)) try { fs.unlinkSync(job.filePath); } catch {}
    delete jobs[req.params.id];
    res.json({ cancelled: true });
});

app.get('/api/health', (_, res) => res.json({ ok:true }));

app.listen(PORT, () => console.log(`\n🎬 TubeRip running → http://localhost:${PORT}\n`));
