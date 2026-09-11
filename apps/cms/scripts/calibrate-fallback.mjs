#!/usr/bin/env node
/**
 * calibrate-fallback.mjs — measure how wide each hero headline is in the real webfonts and in
 * the local stand-in faces `apps/cms/src/app/(frontend)/site.css` declares, and print the
 * `size-adjust` each headline's own runs would need.
 *
 * WHY THIS EXISTS. The stand-in faces are sized from frequency-weighted AVERAGE advance widths
 * (site.css carries the 2026-09-07 working). An average fits running text; it does not fit any
 * one short headline exactly. Where a headline sits close to a wrap boundary, that difference
 * decides the line count: the stand-in fits one more word on a line than the real font does, and
 * everything under the headline moves when the webfont arrives. Measured on the live site on
 * 2026-09-11: /products scored CLS 0.404 at 1350px, because "Every garment, turnable." is only
 * 8px wider than its 1052px column in the real fonts, and 1.7% narrower in the stand-in.
 *
 * HISTORY. Written 2026-09-08 on a branch that never merged; ported 2026-09-11 with three
 * corrections: the contact headline renders a curly U+2019 (`Let&rsquo;s`), not the straight
 * apostrophe first measured; each run is measured WITH its trailing space, which the page draws
 * mid-line in the display face (see METHOD); and the output is per headline, because the shared
 * faces are not the place to fit one (see WHAT TO DO WITH THE OUTPUT).
 *
 * USAGE
 *   node apps/cms/scripts/calibrate-fallback.mjs
 *   node apps/cms/scripts/calibrate-fallback.mjs --linux   (inside CI's Playwright image — see LINUX)
 *
 * Needs Playwright's browsers (`playwright install chromium webkit firefox`); no server, no
 * build. It reads the live files — the real font binaries, the real tokens.css and base.css —
 * never a remembered table. Heavy: three browsers doing thousands of layouts, so run it on an
 * idle machine. `src/fallbackMetrics.test.ts` fails when a headline below no longer matches its
 * page, which is the signal to run this again.
 *
 * METHOD
 *   1. Each headline's display run and serif-accent run is rendered on its own, off-screen, with
 *      the production classes (`.display.display--hero`, `.serif-accent`), so font-size, tracking,
 *      weight, stretch and casing resolve as they do on the page. `white-space: pre`, not
 *      `nowrap`: "Every garment, " ends in a space that the page draws mid-line in the DISPLAY
 *      face, and `nowrap` drops a run's trailing space from its width. The script prints the
 *      difference, so the reason is measured each time rather than asserted here.
 *   2. Each run is measured in the real webfont (the local .woff2 files) and in a stand-in
 *      candidate: the same `local()` sources as site.css, with an injected `size-adjust`.
 *   3. `size-adjust` is bisected per (run, width, engine) until the stand-in is within 0.01% of
 *      the real width — far tighter than any conclusion drawn from it.
 *   4. For each run it prints the minimax across engines and widths (the one value whose worst
 *      error is smallest), with the overrides re-derived for it.
 *
 * `ascent-override`/`descent-override` do not affect width. They are re-derived from CURRENT:
 * `override × size-adjust` is the real font's own ascent (or descent) per em, a constant, so
 * `new = old × oldSizeAdjust / newSizeAdjust` — the formula Fontaine and Capsize use too.
 *
 * WHAT TO DO WITH THE OUTPUT
 *   - The SHARED faces (`Archivo Display Fallback`, `Instrument Serif Fallback`) stay corpus
 *     averages. Every piece of display text uses them — section headings, product names, the
 *     wordmark — so moving them to fit three headlines trades all of those for these three.
 *   - `e2e/fontSwap.spec.ts` decides whether a headline needs faces of its own: it loads each page
 *     with the webfonts blocked and delivered, at four widths, in three engines. A headline that
 *     breaks differently gets scoped faces with the per-headline values printed here, the way
 *     /products has since 2026-09-11.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from '@playwright/test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const CMS_ROOT = join(REPO_ROOT, 'apps', 'cms')

const TOKENS_CSS = join(REPO_ROOT, 'packages', 'ui', 'src', 'tokens.css')
const BASE_CSS = join(REPO_ROOT, 'packages', 'ui', 'src', 'base.css')
const ARCHIVO_WOFF2 = join(
  CMS_ROOT,
  'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
)
const SERIF_WOFF2 = join(
  CMS_ROOT,
  'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
)

// The 2026-09-07 derivations in site.css, which every re-derived face starts from.
// `src/fallbackMetrics.test.ts` holds the same baseline.
const CURRENT = {
  archivoDisplay: { sizeAdjust: 128.24, ascentOverride: 68.47, descentOverride: 16.38 },
  instrumentSerif: { sizeAdjust: 79.52, ascentOverride: 124.49, descentOverride: 38.98 },
}

const WIDTHS = [390, 1350, 1440]
const TOLERANCE_PCT = 0.5
const SEARCH_TOLERANCE_PCT = 0.01
const BISECT_ITERATIONS = 22

// Exact source text from the JSX (`&rsquo;` renders U+2019); text-transform does the casing, as
// on the page. One entry per line: `src/fallbackMetrics.test.ts` reads this table.
const HEADLINES = [
  { page: '/products', archivo: 'Every garment, ', accent: 'turnable.' },
  { page: '/', archivo: 'Made to order. ', accent: 'Made properly.' },
  { page: '/contact', archivo: 'Let’s talk production.', accent: null },
]

/**
 * `--linux`: the faces a machine WITHOUT Arial and Georgia draws — a Linux desktop, and CI's
 * Playwright image (`mcr.microsoft.com/playwright:v1.62.1-noble` has neither, measured 2026-09-11,
 * which is why PR #10's font tests failed there and nowhere else). Liberation Sans has Arial's
 * advance widths, so the display face keeps its values and Liberation Sans Bold is one more source
 * in it. Liberation Serif is shaped like Times, not Georgia, so the serif gets faces of its own in
 * site.css, sized by this mode. Run it INSIDE that image:
 *   docker run --rm --init --ipc=host -v "$PWD":/repo:ro mcr.microsoft.com/playwright:v1.62.1-noble \
 *     node /repo/apps/cms/scripts/calibrate-fallback.mjs --linux
 * ⚠️ READ ITS CHROMIUM AND FIREFOX ROWS ONLY. In that image WebKit's real-font widths did not
 * change between 390, 1350 and 1440px, and its display ideal came out at 90% where the other two
 * engines put it at 125–131%, so its rows (and the summary, which includes them) are noise.
 * Chromium draws `local()` faces there in whole pixels, so its search error stays near 1% where
 * Firefox's reaches 0.01%.
 */
