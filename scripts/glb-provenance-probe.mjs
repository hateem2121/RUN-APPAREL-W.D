/**
 * Assert each live product's GLB provenance: `asset.copyright` present and no
 * CLO/Marvelous Designer leftover string anywhere in its JSON chunk (SE-16).
 *
 * WHY THIS EXISTS. `tools/asset-pipeline/src/strip-live-metadata.ts` writes
 * `asset.copyright` at BUILD time, only when absent — so every processed model
 * should carry it, but nothing re-checks this on the LIVE files after the fact. A
 * spot check on one of sixteen live products found the right copyright string and
 * no leftover text — correct, but a one-time read proves nothing about tomorrow's
 * re-export, which is what a re-shrunk garment always is (root CLAUDE.md: "Never
 * run the pipeline on its own output — always start from the raw CLO export").
 *
 * SHAPE, matching this repo's other probes: a `TARGETS` list resolved from
 * `LIVE_PRODUCTS` (never hardcoded — a hardcoded list rots the moment a product
 * changes), a pure `evaluate(observations)`, and a thin CLI `main()`. Reuses
 * `resolveLiveModelUrl` from `poster-sizes.mjs` for the SAME reason
 * `zone-security-probe.mjs`'s `samplesFromPayload` is the one place that resolution
 * logic lives — see that file's own docblock (lines 91-112): `product.glbUrl` is
 * the shared single-GLB-variants URL; in separate-file mode the model sits on the
 * COLOURWAY instead, and `product.glbUrl` is null there BY CONSTRUCTION.
 *
 * HOW THE JSON CHUNK IS FOUND. Rather than guess a byte count and hope it is
 * enough, this PARSES the real GLB chunk header (12-byte file header, then
 * [uint32 length][uint32 type][payload] — the same layout
 * `strip-live-metadata.ts`'s `readChunks` reads) out of a generous initial ranged
 * GET, and reports "truncated" explicitly if a model's declared JSON chunk turns
 * out to be longer than what was fetched, rather than silently reading a partial
 * (and therefore unparseable, or worse, only PARTIALLY parseable) chunk.
 *
 * WHAT COUNTS AS A FAIL: `asset.copyright` missing or empty, or any of a short
 * blocklist (`marvelous`, `clo3d`, `clo standalone`, `clo virtual`, `style3d`)
 * appearing case-insensitively ANYWHERE in the decoded JSON chunk — not only in the
 * copyright field, because a leftover can just as easily sit in a stray material or
 * node name.
 *
 * WHAT IS INCONCLUSIVE, never a pass or a fail: a 403/429/503 (Bot Fight Mode), a
 * network error, or a chunk that could not be parsed as JSON at all (a genuinely
 * different problem from "no leftover text found" and must not read as clean).
 *
 * ⚠️ COVERAGE IS EACH PRODUCT'S DEFAULT COLOURWAY ONLY, not every colourway it has. In
 * separate-file mode a product's OTHER colourways each carry their own `glbUrl` on
 * `colourways[]` in the same payload, and `resolveLiveModelUrl` only ever resolves the
 * one colourway `TARGETS` names (LIVE_PRODUCTS' default). A leftover string or a missing
 * copyright on a non-default colourway's export is invisible to this run.
 */

import { LIVE_PRODUCTS } from './live-products.mjs'
import { judgePosters } from './poster-sizes.mjs'

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')

/** Statuses that mean "ask again later", not "the model is broken" — same set every probe here uses. */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** A leftover string from the authoring tool has no business shipping to a customer. */
const BLOCKLIST = ['marvelous', 'clo3d', 'clo standalone', 'clo virtual', 'style3d']

/**
 * CLO's own keys (IM-10). A text blocklist cannot see these: they are structure, not
 * words, and each is what `tools/asset-pipeline/src/strip-live-metadata.ts` removes.
 */
export const LEFTOVER_KEYS = ['globalMap', 'PhysicalPropertyList', 'SeamLinePairList', 'MetaData']

