/**
 * Turn a garment's pictures into link-preview cards.
 *
 *   pnpm og:cards --from-site            every live garment and colour (scripts/live-products.mjs)
 *   pnpm og:cards --from-site r-snp      one live garment, every colour
 *   pnpm og:cards n002 [--posters <dir>] a garment not yet live, from the pipeline's posters
 *
 * Writes apps/viewer/public/og/<product>/<colour>.jpg    (shipped in the viewer bundle)
 *        apps/viewer/worker/og-cards.ts                  (the manifest the Worker reads)
 *
 * WHAT A CARD IS (2026-10-25, owner's plan). 1200x630, the WHOLE garment centred on the
 * paper ground, no words: the title and description already sit under the picture in
 * every app that shows one. Until that day a card was the 3D poster at 1200x1500, on the
 * theory that apps which cut a wide strip "land on the chest print". Drawn for all 41
 * garments on 2026-10-25 it held for tops and failed for one-pieces, dresses and tights,
 * which showed a band of torso or leg. LinkedIn's help page (a521928, read 2026-10-25):
 * "Minimum image dimensions: 1200 (w) x 627 (h)", "Recommended ratio: 1.91:1". Meta's
 * best practices: images "at least 1080 pixels in width".
 *
 * WHICH PICTURE. The colour's uploaded CLO render when it has one (198 of 205 colours on
 * 2026-10-25), else its 3D poster. The render is the studio image the owner uploaded: the
 * print is far sharper than in the 3D snapshot, which is what a buyer is shown. The
 * manifest records which one each card came from, so the fallbacks stay visible.
 *
 * WHY JPEG, when the posters and renders are WebP. Link crawlers are not browsers.
 * LinkedIn documents JPG/PNG/GIF only, and iMessage and WhatsApp are both unreliable with
 * WebP — so pointing `og:image` straight at a WebP would show a picture on Slack and X and
 * nothing at all on the two channels most likely to carry a link to a lead.
 *
 * WHY THE PRODUCT SLUG IS AN ARGUMENT for the poster mode, rather than parsed out of the
 * filename: `n001-wine-poster.webp` cannot be split unambiguously — product `n001` + colour
 * `wine` and product `n001-wine` + colour `` read identically. The card PATH keeps them
 * separate for the same reason: a slug can never contain `/`, so `og/<product>/<colour>.jpg`
 * cannot collide the way a hyphen-joined name can.
 *
 * THE MANIFEST IS REGENERATED FROM DISK, not from what this run happened to convert, so
 * adding garment #2 cannot drop garment #1's entries. Width, height and the hash are read
 * back out of the written JPEG rather than assumed — declared preview dimensions drifting
 * from the real file is a silent failure (og.test.ts), and the hash goes into the card's
 * address (`?v=`), so a card whose bytes change gets a new address every app fetches again.
 */
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const VIEWER_OG_DIR = join(REPO_ROOT, 'apps', 'viewer', 'public', 'og')
const MANIFEST_PATH = join(REPO_ROOT, 'apps', 'viewer', 'worker', 'og-cards.ts')
const API_ORIGIN = 'https://cms.wear-run.help'

/** LinkedIn's minimum is 1200x627; 630 is the 1.91:1 size every other platform documents. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630
/**
 * The paper around the garment. 36 px top and bottom leaves the garment 558 px tall, which
 * is what a tall garment (tights, a long coat) gets; 48 px at the sides keeps a wide one off
 * the edge. Drawn at these numbers for four garments on 2026-10-25 (the owner's sheet, A).
 */
export const MARGIN_Y = 36
export const MARGIN_X = 48
/**
 * Quality 76 rather than sharp's default 80: a card is displayed at roughly 500 px wide, and
 * WhatsApp has historically dropped images it considers heavy, so the bytes buy nothing and
 * can cost the whole image. og-cards.test.ts caps every card at 300 KB.
 */
const JPEG_QUALITY = 76
/** packages/ui/src/tokens.css `--bg`, light: link cards sit on white-ish chrome everywhere. */
export const OG_CARD_BACKGROUND = '#f1efea'

/** The first 10 hex digits of the card's SHA-256: its address changes exactly when its bytes do. */
export function cardHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10)
}

