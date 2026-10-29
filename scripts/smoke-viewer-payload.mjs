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
 *                           it is opt-in; ci.yml's post-deploy step and uptime.yml
 *                           (every 6 hours) both set it. See "the cached 404" below.
 *   SMOKE_API_RETRY_MS      the pause before asking the API again after a 5xx
 *                           (default 5000; see getJson, issue #189)
 */

import { inspectModelResponse, responseCategory } from './model-response.mjs'
import { DEFAULT_PRODUCT } from './live-products.mjs'
import { measureModelBytes } from './model-size.mjs'

const [, , apiBaseArg, productArg, colourArg] = process.argv

const API_BASE = (
  apiBaseArg ||
  process.env.VITE_API_BASE_URL ||
  'https://cms.wear-run.help'
).replace(/\/+$/, '')
/**
 * ⚠️ `n001` UNTIL 2026-08-15, AND IT HAD STOPPED EXISTING. Measured that day:
 * `GET /api/public/viewer/n001/wine` → **404 not_found**, while `rxps/wine` returns
 * the live 5-colourway payload and a 27.0 MB model. So this script — the
 * post-deploy gate in `ci.yml` whose entire job is to prove a buyer scanning a QR
 * tag sees a garment — exited 1 against production.
 *
 * The comment below already said the default "must be a slug that EXISTS" and gave
 * the right reason. It was written about the COLOUR, and the same drift then
 * happened one level up to the PRODUCT. Check both when a slug is renamed.
 */
const PRODUCT = productArg || DEFAULT_PRODUCT.slug
// Must be a slug that EXISTS. `navy` was the default until 2026-08-05, when the
// colourways were renamed from the placeholder names to the ones measured in the
// file — and the check kept passing, because a retired slug falls back to the
// default colourway and still returns a whole valid payload. That fallback is
// correct behaviour (a QR tag printed with an old slug must still work) and it is
// exactly why this default has to be a live slug: otherwise the check silently
// exercises the fallback path forever and never the normal one.
const COLOUR = colourArg || DEFAULT_PRODUCT.colourway

// A GLB with a header and no meshes is ~a few hundred bytes; the real N001 is
// 19 MB. 100 KB separates "a model" from "an empty container or an error page
// served with a 200", without pinning CI to any particular garment's size.
const MIN_MODEL_BYTES = Number(process.env.SMOKE_MIN_MODEL_BYTES || 102400)

/**
 * Opt-in bare GET. See the block comment at check 4.
 *
 * Off by default, ON in ci.yml's post-deploy step and in uptime.yml
 * (`SMOKE_BROWSER_GET: '1'`; uptime.yml runs this script every 6 hours, at minute 23).
 * It was off in uptime.yml while that ran every 15 minutes, on the
 * reasoning that a cached 404 is created by a probe made BEFORE the object existed,
 * so it is a hazard at publish time and not a standing condition to poll for. The
 * schedule left 15 minutes on 2026-08-18 and the request is cheap (the body is
 * cancelled once the status line arrives), so uptime.yml opts in too.
 */
const COMPLETE_MODEL = process.env.SMOKE_COMPLETE_MODEL === '1'
const BROWSER_GET = COMPLETE_MODEL || process.env.SMOKE_BROWSER_GET === '1'

/** How long one ask may take, answer and body together. `SMOKE_TIMEOUT_MS` exists only for the tests. */
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 30000)

const failures = []
const fail = (msg) => failures.push(msg)

/**
 * Statuses that mean "ask again later", not "the API is broken".
 *
 * ⚠️ ADDED 2026-08-30, AND IT IS A PRE-REQUISITE FOR THE workers.dev CUTOVER.
 * This script had 403 branches for the MODEL fetch and the browser GET, but not for
 * the API call itself — `getJson` threw on any non-ok and the caller exited 1. That
 * was survivable only because `VITE_API_BASE_URL` pointed at a `*.workers.dev` host,
 * which sits OUTSIDE the wear-run.help zone where Bot Fight Mode operates. The moment
 * the API moves onto `cms.wear-run.help`, one intermittent 403 from a datacenter IP
 * hard-fails the post-deploy gate — the exact incident that forced the first cutover
 * to be rolled back within the hour. Root CLAUDE.md: such a 403 is *inconclusive,
 * never a failed assertion*.
 */
