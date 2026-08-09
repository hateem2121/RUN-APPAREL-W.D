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

const [, , baseArg, productArg, colourArg] = process.argv

const BASE = (baseArg || 'https://viewer.wear-run.help').replace(/\/+$/, '')
const PRODUCT = productArg || 'n001'
// Must be a slug that EXISTS, for the same reason smoke-viewer-payload.mjs says
// so: a retired slug falls back to the default colourway and still produces a
// complete, correct-looking preview, so the check would pass forever while only
// ever exercising the fallback.
const COLOUR = colourArg || 'wine'

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

/** Pull a meta tag's content by its `property=`/`name=` key. */
const meta = (html, key) =>
  html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`, 'i'))?.[1] ??
  null

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
  //    than the whole title keeps the check working when the product is renamed in
  //    the CMS — the code is what is printed on the tag and does not change.
  const expectCode = PRODUCT.toUpperCase()
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? ''
  if (!title.toUpperCase().includes(expectCode)) {
    fail(`<title> is "${title}" — the per-garment rewrite did not run.`)
  }
  for (const key of ['og:title', 'twitter:title']) {
    const value = meta(html, key) ?? ''
    if (!value.toUpperCase().includes(expectCode)) fail(`${key} is "${value}", expected ${expectCode}.`)
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
  console.error(`\n❌ Link previews are wrong on ${url}:\n`)
  for (const message of failures) console.error(`   • ${message}`)
  console.error('')
  process.exit(1)
}

console.log(`\n✅ ${url} unfurls as "${result.title}"`)
console.log(`   canonical ${result.canonical}`)
console.log('   and a plain browser request is untouched.')
