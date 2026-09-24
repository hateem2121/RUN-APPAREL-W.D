// E2E fixture server: serves the built viewer (SPA fallback) plus a mock
// public viewer API shaped exactly like the CMS endpoint, with assets from
// the asset-pipeline output (run `pnpm seed:assets` first).
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(dirname, '../dist')
const ASSETS = path.resolve(dirname, '../../../tools/asset-pipeline/output')
const PORT = Number(process.env.PORT ?? 4173)

// Apply the generated dist/_headers "/*" block (incl. the CSP) to every
// response, so the e2e suite validates the real Content-Security-Policy the way
// Cloudflare will serve it — a missing directive surfaces as a securitypolicy
// violation in the webgl spec instead of only in production.
function loadGlobalHeaders() {
  const p = path.join(DIST, '_headers')
  if (!existsSync(p)) return {}
  const out = {}
  let inGlobal = false
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      inGlobal = raw.trim() === '/*'
      continue
    }
    if (!inGlobal) continue
    const idx = raw.indexOf(':')
    if (idx > 0) out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim()
  }
  // `upgrade-insecure-requests` is the one production directive that cannot
  // survive here: this fixture serves plain HTTP, and the directive rewrites
  // every asset request to https://localhost:4173, which has no listener.
  //
  // Chromium exempts localhost from the upgrade, so this was invisible for as
  // long as the suite was Chromium-only. WebKit does not — under it the whole
  // bundle failed to load with "A TLS error caused the secure connection to
  // fail" and the SPA rendered an empty shell, which looks exactly like the app
  // being broken in Safari. It is not; production is HTTPS and the directive is
  // correct there. Everything else in the CSP is replayed verbatim, which is
  // what catches the real violations (blob:, the decoders, wasm-unsafe-eval).
  if (out['Content-Security-Policy']) {
    out['Content-Security-Policy'] = out['Content-Security-Policy']
      .split(';')
      .map((directive) => directive.trim())
      .filter((directive) => directive !== 'upgrade-insecure-requests')
      .join('; ')
  }
  return out
}
const GLOBAL_HEADERS = loadGlobalHeaders()

/**
 * Remove the Cloudflare Web Analytics beacon from the served shell.
 *
 * The beacon is a real `<script src>` pointing at static.cloudflareinsights.com.
 * Left in, every page load in this suite — 66 tests across four browsers — makes a
 * live cross-origin request to Cloudflare. Two consequences, both unwanted:
 *
 *  - `page.goto` waits for the `load` event, so a slow or unreachable third party
 *    turns into test latency and, intermittently, a failure. The first test in
 *    viewer.spec.ts already has a documented cold-start flake (see
 *    playwright.config.ts); a network-shaped second source of the same symptom
 *    would make that one impossible to tell apart from a real regression.
 *  - It would fire a pageview per test run. Cloudflare matches the reporting
 *    hostname by suffix so localhost:4173 ought to be discarded, but beaconing from
 *    CI at all is noise aimed at analytics whose entire purpose is counting real QR
 *    scans.
 *
 * Stripped here rather than made conditional at build time, so the artefact this
 * suite exercises stays byte-for-byte what ships apart from this one tag. The
 * beacon's only risky property — that a `src` script must never contribute a CSP
 * hash — is covered by scripts/csp.test.ts and re-verified against the live header
 * after each deploy.
 */
function stripBeacon(html) {
  return html.replace(
    /<script[^>]*static\.cloudflareinsights\.com[^>]*>\s*<\/script>/gi,
    '<!-- cf beacon omitted: e2e runs offline -->',
  )
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.hdr': 'image/vnd.radiance',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
}