const INCONCLUSIVE_STATUSES = new Set([403, 429])

/**
 * A 5xx is asked ONCE more, 5 s later, before it counts as a failure (issue #189).
 *
 * On 2026-10-14 at 17:20:55 and 17:20:57 UTC the API answered 500 for r-xmp/wine and
 * r-afp/petrol because D1 failed on Cloudflare's side (`D1_ERROR: internal error`, the CMS
 * Worker's log); a request 0.8 s later succeeded and every other check in that run passed,
 * yet uptime.yml opened an outage issue. Its health curl already asks three times for the
 * same reason (`--retry 2`). A real outage still fails both asks, and the first 500 is
 * printed as a `::warning::` so a blip stays visible in the job summary. Since the same
 * day the CMS also sends every 5xx to Sentry (apps/cms/src/lib/reportServerError.ts), so
 * the reason is recorded whether or not this check catches it.
 *
 * A 4xx is never asked again: it is an answer about the garment, not a failure to answer.
 * `SMOKE_API_RETRY_MS` exists only so publicViewerSmoke.test.ts does not wait 5 s.
 */
const API_RETRY_MS = Number(process.env.SMOKE_API_RETRY_MS || 5000)

/**
 * A cut connection is asked once more too (issue #285, 27 Oct 2026): after #282 deployed, one
 * poster fetch from the GitHub runner ended in `fetch failed` with no answer at all, and the same
 * poster answered 200 three times from Pakistan straight after; the failed check stopped the
 * deploy before its warm-ups. Node's fetch throws `TypeError: fetch failed` for a cut connection.
 *
 * A TIME-OUT is asked once more too (issue #289, 28 Oct): two deploys in a row stopped here while
 * the CMS Worker had answered in time, 5 of 41 garments past 30 s with every Worker answer under
 * 8.0 s, then r-cat/maroon's 200 sent in 1,307 ms and still unread by the runner 30 s later, both
 * during Cloudflare's "Network Performance Issues in Ashburn, IAD". The time-out was firing while
 * the BODY was arriving, after `fetch` had returned, so `ask` gets the signal and reads the body
 * inside it: the retry covers the whole ask, not only its first byte. Any answer, 403, 404, wrong
 * type or bad JSON, is judged exactly as before; a second cut or time-out still fails. Every
 * network call here goes through this, with the same pause and a visible `::warning::`.
 */
async function askOnceMore(url, ask) {
  try {
    return await ask(AbortSignal.timeout(TIMEOUT_MS))
  } catch (err) {
    // A body cut happens after fetch has returned: Node reports `terminated`
    // with UND_ERR_SOCKET. Do not retry JSON/content-validation errors.
    const cut =
      err instanceof TypeError &&
      (err.message === 'fetch failed' ||
        ['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE', 'UND_ERR_BODY_TIMEOUT'].includes(err.cause?.code))
    const timedOut = err?.name === 'TimeoutError'
    if (!cut && !timedOut) throw err
    console.log(
      `::warning::${
        cut
          ? `the connection to ${url} dropped before the transfer completed`
          : `the answer from ${url} did not finish within ${TIMEOUT_MS / 1000} s`
      }; asking once more in ${API_RETRY_MS / 1000} s before calling it a failure.`,
    )
    await new Promise((resolve) => setTimeout(resolve, API_RETRY_MS))
    return ask(AbortSignal.timeout(TIMEOUT_MS))
  }
}

