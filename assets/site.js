// emiliogcs.com — the only script. Everything works without it; this adds
// a fresh line on every visit, figures that draw themselves once, BibTeX
// copying, the theme switch, and the birds in flight.

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
function measure(svg) {
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width || 1;
  for (const p of svg.querySelectorAll('path:not(.base):not(.null)')) {
    p.style.setProperty('--len', Math.ceil(p.getTotalLength() * scale) + 2 + 'px');
  }
}

function arm(fig) {
  const svg = fig.querySelector('svg');
  measure(svg);

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
  measure(fig.querySelector('svg')); // in case the layout changed since arming
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

// ------------------------------------------------------------------ birds
// Birds (home page). Two birds traced from a line drawing sit in the
// intro as drawn; both are diving, the upper one down-left and the middle one
// down-right (data-heading, degrees on screen: 0 right, 90 down). With motion
// allowed they take off into a layer over the window (.flight), joined by
// three more made from the middle bird (mirrored and tilted for other
// headings), and fly as the page scrolls: always forward along their heading,
// whichever way the reader scrolls, drifting only a few degrees as they go.
// A bird that leaves the window comes back in from the edge it was heading
// away from. Depth sets size, speed and lightness: near birds are larger,
// darker and faster; some draw nearer or farther as they cross.
// Wings beat in real time at each bird's own pace: steadily while the page
// moves, flap-flap-glide when it rests. A beat bends the drawing about the
// body (data-flap: where the wings meet the body, x and y; half-span; lift;
// side): the tips move most and trail the base; head, feet and tail hold
// still; the body rises a touch on the downstroke.

const flock = document.querySelector('.flock');
if (flock && !still) {
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const RAD = Math.PI / 180;
  const EASE = 0.06; // how quickly the birds catch up with the scroll (per frame)
  const PACE = 0.5; // px flown per px scrolled, at depth 1
  const DRIFT = 5; // px a second at rest, once the birds have taken off

  // The flock. heading: degrees on screen; mirror: flip the drawing (a
  // copy of the middle bird mirrored flies down-left); depth: size and
  // speed; grow: how much nearer (+) or farther (-) it draws while crossing;
  // wait: px of flight before it first enters the window; beat: wing beats a
  // second, and the length of its flap-glide cycle at rest.
  const BIRDS = [
    { bird: 'upper', heading: 140, depth: 0.95, grow: -0.15, beat: [1.8, 5.2] },
    { bird: 'middle', heading: 62, depth: 1, grow: 0.3, beat: [1.9, 4.6] },
    { bird: 'middle', heading: 124, mirror: true, depth: 0.55, grow: 0, wait: 260, beat: [2.1, 6.1] },
    { bird: 'middle', heading: 34, depth: 0.75, grow: -0.25, wait: 700, beat: [1.8, 5.6] },
    { bird: 'middle', heading: 150, mirror: true, depth: 1.15, grow: 0.15, wait: 1300, beat: [2.0, 4.9] },
  ];

  const parse = (d) =>
    d.split('M').filter((seg) => seg.trim()).map((seg) => {
      const n = seg.replace(/L/g, ' ').trim().split(/\s+/).map(Number);
      const pts = [];
      for (let j = 0; j < n.length; j += 2) pts.push([n[j], n[j + 1]]);
      return pts;
    });
  const outline = (strokes) =>
    strokes.map((pts) => 'M' + pts.map(([x, y], j) => (j === 1 ? 'L' : '') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')).join(' ');
  // theta: where the bird is in its beat; amp: how fully it is beating (0 = glide)
  const bend = (pts, [cx, cy, span, lift, side], theta, amp) =>
    pts.map(([x, y]) => {
      const dx = side ? Math.max(0, x - cx) : Math.abs(x - cx);
      const reach = Math.min(1, dx / span); // 0 at the body, 1 at the tip
      const below = Math.max(0, 1 - Math.max(0, y - cy) / (0.25 * span)); // head, feet, tail: still
      const w = reach ** 1.6 * below;
      const beat = Math.sin(theta - 0.9 * reach) * amp; // the tip trails the base
      return [cx + (x - cx) * (1 - 0.05 * Math.abs(beat) * w), y - lift * span * beat * w];
    });

  // The birds as drawn: shapes, wing-beat settings, heading, and place.
  const tpl = {};
  for (const b of flock.querySelectorAll('.bird')) {
    const box = b.getBBox();
    const m = b.parentNode.transform.baseVal.consolidate()?.matrix;
    tpl[b.dataset.bird] = {
      strokes: parse(b.querySelector('.wing').getAttribute('d')),
      flap: b.dataset.flap.split(' ').map(Number),
      heading: Number(b.dataset.heading),
      cx: box.x + box.width / 2,
      cy: box.y + box.height / 2,
      w: box.width,
      h: box.height,
      fx: (m ? m.e : 0) + box.x + box.width / 2, // centre within the drawing
      fy: (m ? m.f : 0) + box.y + box.height / 2,
    };
  }

  // A seeded random source, so the birds come back the same way each visit.
  const rand = mulberry32(20261015);

  const sky = document.createElementNS(NS, 'svg');
  sky.setAttribute('class', 'flight');
  sky.setAttribute('aria-hidden', 'true');
  sky.setAttribute('focusable', 'false');
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
    sky.setAttribute(k, v);
  }
  const birds = BIRDS.map((spec, i) => {
    const t = tpl[spec.bird];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'bird');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', outline(t.strokes));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    g.append(p);
    sky.append(g);
    const drawn = spec.mirror ? 180 - t.heading : t.heading; // heading of the drawing as placed
    return { ...spec, t, g, p, drawn, x: 0, y: 0, flown: 0, crossing: 0, theta: i * 1.9, amp: 0, wobble: rand() * TAU };
  });
  document.body.append(sky);
  flock.classList.add('aloft');

  let u = 1; // drawing units -> window px
  const size = (b) => u * b.depth * (1 + b.grow * Math.tanh(b.crossing / 900));
  const radius = (b) => (Math.max(b.t.w, b.t.h) * size(b)) / 2 + 12;

  // Send a bird in from the edge it is heading away from, on a line that
  // crosses the middle of the window, `extra` px further back.
  const enter = (b, extra = 0) => {
    b.crossing = 0;
    const a = b.heading * RAD;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = innerWidth * (0.2 + 0.6 * rand());
    const ty = innerHeight * (0.25 + 0.5 * rand());
    // walk back from the target until clear of the window
    const r = radius(b);
    const back = Math.min(
      dx > 0 ? (tx + r) / dx : dx < 0 ? (innerWidth - tx + r) / -dx : Infinity,
      dy > 0 ? (ty + r) / dy : dy < 0 ? (innerHeight - ty + r) / -dy : Infinity,
    );
    b.x = tx - dx * (back + extra);
    b.y = ty - dy * (back + extra);
  };
  const gone = (b) => {
    const r = radius(b);
    const a = b.heading * RAD;
    return (Math.cos(a) > 0 && b.x - r > innerWidth) || (Math.cos(a) < 0 && b.x + r < 0) || (Math.sin(a) > 0 && b.y - r > innerHeight) || (Math.sin(a) < 0 && b.y + r < 0);
  };

  const place = () => {
    const rect = flock.getBoundingClientRect();
    u = rect.height / flock.viewBox.baseVal.height;
    for (const b of birds) {
      if (b.wait === undefined) {
        // the two drawn birds start where they sit in the intro (at the top of the page)
        b.x = rect.left + b.t.fx * u;
        b.y = rect.top + scrollY + b.t.fy * u;
      } else {
        enter(b, b.wait);
      }
    }
  };

  let drawn = false;
  let airborne = false;
  let activity = 0; // how much the page is moving, 0 to 1
  const render = (dt, moved) => {
    const speed = dt ? Math.abs(moved) / dt : 0; // px a second
    activity += (Math.min(1, speed / 250) - activity) * 0.06;
    if (Math.abs(moved) > 0.5) airborne = true;
    const now = performance.now() / 1000;
    for (const b of birds) {
      // fly forward, whichever way the page moves; a slow wander of a few degrees
      const step = (Math.abs(moved) * PACE + (airborne ? DRIFT * dt : 0)) * b.depth;
      b.flown += step;
      b.crossing += step;
      const course = b.heading + 6 * Math.sin(b.flown / 650 + b.wobble);
      b.x += step * Math.cos(course * RAD);
      b.y += step * Math.sin(course * RAD);
      if (gone(b)) enter(b);

      // wings: steady while the page moves; at rest, flap-flap-glide
      const [rate, cycle] = b.beat;
      const rest = Math.max(0, Math.min(1, 1.8 * Math.sin((TAU * now) / cycle + b.wobble) - 0.5));
      b.amp += (Math.max(activity, 0.75 * rest) - b.amp) * 0.08;
      b.theta += TAU * rate * dt * (0.55 + 0.45 * b.amp);
      const s = size(b);
      const rise = drawn ? b.amp * Math.cos(b.theta) * 0.012 * b.t.h * s : 0; // body rises on the downstroke

      // turn the drawing to face its course
      const turn = course - b.drawn;
      b.g.setAttribute(
        'transform',
        `translate(${b.x.toFixed(1)} ${(b.y - rise).toFixed(1)}) rotate(${turn.toFixed(2)}) scale(${(s * (b.mirror ? -1 : 1)).toFixed(4)} ${s.toFixed(4)}) translate(${(-b.t.cx).toFixed(1)} ${(-b.t.cy).toFixed(1)})`,
      );
      const depth = s / u;
      b.g.style.opacity = depth < 1 ? (0.35 + 0.65 * depth).toFixed(3) : '';
      if (drawn) b.p.setAttribute('d', outline(b.t.strokes.map((pts) => bend(pts, b.t.flap, b.theta, b.amp))));
    }
  };

  // Draw the two birds in where they sit, then let them fly.
  place();
  render(0, 0);
  const STAGGER = 0.18;
  birds.forEach((b, i) => {
    b.p.style.setProperty('--len', Math.ceil(b.p.getTotalLength() * size(b)) + 2 + 'px');
    b.p.style.setProperty('--delay', (i * STAGGER).toFixed(2) + 's');
  });
  sky.classList.add('armed');
  sky.getBoundingClientRect();
  sky.classList.add('draw');
  setTimeout(() => {
    sky.classList.remove('armed', 'draw');
    for (const b of birds) b.p.removeAttribute('style');
    drawn = true;
  }, (1.6 + 2 * STAGGER + 0.2) * 1000);

  // One loop while the page is open (the browser pauses it in hidden tabs).
  let current = scrollY;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const before = current;
    current += (Math.max(0, scrollY) - current) * EASE;
    if (Math.abs(scrollY - current) < 0.3) current = Math.max(0, scrollY);
    render(dt, current - before);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  addEventListener('resize', () => {
    const rect = flock.getBoundingClientRect();
    u = rect.height / flock.viewBox.baseVal.height;
  });
}
if (flock) flock.classList.add('ready');
