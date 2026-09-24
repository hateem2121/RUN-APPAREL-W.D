#!/usr/bin/env node
/**
 * Post-deploy smoke test: does a shared link unfurl as THIS garment?
 *
 * WHY THIS EXISTS. The per-garment preview is produced by an HTMLRewriter inside
 * apps/viewer/worker/index.ts, and HTMLRewriter does not exist under vitest — so
 * the unit tests cover every DECISION (worker/preview.test.ts) and nothing at all
 * covers the rewrite itself. That is precisely the gap CLAUDE.md names as the one
 * pattern that keeps causing incidents here: a test suite that cannot exhibit the
 * failure. The same reasoning produced smoke-viewer-payload.mjs, which exists
 * because `curl /api/health` returned {"ok":true} while the live model was broken.
 *
 * Every failure this catches is SILENT. A link that unfurls with the wrong
 * garment, or with no picture, renders a perfect page in a browser — you only
 * find out when a lead sees it.
 *
 * Since 2026-09-17 it also checks the garment page's cross-origin headers (audit SE-05) and
 * its compression (PF-13), for the same reason: both are made by the deployed Worker, and
 * only a request to it can show them.
 *
 * Usage:
 *   node scripts/smoke-viewer-preview.mjs [viewerBase] [productSlug] [colourSlug]
 *
 * ⚠️ A 403 or 429 is treated as INCONCLUSIVE, not a failure. Free-plan bot rules
 * on the wear-run.help zone have blocked datacenter traffic before — it forced
 * the cms.wear-run.help cutover to be rolled back within the hour — and this
 * script asks for a page with a CRAWLER user-agent from a GitHub runner, which is
 * the single most challengeable request shape available. A bot rule must never be
 * reported as "the previews are broken".
 */

import { execFileSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { DEFAULT_PRODUCT, LIVE_PRODUCTS, squashCode } from './live-products.mjs'

/**
 * Mirrors `apps/viewer/worker/crawlerCacheHeaders.ts`'s two predicates of the same name.
 * Not imported: that file is TypeScript inside a workspace package this repo-root script
 * has no build step for, and this repo's own convention for a predicate this small is to
 * duplicate it with a citation rather than force a cross-runtime import (the same choice
 * `og.test.ts`'s JPEG parse and `findability.spec.ts`'s PNG/WebP parses make independently
 * of each other). Keep the two in step by eye; neither is likely to change without the
 * other, since both exist for the one crawler-rewrite code path.
 */
function carriesNoTransform(cacheControl) {
  return (cacheControl ?? '').includes('no-transform')
}
function variesOnUserAgent(vary) {
  return (vary ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes('User-Agent')
}

const [, , baseArg, productArg, colourArg] = process.argv

const BASE = (baseArg || 'https://viewer.wear-run.help').replace(/\/+$/, '')
// ⚠️ `n001` until 2026-08-15, by which time that product 404'd in production — see
// the block in smoke-viewer-payload.mjs. Against the dead slug this reported "the
// per-garment rewrite did not run", which reads as a broken Worker and was a
// missing garment.
const PRODUCT = productArg || DEFAULT_PRODUCT.slug
// Must be a slug that EXISTS, for the same reason smoke-viewer-payload.mjs says
// so: a retired slug falls back to the default colourway and still produces a
// complete, correct-looking preview, so the check would pass forever while only
// ever exercising the fallback.
const COLOUR = colourArg || DEFAULT_PRODUCT.colourway

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const url = `${BASE}/${PRODUCT}/${COLOUR}`

/**
 * ⚠️ RETRIES BECAUSE `wrangler deploy` RETURNS BEFORE THE VERSION IS LIVE.
 *
 * This is not defensive padding — it is the first thing that happened. On the
 * commit that introduced this script (2026-08-08) CI ran it roughly one second
 * after the deploy step and it reported all five assertions failing, in detail,
 * against a viewer that was serving the PREVIOUS version. The same URL checked by
 * hand a few minutes later passed every one. `wrangler deploy` returns when
 * Cloudflare has accepted the upload, not when every colo is serving it.
 *
 * A check that fails for a benign reason and does not say so is worse than no
 * check: it is the kind a person learns to re-run and ignore, which is the exact
 * failure mode CLAUDE.md gives as the reason `findCrushedArtwork` only warns.
 */
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 6)
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_DELAY_MS || 10000)

