#!/usr/bin/env node
/**
 * Colour accuracy: does each colour dot say what its cloth looks like?
 *
 * WHY THIS EXISTS. A colour's `hexSwatch` (the dot on the site, the card and the garment page)
 * is typed into the CMS by a person, while the cloth a buyer sees is the CLO render. Nothing
 * ever compared the two, so a dot could be a different colour from its garment and no gate,
 * test or reviewer would see it (plan 2026-10-26, Task 9). This script compares them for every
 * colour on the live site, with CIEDE2000 (`packages/shared/src/deltaE.ts`), and prints the
 * worst first. A difference above 10 is flagged: that is "a different colour", not "a slightly
 * different shade".
 *
 * HOW. Read, in this order, and only public data:
 *   1. `<origin>/sitemap.xml`  -> the live garments (every published product is listed there at
 *      its default colour: `apps/cms/src/app/sitemap.ts`);
 *   2. `<api>/api/public/viewer/<product>` -> that garment's active colours with `hexSwatch`
 *      and picture addresses (`apps/cms/src/endpoints/publicViewer.ts`; the API lives on
 *      cms.wear-run.help, not on the site's own host: measured 2026-10-26, the site answers
 *      404 for that path);
 *   3. each colour's poster picture on media.wear-run.com. Posters are transparent PNG-style
 *      WebP (measured 2026-10-26: 1200 x 1500, alpha 0 in all four corners), so the garment is
 *      the pixels that are opaque. A picture with no transparency falls back to "every pixel
 *      more than 6 away from the corner colour".
 *
 * READ-ONLY, ALWAYS. It issues GET requests and writes nothing: no file, no CMS field. A swatch
 * that is wrong is changed by the owner in the CMS, or by a scripted write that the owner has
 * said yes to (`.claude/rules/cms-scripted-writes.md`), never from here.
 *
 * WHAT THE NUMBER INCLUDES. The "cloth" colour is the MEDIAN of the garment's pixels, so it
 * carries the render's lighting and the garment's other colours. Measured 2026-10-26 over the
 * 200 colours that could be checked: the poster's cloth is DARKER than its dot in 193 of 200,
 * by a median of 15 L* (the studio renders: 191 of 196, median 19), and many garments are
 * two-tone ("Glow Pink / Deep End"), where the median is the larger panel while the dot names
 * one. So a flag means "the dot and the picture disagree", not yet "the dot is wrong": read
 * the row's lightness and the garment before changing a swatch.
 *
 * sharp (the decoder) is the asset pipeline's dependency, not this script's, so it is loaded
 * the way scripts/build-factory-photos.mjs loads it.
 *
 * Usage:
 *   node scripts/colour-accuracy.mjs --origin=https://wear-run.com
 *   node scripts/colour-accuracy.mjs --origin=https://wear-run.com --image=render
 *   (--api=<url> overrides https://cms.wear-run.help; --image=render prefers the studio
 *    render over the 3D poster)
 */

import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { deltaE2000, hexToLab, labToHex, rgbToLab } from '../packages/shared/src/deltaE.ts'

/** A difference above this is flagged. Strictly above: exactly 10 is not flagged. */
export const FLAG_ABOVE = 10

/** A pixel this far (CIEDE2000) from the corner colour counts as garment in an opaque picture. */
export const CORNER_DELTA_E = 6

/** Alpha at or above this is garment. Below it is the anti-aliased fringe or empty space. */
export const ALPHA_MIN = 250

/** Look at every 3rd pixel in both directions: 1/9 of the pixels, plenty for a median. */
export const SAMPLE_STEP = 3

/** Fewer garment pixels than this share of the sample means the picture is not a garment. */
const MIN_GARMENT_SHARE = 0.01

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Only our own hosts are fetched: the picture addresses come out of an API answer. */
const OWN_HOSTS = ['wear-run.com', 'wear-run.help']

/**
 * Middle value of a list of numbers (the mean of the two middle ones for an even count).
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (values.length === 0) throw new Error('median of nothing')
  const sorted = Float64Array.from(values).sort()
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * The median colour: the median of L, of a and of b taken separately.
 * @param {import('../packages/shared/src/deltaE.ts').Lab[]} labs
 * @returns {import('../packages/shared/src/deltaE.ts').Lab}
 */
export function medianLab(labs) {
  return {
    L: median(labs.map((c) => c.L)),
    a: median(labs.map((c) => c.a)),
    b: median(labs.map((c) => c.b)),
  }
}

/**
 * The garment's pixels, as Lab colours, from a decoded RGBA picture (4 bytes a pixel).
 *
 * A picture that uses transparency anywhere in the sample is cut out by it: the garment is the
 * opaque pixels. A picture with none has a painted background, so the garment is whatever
 * differs from the corner colour (the median of the four corners, so one stray corner pixel
 * cannot become "the background").
 *
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ step?: number }} [options]
 * @returns {{ labs: import('../packages/shared/src/deltaE.ts').Lab[], method: 'alpha' | 'corner', sampled: number }}
 */
