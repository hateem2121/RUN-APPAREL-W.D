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
 *   3. A FULL GET COSTS 1.9-8.2 MB PER GARMENT, 53.69 MB for all eleven (measured
 *      2026-09-05; ~27 MB each before the 2026-09-03 re-exports).
 *      scripts/smoke-viewer-payload.mjs uses HEAD precisely
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
 * the size assertion survives. 1 KB per check instead of the whole object.
 *
 * Usage:
 *   node .claude/skills/check-live/check-live.mjs
 *   node .claude/skills/check-live/check-live.mjs --full   # whole model, 1.9-8.2 MB each
 */

/** Strings that appear ONLY in CLO's internal design database. */
const LEAK_NEEDLES = ['Stretch-Warp', 'SeamLinePairList', 'D:/New File', 'PhysicalPropertyName']

const API = 'https://cms.wear-run.help/api/public/viewer'
// The garment page itself (since the 2026-09-28 domain move), not viewer.wear-run.help,
// which only forwards here: probing the forward also tested the redirect.
const VIEWER = 'https://wear-run.com/products'

/**
 * The live products. Slugs are printed on physical QR tags — never guess one.
 *
 * Shared with scripts/ since 2026-08-30. This file held the ONLY list that
 * iterated both products, and no workflow runs it — so `r-xmp` was covered by
 * nothing. One list means a rename fails everything at once, loudly, instead of
 * one gate going quietly green.
 */
import { pathToFileURL } from 'node:url'
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

/**
 * The shipped file must carry NO CLO factory data and MUST carry a copyright.
 *
 * ⚠️ ADDED 2026-09-05 BECAUSE NOTHING WATCHED THIS. Every published GLB carried root
 * `extras.MetaData` — fabric physics, supplier codes, Coloro dye references, seam
 * pairs, absolute Windows paths — until they were stripped that day. The pipeline
 * fix (`stripRootExtras`) stops it recurring for NEW garments, but a garment
 * attached by hand, restored from an older object, or processed by a container
 * image built before the fix would re-introduce it silently. This is the only check
 * that looks at what is actually SERVED.
 *
 * Reads the JSON chunk only, never the binary one. A GLB is a 12-byte header, then
 * chunks of [uint32 chunkLength][uint32 chunkType][chunkData]; the first chunk MUST be
 * JSON, so its length is at offset 12, its type at 16 and the JSON starts at 20
 * (glTF 2.0 spec, "GLB File Format Specification", read 2026-10-24).
 *
 * ⚠️ IT READ A FIXED 512 KB UNTIL 2026-10-24, AND WENT SILENT PAST IT. A JSON chunk
 * larger than that failed to parse, fell to a string scan for the leak needles, and on
 * a clean scan printed NOTHING, so copyright and root extras were never checked. Two
 * live garments were over it that day: r-ttp (552 KB) and r-mss (1,284 KB), the only
 * two of 41 without this verdict line. It now reads the chunk length from the first
 * read and fetches exactly the rest, and every path ends in an ok or a FAIL.
 */
const FIRST_READ = 524_288
const GLB_MAGIC = 0x46546c67 // "glTF"
const JSON_CHUNK = 0x4e4f534a // "JSON"

async function probeModelPrivacy(url) {
  let bytes
  try {
    const response = await fetch(url, { headers: { Range: `bytes=0-${FIRST_READ - 1}` } })
    if (!response.ok) return // probeAsset already reported the status.
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    fail(`model header unreadable: ${error.message}`)
    return
  }
  if (bytes.byteLength < 20) {
    fail(`model header is ${bytes.byteLength} bytes — not a GLB`)
    return
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(16, true) !== JSON_CHUNK) {
    fail('model does not start with a GLB header and a JSON chunk')
    return
  }
  const jsonLength = view.getUint32(12, true)
  let json = bytes.subarray(20, Math.min(20 + jsonLength, bytes.byteLength))
  if (json.byteLength < jsonLength) {
    try {
      const rest = await fetch(url, {
        headers: { Range: `bytes=${20 + json.byteLength}-${19 + jsonLength}` },
      })
      if (!rest.ok) throw new Error(`HTTP ${rest.status}`)
      const tail = new Uint8Array(await rest.arrayBuffer())
      const whole = new Uint8Array(json.byteLength + tail.byteLength)
      whole.set(json)
      whole.set(tail, json.byteLength)
      json = whole
    } catch (error) {
      fail(
        `model JSON chunk is ${(jsonLength / 1024).toFixed(0)} KB and the rest of it could ` +
          `not be read (${error.message}) — copyright and extras NOT checked`,
      )
      return
    }
  }

  let doc
  try {
    doc = JSON.parse(new TextDecoder().decode(json))
  } catch {
    // The whole chunk is in hand now, so a parse failure is a broken file, not a short
    // read. Still scan for the needles, so a leak is named rather than just "broken".
    const text = new TextDecoder().decode(json)
    const found = LEAK_NEEDLES.filter((needle) => text.includes(needle))
    fail(
      found.length > 0
        ? `model LEAKS CLO factory data: ${found.join(', ')}`
        : `model JSON chunk (${(jsonLength / 1024).toFixed(0)} KB) does not parse`,
    )
    return
  }

  const extras = doc.extras ? Object.keys(doc.extras) : []
  if (extras.length > 0) {
    fail(
      `model carries root extras [${extras.join(', ')}] — CLO factory data is being ` +
        `served. Re-run the pipeline on the RAW export, or strip it with ` +
        `tools/asset-pipeline/scripts/strip-live-r2.mts, then PURGE the URL.`,
    )
  } else if (!doc.asset?.copyright) {
    fail('model has no asset.copyright — it was not processed by the current pipeline')
  } else {
    ok(
      `model carries no CLO metadata, copyright "${doc.asset.copyright}" ` +
        `(JSON chunk ${(jsonLength / 1024).toFixed(0)} KB)`,
    )
  }
}

// Exported so a planted-file control can drive the probe against a local server
// (2026-10-24); the sweep below runs only when this file is the program. Not
// `import.meta.main`: it arrived in Node 24.2, and `engines` allows any Node 24.
export { probeModelPrivacy }
const isProgram =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (isProgram) await sweep()

async function sweep() {
  for (const { slug, colourway, modelComingSoon } of PRODUCTS) {
    console.log(`\n=== ${slug} ===`)

    let payload
    try {
      const response = await fetch(`${API}/${slug}/${colourway}`)
      if (!response.ok) {
        fail(
          `API ${API}/${slug}/${colourway} -> HTTP ${response.status}. The product is not served.`,
        )
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

    const noModel = typeof product.glbUrl !== 'string' || product.glbUrl.length === 0
    if (noModel && modelComingSoon && product.modelComingSoon === true) {
      // "3D coming soon" (2026-10-08): the LIST allows no model and the payload agrees, so the
      // page shows its pictures with a calm note. The poster below is still fetched.
      ok('3D coming soon — no model, by the list and by the payload')
    } else if (noModel) {
      fail('no glbUrl on the product — there is nothing for the viewer to render')
    } else {
      await probeAsset(product.glbUrl, 'model')
      await probeModelPrivacy(product.glbUrl)
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
}