/**
 * One card from one picture: the garment trimmed to its own edges, fitted whole inside the
 * margins, centred on the paper. `trim()` reads the top-left pixel, which is transparent on a
 * render and on a poster since 2026-09-03, so it cuts exactly the empty border.
 */
export async function composeCard(picture) {
  let garment
  try {
    garment = await sharp(picture).ensureAlpha().trim({ threshold: 1 }).png().toBuffer()
  } catch {
    // A picture with no border to trim (already tight, or opaque) is used as it is.
    garment = await sharp(picture).ensureAlpha().png().toBuffer()
  }
  const fitted = await sharp(garment)
    .resize({
      width: CARD_WIDTH - 2 * MARGIN_X,
      height: CARD_HEIGHT - 2 * MARGIN_Y,
      fit: 'inside',
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer()
  const { width, height } = await sharp(fitted).metadata()
  return sharp({
    create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 3, background: OG_CARD_BACKGROUND },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((CARD_WIDTH - width) / 2),
        top: Math.round((CARD_HEIGHT - height) / 2),
      },
    ])
    .flatten({ background: OG_CARD_BACKGROUND })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer()
}

/** Relative paths resolve against the repo root, not the package. See CLAUDE.md. */
async function resolveDir(candidate) {
  if (isAbsolute(candidate)) return candidate
  try {
    await access(candidate)
    return candidate
  } catch {
    return join(REPO_ROOT, candidate)
  }
}

/** Each card's picture source, as the current manifest records it ('render' or 'snapshot'). */
async function readSources() {
  const sources = {}
  try {
    const text = await readFile(MANIFEST_PATH, 'utf8')
    for (const [, key, source] of text.matchAll(/'([^']+)': \{[^}]*source: '(render|snapshot)'/g)) {
      sources[key] = source
    }
  } catch {
    // No manifest yet: every card is new.
  }
  return sources
}