/**
 * The colourways N001 actually ships, read from
 * `GET https://cms.wear-run.help/api/public/viewer/n001/wine` on 2026-08-13.
 *
 * WHY THEY WERE CHANGED. This fixture carried navy / black / crimson, and only
 * `black` had ever existed in production — the live garment is wine / blush /
 * butter / lime / black. So the axe scan and the Lighthouse run both audited
 * `/n001/navy`, a colourway the site answers with the stale-QR fallback. The
 * DOM shape happened to be close enough that nothing failed, which is exactly
 * the shape of this repo's most expensive recurring bug: "the test fixtures
 * could not exhibit the failure" (root CLAUDE.md). Fixtures that drift from
 * production are a gate that has quietly stopped describing production.
 *
 * `butter` is worth keeping for a second reason. At #FDFDC8 it is the
 * near-white swatch that `.colourway-tab__swatch` draws its inset ring for —
 * the ring that was missing in production until 2026-08-13 because `page.css`
 * read an undefined `var(--paper)`. Without a near-white colourway here, no
 * test can ever exhibit that class of bug either.
 *
 * 🟢 `lime` was DELIBERATELY ABSENT until 2026-08-30, when it joined the array
 * below as the 4th colourway to close the four-vs-five fixture gap. The
 * retired-colourway notice moved to `navy` in that same change — a slug that has
 * never existed in production — and both `a11y.spec.ts` and `viewer.spec.ts` now
 * visit `/n001/navy` for it. Adding `navy` here would silently turn those tests
 * into second scans of a healthy page, which is the exact hazard the old version
 * of this note described for `lime`.
 *
 * ⚠️ `variantId` IS NOT the production value and must not be "corrected" to it.
 * Production reports `Colorway 2`..`Colorway 6`; these name variants inside the
 * SEEDED PLACEHOLDER GLB, which `pnpm seed:assets` builds from
 * `tools/asset-pipeline/src/placeholders.ts`. `webgl.spec.ts` asserts
 * `model-viewer.variantName` equals one of them — it is the check that proves the
 * real KHR_materials_variants swap happened — so this field must match the asset
 * on disk, not the live CMS.
 *
 * ⚠️ ONE SLUG, ONE VARIANT — do not collapse two slugs onto one id again.
 * Until 2026-08-31 the placeholder carried only N001-NAVY / N001-BLACK /
 * N001-CRIMSON, so blush, butter AND lime all pointed at N001-CRIMSON. Three
 * consequences, none of which failed a test:
 *   1. A swap that had to reach the 4th or 5th variant could not be expressed —
 *      the exact bug that shipped on 2026-08-27, where model-viewer built only
 *      the arriving colourway's materials and four of five flickered.
 *   2. FOUR OF FIVE POSTER URLS 404'd. The poster path below is built from these
 *      slugs, and only `black` existed on disk.
 *   3. The retired-colourway fallback points at the default colourway's poster,
 *      so that path served a 404 as well.
 * The placeholder now ships five colourways under production's own slugs, so all
 * three are closed at once.
 */
const COLOURWAYS = [
  {
    slug: 'wine',
    displayName: 'Wine',
    variantId: 'N001-WINE',
    hexSwatch: '#825353',
    sequence: 1,
    isDefault: true,
  },
  {
    // ⚠️ A TWO-WORD NAME, 20 CHARACTERS, ADDED 2026-09-04 TO CLOSE A SECOND
    // FIXTURE GAP — and it is the longest one production actually ships, not a
    // stress value. This fixture served five single words ('Wine', 'Blush',
    // 'Butter', 'Lime', 'Black', 4-6 chars) while SIX of the eleven live products
    // ship two-word colourways: 'Pebble / Optic White' (20), 'Bottle Green / Mint'
    // (19), 'Blush / Powder Blue' (19), 'Powder Blue / Teal' (18), 'Lavender /
    // Indigo' (17), 'Blush / Fuchsia' (15).
    //
    // The consequence, measured on the live site 2026-09-04 at 844x390: the rail
    // wraps 4 + 1 and strands one swatch alone beside three empty cells. The test
    // written to prevent exactly that — "never strands a single swatch on its own
    // row" — PASSED, because a long word widens every equal-width column and short
    // words never trigger it. Same shape as the four-vs-five gap closed on
    // 2026-08-30 directly below: the gate could not see the defect it exists for.
    //
    // The SLUG stays 'blush' so no URL, no retired-colourway route and no existing
    // assertion moves; only the label a human reads gets longer. 'Blush' was chosen
    // because it was the one display name with zero references in any test.
    slug: 'blush',
    displayName: 'Pebble / Optic White',
    variantId: 'N001-BLUSH',
    hexSwatch: '#F7CDCD',
    sequence: 2,
    isDefault: false,
  },
  {
    slug: 'butter',
    displayName: 'Butter',
    variantId: 'N001-BUTTER',
    hexSwatch: '#FDFDC8',
    sequence: 3,
    isDefault: false,
  },
  {
    // ⚠️ ADDED 2026-08-30 TO CLOSE A FIXTURE GAP, and it changes what the layout
    // assertions can see. serve.mjs served FOUR colourways while production ships
    // FIVE, so `motion-and-layout.spec.ts`'s label-overflow gate could not fail:
    // under equal columns at 320px, four buttons give 71.2px each against
    // production's 55.4px, and "03 Butter" is 55.2px wide — it fitted in the fixture
    // and overflowed in production. The gate could not see the defect it exists for.
    //
    // The retired-colourway URL moved to `navy` in the same change (see below).
    slug: 'lime',
    displayName: 'Lime',
    variantId: 'N001-LIME',
    hexSwatch: '#D6F26B',
    sequence: 4,
    isDefault: false,
  },
  {
    slug: 'black',
    displayName: 'Black',
    variantId: 'N001-BLACK',
    hexSwatch: '#262727',
    sequence: 5,
    isDefault: false,
  },
]

