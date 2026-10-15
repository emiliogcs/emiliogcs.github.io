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
// Two birds traced from a line drawing (scripts/birds.py) sit in the page
// as drawn; both are diving, the upper one down-left and the middle one
// down-right (data-heading, degrees on screen: 0 right, 90 down). With motion
// allowed they take off into a layer over the window (.flight), with copies
// of the middle bird, in one of two flights:
//
//   home page: they fly as the page scrolls, always forward along their
//   heading whichever way the reader scrolls, drifting a few degrees; a
//   bird that leaves the window comes back in from the edge it was heading
//   away from. Near birds are larger, darker and faster.
//
//   contact page (<body data-birds="orbit">): they wheel round the email
//   address as if it sat in the middle of a ring in the sky, seen a little
//   from above; at the back of the ring a bird is smaller and lighter and
//   passes behind the address, at the front larger and darker and in front.
//   Hovering or focusing the address quickens them; copying it sends them
//   round in a swirl.
//
// Wings beat in real time at each bird's own pace, with flap-flap-glide
// rests. A beat turns each wing about its shoulder (data-flap: where the
// wings meet the body, x and y; half-span; sweep, degrees up and down from
// the drawn pose; side), the inner wing less than the outer and the tip
// trailing a little, so the wing flexes through a smooth, full stroke; head,
// feet and tail hold still.

