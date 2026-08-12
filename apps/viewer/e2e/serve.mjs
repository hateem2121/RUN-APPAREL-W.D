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

const COLOURWAYS = [
  {
    slug: 'navy',
    displayName: 'Navy',
    variantId: 'N001-NAVY',
    hexSwatch: '#22314E',
    sequence: 1,
    isDefault: true,
  },
  {
    slug: 'black',
    displayName: 'Black',
    variantId: 'N001-BLACK',
    hexSwatch: '#17181A',
    sequence: 2,
    isDefault: false,
  },
  {
    slug: 'crimson',
    displayName: 'Crimson',
    variantId: 'N001-CRIMSON',
    hexSwatch: '#8C1F2F',
    sequence: 3,
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
const PRODUCTS = {
  n001: { productCode: 'N001', productName: 'Velocity Performance Tee', hasGlb: true },
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

/**
 * Mirrors apps/viewer/worker/renderGuard.ts's isAllowedRenderModel — by hand,
 * not by import, for the same reason every other production behaviour in
 * this file is mirrored rather than run for real: this server serves the
 * built dist/ directly and never runs the Cloudflare Worker (see the file
 * header above), so worker/index.ts's own `/render` guard is never exercised
 * by this suite either way. Kept in sync deliberately; renderGuard.ts is pure
 * and unit-tested on its own (renderGuard.test.ts), so a drift here would
 * only ever make the e2e fixture MORE permissive or MORE strict than
 * production, never silently wrong about what production actually does.
 */
function isAllowedRenderModel(rawModel, pageOrigin) {
  if (!rawModel) return false
  let url
  try {
    url = new URL(rawModel, pageOrigin)
  } catch {
    return false
  }
  if (url.origin === pageOrigin) return true
  return url.protocol === 'https:' && /(^|\.)wear-run\.help$/.test(url.hostname)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const origin = `http://localhost:${PORT}`

  // Mirror Cloudflare applying the "/*" headers (CSP + security headers) to
  // every response.
  for (const [key, value] of Object.entries(GLOBAL_HEADERS)) res.setHeader(key, value)

  // Task 13/14's screenshot route — mirrors worker/index.ts's own guard (see
  // isAllowedRenderModel's comment above for why this is a mirror, not a
  // shared import). Checked before anything else, same as production.
  if (req.method === 'GET' && url.pathname === '/render') {
    if (!isAllowedRenderModel(url.searchParams.get('model'), origin)) {
      res.statusCode = 400
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('The "model" parameter must be a path or URL on our own host.')
      return
    }
    // Falls through to the SPA-fallback branch at the bottom, same as
    // production falling through to env.ASSETS.fetch(request).
  }

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
