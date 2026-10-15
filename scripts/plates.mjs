#!/usr/bin/env node
// Generates the paper figures ("plates") as SVG and inlines them into the
// HTML files between markers such as <!-- plate:fgls --> … <!-- /plate:fgls -->.
//
//   node scripts/plates.mjs
//
// No dependencies. Every figure uses a fixed seed, so each run produces
// byte-identical output. Re-run only when a paper (or its figure) changes.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['index.html', 'scripts/og.html'];

// Canvas shared by every plate (section 7 of the brief).
const W = 400;
const H = 250;
const PAD = 24;

// ---------------------------------------------------------------------------
// Randomness: mulberry32 + Box–Muller. Mirrors assets/site.js exactly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand) {
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

// AR(1) started from its stationary distribution.
export function ar1(n, phi, seed) {
  const z = gaussian(mulberry32(seed));
  const x = [z() / Math.sqrt(1 - phi * phi)];
  for (let t = 1; t < n; t++) x.push(phi * x[t - 1] + z());
  return x;
}

// ---------------------------------------------------------------------------
// Drawing helpers

const r1 = (v) => {
  const s = (Math.round(v * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

// A polyline as compact path data: "M x y L x y x y …"
const polyline = (pts) =>
  'M' + pts.map(([x, y], i) => (i === 1 ? 'L' : '') + r1(x) + ' ' + r1(y)).join(' ');

const extent = (xs) => [Math.min(...xs), Math.max(...xs)];

// Maps a series onto [top, bottom], larger values drawn higher.
const scaleY = (xs, top, bottom) => {
  const [lo, hi] = extent(xs);
  return (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
};

const NS = 'vector-effect="non-scaling-stroke"';
const pathEl = (d, attrs = '') => `<path${attrs ? ' ' + attrs : ''} d="${d}" ${NS}/>`;

function svg({ label, body, viewBox = `0 0 ${W} ${H}`, cls = 'plate-svg', extra = '' }) {
  return [
    `<svg class="${cls}" viewBox="${viewBox}" role="img" aria-label="${label}" ` +
      `fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"${extra}>`,
    ...body.map((l) => '  ' + l),
    '</svg>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 7.1  Plate 01: serial correlation (FGLS for Time Series Regression)

export function fgls() {
  const phi = 0.9;
  const n = 180;
  const x = ar1(n, phi, 1949); // Cochrane–Orcutt, 1949

  // Upper 60%: the path.
  const y = scaleY(x, PAD, 136);
  const step = (W - 2 * PAD) / (n - 1);
  const series = polyline(x.map((v, t) => [PAD + t * step, y(v)]));

  // Lower band: ACF at lags 1–30, rho_k = phi^k, as hairlines on one baseline.
  // One path per lag inside <g class="seq">, so site.js can raise them in turn.
  const base = H - PAD;
  const tall = 60;
  const lags = 30;
  const gap = (W - 2 * PAD) / (lags - 1);
  const acf = Array.from({ length: lags }, (_, i) =>
    pathEl(`M${r1(PAD + i * gap)} ${base}V${r1(base - tall * phi ** (i + 1))}`),
  );

  return svg({
    label:
      'A persistent AR(1) time series drawn as one hairline across the top, above a row of short vertical lines, its autocorrelations, decaying geometrically from left to right.',
    body: [
      pathEl(`M${PAD} ${base}H${W - PAD}`, 'class="base"'),
      pathEl(series),
      '<g class="seq">',
      ...acf.map((p) => '  ' + p),
      '</g>',
    ],
  });
}

// ---------------------------------------------------------------------------
// 7.2  Plate 02: the forward premium (Uncovered Interest Parity)

export function uip({ seed = 2026, noise = 0.45 } = {}) {
  const z = gaussian(mulberry32(seed));
  const n = 90;
  const slope = -0.8;

  // Simulate, then centre so the fitted line passes through the middle.
  let pts = Array.from({ length: n }, () => {
    const x = z();
    return [x, slope * x + noise * z()];
  });
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  pts = pts.map(([x, y]) => [x - mx, y - my]);

  // OLS slope on the centred data.
  const sxy = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sxx = pts.reduce((s, [x]) => s + x * x, 0);
  const b = sxy / sxx;

  // Same scale on both axes, so the parity line sits at 45 degrees.
  const cx = W / 2;
  const cy = H / 2;
  const half = H / 2 - PAD; // vertical room either side of centre
  const maxX = Math.max(...pts.map(([x]) => Math.abs(x)));
  const maxY = Math.max(...pts.map(([, y]) => Math.abs(y)));
  const s = Math.min((W / 2 - PAD) / maxX, half / maxY);
  const X = (v) => cx + v * s;
  const Y = (v) => cy - v * s;

  // Lines through the centre, clipped to the padded box.
  const line = (m) => {
    const dx = Math.min((W / 2 - PAD) / s, half / s / Math.abs(m));
    return `M${r1(X(-dx))} ${r1(Y(-dx * m))}L${r1(X(dx))} ${r1(Y(dx * m))}`;
  };

  const dots = pts
    .map(([x, y]) => `<circle cx="${r1(X(x))}" cy="${r1(Y(y))}" r="1.6"/>`)
    .join('');

  return svg({
    label:
      'About ninety points falling from upper left to lower right, crossed at the centre by a dashed line of slope one, the parity hypothesis, and a solid line at the fitted negative slope.',
    body: [
      pathEl(line(1), 'class="null" stroke-dasharray="3 4"'),
      pathEl(line(b)),
      `<g fill="currentColor" stroke="none">${dots}</g>`,
    ],
  });
}

// ---------------------------------------------------------------------------
// 7.3  Plate 03: Lasso coefficient paths (Heteroskedasticity of Unknown Form)

// Coordinate descent for (1/2n)||y - Xb||^2 + lambda ||b||_1 on standardised X,
// with warm starts along a decreasing penalty grid. Returns paths[k][j].
export function lassoPaths(X, y, lambdas) {
  const n = X.length;
  const p = X[0].length;
  const beta = new Array(p).fill(0);
  const r = y.slice();
  const paths = [];
  for (const lam of lambdas) {
    for (let it = 0; it < 10000; it++) {
      let moved = 0;
      for (let j = 0; j < p; j++) {
        let rho = 0;
        for (let i = 0; i < n; i++) rho += X[i][j] * r[i];
        rho = rho / n + beta[j];
        const bj = Math.sign(rho) * Math.max(Math.abs(rho) - lam, 0);
        const d = bj - beta[j];
        if (d !== 0) {
          for (let i = 0; i < n; i++) r[i] -= X[i][j] * d;
          beta[j] = bj;
          moved = Math.max(moved, Math.abs(d));
        }
      }
      if (moved < 1e-9) break;
    }
    paths.push(beta.slice());
  }
  return paths;
}

function standardise(X, y) {
  const n = X.length;
  const p = X[0].length;
  const Z = X.map((row) => row.slice());
  for (let j = 0; j < p; j++) {
    const m = Z.reduce((s, row) => s + row[j], 0) / n;
    const sd = Math.sqrt(Z.reduce((s, row) => s + (row[j] - m) ** 2, 0) / n);
    for (const row of Z) row[j] = (row[j] - m) / sd;
  }
  const my = y.reduce((s, v) => s + v, 0) / n;
  return [Z, y.map((v) => v - my)];
}

export function lasso({ seed = 47, mix = 0.6, b1 = -0.6 } = {}) {
  const z = gaussian(mulberry32(seed));
  const n = 200;
  const p = 12;
  const rho = 0.5; // neighbouring regressors correlate at 0.5, decaying with distance
  const beta = [2.4, b1, 0.2, 1.3, 0, 0.55, 0, -0.75, 0.15, 0, 0.35, -0.1];

  const X = Array.from({ length: n }, () => {
    const row = [z()];
    for (let j = 1; j < p; j++) row.push(rho * row[j - 1] + Math.sqrt(1 - rho * rho) * z());
    // Regressor 1 is negative in truth but loads on the two large positive
    // regressors (0 and 3), so it enters with the wrong sign, returns to zero
    // as they take over, and re-enters negative: the path crosses zero.
    row[1] = mix * row[0] + mix * row[3] + Math.sqrt(Math.max(0.05, 1 - 2 * mix * mix)) * row[1];
    return row;
  });
  const y = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0) + 1.6 * z());

  const [Zs, yc] = standardise(X, y);
  const lmax = Math.max(
    ...Array.from({ length: p }, (_, j) => Math.abs(Zs.reduce((s, row, i) => s + row[j] * yc[i], 0)) / n),
  );
  const K = 60;
  const lambdas = Array.from({ length: K }, (_, k) => lmax * Math.pow(0.01, k / (K - 1)));
  const paths = lassoPaths(Zs, yc, lambdas);

  const all = paths.flat();
  const hi = Math.max(0, ...all);
  const lo = Math.min(0, ...all);
  const s = (H - 2 * PAD) / (hi - lo);
  const zero = PAD + hi * s;
  const step = (W - 2 * PAD) / (K - 1);

  const body = [pathEl(`M${PAD} ${r1(zero)}H${W - PAD}`, 'class="base"')];
  for (let j = 0; j < p; j++) {
    body.push(pathEl(polyline(paths.map((b, k) => [PAD + k * step, zero - b[j] * s]))));
  }

  return svg({
    label:
      'Twelve Lasso coefficient paths that leave a shared zero line one by one as the penalty falls from left to right: a few grow large, most stay small, and one crosses zero.',
    body,
  });
}

// ---------------------------------------------------------------------------
// 7.4  The line under the intro. The page ships this fixed-seed draw (phi = 0.98)
// so the line is there without JavaScript; assets/site.js replaces it on every
// page load with a new seed and a new phi.

export const LINE = { n: 600, phi: 0.98, w: 600, h: 64, top: 4, bottom: 60 };

export function linePath(seed) {
  const x = ar1(LINE.n, LINE.phi, seed);
  const y = scaleY(x, LINE.top, LINE.bottom);
  return polyline(x.map((v, t) => [(t * LINE.w) / (LINE.n - 1), y(v)]));
}

export function line() {
  return svg({
    cls: 'line-svg',
    viewBox: `0 0 ${LINE.w} ${LINE.h}`,
    extra: ' preserveAspectRatio="none"',
    label: 'One draw of an AR(1) process with φ = 0.98, a single hairline wandering across the page.',
    body: [pathEl(linePath(20260101))],
  });
}

// ---------------------------------------------------------------------------

export const PLATES = { fgls, uip, lasso, line };

async function main() {
  const rendered = Object.fromEntries(Object.entries(PLATES).map(([k, f]) => [k, f()]));
  for (const rel of TARGETS) {
    const file = path.join(ROOT, rel);
    let html = await readFile(file, 'utf8');
    const before = html;
    for (const [name, markup] of Object.entries(rendered)) {
      const re = new RegExp(`([ \\t]*)<!-- plate:${name} -->[\\s\\S]*?<!-- /plate:${name} -->`, 'g');
      html = html.replace(re, (_, indent) =>
        [
          `${indent}<!-- plate:${name} -->`,
          ...markup.split('\n').map((l) => indent + l),
          `${indent}<!-- /plate:${name} -->`,
        ].join('\n'),
      );
    }
    if (html !== before) await writeFile(file, html);
    console.log(`${html !== before ? 'updated' : 'unchanged'}  ${rel}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