/** One ask whose body is not read here (a HEAD, or a GET cancelled once its status is in). */
const fetchOnceMore = (url, init = {}) =>
  askOnceMore(url, (signal) => fetch(url, { ...init, signal }))

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    // The JSON is read inside the ask, so a body that stops arriving is asked again (#289).
    const { res, json } = await askOnceMore(url, async (signal) => {
      const answer = await fetch(url, { signal })
      if (!answer.ok || responseCategory(answer) === 'security-challenge') {
        await answer.body?.cancel().catch(() => {})
        return { res: answer }
      }
      return { res: answer, json: await answer.json() }
    })
    if (INCONCLUSIVE_STATUSES.has(res.status) || responseCategory(res) === 'security-challenge') {
      const err = new Error(
        `${responseCategory(res)}; HTTP ${res.status}; request ${res.headers.get('cf-ray') ?? 'unavailable'}`,
      )
      err.inconclusive = true
      throw err
    }
    if (res.status >= 500 && attempt === 1) {
      console.log(
        `::warning::the viewer endpoint answered HTTP ${res.status} ${res.statusText} for ` +
          `${url}; asking once more in ${API_RETRY_MS / 1000} s before calling it a failure.`,
      )
      await new Promise((resolve) => setTimeout(resolve, API_RETRY_MS))
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    return json
  }
}

const endpoint = `${API_BASE}/api/public/viewer/${PRODUCT}/${COLOUR}`
console.log(`Smoke: ${endpoint}`)

