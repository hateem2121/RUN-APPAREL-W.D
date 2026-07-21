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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
}

const COLOURWAYS = [
  { slug: 'navy', displayName: 'Navy', variantId: 'N001-NAVY', hexSwatch: '#22314E', sequence: 1, isDefault: true },
  { slug: 'black', displayName: 'Black', variantId: 'N001-BLACK', hexSwatch: '#17181A', sequence: 2, isDefault: false },
  { slug: 'crimson', displayName: 'Crimson', variantId: 'N001-CRIMSON', hexSwatch: '#8C1F2F', sequence: 3, isDefault: false },
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

function viewerPayload(origin, colourSlug) {
  const colourways = COLOURWAYS.map((c) => colourwayPayload(origin, c))
  const requested = colourways.find((c) => c.slug === colourSlug) ?? null
  const fallback = colourways.find((c) => c.isDefault)
  const retiredMessage =
    'The colourway linked by this QR is no longer active. You are viewing the current available reference.'
  return {
    product: {
      productCode: 'N001',
      slug: 'n001',
      productName: 'Velocity Performance Tee',
      category: 'Sportswear',
      variantMode: 'single-glb-variants',
      presentationMode: 'floatingGarment',
      glbUrl: `${origin}/fixtures/n001.glb`,
      posterFallback: fallback.poster,
      fabricComposition: 'Recycled polyester / elastane',
      gsm: '160 GSM',
      performanceFeatures: ['Moisture management', 'Four-way stretch'],
      garmentFit: 'Athletic regular',
      customisationIntroHtml:
        '<p>Send us a finished design, a tech pack, artwork, a reference image — or simply an idea.</p>',
      customisationSteps: [
        { number: 1, title: 'SHARE YOUR STARTING POINT', body: 'A design, tech pack, artwork or idea.' },
        { number: 2, title: 'DEFINE THE PRODUCT', body: 'Fabric, colour, fit, trims, performance.' },
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
    requestedColourwayUnavailable: requested === null,
    fallbackMessage: requested === null ? retiredMessage : null,
    siteSettings,
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const origin = `http://localhost:${PORT}`

  // Mock public viewer API
  const apiMatch = url.pathname.match(/^\/api\/public\/viewer\/([^/]+)\/([^/]+)$/)
  if (apiMatch) {
    res.setHeader('content-type', 'application/json')
    if (apiMatch[1] !== 'n001') {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'not_found', message: 'This product reference is not currently available.' }))
      return
    }
    res.end(JSON.stringify(viewerPayload(origin, apiMatch[2])))
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
    createReadStream(candidate).pipe(res)
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(readFileSync(path.join(DIST, 'index.html')))
})

server.listen(PORT, () => {
  console.log(`viewer e2e server on http://localhost:${PORT}`)
})
