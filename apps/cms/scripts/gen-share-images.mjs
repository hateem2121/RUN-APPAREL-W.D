/**
 * Draw each page type's share picture — `public/share/<page>.jpg`, 1200x630 — from
 * `src/lib/shareImages.ts` (polish X14; the owner's answer Q11 of 2026-10-03: "fix the address,
 * and one picture per page type").
 *
 * WHY. Every website page shared `og-default.png`, made on 8 September before the move to
 * wear-run.com, and it still showed `wear-run.help` (audit, 3 October 2026). That file stays as it
 * is, for the links already shared; these are new files with new names.
 *
 * WHY COMMITTED FILES AND NOT `next/og` AT REQUEST TIME: `src/lib/shareImages.ts` has the ruling.
 * WHY PLAYWRIGHT AND NOT sharp FOR THE DRAWING: `gen-og-image.mjs` has it — SVG text comes out in
 * whatever face the rasteriser finds, and Chromium with the site's own woff2 files embedded draws
 * the same letters everywhere. sharp then writes the JPEG, as `gen-icons.mjs` uses it: JPEG
 * because link previewers are not browsers (`.claude/rules/viewer-headers.md`), at quality 82 with
 * full-resolution colour so the lime words do not bleed into the ink, and under 300 KB, above which
 * WhatsApp is reported to show no picture (vercel/next.js discussion 60366).
 *
 * Every word comes from `shareImages.ts`, which takes it from the pages; every colour from
 * `packages/ui/src/tokens.css`; every picture from a file already in the repository.
 *
 * ⚠️ NOT WIRED INTO ANY BUILD, like `gen-og-image.mjs` and `gen-icons.mjs`: it needs a browser,
 * and the outputs are committed. Run it by hand after a page's label or headline changes, through
 * the pipeline's `tsx`, which reads the site's TypeScript:
 *
 *   tools/asset-pipeline/node_modules/.bin/tsx apps/cms/scripts/gen-share-images.mjs --force
 *
 * ⚠️ REFUSES TO OVERWRITE without `--force`, as `gen-icons.mjs` does: these are committed
 * binaries, and remaking one silently on someone else's branch is how a picture changes without
 * anybody deciding it should. Then look at every file before committing it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTACT_HERO_PHOTO, contactHeroSrc } from '../src/lib/factoryPhotos.ts'
import { SHARE_CARDS, SHARE_IMAGE } from '../src/lib/shareImages.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CMS = join(HERE, '..')
const REPO = join(CMS, '..', '..')
const OUT = join(CMS, 'public', SHARE_IMAGE.folder)
const POSTERS = join(REPO, 'apps', 'viewer', 'public', 'og')
const force = process.argv.includes('--force')

/** A WhatsApp preview is reported to vanish above this (see the header). */
const MAX_BYTES = 300 * 1024