/**
 * The ONLY `extras` keys a finished model may carry, each where our own pipeline writes
 * it. Allow-listed by name AND place, never `extras` wholesale, so a real future leak
 * cannot hide behind them. Measured on all 16 live models 2026-09-25: `depthBias` 183
 * times (material extras, `overlay-annotate.ts`, the decal protection) and `uvRemap`
 * 1,592 times (mesh-primitive extras, `uv-remap.ts`); nothing else.
 */
export const ALLOWED_EXTRAS = { materials: ['depthBias'], primitives: ['uvRemap'] }

/** A raw Windows drive path (`D:/…`, `C:\\…`) is a CLO export leaking the author's disk. */
const DRIVE_PATH = /^[A-Za-z]:[\\/]/

/**
 * Pure: every CLO leftover in a parsed glTF JSON chunk, as readable paths.
 * @param {unknown} gltf
 * @returns {string[]}
 */
export function findLeftovers(gltf) {
  const hits = []
  const walk = (node, path, place) => {
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, `${path}[${index}]`, place))
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        const at = path ? `${path}.${key}` : key
        if (LEFTOVER_KEYS.includes(key)) hits.push(`${at} (a CLO key)`)
        if (key === 'extras' && value && typeof value === 'object') {
          const allowed = ALLOWED_EXTRAS[place] ?? []
          for (const extra of Object.keys(value)) {
            if (!allowed.includes(extra)) hits.push(`${at}.${extra} (unexpected extras key)`)
          }
        }
        const nextPlace =
          key === 'materials' ? 'materials' : key === 'primitives' ? 'primitives' : place
        walk(value, at, key === 'extras' ? place : nextPlace)
      }
      return
    }
    if (typeof node === 'string' && DRIVE_PATH.test(node)) hits.push(`${path} (a raw drive path)`)
  }
  walk(gltf, '', 'root')
  return hits
}

/**
 * Pure: every distinct model file a product serves. Single-GLB-variants mode shares
 * `product.glbUrl` across colourways; separate-file mode puts one on each colourway and
 * leaves `product.glbUrl` null BY CONSTRUCTION. Both are read, so every colourway's file
 * is covered, not only the default's (measured 2026-09-25: all 16 live products serve
 * one shared file).
 * @param {unknown} body `GET /api/public/viewer/<product>`
 * @returns {string[]}
 */
export function modelUrlsFromPayload(body) {
  const payload = /** @type {any} */ (body)
  const urls = [
    payload?.product?.glbUrl,
    payload?.selectedColourway?.glbUrl,
    ...(payload?.colourways ?? []).map((colourway) => colourway?.glbUrl),
  ]
  return [...new Set(urls.filter((url) => typeof url === 'string' && url.length > 0))]
}

/**
 * Pure: IM-02b for models. The posters' own rule (`judgePosters`: each file against its
 * family's median, flagged at 2x), with no owner exceptions: none has been granted for
 * a model. Measured 2026-09-25: 1.89-8.14 MB, worst 1.66x its family median, 0 flagged.
 * @param {Observation[]} observations
 */
export function judgeModelSizes(observations) {
  const samples = observations
    .filter((o) => typeof o.bytes === 'number' && o.bytes > 0 && o.family)
    // `slug` is the PRODUCT (r-wzu), not the label (r-wzu/blush): exceptions are keyed on
    // the product, so only a product slug makes `exceptions: []` the thing that refuses the
    // vest's poster exception. With the label here that test passed with the guard removed.
    .map((o) => ({
      slug: String(o.slug ?? o.key),
      colour: o.slug ? o.key.slice(o.slug.length + 1) : '',
      family: String(o.family),
      bytes: Number(o.bytes),
    }))
  return judgePosters(samples, { exceptions: [] })
}

/** A second GET must come from the edge; one MISS alone is a cold file, not a fault. */
const CACHED = new Set(['HIT', 'REVALIDATED'])