let payload
try {
  payload = await getJson(endpoint)
} catch (err) {
  if (err.inconclusive) {
    // Exit 0. An alarm that fires on Cloudflare's mood gets muted, and a muted
    // alarm is how the uptime check sat dead for 17 days.
    console.log(
      `SKIP  ${err.message}. This client did not verify availability; no outage cause established.`,
    )
    process.exit(0)
  }
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

// "3D coming soon" (owner decision 2026-10-08): a garment live on its pictures while its 3D
// file is redone. Whether that is ALLOWED comes from the committed list (live-products.mjs
// `modelComingSoon`, passed in by smoke-live-products.mjs), never from the payload: a stray
// tick in the CMS must not turn a garment that LOST its model green. Here the pictures are
// the page, so a colourway without one fails (below) instead of warning.
const expectComingSoon = process.env.SMOKE_COMING_SOON === '1'
if (expectComingSoon && modelUrl) {
  console.log(
    '  3D        NOTE: the model has arrived — remove `modelComingSoon` from this row in scripts/live-products.mjs',
  )
}
if (expectComingSoon && !modelUrl) {
  if (product.modelComingSoon === true) {
    console.log(
      '  3D        coming soon, by the list and by the payload: the pictures are the page',
    )
  } else {
    fail(
      'scripts/live-products.mjs marks this garment "3D coming soon", but the payload neither has a model nor says modelComingSoon — the page shows "The 3D view is not available"',
    )
  }
} else if (!modelUrl) {
  fail(
    separateMode
      ? `variantMode is "separate-glb-per-colour" and colourway "${selected?.slug}" has no glbUrl — the viewer reports colourway-has-no-glb`
      : `variantMode is "${product.variantMode}" and the product has no glbUrl — the viewer reports product-has-no-glb`,
  )
} else {
  console.log(`  model     ${modelUrl}`)

  // --- 3. the model is really there, and is not a stub ---------------------
  //
  // HEAD, not GET. This runs after every deploy AND on uptime.yml's schedule (every
  // 15 minutes when this was written, every 6 hours now); a GET pulled the whole
  // 37.7 MB model each time — roughly 3.6 GB of R2 egress a day at the 15-minute
  // rate, against a $5/month cap, to learn a number that is in the headers. The
  // first version of this check did exactly that.
  // Tracked so check 4 can tell "the object is genuinely missing" apart from
  // "HEAD says yes and GET says no", which is a different fault with a different
  // fix and is the one that shipped a 404 to the live page.
  let headVerdict = 'unknown'

  try {
    let res = await fetchOnceMore(modelUrl, { method: 'HEAD' })

    // Some edges do not answer HEAD for R2 objects. Fall back to a 1-byte range
    // rather than the whole file: content-range still carries the true size.
    if (res.status === 405 || res.status === 501) {
      res = await fetchOnceMore(modelUrl, {
        method: 'GET',
        headers: { range: 'bytes=0-0' },
      })
    }

    if ([403, 429].includes(res.status) || responseCategory(res) === 'security-challenge') {
      headVerdict = 'blocked'
      // Access denial or a confirmed challenge does not establish an outage cause.
      // Keep the result visibly unverified; do not invent a security-rule diagnosis.
      console.log(
        `  model     WARN: ${responseCategory(res)}; request ${res.headers.get('cf-ray') ?? 'unavailable'}`,
      )
      console.log(`            HTTP ${res.status}; cause not established. Payload checks passed;`)
      console.log(`            the model URL itself was NOT verified from here.`)
    } else if (!res.ok && res.status !== 206) {
      headVerdict = 'bad'
      fail(
        `the model URL returned HTTP ${res.status} — the payload points at a file that is not served`,
      )
    } else {
      headVerdict = 'ok'
      // Size, via model-size.mjs — which documents why a HEAD alone reads 0 here and
      // why the ranged fallback is what makes MIN_MODEL_BYTES below able to fire at all.
      const bytes = await measureModelBytes(modelUrl, res, { timeoutMs: TIMEOUT_MS })

      if (!bytes) {
        console.log('  model     WARN: no content-length or content-range, size not verified')
      } else if (bytes < MIN_MODEL_BYTES) {
        fail(
          `the model is only ${bytes} bytes (< ${MIN_MODEL_BYTES}) — that is a stub or an error page, not a garment`,
        )
      } else {
        console.log(`  size      ${(bytes / 1024 / 1024).toFixed(1)} MB`)
      }

      // The size the garment data declares (polish F12, 2026-10-04) is the total behind the
      // page's download percentage, since the media hosts gzip models and send no length. A file
      // replaced without its CMS record would make that percentage wrong, so it must match the
      // file. Absent from an API answer cached before the field existed: then said, not failed.
      const declared = separateMode ? selected?.glbBytes : product.glbBytes
      if (declared == null) {
        console.log(
          '  bytes     WARN: the payload names no glbBytes, so the page shows no percentage',
        )
      } else if (bytes && declared !== bytes) {
        fail(
          `the garment data says the model is ${declared} bytes and the file is ${bytes} — the page's download percentage would be wrong`,
        )
      } else if (bytes) {
        console.log(`  bytes     ${declared} in the data, the same as the file`)
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
  // Check 3 uses HEAD deliberately — a full GET on every uptime run (every 15 minutes when
  // this was written; every 6 hours now) was ~3.6 GB a day of R2 egress at that rate,
  // against a $5/month cap — and that trade is still right. It
  // just means HEAD alone cannot see this class of fault, by construction.
  //
  // WHY THE BODY IS NOT DOWNLOADED. The verdict is in the status line, which arrives
  // with the headers; the body says nothing extra. Cancelling the stream
  // closes the connection after a few buffered KB, so a real browser-shaped GET
  // costs about as much as the HEAD it complements. Do NOT "fix" this by adding a
  // Range header or a cache-buster — a ranged or uniquely-keyed request may land on
  // a different cache entry, which is the exact bug being tested for.
  if (BROWSER_GET && modelUrl) {
    try {
      const { res, inspection } = await askOnceMore(modelUrl, async (signal) => {
        const response = await fetch(modelUrl, { signal })
        if (COMPLETE_MODEL && response.ok && responseCategory(response) !== 'security-challenge') {
          const declared = separateMode ? selected?.glbBytes : product.glbBytes
          return { res: response, inspection: await inspectModelResponse(response, declared) }
        }
        await response.body?.cancel().catch(() => {})
        return { res: response }
      })

      if ([403, 429].includes(res.status) || responseCategory(res) === 'security-challenge') {
        // Access/rate denial or a confirmed challenge leaves availability unverified.
        console.log(
          `  browser   WARN: ${responseCategory(res)}; request ${res.headers.get('cf-ray') ?? 'unavailable'}. Not verified.`,
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
        console.log(
          inspection
            ? `  browser   complete GET: ${inspection.bytes} bytes; ${inspection.imageCount} images verified; estimated texture memory ${Math.round(inspection.estimatedTextureBytes / 1048576)} MiB`
            : '  browser   bare GET 200 — headers verified; transfer completion not checked',
        )
      }
    } catch (err) {
      fail(`the model URL could not be fetched with a plain GET: ${err.message}`)
    }
  }
}

// --- 2b. every colourway's poster is really served ---------------------------
// The viewer paints the colourway's photo, blurred, while the model downloads (fix
// plan Rank 6, 2026-09-03), and the link-preview cards are built from the same files.
// A poster URL that 404s is an empty stage for 45–62 s on 2 Mbit, and nothing else
// here would say so: the payload carries the URL either way. Plain GET, never HEAD —
// HEAD and GET land on different edge cache entries on this domain (root CLAUDE.md).
{
  const withPoster = colourways.filter((c) => c?.poster?.url)
  console.log(`  posters   ${withPoster.length} of ${colourways.length} colourways carry one`)
  if (withPoster.length < colourways.length) {
    const missing = colourways.length - withPoster.length
    if (expectComingSoon && !modelUrl) {
      // No model: the picture is the whole garment, so a missing one is an empty page.
      fail(`${missing} colourway(s) have no picture, and this garment has no 3D to show instead`)
    } else {
      console.log(
        `  posters   WARN: ${missing} colourway(s) have no poster — the stage stays empty while their model downloads`,
      )
    }
  }
  for (const c of withPoster) {
    try {
      // The picture is read inside the ask, so one that stops arriving is asked again (#289).
      const res = await askOnceMore(c.poster.url, async (signal) => {
        const answer = await fetch(c.poster.url, { method: 'GET', signal })
        if ([403, 429].includes(answer.status) || responseCategory(answer) === 'security-challenge')
          await answer.body?.cancel().catch(() => {})
        else await answer.arrayBuffer()
        return answer
      })
      if ([403, 429].includes(res.status) || responseCategory(res) === 'security-challenge') {
        console.log(
          `  posters   WARN: ${c.slug} ${responseCategory(res)} HTTP ${res.status}; cause not established — not verified from here`,
        )
        continue
      }
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) {
        fail(
          `the poster for "${c.slug}" returned HTTP ${res.status} ${type} — the viewer paints nothing while that colourway downloads`,
        )
      }
    } catch (err) {
      fail(`the poster for "${c.slug}" could not be fetched: ${err.message}`)
    }
  }
}

// --- 2c. every fact has its explanation line ----------------------------------
// The garment page's facts carry one line each from the glossary (polish D10, 2026-10-04:
// packages/shared/src/specNotes.ts), attached by the CMS as `product.specs`. A term typed in
// the CMS that the glossary lacks draws as a plain bullet with nothing to open: the page still
// works, so it is SAID, not failed, and the line belongs in specNotes.ts (the owner approves
// each new one). An answer cached before the field existed has no `specs`: said, not failed.
// smoke-live-products.mjs runs this for every live garment, so a new term shows here first.
{
  const groups = Array.isArray(product.specs) ? product.specs : null
  if (!groups) {
    console.log(
      '  notes     WARN: the payload carries no fact groups (an answer cached before polish D10?), so the page shows no explanation lines',
    )
  } else {
    const items = groups.flatMap((group) =>
      (Array.isArray(group.items) ? group.items : []).map((item) => ({
        ...item,
        group: group.key,
      })),
    )
    const missing = items.filter((item) => !item.note)
    if (missing.length === 0) {
      console.log(`  notes     all ${items.length} facts have their explanation line`)
    } else {
      console.log(
        `  notes     WARN: ${missing.length} of ${items.length} facts have no explanation line: ` +
          `${missing.map((item) => `${item.group} "${item.text}"`).join(', ')} — add them to packages/shared/src/specNotes.ts`,
      )
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

console.log(
  expectComingSoon && !modelUrl
    ? 'OK    3D coming soon: every colourway serves its picture.'
    : 'OK    the viewer payload serves a real, fetchable model.',
)