const FONTS = {
  archivo: join(
    CMS,
    'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  ),
  serif: join(
    CMS,
    'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
  ),
  mono: join(
    CMS,
    'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
  ),
}

/** The brand's three constants, read from the tokens rather than retyped. */
const TOKENS = readFileSync(join(REPO, 'packages', 'ui', 'src', 'tokens.css'), 'utf8')
function token(name) {
  const match = TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'))
  if (!match?.[1]) throw new Error(`gen-share-images: no --${name} colour in tokens.css`)
  return match[1]
}
const INK = token('ink')
const VOLT = token('volt')
const PAPER = token('paper')

const dataUri = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Garment tiles: two columns of 4:5 posters, as tall as the card allows in two rows. */
const TILE = { inset: 40, gap: 12 }
TILE.height = (SHARE_IMAGE.height - 2 * TILE.inset - TILE.gap) / 2
TILE.width = (TILE.height * 4) / 5
const TILES_WIDTH = 2 * TILE.width + TILE.gap

function pictureMarkup(card) {
  if (card.picture.kind === 'garments') {
    const tiles = card.picture.garments
      .map((garment) => {
        const file = join(POSTERS, `${garment.poster}.jpg`)
        if (!existsSync(file)) throw new Error(`gen-share-images: no poster ${file}`)
        return `<img src="${dataUri(file, 'image/jpeg')}" alt="">`
      })
      .join('')
    return `<div class="tiles">${tiles}</div>`
  }
  if (card.picture.kind === 'photo') {
    // The contact page's own hero, its widest crop.
    const widest = Math.max(...CONTACT_HERO_PHOTO.widths.heroWide)
    const file = join(CMS, 'public', contactHeroSrc('heroWide', widest))
    return `<img class="photo" src="${dataUri(file, 'image/webp')}" alt=""><div class="wash"></div>`
  }
  return ''
}

function page(card) {
  const wordsWidth =
    card.picture.kind === 'garments'
      ? SHARE_IMAGE.width - TILE.inset - TILES_WIDTH - 56
      : SHARE_IMAGE.width - 80
  /*
   * The accent's last two words are joined by a no-break space, as the site's headlines join
   * theirs (TY-12, base.css), so the serif words do not end on one alone: the first drawing left
   * "explained." on a line of its own. Only the accent: joined, "Let's talk production." broke
   * as "Let's" over two words, which read worse than the line it replaced.
   */
  const join = (text) => text.replace(/ (?=\S+$)/, '\u00a0')
  const oneWordAccent = card.accent !== '' && !card.accent.includes(' ')
  const headingText = card.heading
  const accent = card.accent
    ? `${oneWordAccent ? '\u00a0' : ' '}<em>${escapeHtml(oneWordAccent ? card.accent : join(card.accent))}</em>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:url(${dataUri(FONTS.archivo, 'font/woff2')}) format('woff2');font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:Instrument;src:url(${dataUri(FONTS.serif, 'font/woff2')}) format('woff2');font-style:italic}
@font-face{font-family:Plex;src:url(${dataUri(FONTS.mono, 'font/woff2')}) format('woff2');font-weight:400}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${SHARE_IMAGE.width}px;height:${SHARE_IMAGE.height}px}
body{position:relative;overflow:hidden;background:${INK};color:${PAPER};font-family:Archivo,sans-serif}
.grid{position:absolute;inset:0;background-image:linear-gradient(${PAPER}0f 1px,transparent 1px),linear-gradient(90deg,${PAPER}0f 1px,transparent 1px);background-size:60px 60px}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.wash{position:absolute;inset:0;background:linear-gradient(90deg,${INK}f2 0%,${INK}d9 55%,${INK}a6 100%)}
.words{position:absolute;top:0;bottom:0;left:0;width:${wordsWidth}px;padding:64px 0 60px 80px;display:flex;flex-direction:column;justify-content:space-between}
.label{font-family:Plex,monospace;font-size:var(--label,20px);white-space:nowrap;color:${VOLT}}
h1{font-size:var(--size,104px);line-height:1;font-weight:800;font-stretch:122%;letter-spacing:-.02em;overflow-wrap:normal;word-break:normal}
h1 em{font-family:Instrument,serif;font-style:italic;font-weight:400;font-stretch:100%;letter-spacing:0;color:${VOLT}}
.foot{display:flex;justify-content:space-between;align-items:flex-end}
.mark{font-size:34px;font-weight:800;font-stretch:122%;letter-spacing:-.01em}
.host{font-family:Plex,monospace;font-size:22px;color:${PAPER}b3}
.tiles{position:absolute;top:${TILE.inset}px;right:${TILE.inset}px;display:grid;grid-template-columns:repeat(2,${TILE.width}px);grid-auto-rows:${TILE.height}px;gap:${TILE.gap}px}
.tiles img{display:block;width:100%;height:100%;object-fit:cover;border-radius:12px}
</style></head><body>
<div class="grid"></div>
${pictureMarkup(card)}
<div class="words">
  <p class="label">${escapeHtml(card.label)}</p>
  <h1>${escapeHtml(headingText)}${accent}</h1>
  <div class="foot"><span class="mark">RUN APPAREL</span><span class="host">${SHARE_IMAGE.host}</span></div>
</div>
</body></html>`
}

/**
 * The largest headline that fits: no word wider than its column, at most four lines, and 24px
 * clear of the label above and the foot below. A guide's headline is up to 53 characters and the
 * home page's 29, so one fixed size would either crowd one or shrink the other.
 */
async function fitHeadline(browserPage) {
  return browserPage.evaluate(() => {
    const h1 = document.querySelector('h1')
    const label = document.querySelector('.label')
    const foot = document.querySelector('.foot')
    const words = document.querySelector('.words')
    if (!h1 || !label || !foot || !words) throw new Error('the card is missing a part')
    // The label on one line: a category page's runs to 50 characters beside the garments, and
    // its closing bracket wrapped onto a line of its own at 20px.
    for (let size = 20; label.scrollWidth > label.clientWidth && size > 14; size -= 1) {
      label.style.setProperty('--label', `${size - 1}px`)
    }
    if (label.scrollWidth > label.clientWidth) throw new Error(`"${label.textContent}" is too long`)
    const room =
      words.clientHeight -
      Number.parseFloat(getComputedStyle(words).paddingTop) -
      Number.parseFloat(getComputedStyle(words).paddingBottom) -
      label.offsetHeight -
      foot.offsetHeight -
      48
    for (let size = 104; size >= 40; size -= 2) {
      h1.style.setProperty('--size', `${size}px`)
      const lines = Math.round(h1.offsetHeight / size)
      if (h1.scrollWidth <= h1.clientWidth && h1.offsetHeight <= room && lines <= 4) return size
    }
    throw new Error(`"${h1.textContent}" does not fit at 40px`)
  })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const existing = SHARE_CARDS.filter((card) => existsSync(join(OUT, card.file)))
  if (existing.length > 0 && !force) {
    console.error(
      `gen-share-images: ${existing.length} file(s) already exist in public/share/; ` +
        'pass --force to remake them (and look at every one before committing).',
    )
    process.exit(1)
  }
  const require = createRequire(join(REPO, 'tools', 'asset-pipeline', 'package.json'))
  const sharp = require('sharp')
  const { chromium } = createRequire(join(CMS, 'package.json'))('@playwright/test')

  const browser = await chromium.launch()
  try {
    const browserPage = await browser.newPage({
      viewport: { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height },
    })
    for (const card of SHARE_CARDS) {
      await browserPage.setContent(page(card), { waitUntil: 'load' })
      await browserPage.evaluate(() => document.fonts.ready)
      const size = await fitHeadline(browserPage)
      const png = await browserPage.screenshot({ type: 'png' })
      let quality = 82
      let jpeg = await sharp(png)
        .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toBuffer()
      while (jpeg.length > MAX_BYTES && quality > 60) {
        quality -= 4
        jpeg = await sharp(png)
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
          .toBuffer()
      }
      if (jpeg.length > MAX_BYTES) throw new Error(`${card.file} is still over 300 KB`)
      writeFileSync(join(OUT, card.file), jpeg)
      console.log(
        `wrote share/${card.file}  ${(jpeg.length / 1024).toFixed(1)} KB  q${quality}  headline ${size}px`,
      )
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`gen-share-images: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
