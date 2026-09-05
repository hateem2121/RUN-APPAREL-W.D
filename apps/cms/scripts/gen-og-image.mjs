/**
 * Generate the site's default social preview card — `public/og-default.png`.
 *
 * WHY A COMMITTED PNG AND NOT RUNTIME GENERATION. `next/og` renders images on the fly,
 * which is the modern answer and the wrong one here: it pulls satori and resvg-wasm,
 * neither of which this repo has, into the Worker that also serves the admin. This card
 * changes when the brand changes — roughly never — so it is built once and committed.
 *
 * WHY PLAYWRIGHT AND NOT sharp. sharp can rasterise an SVG, but SVG text is rendered by
 * whatever fonts the rasteriser can find, so the wordmark would silently come out in a
 * substitute face on any machine that lacks Archivo. Chromium with the real woff2 files
 * base64-embedded renders the same pixels everywhere, and Playwright is already here.
 *
 * ⚠️ NOT WIRED INTO ANY BUILD, DELIBERATELY. It needs a browser binary, and a build step
 * that downloads Chromium to redraw an unchanged image is a CI failure waiting to
 * happen. Run it by hand after a brand change:
 *
 *   node apps/cms/scripts/gen-og-image.mjs
 *
 * The output is 1200x630 — the size every major platform crops to, and the reason the
 * 1200x1500 garment posters in apps/viewer/public/og/ are NOT reusable here.
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

const FONTS = {
  archivo: join(
    REPO,
    'node_modules/.pnpm/@fontsource-variable+archivo@5.3.0/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  ),
  serif: join(
    REPO,
    'node_modules/.pnpm/@fontsource+instrument-serif@5.3.0/node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
  ),
}

const b64 = (path) => readFileSync(path).toString('base64')

// Brand values, copied from packages/ui/src/tokens.css. Duplicated on purpose: this
// runs outside the browser, so it cannot read a custom property, and a card drawn from
// guessed colours is worse than one drawn from stated ones.
const INK = '#1d1f1a'
const VOLT = '#cdf345'
const PAPER = '#f1efea'

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:url(data:font/woff2;base64,${b64(FONTS.archivo)}) format('woff2');font-weight:100 900;font-stretch:62% 125%;}
@font-face{font-family:Instrument;src:url(data:font/woff2;base64,${b64(FONTS.serif)}) format('woff2');font-style:italic;}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${INK};font-family:Archivo,sans-serif;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;
  background-image:linear-gradient(${PAPER}0f 1px,transparent 1px),linear-gradient(90deg,${PAPER}0f 1px,transparent 1px);
  background-size:60px 60px}
.pad{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
.label{font-size:20px;letter-spacing:.14em;color:${VOLT};font-family:ui-monospace,Menlo,monospace;text-transform:uppercase}
h1{font-size:104px;line-height:.96;font-weight:800;font-stretch:122%;letter-spacing:-.02em;color:${PAPER}}
h1 em{font-family:Instrument,serif;font-style:italic;font-weight:400;font-stretch:100%;color:${VOLT};letter-spacing:0}
.foot{display:flex;justify-content:space-between;align-items:flex-end}
.mark{font-size:34px;font-weight:800;font-stretch:122%;letter-spacing:-.01em;color:${PAPER}}
.host{font-size:22px;color:${PAPER}99;font-family:ui-monospace,Menlo,monospace}
</style></head><body>
<div class="grid"></div>
<div class="pad">
  <p class="label">[ B2B apparel manufacturer &middot; Sialkot, PK ]</p>
  <h1>Made to order.<br><em>Made properly.</em></h1>
  <div class="foot"><span class="mark">RUN APPAREL</span><span class="host">wear-run.help</span></div>
</div>
</body></html>`

const { chromium } = require(
  join(REPO, 'node_modules/.pnpm/playwright@1.62.1/node_modules/playwright'),
)

const out = join(HERE, '..', 'public', 'og-default.png')
const tmp = join(HERE, '..', 'public', '.og-source.html')
writeFileSync(tmp, html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`file://${tmp}`)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: out })
await browser.close()

const { statSync, unlinkSync } = await import('node:fs')
unlinkSync(tmp)
console.log(`wrote ${out} (${(statSync(out).size / 1024).toFixed(1)} KB, 1200x630)`)