/** Every `<product>/<colour>.jpg` currently in public/og/, with its real size and hash. */
async function readManifestFromDisk(sources) {
  const entries = {}
  let products = []
  try {
    products = await readdir(VIEWER_OG_DIR, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const product of products) {
    if (!product.isDirectory()) continue
    const files = await readdir(join(VIEWER_OG_DIR, product.name))
    for (const file of files.sort()) {
      if (!file.endsWith('.jpg')) continue
      const key = `${product.name}/${file.replace(/\.jpg$/, '')}`
      const bytes = await readFile(join(VIEWER_OG_DIR, product.name, file))
      const { width, height } = await sharp(bytes).metadata()
      entries[key] = { width, height, hash: cardHash(bytes), source: sources[key] ?? 'snapshot' }
    }
  }
  return entries
}

async function writeManifest(entries) {
  const keys = Object.keys(entries).sort()
  const rows = keys
    .map((key) => {
      const { width, height, hash, source } = entries[key]
      return `  '${key}': { width: ${width}, height: ${height}, hash: '${hash}', source: '${source}' },`
    })
    .join('\n')
  await writeFile(
    MANIFEST_PATH,
    `// GENERATED by tools/asset-pipeline/scripts/og-cards.mjs — do not edit by hand.
// Regenerate with:  pnpm og:cards --from-site [<productSlug>]
//
// Keyed '<productSlug>/<colourSlug>', matching apps/viewer/public/og/<key>.jpg.
// Width, height and hash are read back out of each written JPEG, so a card that is
// regenerated cannot leave a stale number here. Pinned by
// apps/viewer/worker/og-cards.test.ts, which fails if this file and the directory
// ever disagree in either direction.
export interface OgCard {
  width: number
  height: number
  /** The first 10 hex digits of the file's SHA-256; the card's address carries it as \`?v=\`. */
  hash: string
  /** 'render' = the colour's uploaded CLO render; 'snapshot' = its 3D poster (no render yet). */
  source: 'render' | 'snapshot'
}

export const OG_CARDS: Record<string, OgCard> = {
${rows}
}
`,
    'utf8',
  )
  return keys
}

/** Write one card and say what it is. */
async function writeCard(product, colour, picture) {
  const buffer = await composeCard(picture)
  await mkdir(join(VIEWER_OG_DIR, product), { recursive: true })
  await writeFile(join(VIEWER_OG_DIR, product, `${colour}.jpg`), buffer)
  return buffer.length
}

async function fetchBytes(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Every colour of the live garments, from the same public answer the garment page reads. */
async function fromSite(only, sources) {
  const { LIVE_PRODUCTS } = await import(
    pathToFileURL(join(REPO_ROOT, 'scripts', 'live-products.mjs')).href
  )
  const products = LIVE_PRODUCTS.filter((p) => !only || p.slug === only)
  if (products.length === 0) throw new Error(`${only} is not in scripts/live-products.mjs.`)
  for (const product of products) {
    for (const colour of product.colourways) {
      const answer = await fetch(`${API_ORIGIN}/api/public/viewer/${product.slug}/${colour}`)
      if (!answer.ok)
        throw new Error(`${product.slug}/${colour}: the garment API answered ${answer.status}`)
      const selected = (await answer.json()).selectedColourway
      // The API answers a retired colour with the default one; a card must show the colour asked for.
      if (selected?.slug !== colour)
        throw new Error(`${product.slug}/${colour}: the API served ${selected?.slug}`)
      const source = selected.render?.url ? 'render' : 'snapshot'
      const url = selected.render?.url ?? selected.poster?.url
      if (!url) throw new Error(`${product.slug}/${colour} has neither a render nor a poster.`)
      const bytes = await writeCard(product.slug, colour, await fetchBytes(url))
      sources[`${product.slug}/${colour}`] = source
      console.log(
        `  ${product.slug}/${colour}.jpg  ${source.padEnd(8)}  ${(bytes / 1024).toFixed(0)} KB`,
      )
    }
  }
}

/** A garment that is not live yet, from the pipeline's own posters. */
async function fromPosters(product, postersArg, sources) {
  const postersDir = await resolveDir(postersArg ?? 'output/posters')
  let files
  try {
    files = (await readdir(postersDir)).filter(
      (f) => f.startsWith(`${product}-`) && f.endsWith('-poster.webp'),
    )
  } catch {
    throw new Error(`No poster directory at ${postersDir}. Render the posters first.`)
  }
  if (files.length === 0) {
    // Not a silent skip: a run that converted nothing must not read as a success, or the
    // RUNBOOK step "run pnpm og:cards" passes while shipping no cards.
    throw new Error(
      `No posters matching ${product}-*-poster.webp in ${postersDir}.\n\n` +
        `  Found: ${(await readdir(postersDir)).join(', ') || '(nothing)'}\n\n` +
        '  Check the product slug, or pass --posters <dir>.',
    )
  }
  for (const file of files.sort()) {
    const colour = file.slice(product.length + 1).replace(/-poster\.webp$/, '')
    const bytes = await writeCard(product, colour, await readFile(join(postersDir, file)))
    sources[`${product}/${colour}`] = 'snapshot'
    console.log(`  ${product}/${colour}.jpg  snapshot  ${(bytes / 1024).toFixed(0)} KB`)
  }
  console.log('\nOnce the garment is live and its renders are uploaded, run --from-site for it.')
}

async function main() {
  const args = process.argv.slice(2)
  // `--` is skipped deliberately: pnpm forwards the separator itself into argv, so
  // `pnpm og:cards -- n001` would otherwise take '--' as the product slug.
  const postersAt = args.indexOf('--posters')
  const postersArg = postersAt === -1 ? undefined : args[postersAt + 1]
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && (postersAt === -1 || i !== postersAt + 1),
  )
  const sources = await readSources()
  if (args.includes('--from-site')) {
    await fromSite(positional[0], sources)
  } else if (positional[0]) {
    await fromPosters(positional[0], postersArg, sources)
  } else {
    throw new Error(
      'Usage: pnpm og:cards --from-site [<productSlug>]\n' +
        '       pnpm og:cards <productSlug> [--posters <dir>]\n\n' +
        '  --from-site reads each live colour from the garment API: its uploaded render,\n' +
        '  else its 3D poster. The poster form is for a garment that is not live yet.',
    )
  }
  const keys = await writeManifest(await readManifestFromDisk(sources))
  console.log(`\nManifest: apps/viewer/worker/og-cards.ts (${keys.length} card(s))`)
  console.log(
    'Commit both the JPEGs and the manifest. The Worker reads the manifest at\n' +
      'bundle time, so a card that is not listed there is never used.',
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`\n${error.message}\n`)
    process.exit(1)
  })
}