/**
 * MEASURED, not guessed, against every live model's own chunk-length header
 * (2026-09-23): 409,272 (rxps/wine) · 380,600 (r-gtd/ash) · 358,836 (r-au/bone) ·
 * 287,980 · 283,608 · 277,896 · 269,644 · 263,256 · 244,228 · 205,736 · 191,616 ·
 * 152,824 · 146,440 · 125,032 · 123,300 · 99,544 bytes — largest is rxps/wine at
 * 409,272. The first version of this file guessed 300,000 (an unverified default)
 * and it silently truncated THREE of sixteen
 * models' JSON chunks, which `extractGlbJsonChunk` correctly reported as
 * "truncated" but the CLI wrapper then swallowed into a generic "unparseable" —
 * fixed below. This constant carries ~45% headroom over the largest chunk seen
 * rather than a razor margin, because a future re-export growing the JSON chunk
 * (more colourways, more materials) must be reported, distinctly, as "truncated" —
 * inconclusive rather than a pass, and naming the real cause by name — rather than
 * folded silently into the generic "unparseable" a plain partial chunk would
 * otherwise produce. Neither reading is a FAILURE: both mean this probe could not
 * get a clean look, which a human resolves by raising this constant, not by
 * treating the model itself as suspect.
 */
const INITIAL_RANGE_BYTES = 600_000

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

/** Every live product's default colourway, resolved from LIVE_PRODUCTS — never hardcoded. */
export const TARGETS = LIVE_PRODUCTS.map((p) => ({
  key: `${p.slug}/${p.colourway}`,
  slug: p.slug,
  colourway: p.colourway,
}))

/**
 * Pure: read the JSON chunk out of a GLB's opening bytes, per the glTF 2.0 binary
 * layout (the JSON chunk is always first). Does not decode BIN — nothing here
 * needs geometry.
 *
 * @param {Uint8Array} bytes A prefix of the file. Must cover the header plus the
 *   whole declared JSON chunk length, or this reports an error naming that.
 * @returns {{ text: string } | { error: string }}
 */
export function extractGlbJsonChunk(bytes) {
  if (bytes.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) {
    return { error: `too few bytes (${bytes.byteLength}) to hold a GLB header` }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    return { error: 'not a GLB (bad magic)' }
  }
  const chunkLength = view.getUint32(HEADER_BYTES, true)
  const chunkType = view.getUint32(HEADER_BYTES + 4, true)
  if (chunkType !== CHUNK_JSON) {
    return { error: `first chunk is not JSON (type 0x${chunkType.toString(16)})` }
  }
  const jsonStart = HEADER_BYTES + CHUNK_HEADER_BYTES
  const jsonEnd = jsonStart + chunkLength
  if (bytes.byteLength < jsonEnd) {
    return {
      error:
        `truncated — the JSON chunk is ${chunkLength} bytes but only ` +
        `${bytes.byteLength - jsonStart} were fetched; raise INITIAL_RANGE_BYTES`,
    }
  }
  return { text: new TextDecoder('utf-8').decode(bytes.subarray(jsonStart, jsonEnd)) }
}

/**
 * One model file as the probe saw it. Every field but `key` is optional: an unreadable
 * file carries only `error`, a unit fixture only what it models.
 *
 * @typedef {{
 *   key: string,
 *   slug?: string,
 *   family?: string,
 *   status?: number,
 *   jsonChunk?: string,
 *   error?: string,
 *   bytes?: number,
 *   cache?: string[],
 * }} Observation
 */

/**
 * Turn observations into a verdict. Pure — no network, so a planted fault can be
 * proven against a synthetic chunk rather than a live model.
 *
 * @param {Observation[]} observations
 * @returns {{ ok: boolean, measured: number, failures: string[], inconclusive: string[], lines: string[] }}
 */
