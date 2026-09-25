#!/usr/bin/env node
/**
 * Report how heavy each live product's posters are, against its OWN family's
 * median (audit L-11/IM-02).
 *
 * WHY A MEDIAN PER FAMILY, NOT ONE NUMBER FOR THE WHOLE CATALOGUE. A teamwear kit's
 * poster carries more print than a plain tee, and comparing every product against
 * one catalogue-wide average would flag every kit forever. `category` (Sportswear,
 * Outerwear, …) is the grouping the CMS already uses, so "too big" means too big
 * for its OWN kind of garment.
 *
 * WHY AN EXCEPTION LIST RATHER THAN A HIGHER CEILING. Raising FLAG_AT to stop
 * flagging `r-wzu` would stop catching the same problem on every other product.
 * The owner's 2026-09-17 call on "Shrink gently" ("the vest keeps its detail") is
 * ONE product with its OWN ceiling, on the record in OWNER_EXCEPTIONS below — not a
 * global loosening. An exception still has a ceiling: past it, the product is
 * flagged same as anything else.
 *
 * Reads production, writes nothing — this script never uploads or PATCHes
 * anything. See scripts/shrink-posters-gently.mjs for the script that re-encodes
 * the two products this one already found.
 *
 * Usage:
 *   node scripts/poster-sizes.mjs             # exits 1 if anything is flagged
 *   node scripts/poster-sizes.mjs --report     # same table, always exits 0
 */
import { pathToFileURL } from 'node:url'
import { LIVE_PRODUCTS } from './live-products.mjs'

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const REPORT = process.argv.includes('--report')

/**
 * Pure: pull the model URL a real viewer load would use out of an already-fetched
 * live payload.
 *
 * Same fallback `zone-security-probe.mjs`'s `samplesFromPayload` uses
 * (scripts/zone-security-probe.mjs:91-112): `product.glbUrl` is the shared URL
 * single-GLB-variants mode writes; in separate-file mode the model sits on the
 * COLOURWAY instead, and `product.glbUrl` is null there BY CONSTRUCTION, not a
 * missing value. Without the fallback this silently stops resolving anything the
 * day a product switches mode.
 *
 * @param {unknown} body `GET /api/public/viewer/<product>/<colourway>`
 * @returns {{ url: string } | { error: string }}
 */
export function modelUrlFromPayload(body) {
  const payload = /** @type {any} */ (body)
  const url = payload?.product?.glbUrl ?? payload?.selectedColourway?.glbUrl
  if (typeof url !== 'string' || url.length === 0) {
    return { error: 'the live payload named no model' }
  }
  return { url }
}

/**
 * Fetch one product+colourway's viewer payload and resolve its model URL.
 *
 * SHARED HELPER — a live-model-URL resolver two separate pieces of work both need
 * and neither found already built. Exported by this exact name and signature so a
 * second caller can import it rather than re-deriving it: `resolveLiveModelUrl(slug,
 * colourway, { apiBase? }) => Promise<{ url: string } | { error: string }>`.
 *
 * @param {string} slug
 * @param {string} colourway
 * @param {{ apiBase?: string }} [options]
 * @returns {Promise<{ url: string } | { error: string }>}
 */
