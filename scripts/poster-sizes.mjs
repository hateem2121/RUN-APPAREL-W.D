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
 * All network lives here. Every LIVE_PRODUCTS row's viewer payload, then a plain
 * GET of each colourway's poster bytes — the same request shape a browser makes,
 * so `cf-cache-status` and friends read the way root CLAUDE.md says to trust them.
 *
 * @returns {Promise<{ posters: import('./poster-sizes.d.mts').PosterSample[], unreadable: string[] }>}
 */
async function collectPosters() {
  const posters = []
  const unreadable = []
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
      const bytes = (await posterResponse.arrayBuffer()).byteLength
      posters.push({ slug, colour, family, bytes })
    }
  }
  return { posters, unreadable }
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
  const { posters, unreadable } = await collectPosters()
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
  console.log(
    `\n${flagged.length} flagged, ${excepted.length} excepted, ${unreadable.length} unreadable.`,
  )

  if (REPORT) process.exit(0)
  if (unreadable.length > 0) process.exit(2)
  if (flagged.length > 0) process.exit(1)
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