export function evaluate(observations) {
  const failures = []
  const inconclusive = []
  const lines = []
  let measured = 0

  for (const o of observations) {
    const label = o.key.padEnd(20)

    if (o.error) {
      inconclusive.push(`${o.key}: could not fetch the model (${o.error}). NOT a pass.`)
      lines.push(`  ${label} unreadable — inconclusive`)
      continue
    }
    if (o.status !== undefined && INCONCLUSIVE_STATUSES.has(o.status)) {
      inconclusive.push(
        `${o.key}: the model answered HTTP ${o.status} — Bot Fight Mode, inconclusive rather than a failure.`,
      )
      lines.push(`  ${label} ${o.status} — inconclusive`)
      continue
    }
    if (o.status !== undefined && (o.status < 200 || o.status >= 300)) {
      inconclusive.push(`${o.key}: the model answered HTTP ${o.status}. NOT a pass.`)
      lines.push(`  ${label} ${o.status} — inconclusive`)
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(o.jsonChunk ?? '')
    } catch {
      inconclusive.push(
        `${o.key}: the JSON chunk is unparseable. NOT a pass — a genuinely different problem ` +
          'from "no leftover text found".',
      )
      lines.push(`  ${label} unparseable chunk — inconclusive`)
      continue
    }
    measured += 1

    const lower = (o.jsonChunk ?? '').toLowerCase()
    const hit = BLOCKLIST.find((term) => lower.includes(term))
    if (hit) {
      failures.push(
        `${o.key}: the JSON chunk contains "${hit}" — a CLO/Marvelous Designer leftover string ` +
          'that has no business shipping to a customer (not necessarily in asset.copyright; ' +
          'check every string field, e.g. a stray material or node name).',
      )
      lines.push(`  ${label} blocklist hit "${hit}"  FAIL`)
      continue
    }

    const copyright = parsed?.asset?.copyright
    if (typeof copyright !== 'string' || copyright.trim().length === 0) {
      failures.push(`${o.key}: asset.copyright is missing or empty.`)
      lines.push(`  ${label} copyright MISSING  FAIL`)
      continue
    }

    const leftovers = findLeftovers(parsed)
    if (leftovers.length > 0) {
      failures.push(`${o.key}: CLO leftovers in the model: ${leftovers.slice(0, 5).join('; ')}.`)
      lines.push(`  ${label} ${leftovers.length} leftover(s)  FAIL`)
      continue
    }

    // Read off the GETs' own headers, never a HEAD (root CLAUDE.md). Absent in unit
    // fixtures that do not model caching, so only judged when present.
    if (Array.isArray(o.cache) && !o.cache.some((status) => CACHED.has(String(status)))) {
      failures.push(
        `${o.key}: not served from the edge cache on a repeat GET (cf-cache-status ` +
          `${o.cache.join(' then ')}); every visitor would pull the model from R2.`,
      )
      lines.push(`  ${label} cache ${o.cache.join('/')}  FAIL`)
      continue
    }

    const size = typeof o.bytes === 'number' ? ` ${(o.bytes / 1e6).toFixed(2)} MB,` : ''
    const cache = Array.isArray(o.cache) ? ` cache ${o.cache.join('/')},` : ''
    lines.push(`  ${label}${size}${cache} copyright "${copyright}" ok, no leftovers`)
  }

  return { ok: failures.length === 0, measured, failures, inconclusive, lines }
}

