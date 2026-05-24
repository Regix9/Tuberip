/* ─────────────────────────────────────────────
   TubeRip — shared utilities
   All pages include this file.
───────────────────────────────────────────── */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : ''; // same-origin when deployed behind a reverse proxy

/* ── Storage helpers ── */
const Store = {
  set: (k, v) => sessionStorage.setItem('tuberip_' + k, JSON.stringify(v)),
  get: (k)    => { try { return JSON.parse(sessionStorage.getItem('tuberip_' + k)); } catch { return null; } },
  clear: ()   => { ['info','options','job'].forEach(k => sessionStorage.removeItem('tuberip_' + k)); }
};

/* ── Error toast ── */
function showError(msg) {
  let t = document.getElementById('error-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'error-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}

/* ── Nav + Footer inject ── */
function injectNav(activePage) {
  const pages = [
    { label: 'Downloader',  href: 'index.html' },
    { label: 'How It Works', href: '#how' },
    { label: 'Our Legacy',  href: '#about' },
  ];
  const nav = document.querySelector('nav');
  if (!nav) return;
  nav.innerHTML = `
    <div class="nav-inner">
      <a href="index.html" class="logo">
        <div class="logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C5A059" stroke-width="2">
            <path d="M2 4l3 12h14l3-12-6 6-4-8-4 8-6-6z"/>
          </svg>
        </div>
        <span class="logo-text">Tube<span>Rip</span></span>
      </a>
      <ul class="nav-links">
        ${pages.map(p => `<li><a href="${p.href}"${p.label===activePage?' style="color:var(--gold)"':''}>${p.label}</a></li>`).join('')}
      </ul>
      <a href="index.html" class="outline-btn" style="padding:.5rem 1.25rem;font-size:.6rem;">New Download</a>
    </div>`;
}

function injectFooter() {
  const f = document.querySelector('footer');
  if (!f) return;
  f.innerHTML = `
    <div class="footer-inner">
      <div style="max-width:260px">
        <a href="index.html" class="logo" style="margin-bottom:1rem;display:flex">
          <div class="logo-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C5A059" stroke-width="2"><path d="M2 4l3 12h14l3-12-6 6-4-8-4 8-6-6z"/></svg></div>
          <span class="logo-text" style="font-size:1.1rem">Tube<span>Rip</span></span>
        </a>
        <p style="color:#475569;font-size:.65rem;line-height:2;letter-spacing:.12em;text-transform:uppercase;margin-top:.75rem">
          The definitive standard in digital content curation.
        </p>
      </div>
      <div style="display:flex;gap:4rem;flex-wrap:wrap">
        <div>
          <p style="font-size:.6rem;font-weight:700;letter-spacing:.3em;color:var(--gold);text-transform:uppercase;margin-bottom:1rem">The Suite</p>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:.75rem">
            <li><a href="index.html" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;transition:color .3s" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#475569'">Master Downloader</a></li>
            <li><a href="#" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none">Batch Processing</a></li>
            <li><a href="#" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none">Audio Extract</a></li>
          </ul>
        </div>
        <div>
          <p style="font-size:.6rem;font-weight:700;letter-spacing:.3em;color:var(--gold);text-transform:uppercase;margin-bottom:1rem">Company</p>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:.75rem">
            <li><a href="#" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none">Privacy Policy</a></li>
            <li><a href="#" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none">Terms of Use</a></li>
            <li><a href="#" style="color:#475569;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none">Contact</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} TubeRip. All Rights Reserved.</p>
      <div class="footer-cities">
        <span>Mumbai</span><span>New York</span><span>London</span>
      </div>
    </div>`;
}

/* ── YouTube URL validation ── */
function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ── Toggle helper ── */
function setupToggle(el, onChange) {
  if (!el) return;
  el.addEventListener('click', () => {
    el.classList.toggle('on');
    onChange && onChange(el.classList.contains('on'));
  });
}

/* ── Quality pill group ── */
function setupPillGroup(container, onChange) {
  if (!container) return;
  container.querySelectorAll('.quality-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.quality-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      onChange && onChange(pill.dataset.value);
    });
  });
}