let failures = []
const fail = (message) => failures.push(message)

/**
 * Checks 9 and 10 below read SITE-WIDE behaviour, not the product under test, so they
 * run for the default product only. `smoke-live-previews.mjs` (the post-deploy gate)
 * runs this script once per live product, 16 today, and the default product is its
 * first run. That is also the one run that can promise check 9 a payload no earlier
 * run has just warmed.
 */
const SITE_WIDE_CHECKS = PRODUCT === DEFAULT_PRODUCT.slug
/** Check 9 is measured once per run, on the first attempt: every retry warms its slug. */
let timingMeasured = false

/** Pull a meta tag's content by its `property=`/`name=` key. */
const meta = (html, key) =>
  html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`, 'i'))?.[1] ??
  null

/**
 * A GET that can send `Sec-Fetch-Mode`, which `fetch` cannot.
 *
 * ⚠️ `sec-fetch-mode` IS A FORBIDDEN HEADER NAME, and `fetch` does not refuse it — it
 * silently REWRITES it to `cors`. Verified against a local echo server 2026-09-07:
 * `fetch(url, { headers: { 'sec-fetch-mode': 'navigate' } })` arrives as `cors`. So the
 * first version of the check below reported every navigation identical to a plain
 * request, which reads as "nothing to fix". `node:https` sends what it is given.
 */
function rawGet(target, headers) {
  const url = new URL(target)
  const mod = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      },
      (res) => {
        // Bytes, not text: a compressed body has to be decoded before it can be read (PF-13).
        // `html` is kept for the crawler-navigation check below, which never asks for one.
        const chunks = []
        res.on('data', (chunk) => {
          chunks.push(chunk)
        })
        res.on('end', () => {
          const bytes = Buffer.concat(chunks)
          resolve({
            status: res.statusCode,
            headers: res.headers,
            bytes,
            html: bytes.toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * A body as text, decoded by its Content-Encoding (PF-13). Null means it does not decode,
 * which is what a visitor would see as a blank or garbled page. `zstd` is here because a
 * browser offers it and Cloudflare may re-encode a page it rewrites; Node 24 has it.
 */
function decodeBody({ headers, bytes }) {
  const encoding = headers['content-encoding']
  try {
    if (!encoding || encoding === 'identity') return bytes.toString('utf8')
    if (encoding === 'br') return zlib.brotliDecompressSync(bytes).toString('utf8')
    if (encoding === 'gzip') return zlib.gunzipSync(bytes).toString('utf8')
    if (encoding === 'zstd') return zlib.zstdDecompressSync(bytes).toString('utf8')
  } catch {
    return null
  }
  return null
}

async function get(target, ua) {
  const res = await fetch(target, { headers: { 'user-agent': ua, accept: 'text/html' } })
  if (res.status === 403 || res.status === 429) {
    console.log(
      `⚠️  ${target} returned ${res.status} for a ${ua.slice(0, 24)}… request.\n` +
        '   Treating as INCONCLUSIVE — this is the documented bot-rule symptom, not a\n' +
        '   preview failure. Re-run from a non-datacenter IP to check for real.',
    )
    process.exit(0)
  }
  return { res, html: await res.text() }
}

async function runChecks() {
  failures = []
  const { res, html } = await get(url, CRAWLER_UA)

  // 1. The page is served at all.
  if (!res.ok) fail(`${url} responded ${res.status} to a crawler.`)
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) {
    fail(`${url} is not HTML (content-type: ${res.headers.get('content-type')}).`)
  }

  // 2. The rewrite ran, and named THIS garment. Matching on the product code rather
  //    than the whole title keeps the check working when the product is RENAMED in
  //    the CMS.
  //
  //    ⚠️ THIS COMPARISON IS NORMALISED, AND IT WENT RED ON MAIN WITHOUT IT.
  //    2026-08-17: the live product's code changed `RXPS` → `R-XPS` (catalogue
  //    house style) while its slug correctly stayed `rxps`. The check derived the
  //    expected CODE by uppercasing the SLUG, so it wanted `RXPS`, the page
  //    correctly said `R-XPS`, and the deploy job failed on a rewrite that was
  //    working perfectly.
  //
  //    The comment here used to justify that with "the code is what is printed on
  //    the tag and does not change". That conflated two different fields: the
  //    SLUG is on the tag and may never change (Products.ts and colourways.ts
  //    both enforce it), while the product CODE is on the page and in the enquiry
  //    email, is not in any URL, and is therefore safe to change — as it just was.
  //    Uppercasing a slug is not a way to learn a product code.
  //
  //    Stripping non-alphanumerics from both sides compares the two the only way
  //    that is stable: `rxps` and `R-XPS` both reduce to RXPS, and every imported
  //    garment matches its own code the same way (`r-gcj` ↔ `R-GCJ` → RGCJ). This
  //    is the same rename-shaped breakage that took out BOTH post-deploy gates on
  //    2026-08-15 when `n001` became `rxps`; that one was fixed by editing a
  //    default, which left the next rename free to do it again.
  // Shared with live-products.mjs so the rule cannot drift between the two
  // places that squash a product code.
  const squash = squashCode
  const expectCode = squash(PRODUCT)
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ''
  if (!squash(title).includes(expectCode)) {
    fail(`<title> is "${title}" — the per-garment rewrite did not run.`)
  }
  for (const key of ['og:title', 'twitter:title']) {
    const value = meta(html, key) ?? ''
    if (!squash(value).includes(expectCode))
      fail(`${key} is "${value}", expected it to contain the product code ${expectCode}.`)
  }

  // 3. The canonical URL is per-colourway and points back here. A static value would
  //    tell crawlers every colourway is the same page.
  const ogUrl = meta(html, 'og:url')
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1] ?? null
  if (ogUrl !== url) fail(`og:url is ${ogUrl}, expected ${url}.`)
  if (canonical !== url) fail(`canonical is ${canonical}, expected ${url}.`)

  // 4. The picture is absolute and really fetchable. A relative og:image is the most
  //    common way a preview fails, and a 404 here shows as a card with a blank slot.
  const image = meta(html, 'og:image')
  if (!image || !/^https:\/\//.test(image)) {
    fail(`og:image is "${image}" — must be an absolute https URL or no crawler resolves it.`)
  } else {
    // A bare GET, not HEAD: on 2026-08-06 a HEAD returned 200 with the right
    // content-length for an object whose GET returned a cached 404. The cards are
    // 62-75 KB, so this costs almost nothing.
    const img = await fetch(image, { headers: { 'user-agent': CRAWLER_UA } })
    const type = img.headers.get('content-type') ?? ''
    const bytes = (await img.arrayBuffer()).byteLength
    if (!img.ok) fail(`og:image ${image} responded ${img.status}.`)
    else if (!type.startsWith('image/')) fail(`og:image ${image} is ${type}, not an image.`)
    else if (bytes < 5000) fail(`og:image ${image} is only ${bytes} bytes — not a real card.`)
    else console.log(`   og:image ${image} → ${type}, ${(bytes / 1024).toFixed(0)} KB`)

    const declaredType = meta(html, 'og:image:type')
    if (declaredType && !type.startsWith(declaredType)) {
      fail(`og:image:type says ${declaredType} but the file is ${type}.`)
    }
  }

  // 4b. A MISSING card must be a 404, not a page.
  //
  //     Until 2026-08-31 `/og/<anything>/<anything>.jpg` returned **200 with
  //     `content-type: text/html`** and 8,017 bytes of SPA shell, byte-identical to a
  //     bogus page URL — `not_found_handling: single-page-application` is right for
  //     HTML routes and actively wrong for images. A crawler asked for a picture, got
  //     a document with a success code, and had no reason to retry or fall back.
  //
  //     Asserted HERE rather than in a unit test because worker/index.ts is not
  //     testable in isolation (HTMLRewriter, a service binding), and because the e2e
  //     fixture server cannot exhibit this: serve.mjs never had the SPA-fallback
  //     behaviour that causes it. That is the "fixture too GOOD" trap recorded in
  //     worker/securityHeaders.ts, and it is why this lives in the post-deploy smoke.
  {
    const bogus = new URL('/og/zzz-not-a-product/zzz-not-a-colourway.jpg', url).toString()
    const res = await fetch(bogus, { headers: { 'user-agent': CRAWLER_UA } })
    const type = res.headers.get('content-type') ?? ''
    if (res.status !== 404) {
      fail(
        `${bogus} responded ${res.status} (${type}), expected 404.\n` +
          '   A missing preview card must not be served as the SPA shell: a crawler\n' +
          '   handed 200 text/html for an image has nothing to fall back to.',
      )
    } else if (type.includes('text/html')) {
      fail(`${bogus} 404'd but with ${type} — it must not be the SPA document.`)
    } else {
      console.log(`   missing og card → ${res.status} ${type.split(';')[0]}`)
    }
  }

  // 5. NEGATIVE CONTROL. A normal browser must get the page UNCHANGED. Without this
  //    the check above passes just as happily if the Worker started rewriting for
  //    everyone — which would put the ~1.9 s CMS call in front of every QR scan and
  //    show up as "the site got slow", diagnosed somewhere else entirely.
  const { html: browserHtml } = await get(url, BROWSER_UA)
  const browserTitle = browserHtml.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ''
  if (browserTitle.toUpperCase().includes(expectCode)) {
    fail(
      `A plain browser request was ALSO rewritten (<title> "${browserTitle}").\n` +
        '   Visitors must be served the static shell — see the latency measurement in\n' +
        '   apps/viewer/worker/index.ts.',
    )
  }

  // 6. THE SAME CRAWLER REQUEST, SENT AS A NAVIGATION. This is the check that was
  //    missing, and the one this script could not physically perform: `fetch` cannot
  //    send `Sec-Fetch-Mode` (see rawGet above), so every assertion here was made with
  //    a header shape no real crawler or browser uses.
  //
  //    Cloudflare's Static Assets router serves a top-level navigation straight from
  //    the asset router and never invokes the Worker. Measured live 2026-09-07: this
  //    exact URL with a Twitterbot UA returned the per-garment og:title on a plain
  //    request and the GENERIC one with `sec-fetch-mode: navigate`. A navigation is the
  //    only way a person or a link crawler ever reaches a page, so the whole feature was
  //    inert for its audience while every check in this file passed.
  //
  //    The fix is the `run_worker_first` ARRAY in apps/viewer/wrangler.jsonc, which
  //    disables that automatic detection. This asserts it is still in force ON THE
  //    DEPLOYED WORKER, which no unit test can.
  {
    const nav = await rawGet(url, {
      'user-agent': CRAWLER_UA,
      accept: 'text/html',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'none',
    })
    if (nav.status === 403 || nav.status === 429) {
      console.log(
        `⚠️  ${url} returned ${nav.status} to a navigation request — INCONCLUSIVE, as above.`,
      )
    } else {
      const navTitle = nav.html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ''
      if (!squash(navTitle).includes(expectCode)) {
        fail(
          `A crawler sending Sec-Fetch-Mode: navigate got <title> "${navTitle}",\n` +
            `   which does not name ${expectCode}. The Worker did not run: Cloudflare\n` +
            '   served the request from the asset router. Check that the\n' +
            '   `run_worker_first` array is still present in apps/viewer/wrangler.jsonc.',
        )
      } else {
        console.log('   navigation request → rewritten too')
      }

      // SO-02 / SO-03: the rewritten response must say its body depends on the
      // User-Agent, and must refuse Cloudflare's own injection — see
      // apps/viewer/worker/crawlerCacheHeaders.ts for both reasons in full. The
      // browser path (check 5 above) goes through a DIFFERENT mechanism
      // (withNoTransform in noTransform.ts) that never sets Vary, since a plain
      // visitor's response does not depend on their user-agent — so this is
      // asserted only here, on the crawler path.
      if (!variesOnUserAgent(nav.headers.vary)) {
        fail(
          `${url} answered vary: ${nav.headers.vary ?? '(none)'} to a rewritten crawler ` +
            'request — expected it to include User-Agent (SO-02), so a cache in front of ' +
            'this can never hand a crawler copy to a visitor.',
        )
      }
      if (!carriesNoTransform(nav.headers['cache-control'])) {
        fail(
          `${url} answered cache-control: ${nav.headers['cache-control'] ?? '(none)'} to a ` +
            'rewritten crawler request — expected no-transform (SO-03), or Cloudflare may ' +
            'inject into a response this Worker built by hand.',
        )
      }
    }
  }

  // 7. The garment page states its cross-origin policy (SE-05) and arrives compressed
  //    (PF-13). Asked the way a browser asks, offering br and gzip: the headers must carry
  //    both SE-05 values, and the body must arrive brotli-encoded and decode to the page.
  {
    const page = await rawGet(url, {
      'user-agent': BROWSER_UA,
      accept: 'text/html',
      'accept-encoding': 'br, gzip',
    })
    if (page.status === 403 || page.status === 429) {
      console.log(
        `⚠️  ${url} returned ${page.status} to a browser request — INCONCLUSIVE, as above.`,
      )
    } else {
      for (const header of ['cross-origin-opener-policy', 'cross-origin-resource-policy']) {
        if (page.headers[header] !== 'same-origin') {
          fail(
            `${url} answered ${header}: ${page.headers[header] ?? '(none)'}; expected same-origin (SE-05).`,
          )
        }
      }
      // PF-13: this browser offered br and gzip, so the Worker must have used brotli, and the
      // bytes must decode to the page.
      const text = decodeBody(page)
      if (page.headers['content-encoding'] !== 'br') {
        fail(
          `${url} came back ${page.headers['content-encoding'] ?? 'uncompressed'} to a browser offering br and gzip (PF-13).`,
        )
      } else if (text === null || !/<title>[^<]*<\/title>/i.test(text)) {
        fail(`${url} came back br but the body does not decode to a page (PF-13).`)
      }
    }
  }

  // 8. PF-13: only an encoding the visitor can read. Cloudflare rewrites Accept-Encoding
  //    before the Worker runs, so the gzip and identity cases prove the Worker chose from
  //    the visitor's own list (request.cf.clientAcceptEncoding), and the last proves it
  //    sends plain when there is no list. Then a NAVIGATION, which Cloudflare may rewrite
  //    on the way out (apps/viewer/worker/noTransform.ts): whatever arrives must decode.
  for (const [who, offered, expected] of [
    ['a browser offering only gzip', { 'accept-encoding': 'gzip' }, 'gzip'],
    ['a client asking for identity', { 'accept-encoding': 'identity' }, undefined],
    ['a client naming no encoding', {}, undefined],
  ]) {
    const res = await rawGet(url, { 'user-agent': BROWSER_UA, accept: 'text/html', ...offered })
    if (res.status === 403 || res.status === 429) {
      console.log(`⚠️  ${url} returned ${res.status} to ${who} — INCONCLUSIVE, as above.`)
      continue
    }
    if (res.headers['content-encoding'] !== expected) {
      fail(
        `${url} came back ${res.headers['content-encoding'] ?? 'uncompressed'} to ${who}; ` +
          `expected ${expected ?? 'uncompressed'} (PF-13).`,
      )
    } else {
      const text = decodeBody(res)
      if (text === null || !/<title>[^<]*<\/title>/i.test(text)) {
        fail(
          `${url} came back ${expected ?? 'uncompressed'} to ${who}, but the body does not decode to a page (PF-13).`,
        )
      }
    }
  }
  {
    const nav = await rawGet(url, {
      'user-agent': BROWSER_UA,
      accept: 'text/html',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'none',
    })
    if (nav.status !== 403 && nav.status !== 429) {
      const text = decodeBody(nav)
      if (text === null || !/<title>[^<]*<\/title>/i.test(text)) {
        fail(
          `A browser navigating to ${url} got a ${nav.headers['content-encoding'] ?? 'plain'} ` +
            'body that does not decode to a page (PF-13).',
        )
      }
    } else {
      console.log(
        `⚠️  ${url} returned ${nav.status} to a browser navigation — INCONCLUSIVE, as above.`,
      )
    }
  }

  // 9. SO-02 / SO-03: the crawler path costs a synchronous CMS call; a browser gets the
  //    static shell straight from Cloudflare's asset router with no such hop. Measured
  //    2026-09-07 (apps/viewer/CLAUDE.md): the viewer's own static HTML is 0.106-0.155s to
  //    first byte, and the CMS payload endpoint is 1.77-2.27s — neither edge-cached.
  //
  //    ⚠️ A JUST-TOUCHED SLUG READS WARM AND ERASES THE ASYMMETRY — a documented false
  //    negative from measuring this the naive way: reusing PRODUCT/COLOUR above means the
  //    payload the crawler branch needs has already been fetched once this run and may
  //    still be warm wherever the CMS caches it, so the SECOND timing read of the SAME
  //    slug can come back misleadingly fast and this check would pass even if the real
  //    cold path is slow. A slug this script has not touched anywhere above is required —
  //    LIVE_PRODUCTS[1] unless that happens to be the slug already under test.
  //
  //    curl, not fetch (Global Constraints) — this needs to look like a real request AND
  //    time it, and `-w` is the one thing `fetch` cannot report at all.
  if (SITE_WIDE_CHECKS && !timingMeasured) {
    timingMeasured = true
    const timingProduct = LIVE_PRODUCTS.find((p) => p.slug !== PRODUCT) ?? LIVE_PRODUCTS[1]
    const timingUrl = `${BASE}/${timingProduct.slug}/${timingProduct.colourway}`

    // `--max-time` so a stalled connection ends as INCONCLUSIVE (status 0) instead of
    // hanging a post-deploy step until the job's own timeout.
    const timed = (headers) => {
      const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`])
      try {
        const out = execFileSync(
          'curl',
          [
            '-s',
            '--max-time',
            '20',
            '-o',
            '/dev/null',
            '-w',
            '%{http_code} %{time_starttransfer}',
            ...headerArgs,
            timingUrl,
          ],
          { encoding: 'utf8' },
        ).trim()
        const [status, seconds] = out.split(' ')
        return { status: Number(status), seconds: Number.parseFloat(seconds) }
      } catch {
        return { status: 0, seconds: Number.NaN }
      }
    }

    const crawler = timed({
      'user-agent': CRAWLER_UA,
      accept: 'text/html',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'sec-fetch-site': 'none',
    })
    const browser = timed({ 'user-agent': BROWSER_UA, accept: 'text/html' })

    if ([crawler.status, browser.status].some((s) => s === 0 || s === 403 || s === 429)) {
      console.log(
        `⚠️  timing check on ${timingUrl} got no usable answer (crawler ${crawler.status}, ` +
          `browser ${browser.status}; 0 = timed out or unreachable) — INCONCLUSIVE, as above.`,
      )
    } else {
      console.log(
        `   timing (${timingProduct.slug}/${timingProduct.colourway}, untouched earlier in this run): ` +
          `crawler ${crawler.seconds.toFixed(2)}s vs browser ${browser.seconds.toFixed(2)}s`,
      )
      // A wide, deliberately loose margin (not an exact pin — this is server-response
      // timing over a real network and this repo's own docs warn it jitters), set well
      // under the measured spread of 0.66-2.29s crawler vs ~0.08s browser: it fails only
      // if the synchronous CMS call stopped happening, never on ordinary variance.
      //
      // REPORT-ONLY, never a failure. This runs inside a post-deploy gate, and a payload
      // warmed by any other visitor inside the CMS's content-cache window erases the gap
      // on a perfectly healthy deploy. A red deploy for that is the "fails for a benign
      // reason" check this file's header warns against. The crawler path's headers
      // (checked above) are the hard gate; this number is recorded evidence.
      const MARGIN_SECONDS = 0.2
      if (crawler.seconds < browser.seconds + MARGIN_SECONDS) {
        console.log(
          `::warning::the crawler path (${crawler.seconds.toFixed(2)}s) is not meaningfully ` +
            `slower than the browser path (${browser.seconds.toFixed(2)}s) on ${timingUrl}. ` +
            'Expected the synchronous CMS call to show; a warm payload also does this.',
        )
      }
    }
  }

  // 10. SO-11: the 404 triad, live. apps/viewer/worker/notFound.ts has strong unit
  //     coverage (notFound.test.ts) for the DECISION function; this confirms the
  //     DEPLOYED Worker still produces the three real-world outcomes it decides between.
  //     Re-measured live 2026-09-24: unlike this row's own planning note, a plain GET of
  //     /manifest.webmanifest already 404s WITHOUT Sec-Fetch-Mode: navigate today (the
  //     run_worker_first array, live since 2026-09-07, puts the Worker in front of every
  //     request regardless) — sent anyway, harmlessly, as the header a real navigation
  //     always carries and the shape this exact bug class hid behind historically.
  if (SITE_WIDE_CHECKS) {
    const cases = [
      { label: 'a malformed path (3 segments)', path: '/a/b/c', expectHtml404: true },
      {
        label: 'a well-formed but nonexistent product (SPA fallback)',
        path: '/nope/wine',
        expectHtml404: false,
      },
      {
        label: 'a single-segment file request (manifest)',
        path: '/manifest.webmanifest',
        expectHtml404: true,
        navigate: true,
      },
    ]
    for (const { label, path, expectHtml404, navigate } of cases) {
      const target = `${BASE}${path}`
      const headers = { 'user-agent': BROWSER_UA, accept: 'text/html' }
      if (navigate) {
        headers['sec-fetch-mode'] = 'navigate'
        headers['sec-fetch-dest'] = 'document'
      }
      const res = await rawGet(target, headers)
      if (res.status === 403 || res.status === 429) {
        console.log(`⚠️  ${target} returned ${res.status} — INCONCLUSIVE, as above.`)
        continue
      }
      const is404 = res.status === 404
      if (is404 !== expectHtml404) {
        fail(
          `${label} (${target}) answered ${res.status}, expected ${expectHtml404 ? '404' : '200 (SPA fallback)'} (SO-11).`,
        )
      } else {
        console.log(`   404 triad: ${label} -> ${res.status}`)
      }
    }
  }

  return { title, canonical }
}

let result = { title: '', canonical: null }
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  result = await runChecks()
  if (failures.length === 0) {
    if (attempt > 1) console.log(`   (settled on attempt ${attempt} — deploy propagation)`)
    break
  }
  if (attempt === ATTEMPTS) break
  console.log(
    `   attempt ${attempt}/${ATTEMPTS}: not live yet (${failures.length} check(s) failing), ` +
      `retrying in ${RETRY_DELAY_MS / 1000}s…`,
  )
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
}

if (failures.length > 0) {
  console.error(`\n❌ The viewer page is wrong on ${url}:\n`)
  for (const message of failures) console.error(`   • ${message}`)
  console.error('')
  process.exit(1)
}

console.log(`\n✅ ${url} unfurls as "${result.title}"`)
console.log(`   canonical ${result.canonical}`)
console.log('   and a plain browser request is untouched.')
