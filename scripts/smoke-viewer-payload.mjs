#!/usr/bin/env node
/**
 * Post-deploy smoke test: does the public viewer API actually serve a garment?
 *
 * WHY THIS EXISTS. CI's only post-deploy check was `curl /api/health`, which
 * returns `{"ok":true}` from a worker with an EMPTY DATABASE. It proves the
 * process is up and nothing about whether a buyer scanning a QR tag sees a
 * garment. On 2026-07-29 a model that rendered a near-white box across the chest
 * shipped and stayed live for six days; every automated check was green
 * throughout, because none of them looked at the payload.
 *
 * This asserts the three facts a QR scan depends on:
 *
 *   1. the endpoint answers with a product,
 *   2. that product resolves to a model URL **by the same rule the viewer uses**,
 *   3. that URL is really fetchable and is not a stub.
 *
 * It deliberately does NOT check whether the artwork on the model is intact —
 * that is not decidable from HTTP. `findArtworkAlphaProblems` and friends block
 * that at pipeline time; see docs/OPEN-ISSUE-ARTWORK.md.
 *
 * Usage:
 *   node scripts/smoke-viewer-payload.mjs [apiBase] [productSlug] [colourSlug]
 *
 * Env:
 *   SMOKE_MIN_MODEL_BYTES   override the "not a stub" floor (default 102400)
 *   SMOKE_BROWSER_GET=1     also fetch the model the way a browser does — a bare
 *                           GET, no HEAD, no Range. Costs one extra request, so
 *                           it is opt-in and set only on the post-deploy path.
 *                           See "the cached 404" below.
 */

const [, , apiBaseArg, productArg, colourArg] = process.argv

const API_BASE = (
  apiBaseArg ||
  process.env.VITE_API_BASE_URL ||
  'https://cms.wear-run.help'
).replace(/\/+$/, '')
const PRODUCT = productArg || 'n001'
// Must be a slug that EXISTS. `navy` was the default until 2026-08-05, when the
// colourways were renamed from the placeholder names to the ones measured in the
// file — and the check kept passing, because a retired slug falls back to the
// default colourway and still returns a whole valid payload. That fallback is
// correct behaviour (a QR tag printed with an old slug must still work) and it is
// exactly why this default has to be a live slug: otherwise the check silently
// exercises the fallback path forever and never the normal one.
const COLOUR = colourArg || 'wine'

// A GLB with a header and no meshes is ~a few hundred bytes; the real N001 is
// 19 MB. 100 KB separates "a model" from "an empty container or an error page
// served with a 200", without pinning CI to any particular garment's size.
const MIN_MODEL_BYTES = Number(process.env.SMOKE_MIN_MODEL_BYTES || 102400)

/**
 * Opt-in bare GET. See the block comment at check 4.
 *
 * Off by default because uptime.yml runs this script every 15 minutes and the
 * extra request would be pointless there — a cached 404 is created by a probe
 * made BEFORE the object existed, so it is a hazard at publish time, not a
 * standing condition to poll for.
 */
const BROWSER_GET = process.env.SMOKE_BROWSER_GET === '1'

const TIMEOUT_MS = 30000

const failures = []
const fail = (msg) => failures.push(msg)

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

const endpoint = `${API_BASE}/api/public/viewer/${PRODUCT}/${COLOUR}`
console.log(`Smoke: ${endpoint}`)

let payload
try {
  payload = await getJson(endpoint)
} catch (err) {
  console.error(`FAIL  the viewer endpoint did not return JSON: ${err.message}`)
  process.exit(1)
}

const product = payload?.product
if (!product) {
  console.error('FAIL  response carried no `product`.')
  process.exit(1)
}
console.log(`  product   ${product.productCode} — ${product.productName}`)

// --- 1. at least one colourway a buyer can select --------------------------
const colourways = Array.isArray(payload.colourways) ? payload.colourways : []
if (colourways.length === 0) {
  fail('the product has no colourways, so the viewer has nothing to show or select')
} else {
  console.log(`  colours   ${colourways.length} (${colourways.map((c) => c.slug).join(', ')})`)
}

// --- 2. resolve the model URL exactly as the viewer does -------------------
// apps/viewer/src/components/Stage.tsx:46 —
//     const glbUrl = separateMode ? selected.glbUrl : product.glbUrl
// There is NO fallback between the two fields. Accepting `a || b` here would let
// this pass on a product whose UNUSED field happens to be populated, i.e. green
// CI while every visitor sees the no-model state. Mirror the real rule.
const separateMode = product.variantMode === 'separate-glb-per-colour'
const selected = payload.selectedColourway ?? colourways[0]
const modelUrl = separateMode ? selected?.glbUrl : product.glbUrl

