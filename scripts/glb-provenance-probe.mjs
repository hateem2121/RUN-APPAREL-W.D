/**
 * Assert every live GLB's provenance: `asset.copyright` present and no
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
 */

import { LIVE_PRODUCTS } from './live-products.mjs'
import { resolveLiveModelUrl } from './poster-sizes.mjs'

/** Statuses that mean "ask again later", not "the model is broken" — same set every probe here uses. */
const INCONCLUSIVE_STATUSES = new Set([403, 429, 503])

/** A leftover string from the authoring tool has no business shipping to a customer. */
const BLOCKLIST = ['marvelous', 'clo3d', 'clo standalone', 'clo virtual', 'style3d']

/**
 * MEASURED, not guessed, against every live model's own chunk-length header
 * (2026-09-23): 409,272 (rxps/wine) · 380,600 (r-gtd/ash) · 358,836 (r-au/bone) ·
 * 287,980 · 283,608 · 277,896 · 269,644 · 263,256 · 244,228 · 205,736 · 191,616 ·
 * 152,824 · 146,440 · 125,032 · 123,300 · 99,544 bytes — largest is rxps/wine at
 * 409,272. The first version of this file guessed 300,000 (the plan's own
 * suggested default, unverified) and it silently truncated THREE of sixteen
 * models' JSON chunks, which `extractGlbJsonChunk` correctly reported as
 * "truncated" but the CLI wrapper then swallowed into a generic "unparseable" —
 * fixed below. This constant carries ~45% headroom over the largest chunk seen
 * rather than a razor margin, because a future re-export growing the JSON chunk
 * (more colourways, more materials) must fail LOUDLY as "truncated", not silently
 * as "unparseable".
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
 * Turn observations into a verdict. Pure — no network, so a planted fault can be
 * proven against a synthetic chunk rather than a live model.
 *
 * @param {{
 *   key: string,
 *   status?: number,
 *   jsonChunk?: string,
 *   error?: string,
 * }[]} observations
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

    lines.push(`  ${label} copyright "${copyright}" ok, no leftover strings`)
  }

  return { ok: failures.length === 0, measured, failures, inconclusive, lines }
}

/** One target's ranged GET, model URL resolved live, chunk extracted. */
async function probeOne(target) {
  const resolved = await resolveLiveModelUrl(target.slug, target.colourway)
  if ('error' in resolved) return { key: target.key, error: resolved.error }

  let response
  try {
    response = await fetch(resolved.url, {
      headers: { range: `bytes=0-${INITIAL_RANGE_BYTES - 1}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    return { key: target.key, error: error.message ?? String(error) }
  }
  if (!response.ok) {
    await response.body?.cancel()
    return { key: target.key, status: response.status }
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  const extracted = extractGlbJsonChunk(bytes)
  // A truncated/malformed chunk is a DIFFERENT problem from "no leftover text found" and
  // must say so by name — folding it into an empty jsonChunk (-> generic "unparseable")
  // hid a real bug here: three of sixteen live models' JSON chunks turned out larger than
  // the first INITIAL_RANGE_BYTES guess, measured 2026-09-23.
  if ('error' in extracted)
    return { key: target.key, status: response.status, error: extracted.error }
  return { key: target.key, status: response.status, jsonChunk: extracted.text }
}

export async function probe(targets = TARGETS) {
  return Promise.all(targets.map(probeOne))
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  // A single `<product>/<colourway>` argument runs one model — the RUNBOOK spot-check
  // shape (Task 3, Step 5) — instead of the full catalogue.
  const arg = process.argv[2]
  const targets = arg
    ? (() => {
        const [slug, colourway] = arg.split('/')
        return [{ key: arg, slug, colourway }]
      })()
    : TARGETS

  const observations = await probe(targets)
  const { ok, measured, failures, inconclusive, lines } = evaluate(observations)

  console.log('glb provenance probe — copyright present, no CLO/Marvelous Designer leftovers\n')
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