export async function resolveLiveModelUrl(slug, colourway, { apiBase = API_BASE } = {}) {
  try {
    const response = await fetch(`${apiBase}/api/public/viewer/${slug}/${colourway}`, {
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return { error: `viewer payload answered ${response.status}` }
    const body = await response.json()
    return modelUrlFromPayload(body)
  } catch (error) {
    return { error: error.message ?? String(error) }
  }
}

/** A poster this many times (or more) its family's median is worth a look. */
export const FLAG_AT = 2

/**
 * Products the owner has looked at and accepted, each with its OWN ceiling.
 * Still judged — see judgePosters: past `maxRatio`, the exception stops covering it
 * and the row is flagged same as anything else.
 */
export const OWNER_EXCEPTIONS = [
  {
    product: 'r-wzu',
    maxRatio: 3,
    reason: 'owner\'s choice on 2026-09-17, "Shrink gently": the vest keeps its detail',
  },
]

/**
 * @param {number[]} values
 * @returns {number} 0 for an empty list; the mean of the two middle values for an
 *   even count.
 */
export function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Pure: judge each poster against its OWN family's median. No network — the network
 * half lives in collectPosters() below, kept separate so this can be unit-tested
 * against fixed numbers instead of a live fetch.
 *
 * @param {import('./poster-sizes.d.mts').PosterSample[]} posters
 * @param {{ exceptions?: import('./poster-sizes.d.mts').OwnerException[] }} [options]
 * @returns {import('./poster-sizes.d.mts').PosterJudgement}
 */
export function judgePosters(posters, { exceptions = OWNER_EXCEPTIONS } = {}) {
  const byFamily = new Map()
  for (const poster of posters) {
    const bucket = byFamily.get(poster.family) ?? []
    bucket.push(poster.bytes)
    byFamily.set(poster.family, bucket)
  }
  const medians = {}
  for (const [family, values] of byFamily) medians[family] = median(values)

  const rows = posters.map((poster) => {
    const familyMedian = medians[poster.family] ?? 0
    const ratio = familyMedian > 0 ? poster.bytes / familyMedian : 0
    const exception = exceptions.find((row) => row.product === poster.slug)
    const at = `${ratio.toFixed(2)}× the ${poster.family} median (${familyMedian})`

    if (ratio < FLAG_AT) return { ...poster, ratio, verdict: 'ok', note: at }
    if (exception) {
      // The exception still has a ceiling. Past it, this product is flagged same
      // as anything else — "gentler", not "unlimited".
      if (ratio <= exception.maxRatio) {
        return { ...poster, ratio, verdict: 'excepted', note: `${at} — ${exception.reason}` }
      }
      return {
        ...poster,
        ratio,
        verdict: 'flagged',
        note: `${at}, above the ${exception.maxRatio}× exception ceiling`,
      }
    }
    return { ...poster, ratio, verdict: 'flagged', note: at }
  })

  return {
    rows,
    medians,
    flagged: rows.filter((row) => row.verdict === 'flagged'),
    excepted: rows.filter((row) => row.verdict === 'excepted'),
  }
}

/**
 * IM-03: what every poster must BE, read from its bytes and its own GET's headers, never
 * from a filename or a CMS field. Measured on all 80 live posters 2026-09-25: image/webp,
 * 1200x1500 (VP8X header), `max-age=604800`, served from the edge. The lifetime floor is
 * that measured 7 days: a shorter one is a regression, not a choice this check should
 * bless.
 */
export const POSTER_WIDTH = 1200
export const POSTER_HEIGHT = 1500
export const MIN_MAX_AGE_SECONDS = 604_800

/**
 * Pure: a WebP's pixel size from its first 30 bytes (RIFF header, then a VP8X, VP8 or
 * VP8L chunk, per Google's WebP container spec). `null` when it is not a WebP.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function webpDimensions(bytes) {
  if (bytes.length < 30) return null
  const text = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length))
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') return null
  const u24 = (o) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)
  const chunk = text(12, 4)
  if (chunk === 'VP8X') return { width: 1 + u24(24), height: 1 + u24(27) }
  if (chunk === 'VP8 ') {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return null
}

/**
 * Pure: every way one poster falls short, as readable sentences. Empty = fine.
 * @param {{ head: Uint8Array, contentType: string | null, cacheControl: string | null, cache: string[] }} poster
 * @returns {string[]}
 */
export function judgePosterContent({ head, contentType, cacheControl, cache }) {
  const problems = []
  if (!String(contentType ?? '').startsWith('image/webp')) {
    problems.push(`served as ${contentType ?? 'no content-type'}, not image/webp`)
  }
  const size = webpDimensions(head)
  if (!size) problems.push('the bytes are not a WebP image')
  else if (size.width !== POSTER_WIDTH || size.height !== POSTER_HEIGHT) {
    problems.push(`${size.width}x${size.height}, not ${POSTER_WIDTH}x${POSTER_HEIGHT}`)
  }
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl ?? '')?.[1] ?? 0)
  if (maxAge < MIN_MAX_AGE_SECONDS) {
    problems.push(`cache-control "${cacheControl ?? ''}" keeps it under 7 days`)
  }
  if (!cache.some((status) => status === 'HIT' || status === 'REVALIDATED')) {
    problems.push(`not served from the edge cache (cf-cache-status ${cache.join(' then ')})`)
  }
  return problems
}