/** One product: its payload, then every distinct model file it serves. */
/** @returns {Promise<Observation[]>} */
async function probeOne(target) {
  let body
  try {
    const response = await fetch(
      `${API_BASE}/api/public/viewer/${target.slug}/${target.colourway}`,
      {
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!response.ok)
      return [{ key: target.key, error: `viewer payload answered ${response.status}` }]
    body = await response.json()
  } catch (error) {
    return [{ key: target.key, error: error.message ?? String(error) }]
  }
  const urls = modelUrlsFromPayload(body)
  if (urls.length === 0) return [{ key: target.key, error: 'the live payload named no model' }]
  const family = String(/** @type {any} */ (body)?.product?.category ?? '')
  const observations = []
  for (const [index, url] of urls.entries()) {
    const key = urls.length === 1 ? target.key : `${target.key}#${index + 1}`
    observations.push({ ...(await probeUrl(key, url)), family, slug: target.slug })
  }
  return observations
}

/** One model file: a ranged GET for the JSON chunk and size, then a 1-byte GET for the cache. */
/** @returns {Promise<Observation>} */
async function probeUrl(key, url) {
  let response
  try {
    response = await fetch(url, {
      headers: { range: `bytes=0-${INITIAL_RANGE_BYTES - 1}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    return { key, error: error.message ?? String(error) }
  }
  // ⚠️ ONLY 206 PROVES THE SERVER HONOURED THE RANGE REQUEST. A 200 is still `.ok` —
  // some servers answer a Range header with the FULL body instead of a 206 Partial
  // Content — and reading that whole would defeat the ranged GET's entire purpose
  // (a bounded download against a model that can be tens of MB). Cancelled and
  // reported, never read, whichever status comes back.
  if (response.status !== 206) {
    await response.body?.cancel()
    if (response.status === 200) {
      return {
        key,
        status: response.status,
        error:
          'the server answered 200 (not 206) to a ranged request — ignored the Range ' +
          'header rather than honouring it, so the body was never read',
      }
    }
    return { key, status: response.status }
  }
  const total = Number((response.headers.get('content-range') ?? '').split('/')[1])
  const firstCache = response.headers.get('cf-cache-status') ?? 'none'
  const bytes = new Uint8Array(await response.arrayBuffer())
  const extracted = extractGlbJsonChunk(bytes)
  // A truncated/malformed chunk is a DIFFERENT problem from "no leftover text found" and
  // must say so by name — folding it into an empty jsonChunk (-> generic "unparseable")
  // hid a real bug here: three of sixteen live models' JSON chunks turned out larger than
  // the first INITIAL_RANGE_BYTES guess, measured 2026-09-23.
  if ('error' in extracted) return { key, status: response.status, error: extracted.error }

  // The first GET can be the one that warms a cold file; the second must be a HIT.
  let secondCache = 'none'
  try {
    const again = await fetch(url, {
      headers: { range: 'bytes=0-0' },
      signal: AbortSignal.timeout(20_000),
    })
    secondCache = again.headers.get('cf-cache-status') ?? 'none'
    await again.body?.cancel()
  } catch {
    secondCache = 'unreadable'
  }
  return {
    key,
    status: response.status,
    jsonChunk: extracted.text,
    bytes: Number.isFinite(total) && total > 0 ? total : undefined,
    cache: [firstCache, secondCache],
  }
}

/** @returns {Promise<Observation[]>} */
export async function probe(targets = TARGETS) {
  return (await Promise.all(targets.map(probeOne))).flat()
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  // A single `<product>/<colourway>` argument runs one model — the RUNBOOK spot-check
  // shape (docs/RUNBOOK.md) — instead of the full catalogue.
  const arg = process.argv[2]
  const targets = arg
    ? (() => {
        const [slug, colourway] = arg.split('/')
        return [{ key: arg, slug, colourway }]
      })()
    : TARGETS

  const observations = await probe(targets)
  const { ok: provenanceOk, measured, failures, inconclusive, lines } = evaluate(observations)
  // IM-02b: each model against its family's median, the posters' own rule.
  const sizes = judgeModelSizes(observations)
  for (const row of sizes.flagged)
    failures.push(`${row.slug} ${row.colour}: model size ${row.note}.`)
  const ok = provenanceOk && sizes.flagged.length === 0

  console.log(
    'glb provenance probe — copyright, no CLO leftovers, edge-cached, size within its family\n',
  )
  for (const [family, value] of Object.entries(sizes.medians)) {
    console.log(`  ${family.padEnd(20)} median ${(value / 1e6).toFixed(2)} MB`)
  }
  console.log()
  for (const line of lines) console.log(line)

  if (inconclusive.length) {
    console.log('\ninconclusive (NOT a pass, NOT a failure):')
    for (const note of inconclusive) console.log(`  - ${note}`)
  }

  if (!ok) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }

  if (measured === 0) {
    console.log(
      '::warning::glb-provenance-probe reached NO model — this run asserted nothing about ' +
        'provenance. Not a failure (datacenter IPs are blocked intermittently), but do not read ' +
        'the green tick as evidence.',
    )
    console.log(`\n⚠ 0 of ${observations.length} models measured. Nothing was verified.`)
  } else {
    console.log(`\n✓ ${measured}/${observations.length} models measured: provenance clean.`)
  }
}
