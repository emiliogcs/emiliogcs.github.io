// emiliogcs.com — the only script. Everything works without it; this adds
// a fresh line on every visit, figures that draw themselves once, BibTeX copying,
// and the theme switch in the footer.

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the line
// Same generator as scripts/plates.mjs (mulberry32 + Box–Muller, AR(1) from
// its stationary distribution). Every page load draws a new seed and a new
// persistence phi in 0.50–0.99, and the caption reports it.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = rand();
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

function linePath(seed, n = 600, phi = 0.98, w = 600, top = 4, bottom = 60) {
  const z = gaussian(mulberry32(seed));
  const x = [z() / Math.sqrt(1 - phi * phi)];
  for (let t = 1; t < n; t++) x.push(phi * x[t - 1] + z());
  const lo = Math.min(...x);
  const hi = Math.max(...x);
  const r1 = (v) => Math.round(v * 10) / 10;
  return (
    'M' +
    x
      .map((v, t) => {
        const px = r1((t * w) / (n - 1));
        const py = r1(bottom - ((v - lo) / (hi - lo)) * (bottom - top));
        return (t === 1 ? 'L' : '') + px + ' ' + py;
      })
      .join(' ')
  );
}

const line = document.querySelector('.line');
const linePathEl = line?.querySelector('path');
if (linePathEl) {
  const phi = (50 + Math.floor(Math.random() * 50)) / 100;
  const seed = Math.floor(Math.random() * 2 ** 32);
  linePathEl.setAttribute('d', linePath(seed, 600, phi));
  line.querySelector('svg').setAttribute(
    'aria-label',
    `One draw of an AR(1) process with φ = ${phi.toFixed(2)}, a single hairline wandering across the page.`,
  );
  const phiEl = document.getElementById('phi');
  if (phiEl) phiEl.textContent = phi.toFixed(2);
  if (!still) {
    line.classList.add('armed');
    line.getBoundingClientRect(); // commit the hidden state so the next change transitions
    line.classList.add('draw');
  }
  line.classList.add('ready');
}

// ----------------------------------------------------------------- plates
// Each figure draws itself the first time it is 35% in view: strokes via
// stroke-dashoffset, points fading in from left to right; all under 1.4s.

const DRAW = 1.3; // seconds

// Strokes are vector-effect: non-scaling-stroke, so browsers measure dashes
// in screen pixels: scale the path's user-space length to its drawn size.
function measure(fig) {
  const svg = fig.querySelector('svg');
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width || 1;
  for (const p of svg.querySelectorAll('path:not(.base):not(.null)')) {
    p.style.setProperty('--len', Math.ceil(p.getTotalLength() * scale) + 2 + 'px');
  }
}

function arm(fig) {
  const svg = fig.querySelector('svg');
  measure(fig);

  // A sequence (the ACF bars) rises one after another inside the window.
  const seq = [...svg.querySelectorAll('.seq path')];
  seq.forEach((p, i) => {
    p.style.setProperty('--dur', '0.35s');
    p.style.setProperty('--delay', (0.35 + (i / seq.length) * 0.6).toFixed(3) + 's');
  });

  // Points fade in staggered, left to right.
  for (const c of svg.querySelectorAll('circle')) {
    const x = (c.cx.baseVal.value - 24) / 352;
    c.style.setProperty('--delay', (Math.max(0, Math.min(1, x)) * 0.85).toFixed(3) + 's');
  }
  svg.querySelector('.null')?.style.setProperty('--delay', '0.2s');

  fig.classList.add('armed');
}

function draw(fig) {
  measure(fig); // in case the layout changed since arming
  fig.getBoundingClientRect();
  fig.classList.add('draw');
  setTimeout(() => {
    fig.classList.remove('armed', 'draw');
    for (const el of fig.querySelectorAll('[style]')) el.removeAttribute('style');
  }, (DRAW + 0.2) * 1000);
}

const figs = [...document.querySelectorAll('.plate-fig')];
if (!still && 'IntersectionObserver' in window) {
  figs.forEach(arm);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        draw(e.target);
      }
    },
    { threshold: 0.35 },
  );
  figs.forEach((f) => io.observe(f));
}
figs.forEach((f) => f.classList.add('ready'));

// ----------------------------------------------------------------- BibTeX
// The no-JS <details> becomes a copy button in the action row. If the
// clipboard is unavailable, the button reveals the entry instead.

const status = document.getElementById('status');

for (const bib of document.querySelectorAll('details.bib')) {
  const plate = bib.closest('.plate');
  const abstract = plate.querySelector('details.abstract');
  const entry = bib.querySelector('pre').textContent;
  const title = plate.querySelector('.plate-title a').firstChild.textContent;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'act';
  button.textContent = 'bibtex';
  button.setAttribute('aria-label', `Copy BibTeX for ${title}`);
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '·';
  abstract.before(button, sep);
  bib.hidden = true;

  let timer;
  const reveal = () => {
    bib.hidden = false;
    bib.open = true;
    const range = document.createRange();
    range.selectNodeContents(bib.querySelector('pre'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  };

  button.addEventListener('click', async () => {
    if (!navigator.clipboard?.writeText) return reveal();
    try {
      await navigator.clipboard.writeText(entry);
    } catch {
      return reveal();
    }
    button.textContent = 'copied';
    status.textContent = '';
    status.textContent = `BibTeX for ${title} copied to the clipboard.`;
    clearTimeout(timer);
    timer = setTimeout(() => {
      button.textContent = 'bibtex';
    }, 1600);
  });
}

// ------------------------------------------------------------------ theme
// auto follows the system; light or dark is remembered in localStorage and
// applied before first paint by the inline script in <head>.

const switcher = document.querySelector('.theme-switch');
if (switcher) {
  const root = document.documentElement;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const paper = { light: '#F5F3EE', dark: '#0F0F0E' };

  const apply = (mode) => {
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
    else delete root.dataset.theme;
    for (const m of metas) {
      const own = (m.getAttribute('media') || '').includes('dark') ? 'dark' : 'light';
      m.setAttribute('content', paper[root.dataset.theme || own]);
    }
    for (const b of switcher.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.value === (root.dataset.theme || 'auto')));
    }
  };

  apply(root.dataset.theme || 'auto');
  switcher.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    apply(b.value);
    try {
      if (b.value === 'auto') localStorage.removeItem('theme');
      else localStorage.setItem('theme', b.value);
    } catch {}
  });
  switcher.hidden = false;
}