const siteSettings = {
  companyName: 'RUN APPAREL (PVT) LTD',
  email: 'partner@wear-run.com',
  whatsappNumber: '+923361777313',
  catalogueUrl: 'https://wear-run.help/catalogue',
  temporaryWordmark: 'RUN APPAREL',
  footerLine: 'RUN THE EXTRA MILE.',
  legalLine: '© RUN APPAREL (PVT) LTD',
}

function colourwayPayload(origin, c) {
  return {
    variantId: c.variantId,
    displayName: c.displayName,
    slug: c.slug,
    sequence: c.sequence,
    poster: {
      url: `${origin}/fixtures/placeholders/n001-${c.slug}-poster.webp`,
      alt: `Velocity Performance Tee in ${c.displayName}`,
      width: 1200,
      height: 1500,
      mimeType: 'image/webp',
    },
    glbUrl: null,
    isDefault: c.isDefault,
    altText: `Velocity Performance Tee in ${c.displayName}`,
    hexSwatch: c.hexSwatch,
  }
}

// `colourSlug === null` mirrors GET /api/public/viewer/:productSlug — the
// visitor named no colour. It must NOT come back flagged as a retired-colourway
// fallback, or the page tells them a colour was discontinued when none was.
// Keep this in step with apps/cms/src/endpoints/projectViewer.ts.
// Products this fixture serves. `n002` has no finished 3D file, which is the
// state a published-but-modelless product is in. Without it the poster-fallback
// path and its diagnostic could not be exercised by any test — the same
// "the fixture cannot exhibit the failure" gap that hid three production bugs.
//
// ⚠️ `shortDescription` IS SET ON n001 AND DELIBERATELY ABSENT ON n002, added
// 2026-08-17. Both branches are real production states and BOTH must be
// renderable here: every product that existed before the field was added has no
// description, so <ProductPanel>'s fallback paragraph is what the live catalogue
// shows today — and a fixture with no description anywhere can only ever exercise
// the fallback, which is how a broken description path would ship green. Same
// gap, same shape, as the three production bugs CLAUDE.md opens with.
const PRODUCTS = {
  n001: {
    productCode: 'N001',
    productName: 'Velocity Performance Tee',
    hasGlb: true,
    shortDescription:
      'A race-fit training tee built for long summer mileage. Recycled face yarn, ' +
      'bonded shoulder seams and a dropped back hem that stays put at speed.',
  },
  n002: { productCode: 'N002', productName: 'Sample Without Model', hasGlb: false },
}

// Per-key request counts for the stall route below. Keyed so tests running in parallel never share a counter.
const STALL_COUNTS = new Map()