const LINUX = process.argv.includes('--linux')

const FACES = {
  archivoDisplay: {
    label: 'Archivo Display Fallback',
    // The same sources, in the same order, as site.css.
    src: 'local("Arial Bold"), local("Helvetica Neue Bold"), local("Liberation Sans Bold"), local("Arial")',
    weightDescriptor: '700 900',
    current: CURRENT.archivoDisplay,
  },
  instrumentSerif: {
    label: LINUX ? 'Instrument Serif Fallback Liberation' : 'Instrument Serif Fallback',
    // Full name first for Chromium and Firefox, family name second for WebKit — see site.css.
    src: LINUX
      ? 'local("Liberation Serif Italic"), local("Liberation Serif")'
      : 'local("Georgia Italic"), local("Georgia")',
    weightDescriptor: 'normal',
    styleDescriptor: 'italic',
    current: CURRENT.instrumentSerif,
  },
}

function buildFixtureHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="file://${TOKENS_CSS}" />
<link rel="stylesheet" href="file://${BASE_CSS}" />
<style>
@font-face {
  font-family: "Archivo Variable Real";
  src: url("file://${ARCHIVO_WOFF2}") format("woff2-variations");
  font-weight: 100 900;
  font-stretch: 62% 125%;
}
@font-face {
  font-family: "Instrument Serif Real";
  src: url("file://${SERIF_WOFF2}") format("woff2");
  font-style: italic;
  font-weight: 400;
}
html, body { margin: 0; padding: 0; }
#stage { position: absolute; left: 0; top: 0; visibility: hidden; }
.measure { position: absolute; left: 0; top: 0; white-space: pre; width: max-content; }
</style>
</head>
<body>
<div id="stage"></div>
</body>
</html>
`
}

/** Measure the width of one run, rendered in `fontFamily` (a single face name — no fallback
 * chain, so the browser cannot silently pick something else). */
async function measureRun(page, { text, accent, fontFamily, whiteSpace = 'pre' }) {
  return page.evaluate(
    ({ text, accent, fontFamily, whiteSpace }) => {
      const stage = document.getElementById('stage')
      stage.replaceChildren()
      const h1 = document.createElement('h1')
      h1.className = 'display display--hero measure'
      h1.style.whiteSpace = whiteSpace
      if (accent) {
        const span = document.createElement('span')
        span.className = 'serif-accent'
        span.style.fontFamily = fontFamily
        span.textContent = text
        h1.appendChild(span)
      } else {
        h1.style.fontFamily = fontFamily
        h1.textContent = text
      }
      const target = accent ? h1.querySelector('span') : h1
      stage.appendChild(h1)
      return target.getBoundingClientRect().width
    },
    { text, accent, fontFamily, whiteSpace },
  )
}

let candidateCounter = 0
/** Inject a fresh, uniquely named @font-face for `face` at `sizeAdjust`, return its name. */
async function injectCandidate(page, face, sizeAdjust) {
  candidateCounter += 1
  const family = `Candidate-${candidateCounter}`
  await page.evaluate(
    ({ family, src, weightDescriptor, styleDescriptor, sizeAdjust }) => {
      const style = document.createElement('style')
      style.textContent = `
        @font-face {
          font-family: "${family}";
          src: ${src};
          font-weight: ${weightDescriptor};
          ${styleDescriptor ? `font-style: ${styleDescriptor};` : ''}
          size-adjust: ${sizeAdjust}%;
        }
      `
      document.head.appendChild(style)
    },
    {
      family,
      src: face.src,
      weightDescriptor: face.weightDescriptor,
      styleDescriptor: face.styleDescriptor ?? null,
      sizeAdjust,
    },
  )
  // local() sources resolve without a network fetch, but go through the same load pipeline —
  // wait for it explicitly rather than assuming synchronous availability.
  await page.evaluate((family) => document.fonts.load(`16px "${family}"`), family)
  return family
}

/** Bisect size-adjust so the candidate's rendered width matches `realWidth`. */
async function bisectSizeAdjust(page, face, run, realWidth) {
  let lo = 60
  let hi = 220
  let bestValue = (lo + hi) / 2
  let bestError = Number.POSITIVE_INFINITY
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const family = await injectCandidate(page, face, mid)
    const width = await measureRun(page, { ...run, fontFamily: family })
    const errorPct = ((width - realWidth) / realWidth) * 100
    if (Math.abs(errorPct) < Math.abs(bestError)) {
      bestValue = mid
      bestError = errorPct
    }
    if (Math.abs(errorPct) <= SEARCH_TOLERANCE_PCT) break
    if (width < realWidth) lo = mid
    else hi = mid
  }
  return { sizeAdjust: bestValue, errorPct: bestError }
}

/**
 * ⚠️ THE FIRST-EVER RENDER OF A NON-DEFAULT VARIABLE-FONT INSTANCE COMES BACK WRONG, IN ALL THREE
 * ENGINES. Measured 2026-09-08: with `font-stretch: 122%` and `font-size` both held fixed, the
 * very first `getBoundingClientRect()` after a fresh page load returned the UNSTRETCHED width —
 * 308.64px for "Every garment, " at 34px — and every later measurement, at any width, returned
 * the correctly stretched 392.45px. It is not keyed by viewport width (1350 → 390 → 1350 → 200 →
 * 800: only the first call was wrong, whichever width it ran at). It cost the first version of
 * this script a spurious "one string wraps completely differently at 390px" finding. A throwaway
 * render of each REAL variable face before any measurement discards the artefact. The `local()`
 * candidates are static fonts and did not show it (every bisection's search error stayed under
 * 0.02%), so only the two real webfonts need it.
 */
async function warmUpVariableFonts(page) {
  await page.evaluate(() => {
    const stage = document.getElementById('stage')
    stage.replaceChildren()
    const archivo = document.createElement('h1')
    archivo.className = 'display display--hero measure'
    archivo.style.fontFamily = 'Archivo Variable Real'
    archivo.textContent = 'warm up'
    stage.appendChild(archivo)
    void archivo.getBoundingClientRect().width
    const serif = document.createElement('span')
    serif.className = 'serif-accent measure'
    serif.style.fontFamily = 'Instrument Serif Real'
    serif.textContent = 'warm up'
    stage.appendChild(serif)
    void serif.getBoundingClientRect().width
    stage.replaceChildren()
  })
}

async function calibrateOnEngine(engineName, browserType, fixtureUrl) {
  const browser = await browserType.launch()
  const page = await browser.newPage()
  await page.goto(fixtureUrl)
  await page.evaluate(() => document.fonts.ready)
  await warmUpVariableFonts(page)

  // METHOD step 1, measured: what the trailing space adds to the first display run.
  await page.setViewportSize({ width: WIDTHS[0], height: 900 })
  const [first] = HEADLINES
  const realRun = { text: first.archivo, accent: false, fontFamily: 'Archivo Variable Real' }
  const withSpace = await measureRun(page, { ...realRun, whiteSpace: 'pre' })
  const withoutSpace = await measureRun(page, { ...realRun, whiteSpace: 'nowrap' })
  console.log(
    `  "${first.archivo}" at ${WIDTHS[0]}px in the real font: ${withSpace.toFixed(2)}px with its ` +
      `trailing space (pre), ${withoutSpace.toFixed(2)}px without (nowrap)`,
  )

  const rows = []
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    for (const headline of HEADLINES) {
      const runs = [['archivoDisplay', headline.archivo, false, 'Archivo Variable Real']]
      if (headline.accent) {
        runs.push(['instrumentSerif', headline.accent, true, 'Instrument Serif Real'])
      }
      for (const [faceKey, text, accent, realFamily] of runs) {
        const run = { text, accent }
        const realWidth = await measureRun(page, { ...run, fontFamily: realFamily })
        const fit = await bisectSizeAdjust(page, FACES[faceKey], run, realWidth)
        rows.push({
          engine: engineName,
          width,
          page: headline.page,
          face: faceKey,
          text,
          realWidth,
          ...fit,
        })
      }
    }
  }

  await browser.close()
  return rows
}

/** A run's width error, in percent, if the stand-in used size-adjust `V` instead of the ideal the
 * bisection found. Width scales linearly with size-adjust (the same run's ideal came back identical
 * at 1350px and 1440px, which clamp to the same font-size), so this is exact enough to rank values. */
const projectedError = (cell, V) => ((V - cell.sizeAdjust) / cell.sizeAdjust) * 100 + cell.errorPct

function worstErrorAt(cells, V) {
  return Math.max(...cells.map((cell) => Math.abs(projectedError(cell, V))))
}

/** The single V that minimises the worst-case width error across `cells`. Each cell's error is
 * linear in V, so the worst case is convex and ternary search finds its minimum exactly. */
function minimax(cells) {
  let lo = Math.min(...cells.map((c) => c.sizeAdjust))
  let hi = Math.max(...cells.map((c) => c.sizeAdjust))
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (worstErrorAt(cells, m1) < worstErrorAt(cells, m2)) hi = m2
    else lo = m1
  }
  const V = (lo + hi) / 2
  return { V, worst: worstErrorAt(cells, V) }
}

function reDerived(faceKey, V) {
  const { current } = FACES[faceKey]
  const ascent = (current.ascentOverride * current.sizeAdjust) / V
  const descent = (current.descentOverride * current.sizeAdjust) / V
  return `size-adjust: ${V.toFixed(2)}%; ascent-override: ${ascent.toFixed(2)}%; descent-override: ${descent.toFixed(2)}%;`
}

async function main() {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'calibrate-fallback-'))
  const fixturePath = join(fixtureDir, 'fixture.html')
  writeFileSync(fixturePath, buildFixtureHtml())
  const fixtureUrl = `file://${fixturePath}`

  console.log('calibrate-fallback.mjs — real vs stand-in widths of the hero headlines\n')
  console.log(`Fixture: ${fixtureUrl}`)
  console.log(`Real Archivo:          ${ARCHIVO_WOFF2}`)
  console.log(`Real Instrument Serif: ${SERIF_WOFF2}\n`)

  const engines = [
    ['chromium', chromium],
    ['webkit', webkit],
    ['firefox', firefox],
  ]

  let allRows = []
  for (const [name, type] of engines) {
    console.log(`--- ${name} ---`)
    const rows = await calibrateOnEngine(name, type, fixtureUrl)
    for (const row of rows) {
      console.log(
        `  ${row.width}px  ${row.page.padEnd(10)} ${FACES[row.face].label.padEnd(26)} "${row.text}"`.padEnd(
          88,
        ) +
          `real=${row.realWidth.toFixed(2)}px  ideal size-adjust=${row.sizeAdjust.toFixed(3)}%` +
          `  (search error ${row.errorPct.toFixed(4)}%)`,
      )
    }
    allRows = allRows.concat(rows)
  }

  console.log('\n=== Per headline: the values a face scoped to that headline should use ===\n')
  for (const headline of HEADLINES) {
    for (const [faceKey, text] of [
      ['archivoDisplay', headline.archivo],
      ['instrumentSerif', headline.accent],
    ]) {
      if (!text) continue
      const cells = allRows.filter((r) => r.page === headline.page && r.face === faceKey)
      const ideals = cells.map((c) => c.sizeAdjust)
      const { V, worst } = minimax(cells)
      console.log(
        `${headline.page} — ${FACES[faceKey].label}, "${text}": ideal ` +
          `${Math.min(...ideals).toFixed(2)}–${Math.max(...ideals).toFixed(2)}% across engines and ` +
          `widths; minimax worst error ${worst.toFixed(3)}%`,
      )
      console.log(`  ${reDerived(faceKey, V)}`)
    }
  }

  console.log('\n=== The shared faces at their shipped values (they stay corpus averages) ===\n')
  for (const faceKey of Object.keys(FACES)) {
    const shipped = FACES[faceKey].current.sizeAdjust
    console.log(`${FACES[faceKey].label} at ${shipped}% — width error per headline (+ = wider):`)
    for (const headline of HEADLINES) {
      const cells = allRows.filter((r) => r.page === headline.page && r.face === faceKey)
      if (cells.length === 0) continue
      const errors = cells.map((cell) => projectedError(cell, shipped))
      console.log(
        `  ${headline.page.padEnd(10)} ${Math.min(...errors).toFixed(2)}% to ${Math.max(...errors).toFixed(2)}%`,
      )
    }
    const all = minimax(allRows.filter((r) => r.face === faceKey))
    console.log(
      `  (one value for all three headlines would be ${all.V.toFixed(2)}%, worst ${all.worst.toFixed(3)}%, ` +
        `${all.worst <= TOLERANCE_PCT ? 'within' : 'outside'} ${TOLERANCE_PCT}%)\n`,
    )
  }

  console.log(
    'Next: e2e/fontSwap.spec.ts decides which headlines need their own faces (see the header).',
  )
}

// `process.exit`, not `exitCode`: an error mid-engine leaves that browser open, and an open browser
// keeps node alive. The first `--linux` run on 2026-09-11 printed WebKit's error and then sat there.
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