if (!modelUrl) {
  fail(
    separateMode
      ? `variantMode is "separate-glb-per-colour" and colourway "${selected?.slug}" has no glbUrl — the viewer reports colourway-has-no-glb`
      : `variantMode is "${product.variantMode}" and the product has no glbUrl — the viewer reports product-has-no-glb`,
  )
} else {
  console.log(`  model     ${modelUrl}`)

  // --- 3. the model is really there, and is not a stub ---------------------
  //
  // HEAD, not GET. This runs after every deploy AND every 15 minutes from
  // uptime.yml; a GET pulled the whole 37.7 MB model each time — roughly 3.6 GB
  // of R2 egress a day against a $5/month cap, to learn a number that is in the
  // headers. The first version of this check did exactly that.
  // Tracked so check 4 can tell "the object is genuinely missing" apart from
  // "HEAD says yes and GET says no", which is a different fault with a different
  // fix and is the one that shipped a 404 to the live page.
  let headVerdict = 'unknown'

  try {
    let res = await fetch(modelUrl, { method: 'HEAD', signal: AbortSignal.timeout(TIMEOUT_MS) })

    // Some edges do not answer HEAD for R2 objects. Fall back to a 1-byte range
    // rather than the whole file: content-range still carries the true size.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(modelUrl, {
        method: 'GET',
        headers: { range: 'bytes=0-0' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    }

    if (res.status === 403) {
      headVerdict = 'blocked'
      // NOT a failure, and this is the one exception in this script.
      //
      // Free-plan Bot Fight Mode intermittently 403s datacenter traffic to
      // wear-run.help hosts. It is documented in HARDENING-LOG.md — it already
      // forced the `cms.wear-run.help` API cutover to be rolled back within the
      // hour. A GitHub runner is datacenter traffic, so failing here would fail
      // deploys at random for a reason that has nothing to do with the garment,
      // and a gate the owner learns to override is worse than no gate.
      //
      // The payload assertions above still fail hard — those are what actually
      // catch a product with no model.
      console.log(`  model     WARN: HTTP 403 fetching the model (free-plan Bot Fight Mode blocks`)
      console.log(
        `            datacenter traffic — see docs/HARDENING-LOG.md). Payload checks passed;`,
      )
      console.log(`            the model URL itself was NOT verified from here.`)
    } else if (!res.ok && res.status !== 206) {
      headVerdict = 'bad'
      fail(
        `the model URL returned HTTP ${res.status} — the payload points at a file that is not served`,
      )
    } else {
      headVerdict = 'ok'
      // content-range on a 206 ("bytes 0-0/39555036"), content-length on a HEAD.
      const range = res.headers.get('content-range')
      const bytes = range
        ? Number(range.split('/')[1] || 0)
        : Number(res.headers.get('content-length') || 0)

      if (!bytes) {
        console.log('  model     WARN: no content-length or content-range, size not verified')
      } else if (bytes < MIN_MODEL_BYTES) {
        fail(
          `the model is only ${bytes} bytes (< ${MIN_MODEL_BYTES}) — that is a stub or an error page, not a garment`,
        )
      } else {
        console.log(`  size      ${(bytes / 1024 / 1024).toFixed(1)} MB`)
      }
    }
  } catch (err) {
    fail(`the model URL could not be fetched: ${err.message}`)
  }

  // --- 4. fetch it the way a browser actually will --------------------------
  //
  // A bare GET. No HEAD, no Range header, no cache-buster. This exists because
  // on 2026-08-06 every check above was GREEN on a model that was unreachable:
  //
  //     GET  https://media.wear-run.help/…  ->  404  (a 28 KB Cloudflare error page)
  //     HEAD https://media.wear-run.help/…  ->  200  with the correct content-length
  //
  // The two landed on DIFFERENT edge cache entries. `media.wear-run.help` is an R2
  // custom domain with a 30-day Cache Rule, so a request for an object that does
  // not exist YET caches the miss — and the cached 404 was 25 hours old, left by a
  // probe made before the shrink worker wrote the file. The object was intact in R2
  // the whole time (`wrangler r2 object get` returned all 28,271,780 bytes), and the
  // same URL with `?v=1` served 200 immediately.
  //
  // So `artworkVerdict: ok`, the filesize, the {OPAQUE, MASK} census AND check 3's
  // HEAD were all green while a buyer scanning a QR tag would have got nothing.
  // Check 3 uses HEAD deliberately — a GET on every 15-minute uptime run is ~3.6 GB
  // of R2 egress a day against a $5/month cap — and that trade is still right. It
  // just means HEAD alone cannot see this class of fault, by construction.
  //
  // WHY THE BODY IS NOT DOWNLOADED. The verdict is in the status line, which arrives
  // with the headers; the 27 MB body says nothing extra. Cancelling the stream
  // closes the connection after a few buffered KB, so a real browser-shaped GET
  // costs about as much as the HEAD it complements. Do NOT "fix" this by adding a
  // Range header or a cache-buster — a ranged or uniquely-keyed request may land on
  // a different cache entry, which is the exact bug being tested for.
  if (BROWSER_GET && modelUrl) {
    try {
      const res = await fetch(modelUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      await res.body?.cancel().catch(() => {})

      if (res.status === 403) {
        // Same Bot Fight Mode exception as check 3, and for the same reason: a
        // datacenter 403 is inconclusive, never a failed assertion.
        console.log(
          '  browser   WARN: HTTP 403 on the bare GET (free-plan Bot Fight Mode). Not verified.',
        )
      } else if (!res.ok) {
        if (headVerdict === 'ok') {
          fail(
            `HEAD says the model is there but a plain GET returns HTTP ${res.status}.\n` +
              `        This is the cached-404 signature: the two methods are on different edge cache\n` +
              `        entries, and a visitor's browser gets the one that says ${res.status}.\n` +
              `        The file is probably intact in R2 — confirm with \`wrangler r2 object get\`, then fix\n` +
              `        it with a Cloudflare Custom Purge of THAT ONE URL. Do not re-run the shrink.`,
          )
        } else {
          fail(
            `a plain GET on the model URL returned HTTP ${res.status} — a visitor would see no garment`,
          )
        }
      } else {
        console.log('  browser   bare GET 200 — reachable the way a QR scan reaches it')
      }
    } catch (err) {
      fail(`the model URL could not be fetched with a plain GET: ${err.message}`)
    }
  }
}

if (failures.length > 0) {
  console.error('')
  for (const f of failures) console.error(`FAIL  ${f}`)
  console.error('')
  console.error('A buyer scanning a QR tag for this garment would not see a model.')
  console.error('See docs/RUNBOOK.md → "Re-processing a garment".')
  process.exit(1)
}

console.log('OK    the viewer payload serves a real, fetchable model.')
