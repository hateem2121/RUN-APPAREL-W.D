#!/usr/bin/env node
/**
 * Is the live viewer actually serving a garment right now?
 *
 * WHY THIS EXISTS. "Is the site up?" has a correct answer here that is genuinely
 * hard to remember, and all three of the obvious ways to ask it are wrong:
 *
 *   1. THE UPTIME CHECK PROVES NOTHING. The viewer is an SPA, so any path returns
 *      200 HTML and renders "REFERENCE UNAVAILABLE" on the client. uptime.yml stayed
 *      GREEN through six consecutive runs while the probed product slug 404ed at the
 *      API — the rename from n001 to rxps had already broken both post-deploy gates.
 *      A 200 from viewer.wear-run.help means a web server answered, nothing more.
 *   2. `HEAD` DOES NOT SHARE THE GET'S CACHE ENTRY. On 2026-08-06 a model the shrink
 *      worker had just written returned `GET 404` (a cached 28 KB Cloudflare error
 *      page, 25 hours old, from a probe made before the file existed) while `HEAD`
 *      returned 200 with the correct content-length. artworkVerdict, the filesize,
 *      the material census and that HEAD were ALL green while the file was
 *      unreachable. Re-confirmed in the opposite direction on 2026-08-13: GET said
 *      HIT with age 49431, HEAD said DYNAMIC, same URL, same minute.
 *   3. A FULL GET COSTS 27 MB. scripts/smoke-viewer-payload.mjs uses HEAD precisely
 *      to keep R2 egress off the $5/month cap, which is why it would not have caught
 *      the cached 404 either.
 *
 * SO IT USES A RANGED GET, which is the way out of that trade and was measured on
 * 2026-08-26 against the live model:
 *
 *      HEAD              -> 200, cf-cache-status: DYNAMIC,   0 bytes
 *      GET (bytes 0-1023) -> 206, cf-cache-status: HIT,    1024 bytes
 *                            content-range: bytes 0-1023/28271780
 *
 * A range request is a GET, so it reads the entry a browser would read and a cached
 * 404 shows up as a 404. It also reports the object's FULL size in content-range, so
 * the size assertion survives. 1 KB per check instead of 27 MB.
 *
 * Usage:
 *   node .claude/skills/check-live/check-live.mjs
 *   node .claude/skills/check-live/check-live.mjs --full   # whole model, 27 MB each
 */

const API = 'https://cms.wear-run.help/api/public/viewer'
const VIEWER = 'https://viewer.wear-run.help'

/**
 * The live products. Slugs are printed on physical QR tags — never guess one.
 *
 * Shared with scripts/ since 2026-08-30. This file held the ONLY list that
 * iterated both products, and no workflow runs it — so `r-xmp` was covered by
 * nothing. One list means a rename fails everything at once, loudly, instead of
 * one gate going quietly green.
 */
import { LIVE_PRODUCTS as PRODUCTS } from '../../../scripts/live-products.mjs'

const full = process.argv.includes('--full')
let problems = 0

function fail(message) {
  problems++
  console.log(`  FAIL  ${message}`)
}

function ok(message) {
  console.log(`  ok    ${message}`)
}

/** Ranged GET: the browser's cache entry, at HEAD's cost. See the header. */
async function probeAsset(url, label) {
  const headers = full ? {} : { Range: 'bytes=0-1023' }
  let response
  try {
    response = await fetch(url, { headers })
  } catch (error) {
    fail(`${label} unreachable: ${error.message}`)
    return
  }

  const cache = response.headers.get('cf-cache-status') ?? '(none)'
  const age = response.headers.get('age')
  if (!response.ok) {
    fail(
      `${label} HTTP ${response.status} (cf-cache-status: ${cache}${age ? `, age ${age}s` : ''}) ` +
        `${url}\n        A 404 here can be a CACHED miss from before the file existed. ` +
        `Fix is a Custom Purge of this exact URL, not a redeploy.`,
    )
    await response.arrayBuffer().catch(() => {})
    return
  }

  const range = response.headers.get('content-range')
  const total = range ? Number(range.split('/')[1]) : Number(response.headers.get('content-length'))
  const size = Number.isFinite(total) ? `${(total / 1_000_000).toFixed(1)} MB` : 'unknown size'
  ok(
    `${label} HTTP ${response.status}, ${size}, cf-cache-status: ${cache}${age ? `, age ${age}s` : ''}`,
  )
  await response.arrayBuffer().catch(() => {})
}

for (const { slug, colourway } of PRODUCTS) {
  console.log(`\n=== ${slug} ===`)

  let payload
  try {
    const response = await fetch(`${API}/${slug}/${colourway}`)
    if (!response.ok) {
      fail(`API ${API}/${slug}/${colourway} -> HTTP ${response.status}. The product is not served.`)
      continue
    }
    payload = await response.json()
  } catch (error) {
    fail(`API unreachable: ${error.message}`)
    continue
  }

  const product = payload.product ?? {}
  const colourways = Array.isArray(payload.colourways) ? payload.colourways : []
  ok(`API 200 — ${product.productCode ?? '(no code)'}, ${colourways.length} colourways`)

  // Not a failure: the API falls back deliberately. But a silent fallback is how a
  // stranded colourway tab goes unnoticed, so it is always printed.
  if (payload.requestedColourwayUnavailable) {
    console.log(
      `  note  "${colourway}" is not a colourway of this product; the API fell back` +
        `${payload.fallbackMessage ? ` — ${payload.fallbackMessage}` : ''}`,
    )
  }

  if (typeof product.glbUrl !== 'string' || product.glbUrl.length === 0) {
    fail('no glbUrl on the product — there is nothing for the viewer to render')
  } else {
    await probeAsset(product.glbUrl, 'model')
  }

  const poster = product.posterFallback?.url ?? payload.selectedColourway?.poster?.url
  if (typeof poster === 'string') await probeAsset(poster, 'poster')

  // Deliberately last, and deliberately labelled. The SPA returns 200 for ANY path,
  // so this line is not evidence the garment renders — it is evidence a web server
  // answered. uptime.yml believing otherwise is why this whole script exists.
  try {
    const response = await fetch(`${VIEWER}/${slug}/${colourway}`)
    console.log(
      `  info  viewer HTTP ${response.status} (SPA: any path returns 200 — NOT proof it renders)`,
    )
    await response.arrayBuffer().catch(() => {})
  } catch (error) {
    fail(`viewer unreachable: ${error.message}`)
  }
}

console.log(
  problems === 0
    ? '\nAll live checks passed.'
    : `\n${problems} PROBLEM${problems === 1 ? '' : 'S'} — see FAIL lines above.`,
)
process.exit(problems === 0 ? 0 : 1)
