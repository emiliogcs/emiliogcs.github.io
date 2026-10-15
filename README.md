# emiliogcs.com

Personal site of Emilio González Coya. Plain HTML, one stylesheet, one
small script, served by GitHub Pages from `main` / root. Nothing to build: what
is in the repository is what is deployed.

```
index.html                  the whole site
404.html                    served by GitHub Pages for any missing path
assets/site.css             all styles (tokens at the top)
assets/site.js              a fresh AR(1) line per visit, figure drawing, BibTeX copy
assets/fonts/               EB Garamond 400 + italic, IBM Plex Mono 400 (woff2, Latin + Latin Extended-A; licences alongside)
assets/og.png               1200×630 social preview
favicon.svg
cv/index.html               redirect → /              (old WordPress URL; see "Add the CV")
working-papers/index.html   redirect → /#research     (old WordPress URL)
scripts/plates.mjs          generates the paper figures and inlines them
scripts/og.html             template for og.png
CNAME                       emiliogcs.com
```

## Preview locally

```sh
python3 -m http.server 8000
```

then open <http://localhost:8000>. (Opening `index.html` as a file won't load
the fonts, because paths start at the site root.)

## Add the CV

The CV is not on the site for now. To publish it:

1. Put the file in the root as `cv.pdf`.
2. In `index.html` and `404.html`, add `<li><a href="/cv.pdf">cv</a></li>`
   to the nav, between research and contact.
3. In the contact row of `index.html`, add `<li><a href="/cv.pdf">cv (pdf)</a></li>`
   before `new york`.
4. In `cv/index.html`, point the redirect back at `/cv.pdf` (the
   `canonical`, `refresh` and `location.replace` lines).

To update it later, overwrite `cv.pdf` (keep the name).

## Add a paper

Papers live in `index.html` inside `<section id="research">`, newest first.
Each one is an `<article class="plate">`.

1. **Copy an existing `<article class="plate">` block** and edit it:
   - `id` on the article (short, e.g. `id="garch"`) and the matching
     `aria-labelledby` / title `id` (`garch-title`).
   - Title and its link, `with …`, venue (journal name in `<cite>`).
   - Action row: keep only the links that exist. Each link is
     `<a class="act" …>` followed by `<span class="sep" aria-hidden="true">·</span>`.
     The `abstract` `<details>` stays last; the BibTeX button is added by the
     script automatically.
   - Paste the abstract verbatim inside `<div class="abstract-body"><p>…</p></div>`.
   - Put the BibTeX entry inside `<details class="bib"><summary>bibtex</summary><pre>…</pre></details>`.
     Take author name forms, volume, issue, pages and year from the
     publisher's record (Crossref: `curl -LH "Accept: application/x-bibtex" https://doi.org/<DOI>`).
2. **Design its figure.** Every paper gets its own drawing, computed from the
   econometrics in the paper. In `scripts/plates.mjs`, add a function next to
   `fgls()`, `uip()` and `lasso()` and register it in `PLATES`. The rules:
   - `viewBox="0 0 400 250"`, at least 24 units of padding (use the `svg()`
     helper, which sets stroke, caps and joins).
   - Strokes 1px via `pathEl()` (adds `vector-effect="non-scaling-stroke"`);
     points are `<circle r="1.6">` inside `<g fill="currentColor" stroke="none">`.
   - No axes, ticks, labels, legends or grids. At most one hairline baseline,
     drawn with `class="base"` (it takes the `--rule` colour).
   - A fixed seed with `mulberry32(seed)` and `gaussian()`, so every run draws
     the same picture. Coordinates are rounded to one decimal by `r1()`.
   - A one-sentence `label` describing the drawing for screen readers.
   - It should read as an abstract drawing first and econometrics second.
   - Paths draw themselves on scroll automatically. Paths inside
     `<g class="seq">` draw one after another; a dashed reference line can use
     `class="null"` so it fades in instead.
3. **Add the markers** where the figure goes, inside the plate's
   `<div class="plate-fig">`:
   ```html
   <!-- plate:garch -->
   <!-- /plate:garch -->
   ```
4. **Run the generator** (Node 18+, no dependencies; on a Mac: `brew install node`):
   ```sh
   node scripts/plates.mjs
   ```
   It replaces whatever sits between each pair of markers in `index.html`
   and `scripts/og.html`. Running it again changes nothing.
5. **Add the paper to the structured data**: one more `ScholarlyArticle` in
   the JSON-LD block in `<head>` (name, author, `isPartOf` the journal,
   `datePublished` if known, `url`, DOI link as `sameAs`).
6. Preview, then commit and push.

When a forthcoming paper comes out, change the venue to
`<cite>Journal</cite> volume (year), pages.`, drop `note = {Forthcoming}`
from its BibTeX (adding volume, number, pages), and update `creativeWorkStatus`
/ `datePublished` in the JSON-LD.

## Social image

`assets/og.png` is rendered from `scripts/og.html` (it carries plate 01). After
re-running the plates, regenerate it with any headless Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=3000 --screenshot="$PWD/assets/og.png" "file://$PWD/scripts/og.html"
```

## Fonts

Subset from the Google Fonts sources with fontTools, keeping kerning,
ligatures, old-style and lining figures, and true small caps:

```sh
pyftsubset EBGaramond-400.ttf --flavor=woff2 --no-hinting \
  --layout-features="kern,liga,onum,lnum,pnum,tnum,smcp,c2sc,case,locl,ccmp,mark,mkmk" \
  --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+0192,U+0218-021B,U+0237,U+02BB-02BC,U+02C6-02C7,U+02D8-02DD,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD"
```

(The italic also keeps U+03C6, φ, for the caption under the line. EB Garamond
was instanced at weight 400 from the variable font first with
`fonttools varLib.instancer`.)

## Checks before pushing

```sh
npx html-validate index.html 404.html cv/index.html working-papers/index.html
```

No analytics, cookies or third-party requests: keep it that way.