const flock = document.querySelector('.flock');
if (flock && !still) {
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const RAD = Math.PI / 180;

  const parse = (d) =>
    d.split('M').filter((seg) => seg.trim()).map((seg) => {
      const n = seg.replace(/L/g, ' ').trim().split(/\s+/).map(Number);
      const pts = [];
      for (let j = 0; j < n.length; j += 2) pts.push([n[j], n[j + 1]]);
      return pts;
    });
  const outline = (strokes) =>
    strokes.map((pts) => 'M' + pts.map(([x, y], j) => (j === 1 ? 'L' : '') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ')).join(' ');
  const smoothstep = (e0, e1, v) => {
    const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  // theta: where the bird is in its beat; amp: how fully it is beating (0 = glide)
  const bend = (pts, [cx, cy, span, sweep, side], theta, amp) => {
    const gap = 0.06 * span; // the shoulders sit just either side of the body
    return pts.map(([x, y]) => {
      const dx = x - cx;
      if (side && dx < 0) return [x, y];
      const reach = Math.min(1, Math.max(0, Math.abs(dx) - gap) / (span - gap)); // 0 at the shoulder, 1 at the tip
      if (!reach) return [x, y];
      // head, feet and tail (well below the shoulders, close to the body) hold
      // still; the rest of the wing, its lower feathers included, turns whole
      const body = smoothstep(0, 0.2 * span, y - cy) * (1 - smoothstep(0.4, 0.65, reach));
      const w = reach ** 0.7 * (1 - body);
      const a = -Math.sign(dx) * sweep * RAD * amp * w * Math.sin(theta - 0.8 * reach); // the tip trails the base
      const px = cx + Math.sign(dx) * gap;
      const vx = x - px;
      const vy = y - cy;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return [px + vx * c - vy * s, cy + vx * s + vy * c];
    });
  };

  // The birds as drawn: shapes, wing-beat settings, heading, size and place
  // (all from the drawing's own points, so it may be hidden).
  const tpl = {};
  for (const b of flock.querySelectorAll('.bird')) {
    const strokes = parse(b.querySelector('.wing').getAttribute('d'));
    const xs = strokes.flat().map((p) => p[0]);
    const ys = strokes.flat().map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const m = b.parentNode.transform.baseVal.consolidate()?.matrix;
    tpl[b.dataset.bird] = {
      strokes,
      flap: b.dataset.flap.split(' ').map(Number),
      heading: Number(b.dataset.heading),
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      w: x1 - x0,
      h: y1 - y0,
      fx: (m ? m.e : 0) + (x0 + x1) / 2, // centre within the drawing
      fy: (m ? m.f : 0) + (y0 + y1) / 2,
    };
  }

  const layer = (cls) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
      svg.setAttribute(k, v);
    }
    document.body.append(svg);
    return svg;
  };
  const hatch = (spec, i, into) => {
    const t = tpl[spec.bird];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'bird');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', outline(t.strokes));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    g.append(p);
    into.append(g);
    return { ...spec, t, g, p, theta: i * 1.9, amp: 0, flip: spec.mirror ? -1 : 1, rot: 0 };
  };
  const pose = (b, x, y, rot, s) => {
    b.g.setAttribute(
      'transform',
      `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${(s * b.flip).toFixed(4)} ${s.toFixed(4)}) translate(${(-b.t.cx).toFixed(1)} ${(-b.t.cy).toFixed(1)})`,
    );
  };
  const beat = (b) => b.p.setAttribute('d', outline(b.t.strokes.map((pts) => bend(pts, b.t.flap, b.theta, b.amp))));
  // Trace the birds in, as the page figures draw themselves; then `done`.
  const drawIn = (birds, scaleOf, done) => {
    const STAGGER = 0.18;
    const svgs = new Set(birds.map((b) => b.g.ownerSVGElement));
    birds.forEach((b, i) => {
      b.p.style.setProperty('--len', Math.ceil(b.p.getTotalLength() * scaleOf(b)) + 2 + 'px');
      b.p.style.setProperty('--delay', (Math.min(i, 3) * STAGGER).toFixed(2) + 's');
    });
    for (const svg of svgs) svg.classList.add('armed');
    document.body.getBoundingClientRect();
    for (const svg of svgs) svg.classList.add('draw');
    setTimeout(() => {
      for (const svg of svgs) svg.classList.remove('armed', 'draw');
      for (const b of birds) b.p.removeAttribute('style');
      done();
    }, (1.6 + 3 * STAGGER + 0.2) * 1000);
  };
  // flap-flap-glide: 0 to 1 on the bird's own cycle
  const rest = (b, now) => Math.max(0, Math.min(1, 1.8 * Math.sin((TAU * now) / b.beat[1] + b.theta0) - 0.5));

  if (document.body.dataset.birds !== 'orbit') {
    // ------------------------------------------------ home page: with the scroll
    const EASE = 0.06; // how quickly the birds catch up with the scroll (per frame)
    const PACE = 0.5; // px flown per px scrolled, at depth 1
    const DRIFT = 5; // px a second at rest, once the birds have taken off

    // heading: degrees on screen; mirror: flip the drawing (a copy of the
    // middle bird mirrored flies down-left); depth: size and speed; grow: how
    // much nearer (+) or farther (-) it draws while crossing; wait: px of
    // flight before it first enters the window; beat: wing beats a second,
    // and the length of its flap-glide cycle at rest.
    const BIRDS = [
      { bird: 'upper', heading: 140, depth: 0.95, grow: -0.15, beat: [1.45, 5.2] },
      { bird: 'middle', heading: 62, depth: 1, grow: 0.3, beat: [1.5, 4.6] },
      { bird: 'middle', heading: 124, mirror: true, depth: 0.55, grow: 0, wait: 260, beat: [1.65, 6.1] },
      { bird: 'middle', heading: 34, depth: 0.75, grow: -0.25, wait: 700, beat: [1.55, 5.6] },
      { bird: 'middle', heading: 150, mirror: true, depth: 1.15, grow: 0.15, wait: 1300, beat: [1.4, 4.9] },
    ];

    // A seeded random source, so the birds come back the same way each visit.
    const rand = mulberry32(20261015);
    const sky = layer('flight');
    const birds = BIRDS.map((spec, i) => {
      const b = hatch(spec, i, sky);
      b.drawn = spec.mirror ? 180 - b.t.heading : b.t.heading; // heading of the drawing as placed
      return Object.assign(b, { x: 0, y: 0, flown: 0, crossing: 0, wobble: rand() * TAU, theta0: rand() * TAU });
    });
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
      const r = radius(b); // walk back from the target until clear of the window
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
        b.amp += (Math.max(activity, 0.75 * rest(b, now)) - b.amp) * 0.08;
        b.theta += TAU * b.beat[0] * dt * (0.55 + 0.45 * b.amp);
        const s = size(b);
        pose(b, b.x, b.y, course - b.drawn, s); // turned to face its course
        const depth = s / u;
        b.g.style.opacity = depth < 1 ? (0.35 + 0.65 * depth).toFixed(3) : '';
        if (drawn) beat(b);
      }
    };

    // Draw the two birds in where they sit, then let them fly.
    place();
    render(0, 0);
    drawIn(birds, size, () => (drawn = true));

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
  } else {
    // --------------------------------------- contact page: round the address
    // ring: size of its ring; lift: ring raised (+) or lowered (-); speed;
    // depth: size; at: where on the ring it starts; beat: as above.
    const ORBIT = [
      { bird: 'middle', ring: 1, lift: -0.1, speed: 1, depth: 0.62, at: 0.3, beat: [1.5, 4.6] },
      { bird: 'upper', ring: 0.8, lift: 0.45, speed: 0.86, depth: 0.55, at: 2.2, beat: [1.45, 5.2] },
      { bird: 'middle', ring: 1.25, lift: 0.15, speed: 0.74, depth: 0.5, at: 4.1, beat: [1.65, 6.1] },
      { bird: 'middle', ring: 0.66, lift: -0.5, speed: 1.12, depth: 0.42, at: 1.2, beat: [1.55, 5.6] },
      { bird: 'upper', ring: 1.12, lift: 0.75, speed: 0.92, depth: 0.48, at: 5.3, beat: [1.4, 4.9] },
    ];
    const LAP = 24; // seconds round the ring at speed 1
    const address = document.querySelector('.contact-email a');
    const behind = layer('flight behind');
    const ahead = layer('flight ahead');
    const birds = ORBIT.map((spec, i) => {
      const b = hatch(spec, i, ahead);
      b.a = spec.at;
      b.theta0 = spec.at;
      // does the drawing face right (cos of its heading > 0)?
      b.right = Math.cos(b.t.heading * RAD) > 0;
      return b;
    });

    // the drawing is hidden here; size the birds as it would be drawn
    const vb = flock.viewBox.baseVal;
    const unit = () => (innerWidth >= 1200 ? Math.min(340, innerWidth * 0.24) : innerWidth >= 900 ? 240 : 200) / vb.height;

    let drawn = false;
    let eager = 1; // 1 calm, more when the address has attention
    let eagerTo = 1;
    let swirlUntil = 0;
    const render = (dt) => {
      const now = performance.now() / 1000;
      eager += ((now < swirlUntil ? 2.6 : eagerTo) - eager) * 0.05;
      const box = (address || flock).getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const narrow = innerWidth < 700;
      const R = Math.max(box.width * (narrow ? 0.75 : 0.7), Math.min(innerWidth * (narrow ? 0.44 : 0.36), 540));
      const ry = R * (narrow ? 0.62 : 0.24); // the ring seen from above (more steeply on a phone, so birds clear the text)
      const u = unit() * (narrow ? 0.7 : 1);
      for (const b of birds) {
        const da = -(TAU / LAP) * b.speed * eager * dt; // the front of the ring runs left to right
        b.a += da;
        const z = Math.sin(b.a); // +1 front, -1 back
        const x = cx + R * b.ring * Math.cos(b.a);
        const y = cy + ry * b.ring * z - ry * 1.4 * b.lift;
        const vx = -R * b.ring * Math.sin(b.a) * da;
        const vy = ry * b.ring * Math.cos(b.a) * da;

        // face the way it flies: mirror to head left or right, easing through the turn
        const goingRight = vx >= 0;
        b.flip += ((goingRight === b.right ? 1 : -1) - b.flip) * 0.1;
        const climb = Math.max(-20, Math.min(20, ((Math.atan2(vy, Math.abs(vx) + 1e-9) * 180) / Math.PI) * 0.6));
        const course = goingRight ? 28 + climb : 152 - climb;
        const drawnHeading = b.flip >= 0 ? b.t.heading : 180 - b.t.heading;
        let turn = course - drawnHeading;
        turn = ((turn + 540) % 360) - 180;
        b.rot += (turn - b.rot) * 0.1;

        const s = u * b.depth * (1 + 0.38 * z);
        pose(b, x, y, b.rot, s);
        b.g.style.opacity = (0.42 + 0.29 * (z + 1)).toFixed(3);
        const into = z >= 0 ? ahead : behind; // in front of the address or behind it
        if (b.g.parentNode !== into) into.append(b.g);

        // wings: always flying here, fuller and quicker when eager
        b.amp += (Math.min(1, Math.max(0.45 + 0.55 * rest(b, now), eager > 1.35 ? 1 : 0)) - b.amp) * 0.08;
        b.theta += TAU * b.beat[0] * dt * (0.6 + 0.4 * b.amp) * (eager > 1.35 ? 1.2 : 1);
        if (drawn) beat(b);
      }
    };

    const keen = (on) => () => (eagerTo = on ? 1.7 : 1);
    for (const el of [address, document.querySelector('.copy-email')]) {
      if (!el) continue;
      el.addEventListener('pointerenter', keen(true));
      el.addEventListener('pointerleave', keen(false));
      el.addEventListener('focus', keen(true));
      el.addEventListener('blur', keen(false));
    }
    document.addEventListener('birds:swirl', () => (swirlUntil = performance.now() / 1000 + 1.4));

    render(0);
    drawIn(birds, (b) => unit() * (innerWidth < 700 ? 0.7 : 1) * b.depth * (1 + 0.38 * Math.sin(b.a)), () => (drawn = true));
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      render(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
if (flock) flock.classList.add('ready');

// ----------------------------------------------------------- copy address
// Contact page: copy the email address; the label says so for 1.6s (and
// screen readers hear it). Without the clipboard, the address is selected.

const copyEmail = document.querySelector('.copy-email');
if (copyEmail) {
  copyEmail.closest('[hidden]')?.removeAttribute('hidden'); // useless without the script
  let timer;
  copyEmail.addEventListener('click', async () => {
    const email = copyEmail.dataset.email;
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      const link = document.querySelector('.contact-email a');
      const range = document.createRange();
      range.selectNodeContents(link);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return;
    }
    copyEmail.textContent = 'copied';
    status.textContent = '';
    status.textContent = 'Email address copied to the clipboard.';
    document.dispatchEvent(new Event('birds:swirl'));
    clearTimeout(timer);
    timer = setTimeout(() => (copyEmail.textContent = 'copy'), 1600);
  });
}
