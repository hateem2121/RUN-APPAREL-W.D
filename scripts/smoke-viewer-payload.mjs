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
 */

const [, , apiBaseArg, productArg, colourArg] = process.argv

const API_BASE = (apiBaseArg || process.env.VITE_API_BASE_URL || 'https://cms.wear-run.help').replace(/\/+$/, '')
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
      console.log(`            datacenter traffic — see docs/HARDENING-LOG.md). Payload checks passed;`)
      console.log(`            the model URL itself was NOT verified from here.`)
    } else if (!res.ok && res.status !== 206) {
      fail(`the model URL returned HTTP ${res.status} — the payload points at a file that is not served`)
    } else {
      // content-range on a 206 ("bytes 0-0/39555036"), content-length on a HEAD.
      const range = res.headers.get('content-range')
      const bytes = range
        ? Number(range.split('/')[1] || 0)
        : Number(res.headers.get('content-length') || 0)

      if (!bytes) {
        console.log('  model     WARN: no content-length or content-range, size not verified')
      } else if (bytes < MIN_MODEL_BYTES) {
        fail(`the model is only ${bytes} bytes (< ${MIN_MODEL_BYTES}) — that is a stub or an error page, not a garment`)
      } else {
        console.log(`  size      ${(bytes / 1024 / 1024).toFixed(1)} MB`)
      }
    }
  } catch (err) {
    fail(`the model URL could not be fetched: ${err.message}`)
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