export function garmentLabs(rgba, width, height, options = {}) {
  const step = options.step ?? SAMPLE_STEP
  const at = (x, y) => (y * width + x) * 4
  let usesAlpha = false
  let sampled = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      sampled += 1
      if (rgba[at(x, y) + 3] < 255) usesAlpha = true
    }
  }

  if (usesAlpha) {
    const labs = []
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = at(x, y)
        if (rgba[i + 3] >= ALPHA_MIN) labs.push(rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2]))
      }
    }
    return { labs, method: 'alpha', sampled }
  }

  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ].map(([x, y]) => rgbToLab(rgba[at(x, y)], rgba[at(x, y) + 1], rgba[at(x, y) + 2]))
  const background = medianLab(corners)
  const labs = []
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = at(x, y)
      const lab = rgbToLab(rgba[i], rgba[i + 1], rgba[i + 2])
      if (deltaE2000(lab, background) > CORNER_DELTA_E) labs.push(lab)
    }
  }
  return { labs, method: 'corner', sampled }
}

/**
 * Score one colour: the median garment colour against its swatch.
 *
 * @param {string} hexSwatch
 * @param {{ labs: import('../packages/shared/src/deltaE.ts').Lab[], sampled: number }} garment
 * @returns {{ clothHex: string, deltaE: number }}
 */
export function scoreColour(hexSwatch, garment) {
  if (garment.labs.length < Math.max(1, garment.sampled * MIN_GARMENT_SHARE)) {
    throw new Error(`only ${garment.labs.length} of ${garment.sampled} sampled pixels are garment`)
  }
  const cloth = medianLab(garment.labs)
  return { clothHex: labToHex(cloth), deltaE: deltaE2000(hexToLab(hexSwatch), cloth) }
}

/**
 * Worst first. Equal differences keep their order (Array.sort is stable), so a re-run on the
 * same site prints the same table.
 * @template {{ deltaE: number }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function sortWorstFirst(rows) {
  return [...rows].sort((p, q) => q.deltaE - p.deltaE)
}

/** @param {{ deltaE: number }} row */
export const isFlagged = (row) => row.deltaE > FLAG_ABOVE

/**
 * The garments the sitemap lists, as product slugs, in the sitemap's order. Only addresses on
 * `origin` count, and only `/products/<slug>` or `/products/<slug>/<colour>` with a valid slug.
 *
 * @param {string} xml
 * @param {string} origin e.g. https://wear-run.com
 * @returns {string[]}
 */
export function productSlugsFromSitemap(xml, origin) {
  const host = new URL(origin).host
  const slugs = new Set()
  for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    let url
    try {
      url = new URL(loc.trim())
    } catch {
      continue
    }
    if (url.host !== host) continue
    const [first, product] = url.pathname.split('/').filter(Boolean)
    if (first === 'products' && product && SLUG.test(product)) slugs.add(product)
  }
  return [...slugs]
}

/**
 * The picture to measure for one colour, and which kind it is. The poster by default (the 3D
 * view's picture, the one the plan names); `prefer: 'render'` tries the studio renders first.
 * Whichever is missing falls through to the next, and the kind comes back so the table can say
 * what was measured. An address on a host that is not ours is passed over.
 *
 * @param {{ poster?: { url?: string } | null, render?: { url?: string } | null, renderScreen?: { url?: string } | null }} colour
 * @param {'poster' | 'render'} [prefer]
 * @returns {{ url: string, kind: 'poster' | 'render-screen' | 'render' } | null}
 */
export function pickImage(colour, prefer = 'poster') {
  const poster = ['poster', colour.poster?.url]
  const screen = ['render-screen', colour.renderScreen?.url]
  const render = ['render', colour.render?.url]
  const order = prefer === 'render' ? [screen, render, poster] : [poster, screen, render]
  for (const [kind, url] of order) {
    if (typeof url === 'string' && isOwnHttpsUrl(url)) return { url, kind }
  }
  return null
}

/** @param {string} text */
export function isOwnHttpsUrl(text) {
  try {
    const url = new URL(text)
    return (
      url.protocol === 'https:' &&
      OWN_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    )
  } catch {
    return false
  }
}

/**
 * The text table, worst first. Fixed-width, no colour codes, so it reads the same on screen,
 * in a file and in a pull request.
 *
 * @param {{ product: string, colour: string, slug: string, swatch: string, clothHex: string, deltaE: number, image: string }[]} rows
 *   already sorted
 * @returns {string}
 */