function viewerPayload(origin, colourSlug, productSlug = 'n001') {
  const meta = PRODUCTS[productSlug]
  const colourways = COLOURWAYS.map((c) => colourwayPayload(origin, c))
  const requested =
    colourSlug === null ? null : (colourways.find((c) => c.slug === colourSlug) ?? null)
  const unavailable = colourSlug !== null && requested === null
  const fallback = colourways.find((c) => c.isDefault)
  const retiredMessage =
    'The colorway linked by this QR is no longer active. You are viewing the current available reference.'
  return {
    product: {
      productCode: meta.productCode,
      slug: productSlug,
      productName: meta.productName,
      // `?? ''` mirrors projectViewer.ts exactly: the API always emits a string,
      // so the viewer's `||` fallback is the only thing that decides.
      shortDescription: meta.shortDescription ?? '',
      category: 'Sportswear',
      variantMode: 'single-glb-variants',
      glbUrl: meta.hasGlb ? `${origin}/fixtures/n001.glb` : null,
      posterFallback: fallback.poster,
      fabricComposition: 'Recycled polyester / elastane',
      gsm: '160 GSM',
      performanceFeatures: ['Moisture management', 'Four-way stretch'],
      garmentFit: 'Athletic regular',
      customisationIntroHtml:
        '<p>Send us a finished design, a tech pack, artwork, a reference image — or simply an idea.</p>',
      customisationSteps: [
        {
          number: 1,
          title: 'SHARE YOUR STARTING POINT',
          body: 'A design, tech pack, artwork or idea.',
        },
        {
          number: 2,
          title: 'DEFINE THE PRODUCT',
          body: 'Fabric, color, fit, trims, performance.',
        },
        { number: 3, title: 'ADD YOUR BRAND', body: 'Logos, labels, prints, embroidery.' },
        { number: 4, title: 'SAMPLE, REFINE AND PRODUCE', body: 'Approve, refine, produce.' },
      ],
      camera: {
        frontCameraOrbit: '0deg 82deg 105%',
        backCameraOrbit: '180deg 82deg 105%',
        sideCameraOrbit: '90deg 82deg 105%',
        cameraTarget: 'auto auto auto',
        defaultFieldOfView: '30deg',
      },
      catalogueUrl: 'https://wear-run.help/catalogue',
      retiredMessage,
    },
    colourways,
    selectedColourway: requested ?? fallback,
    requestedColourwayUnavailable: unavailable,
    fallbackMessage: unavailable ? retiredMessage : null,
    siteSettings,
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const origin = `http://localhost:${PORT}`

  // Mirror Cloudflare applying the "/*" headers (CSP + security headers) to
  // every response.
  for (const [key, value] of Object.entries(GLOBAL_HEADERS)) res.setHeader(key, value)

  // The `/render` screenshot route was mirrored here until 2026-08-17, along
  // with a hand-copy of renderGuard.ts's host check. Both went with the
  // automatic poster capture they served.

  // Mock public viewer API. Both real routes: with and without a colour segment.
  const apiMatch = url.pathname.match(/^\/api\/public\/viewer\/([^/]+)(?:\/([^/]+))?$/)
  if (apiMatch) {
    res.setHeader('content-type', 'application/json')
    if (!(apiMatch[1] in PRODUCTS)) {
      res.statusCode = 404
      res.end(
        JSON.stringify({
          error: 'not_found',
          message: 'This product reference is not currently available.',
        }),
      )
      return
    }
    res.end(JSON.stringify(viewerPayload(origin, apiMatch[2] ?? null, apiMatch[1])))
    return
  }

  // A model request that answers 200 with its headers and then sends NOTHING, for the first N requests per key —
  // exactly what Cloudflare's Islamabad edge did on 2026-09-24 (issue #41; its analytics logged status 499, 0
  // bytes). Not a slow file and not a 5xx: both of those settle on their own, and this must not.
  //   /fixtures/stall/<key>/<n>/<file>
  // Request n+1 for a key falls through to the real file below, which is what lets TRY 3D AGAIN be shown to
  // recover. The held response is released when the browser aborts it (the viewer's retry does exactly that).
  // The FIRST request sends the file's first 64 KB before going silent, so the suite also covers a stall AFTER
  // bytes arrived — the case where the readout must reset to 0 for "TRYING AGAIN" to show. Later ones send nothing:
  // a prefix on every retry would satisfy "bytes arrived" and hide the retry line a moment after it appeared.
  const stallMatch = url.pathname.match(/^\/fixtures\/stall\/([\w-]+)\/(\d+)\/(.+)$/)
  if (stallMatch) {
    const [, key, n, rest] = stallMatch
    const seen = (STALL_COUNTS.get(key) ?? 0) + 1
    STALL_COUNTS.set(key, seen)
    if (seen <= Number(n)) {
      res.writeHead(200, { 'content-type': 'model/gltf-binary' })
      res.flushHeaders()
      if (seen === 1) {
        const file = path.join(ASSETS, rest)
        if (existsSync(file)) res.write(readFileSync(file).subarray(0, 64 * 1024))
      }
      return
    }
    url.pathname = `/fixtures/${rest}`
  }

  // Pipeline assets
  if (url.pathname.startsWith('/fixtures/')) {
    const file = path.join(ASSETS, url.pathname.replace('/fixtures/', ''))
    if (existsSync(file)) {
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
      /*
       * ⚠️ NO `content-length`, AND THAT MAKES ONE WHOLE UI STATE UNREACHABLE HERE.
       *
       * Node streams chunked without it, so `fetchWithProgress` reads a null
       * content-length and `bytesTotal` stays 0. `describeLoad` returns `preparing`
       * only for `bytesTotal > 0 && bytesLoaded >= bytesTotal`, so that phase never
       * occurs in e2e: its "PREPARING 3D MODEL…" title, its indeterminate sweep, and
       * its live-region announcement "Download complete. Preparing the interactive
       * 3D model." have never been exercised by any browser test. Production DOES
       * send the header — measured on the live model 2026-09-04,
       * `content-length: 3883016` — so this fixture is less faithful than it looks.
       *
       * ⚠️ IT WAS ADDED ON 2026-09-04 AND THEN REVERTED, and the reason is worth
       * more than the line was. With `res.setHeader('content-length', statSync(file)
       * .size)` here, `webgl.spec.ts` -> "3D model loads and switching colourway
       * changes the KHR material variant" fails in the FULL suite — `model-viewer`
       * never mounts inside its 5s wait — while passing when the webgl project runs
       * alone. Measured both ways, twice: 369 passed without the header, 368 passed
       * and 1 failed with it. `fetchWithProgress` does not validate the length, so
       * the mechanism is not that; it is some interaction with the other four
       * projects sharing this server, and it was not understood.
       *
       * A change that makes CI fail for a reason nobody can explain is worse than a
       * documented gap, so the gap is documented instead. If the `preparing` state
       * needs real coverage, find out WHY that test regresses first — the answer is
       * probably worth knowing on its own. The phase's decision logic is unit-tested
       * in the meantime: `showsIndeterminateSweep` in lib/loadProgress.ts.
       */
      createReadStream(file).pipe(res)
      return
    }
    res.statusCode = 404
    res.end('missing fixture — run `pnpm seed:assets` first')
    return
  }

  // Static dist with SPA fallback (mirrors Cloudflare Pages `_redirects`)
  const candidate = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)
  if (existsSync(candidate) && path.extname(candidate)) {
    res.setHeader('content-type', MIME[path.extname(candidate)] ?? 'application/octet-stream')
    // `/` resolves to index.html here, so the shell reaches the browser through
    // THIS branch as well as the SPA fallback below — both need the beacon gone.
    if (path.extname(candidate) === '.html') {
      res.end(stripBeacon(readFileSync(candidate, 'utf8')))
      return
    }
    createReadStream(candidate).pipe(res)
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(stripBeacon(readFileSync(path.join(DIST, 'index.html'), 'utf8')))
})

server.listen(PORT, () => {
  console.log(`viewer e2e server on http://localhost:${PORT}`)
})