/**
 * All network lives here. Every LIVE_PRODUCTS row's viewer payload, then a plain
 * GET of each colourway's poster bytes — the same request shape a browser makes,
 * so `cf-cache-status` and friends read the way root CLAUDE.md says to trust them.
 *
 * @returns {Promise<{ posters: import('./poster-sizes.d.mts').PosterSample[], unreadable: string[], contentProblems: string[] }>}
 */
async function collectPosters() {
  const posters = []
  const unreadable = []
  const contentProblems = []
  for (const { slug } of LIVE_PRODUCTS) {
    const response = await fetch(`${API_BASE}/api/public/viewer/${slug}`)
    if (!response.ok) {
      unreadable.push(`${slug}: viewer payload answered ${response.status}`)
      continue
    }
    const body = await response.json()
    const family = String(body?.product?.category ?? '')
    for (const colourway of body?.colourways ?? []) {
      const colour = String(colourway?.slug ?? '')
      const url = colourway?.poster?.url
      if (!url) {
        unreadable.push(`${slug} ${colour}: no poster url in the payload`)
        continue
      }
      const posterResponse = await fetch(url)
      if (!posterResponse.ok) {
        unreadable.push(`${slug} ${colour}: poster answered ${posterResponse.status}`)
        continue
      }
      const body = new Uint8Array(await posterResponse.arrayBuffer())
      // Read off this GET's own headers (root CLAUDE.md: never a HEAD). A first MISS only
      // means the file was cold; a second, one-byte GET must then come from the edge.
      const cache = [posterResponse.headers.get('cf-cache-status') ?? 'none']
      if (cache[0] !== 'HIT') {
        const again = await fetch(url, { headers: { range: 'bytes=0-0' } })
        cache.push(again.headers.get('cf-cache-status') ?? 'none')
        await again.body?.cancel()
      }
      const problems = judgePosterContent({
        head: body.slice(0, 64),
        contentType: posterResponse.headers.get('content-type'),
        cacheControl: posterResponse.headers.get('cache-control'),
        cache,
      })
      for (const problem of problems) contentProblems.push(`${slug} ${colour}: ${problem}`)
      posters.push({ slug, colour, family, bytes: body.byteLength })
    }
  }
  return { posters, unreadable, contentProblems }
}

function printTable(rows) {
  for (const row of rows) {
    console.log(
      `  ${row.slug.padEnd(8)} ${row.colour.padEnd(14)} ${row.family.padEnd(20)} ` +
        `${String(row.bytes).padStart(7)} B  ${row.verdict.padEnd(9)} ${row.note}`,
    )
  }
}

async function main() {
  const { posters, unreadable, contentProblems } = await collectPosters()
  const { rows, medians, flagged, excepted } = judgePosters(posters)

  console.log(`poster weight — per-family median (${new Date().toISOString().slice(0, 10)})\n`)
  for (const [family, value] of Object.entries(medians)) {
    const count = posters.filter((poster) => poster.family === family).length
    console.log(`  ${family.padEnd(20)} median ${value} B  (${count} posters)`)
  }
  console.log()
  printTable(rows)

  if (unreadable.length > 0) {
    console.log('\nunreadable:')
    for (const line of unreadable) console.log(`  - ${line}`)
  }
  if (contentProblems.length > 0) {
    console.log('\nposter content (IM-03: WebP, 1200x1500, 7-day cache, edge-cached):')
    for (const line of contentProblems) console.log(`  - ${line}`)
  }
  console.log(
    `\n${flagged.length} flagged, ${excepted.length} excepted, ${unreadable.length} unreadable, ` +
      `${contentProblems.length} content problem(s) across ${posters.length} posters.`,
  )

  if (REPORT) process.exit(0)
  if (unreadable.length > 0) process.exit(2)
  if (flagged.length > 0 || contentProblems.length > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`poster-sizes: ${error instanceof Error ? error.message : String(error)}`)
    // A thrown error here means something could not be READ — a fetch that never
    // got a response, or response.json() failing on a non-JSON body (a Cloudflare
    // challenge page, say) — never that a poster was judged too heavy. That is
    // exactly the `unreadable` exit code below, not the `flagged` one (docs/RUNBOOK.md
    // "Is a poster too heavy?": "2 if anything could not be read"). Before this fix
    // both cases exited 1, so the RUNBOOK's own documented contract did not hold.
    process.exit(2)
  })
}