export function formatTable(rows) {
  const header = ['DELTA-E', 'FLAG', 'PRODUCT', 'COLOUR', 'SLUG', 'SWATCH', 'CLOTH', 'IMAGE']
  const body = rows.map((row) => [
    row.deltaE.toFixed(1),
    isFlagged(row) ? 'FLAG' : '',
    row.product,
    row.colour,
    row.slug,
    row.swatch,
    row.clothHex,
    row.image,
  ])
  const widths = header.map((title, column) =>
    Math.max(title.length, ...body.map((line) => line[column].length)),
  )
  const line = (cells) =>
    cells
      .map((cell, column) =>
        column === 0 ? cell.padStart(widths[0]) : cell.padEnd(widths[column]),
      )
      .join('  ')
      .trimEnd()
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n')
}

/**
 * @param {string[]} argv
 * @returns {{ origin: string, api: string, prefer: 'poster' | 'render' }}
 */
export function parseArgs(argv) {
  const flags = new Map(
    argv.map((arg) => {
      const [name, ...rest] = arg.replace(/^--/, '').split('=')
      return [name, rest.join('=')]
    }),
  )
  const origin = (flags.get('origin') || '').replace(/\/$/, '')
  if (!origin) throw new Error('--origin=https://wear-run.com is required')
  const api = (flags.get('api') || 'https://cms.wear-run.help').replace(/\/$/, '')
  const image = flags.get('image') || 'poster'
  if (image !== 'poster' && image !== 'render') throw new Error('--image must be poster or render')
  return { origin, api, prefer: image }
}

const USER_AGENT = 'run-apparel-colour-accuracy (read-only)'

/**
 * GET with a timeout and one retry. Anything but a 200 is an error carrying the status.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function getBytes(url) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : lastError}`)
}

/**
 * Run `task` over `items`, at most `limit` at a time, keeping the results in order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} task
 * @returns {Promise<R[]>}
 */
async function mapLimit(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await task(items[index])
      }
    }),
  )
  return results
}

async function main() {
  const { origin, api, prefer } = parseArgs(process.argv.slice(2))
  const sharp = createRequire(resolve(import.meta.dirname, '../tools/asset-pipeline/package.json'))(
    'sharp',
  )

  const sitemap = (await getBytes(`${origin}/sitemap.xml`)).toString('utf8')
  const slugs = productSlugsFromSitemap(sitemap, origin)
  if (slugs.length === 0) throw new Error(`no garments found in ${origin}/sitemap.xml`)

  /** @type {{ product: string, productName: string, colours: any[] }[]} */
  const products = await mapLimit(slugs, 4, async (slug) => {
    const body = JSON.parse(
      (await getBytes(`${api}/api/public/viewer/${encodeURIComponent(slug)}`)).toString('utf8'),
    )
    return {
      product: slug,
      productName: body.product?.productName ?? slug,
      colours: body.colourways ?? [],
    }
  })

  const jobs = products.flatMap((p) => p.colours.map((colour) => ({ product: p.product, colour })))
  const skipped = []
  const results = await mapLimit(jobs, 6, async ({ product, colour }) => {
    const label = `${product}/${colour.slug}`
    const swatch = typeof colour.hexSwatch === 'string' ? colour.hexSwatch : ''
    if (!swatch) {
      skipped.push(`${label}: no hexSwatch`)
      return null
    }
    const image = pickImage(colour, prefer)
    if (!image) {
      skipped.push(`${label}: no picture to measure`)
      return null
    }
    try {
      const { data, info } = await sharp(await getBytes(image.url))
        .ensureAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true })
      const garment = garmentLabs(data, info.width, info.height)
      const { clothHex, deltaE } = scoreColour(swatch, garment)
      return {
        product,
        colour: colour.displayName ?? colour.slug,
        slug: colour.slug,
        swatch: swatch.toLowerCase(),
        clothHex,
        deltaE,
        image: image.kind,
      }
    } catch (error) {
      skipped.push(`${label}: ${error instanceof Error ? error.message : error}`)
      return null
    }
  })

  const rows = sortWorstFirst(results.filter((row) => row !== null))
  const flagged = rows.filter(isFlagged)
  console.log(`Colour accuracy, ${new Date().toISOString().slice(0, 10)}`)
  console.log(`site ${origin}, API ${api}, picture: ${prefer} first`)
  console.log(
    `${slugs.length} garments, ${jobs.length} colours, ${rows.length} checked, ${flagged.length} flagged (delta-E above ${FLAG_ABOVE}), ${skipped.length} skipped`,
  )
  console.log('')
  console.log(formatTable(rows))
  if (skipped.length > 0) {
    console.log('')
    console.log('Skipped, not checked:')
    for (const line of skipped.sort()) console.log(`  ${line}`)
  }
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
