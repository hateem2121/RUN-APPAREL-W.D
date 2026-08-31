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
 * ⚠️ `lime` is DELIBERATELY ABSENT and must stay absent. `a11y.spec.ts` visits
 * `/n001/lime` to reach the retired-colourway notice; adding it here silently
 * turns that test into a second scan of a healthy page.
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
    slug: 'blush',
    displayName: 'Blush',
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

function viewerPayload(origin, colourSlug, productSlug = 'n001') {
  const meta = PRODUCTS[productSlug]
  const colourways = COLOURWAYS.map((c) => colourwayPayload(origin, c))
  const requested =
    colourSlug === null ? null : (colourways.find((c) => c.slug === colourSlug) ?? null)
  const unavailable = colourSlug !== null && requested === null
  const fallback = colourways.find((c) => c.isDefault)
  const retiredMessage =
    'The colourway linked by this QR is no longer active. You are viewing the current available reference.'
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
          body: 'Fabric, colour, fit, trims, performance.',
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

  // Pipeline assets
  if (url.pathname.startsWith('/fixtures/')) {
    const file = path.join(ASSETS, url.pathname.replace('/fixtures/', ''))
    if (existsSync(file)) {
      res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream')
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
