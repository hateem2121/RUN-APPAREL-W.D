import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { type Server, createServer } from 'node:http'
import { extname, join } from 'node:path'
import { type GlbDescription, describeGlb } from './describe'
import { MIME, viewerAssetMap } from './render'
import {
  CAMERA_FREEDOM_ATTRIBUTES,
  environmentUrl,
  instrumentsScript,
  lightingAttributeHtml,
  lightingModesLiteral,
  PRODUCTION_ENVIRONMENT_URL,
  productionEnvironmentPath,
} from './viewer-page'

/**
 * Serve every GLB in a directory in a live `<model-viewer>`, for judging garments.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A CONTACT SHEET. Owner requirement,
 * 2026-08-26: *"Provide all the models in a local live 3d viewer so I can test
 * them."* A still frame cannot show what turning a garment shows — a print that
 * reads correctly head-on can be wrong at 40°, and a metallic fabric only
 * announces itself when the light moves across it. `render.ts` still produces the
 * contact sheets, because a diff needs the same frame twice; this is where a human
 * decides.
 *
 * ⚠️ IT MUST BE THE RENDERER PRODUCTION USES, OR IT ANSWERS A DIFFERENT QUESTION.
 * Everything static comes from `viewerAssetMap()`, shared with the render harness,
 * so the two cannot drift onto different model-viewer builds or different decoders.
 * `@google/model-viewer` is pinned to the same version in `apps/viewer/package.json`
 * and this package's own `package.json`.
 *
 * ⚠️ IT IS FOR PROCESSED OUTPUT FIRST, RAW EXPORTS SECOND. Verified 2026-08-26
 * against the real catalogue: the 409.7 MB METRO-SHIELD SUIT loads and turns
 * fine. The 1,253 MB Cycling Bib is a browser's whole memory budget in one
 * request and has NOT been shown to load — do not read a failure there as a
 * verdict on the garment. The regression run this exists to serve (Task 14) views
 * the SHRUNK output, which is tens of megabytes.
 *
 * ⚠️ MODELS ARE ADDRESSED BY INDEX, NEVER BY A PATH FROM THE REQUEST. The directory
 * comes from argv; the URL supplies two integers. Nothing from a request is ever
 * joined onto a filesystem path. That is the same class of defect recorded in
 * `apps/shrink/container/server.ts`, where a bare argument became the input path and
 * `/etc/passwd` was reachable — and what actually kept that safe was upstream, not
 * the check that looked like it was doing the work.
 */

/**
 * The publish ceiling, shown against every garment.
 *
 * DELIBERATELY A SECOND COPY of `GLB_HARD_MAX_BYTES` in `packages/shared/src/media.ts`,
 * not an import — this package is installed with plain `npm install` inside the
 * shrink container's Docker image, where a `workspace:*` dependency cannot resolve.
 * Exactly the arrangement `SIZE_WARNING_BYTES` already has in `validate.ts`, and
 * pinned equal by a drift test in `review-server.test.ts` for the same reason.
 */
export const HARD_MAX_BYTES = 40 * 1024 * 1024

/**
 * The instruments and their constants — the decal depth bias, the adaptive near plane,
 * the production environment map — live in viewer-page.ts since 2026-09-02, shared
 * with the render harness, and are re-exported here so the drift tests in
 * review-server.test.ts and the audit's probe scripts keep reading them from this
 * module. The history of the two drifts that led here is on the constants there.
 */
export {
  DECAL_OFFSET_FACTOR,
  DECAL_OFFSET_UNITS,
  MAX_ABS_OVERLAY_BIAS,
  MIN_ABS_OVERLAY_BIAS,
  MIN_NEAR,
  NEAR_FRACTION,
  PRODUCTION_ENVIRONMENT_FILE,
  PRODUCTION_ENVIRONMENT_URL,
  productionEnvironmentPath,
} from './viewer-page'

export interface ReviewGarment {
  dirIndex: number
  fileIndex: number
  name: string
  path: string
  dir: string
  description: GlbDescription
}

export interface ReviewServerHandle {
  server: Server
  port: number
  /** Ends with a slash, so `${url}api/garments` composes. */
  url: string
  /**
   * Shut down, including sockets a client is holding open.
   *
   * ⚠️ `server.close()` ALONE HANGS. It stops accepting new connections and then
   * waits for existing ones to end — and Node's own `fetch` (undici) keeps its
   * sockets alive by default, so nothing ever ends them. Measured 2026-08-26:
   * the test suite's `afterAll` timed out at 10s with every assertion already
   * passed, which reads as a broken server and is a leaked socket.
   * `closeAllConnections()` is what actually ends them.
   */
  close(): Promise<void>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1)

/** Index every GLB under the given directories, describing each one. */
async function indexGarments(dirs: string[]): Promise<ReviewGarment[]> {
  const garments: ReviewGarment[] = []
  for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
    const dir = dirs[dirIndex]
    if (!dir) continue
    let entries: string[] = []
    try {
      entries = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.glb')).sort()
    } catch {
      // A directory that cannot be read is reported as empty rather than fatal —
      // one bad argument must not stop the other directory being reviewable.
      continue
    }
    for (let fileIndex = 0; fileIndex < entries.length; fileIndex++) {
      const name = entries[fileIndex]
      if (!name) continue
      const path = join(dir, name)
      garments.push({
        dirIndex,
        fileIndex,
        name: name.replace(/\.glb$/i, ''),
        path,
        dir,
        // Reads the JSON chunk only, so indexing 28 garments across 7.7 GB costs
        // about a second.
        description: await describeGlb(path),
      })
    }
  }
  return garments
}

/** The card grid. Size and family sit next to the picture, so both are read together. */
function indexPage(garments: ReviewGarment[], dirs: string[]): string {
  const cards = garments
    .map((g) => {
      const d = g.description
      const over = d.bytes > HARD_MAX_BYTES
      const problems: string[] = []
      if (d.error) problems.push(`UNREADABLE: ${escapeHtml(d.error)}`)
      if (d.colourways.count > 0 && !d.colourways.fullyMapped) {
        problems.push('COLOURWAYS DECLARED BUT NOT BOUND — the switcher would do nothing')
      }
      if (d.pbrSuspects.length)
        problems.push(`${d.pbrSuspects.length} fabric material(s) set to metal`)
      return `<a class="card" href="/g/${g.dirIndex}/${g.fileIndex}">
  <div class="name">${escapeHtml(g.name)}</div>
  <div class="meta">
    <span class="fam fam-${d.family}">${d.family}</span>
    <span class="${over ? 'over' : 'ok'}">${mb(d.bytes)} MB</span>
    <span>${d.colourways.count} colourways</span>
    <span>${d.triangles.toLocaleString()} tris</span>
  </div>
  ${problems.map((p) => `<div class="warn">${p}</div>`).join('')}
</a>`
    })
    .join('\n')

  return `<!doctype html>
<meta charset="utf-8">
<title>Garment review</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #111; color: #eee;
         font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #888; margin-bottom: 20px; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
  .card { display: block; padding: 14px 16px; background: #1b1b1b; border: 1px solid #2c2c2c;
          border-radius: 8px; text-decoration: none; color: inherit; }
  .card:hover { border-color: #555; background: #202020; }
  .name { font-weight: 600; margin-bottom: 6px; }
  .meta { display: flex; flex-wrap: wrap; gap: 10px; color: #999; font-size: 12px; }
  .fam { padding: 1px 7px; border-radius: 99px; font-weight: 600; }
  .fam-texture { background: #3a2a10; color: #f0b46a; }
  .fam-geometry { background: #102a3a; color: #6ac0f0; }
  .fam-mixed { background: #2a2a2a; color: #bbb; }
  .over { color: #ff6b6b; font-weight: 600; }
  .ok { color: #7ad07a; }
  .warn { margin-top: 8px; padding: 6px 8px; background: #3a1414; color: #ff9b9b;
          border-radius: 4px; font-size: 12px; }
</style>
<h1>Garment review</h1>
<div class="sub">
  ${garments.length} garment(s) from ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'}.
  Red size = over the ${mb(HARD_MAX_BYTES)} MB publish ceiling.
  Click a garment to turn it, switch colourways and move the light.
</div>
<div class="grid">
${cards}
</div>`
}

/**
 * One garment, full window.
 *
 * THREE LIGHTING MODES. "Diagnostic" is byte-for-byte the harness setup in
 * `render.ts` — flat neutral, shadows off — which isolates the texture and the UVs
 * beneath it. "Studio" is a deliberately punchy sales light (`legacy` environment,
 * `commerce` tone-mapping) and it is the only one in which a metallic-fabric defect is
 * visible at all: specular highlights need a light that moves. Judging metalness under
 * diagnostic light would report every one of the 55 measured offenders as fine.
 *
 * ⚠️ "Production" IS THE DEFAULT, AND NEITHER OF THE OTHER TWO IS WHAT A CUSTOMER SEES.
 * Added 2026-08-29 after the owner reviewed two garments here under "Studio" and
 * reported *"metallic/shiny feel is present in the whole garment, both of them"* — on
 * files measured to contain ZERO metallic materials (metallicFactor 0 on 178/178 and
 * 65/65, before and after the pipeline). The gloss was the light, not the garment:
 * `legacy` + `commerce` is far glossier than production's soft studio HDR + `neutral`.
 * Same class as the decal bias and the near plane above — the page said it renders what
 * production renders, and on the LIGHT it did not. Held equal to Stage.tsx and pinned by
 * review-server.test.ts.
 *
 * The HDR is read from `apps/viewer/public/env/` at request time and this page falls
 * back to `neutral` and says so when it is absent, so the shrink container — which
 * never runs this command and has no `apps/` — cannot be broken by its absence.
 */
function garmentPage(garment: ReviewGarment): string {
  // 'neutral' when apps/viewer is not on disk, so this never renders a broken light.
  const envUrl = environmentUrl()
  const d = garment.description
  const over = d.bytes > HARD_MAX_BYTES
  const rows: [string, string][] = [
    ['family', d.family],
    ['size', `${mb(d.bytes)} MB${over ? ` — OVER the ${mb(HARD_MAX_BYTES)} MB ceiling` : ''}`],
    ['textures / geometry', `${mb(d.textureBytes)} MB / ${mb(d.geometryBytes)} MB`],
    [
      'triangles',
      `${d.triangles.toLocaleString()} (${(d.stitchFraction * 100).toFixed(1)}% topstitch)`,
    ],
    ['materials', `${d.materials.total} — ${d.materials.blend} BLEND, ${d.materials.mask} MASK`],
    ['colourways', `${d.colourways.count}${d.colourways.fullyMapped ? '' : ' — NOT BOUND'}`],
    ['fabric set to metal', String(d.pbrSuspects.length)],
    ['unclassified metallic', String(d.unclassifiedMetallic.length)],
  ]
  return `<!doctype html>
<meta charset="utf-8">
<title>${escapeHtml(garment.name)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #111; color: #eee; display: flex; height: 100vh;
         font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; }
  model-viewer { flex: 1; height: 100vh; background: #808080; --poster-color: transparent; }
  aside { width: 300px; padding: 16px; overflow-y: auto; border-left: 1px solid #2c2c2c; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  a.back { color: #6ac0f0; text-decoration: none; font-size: 12px; }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0;
         border-bottom: 1px solid #222; }
  .row span:first-child { color: #888; }
  .row span:last-child { text-align: right; }
  h2 { font-size: 12px; text-transform: uppercase; color: #888; margin: 18px 0 6px; }
  button { background: #222; color: #ddd; border: 1px solid #3a3a3a; border-radius: 5px;
           padding: 5px 10px; margin: 0 4px 4px 0; cursor: pointer; font: inherit; }
  button:hover { background: #2c2c2c; }
  button[aria-pressed="true"] { background: #2f5d8a; border-color: #3f7fbf; color: #fff; }
  #bias-report { margin-top: 6px; color: #888; font-size: 12px; }
  #status { margin-top: 12px; color: #ff9b9b; }
  .over { color: #ff6b6b; font-weight: 600; }
</style>
<model-viewer
  id="mv"
  src="/model/${garment.dirIndex}/${garment.fileIndex}"
  camera-controls
  interaction-prompt="none"
  ${lightingAttributeHtml('production', envUrl)}
  ${CAMERA_FREEDOM_ATTRIBUTES}
></model-viewer>
<aside>
  <a class="back" href="/">&larr; all garments</a>
  <h1>${escapeHtml(garment.name)}</h1>
  ${rows
    .map(
      ([k, v]) =>
        `<div class="row"><span>${escapeHtml(k)}</span><span${k === 'size' && over ? ' class="over"' : ''}>${escapeHtml(v)}</span></div>`,
    )
    .join('\n  ')}
  <h2>Colourway</h2>
  <div id="colourways">(loading)</div>
  <h2>Lighting</h2>
  <div id="lighting">
    <button id="lit-production" aria-pressed="true">Production</button>
    <button id="lit-diagnostic" aria-pressed="false">Diagnostic</button>
    <button id="lit-studio" aria-pressed="false">Studio</button>
  </div>
  <h2>Decal depth bias</h2>
  <div id="bias">
    <button id="bias-on" aria-pressed="true">On (as shipped)</button>
    <button id="bias-off" aria-pressed="false">Off</button>
  </div>
  <div id="bias-report"></div>
  <div id="status"></div>
</aside>
<script type="module">
  import { ModelViewerElement } from '/model-viewer.js'
  // Self-hosted and identical to render.ts and apps/viewer/src/components/Stage.tsx.
  // Set BEFORE any model loads, or every production GLB fails with
  // "setMeshoptDecoder must be called before loading compressed files" — the bug
  // that made the first real garment render as an empty stage.
  ModelViewerElement.meshoptDecoderLocation = '/meshopt_decoder.js'
  ModelViewerElement.dracoDecoderLocation = '/draco/'
  ModelViewerElement.ktx2TranscoderLocation = '/basis/'

  const mv = document.getElementById('mv')
  const status = document.getElementById('status')

${instrumentsScript()}
  for (const on of [true, false]) {
    document.getElementById(on ? 'bias-on' : 'bias-off').onclick = () => {
      window.__instruments.setBias(on)
      document.getElementById('bias-on').setAttribute('aria-pressed', String(on))
      document.getElementById('bias-off').setAttribute('aria-pressed', String(!on))
    }
  }

  mv.addEventListener('load', () => {
    // The instruments install themselves on 'load' (viewer-page.ts). This listener
    // only builds the colourway switcher.
    // KHR_materials_variants. Every garment in the catalogue declares 5 (Mantra Ray
    // 6), but STRUCTURE POLO SET binds NONE of them — so an empty list here is a
    // real finding about the file, not a bug in this page. Say which.
    const bar = document.getElementById('colourways')
    const names = mv.availableVariants ?? []
    if (!names.length) {
      bar.textContent = 'No colourway is bound in this file — every colour renders identically.'
      bar.style.color = '#ff9b9b'
      return
    }
    bar.replaceChildren(...names.map((name, i) => {
      const b = document.createElement('button')
      b.textContent = name
      b.setAttribute('aria-pressed', String(i === 0))
      b.onclick = () => {
        mv.variantName = name
        for (const other of bar.children) other.setAttribute('aria-pressed', String(other === b))
      }
      return b
    }))
  })

  mv.addEventListener('error', (event) => {
    // A decoder that failed to load looks EXACTLY like a broken garment. Never let
    // the owner reach that conclusion from a tooling fault.
    status.textContent =
      'FAILED TO LOAD — this may be the viewer rather than the garment: ' +
      String(event.detail?.sourceError ?? event.detail?.type ?? 'unknown')
  })

  const modes = ${lightingModesLiteral(envUrl)}
  for (const key of Object.keys(modes)) {
    document.getElementById('lit-' + key).onclick = () => {
      for (const [attr, value] of Object.entries(modes[key])) mv.setAttribute(attr, value)
      for (const k of Object.keys(modes)) {
        document.getElementById('lit-' + k).setAttribute('aria-pressed', String(k === key))
      }
    }
  }
</script>`
}

/**
 * Start the review server. Pass `port` 0 (the default) to take any free port.
 */
export async function startReviewServer(dirs: string[], port = 0): Promise<ReviewServerHandle> {
  const garments = await indexGarments(dirs)
  const assets = viewerAssetMap()

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0] ?? '/'

    const sendFile = (file: string) => {
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        // ⚠️ NO-STORE, AND THIS COST THE OWNER A WHOLE REVIEW PASS ON 2026-08-28.
        //
        // Garment URLs are POSITIONAL — `/model/<dirIndex>/<fileIndex>` — so the same
        // URL serves completely different bytes the moment the server is restarted on
        // a different directory, which is the normal way this tool is used: rebuild,
        // re-serve, look again. With no cache-control, no ETag and no Last-Modified,
        // the browser is free to heuristically reuse what it already has, and it does.
        //
        // The owner reviewed a rebuilt catalogue, saw the defect still there, and
        // reported "it looks like you did nothing" — correctly, because the bytes on
        // their screen were the previous build's. Verified on the same hardware
        // afterwards: with the CURRENT file the skirt is clean, and toggling the bias
        // off puts the white specks straight back.
        //
        // This is the same shape as every other lying instrument in this repository:
        // it reported success while showing something other than what was measured.
        'cache-control': 'no-store, no-cache, must-revalidate',
      })
      // Streamed, never buffered: a processed garment can be tens of megabytes and
      // a raw one over a gigabyte.
      createReadStream(file)
        .on('error', () => {
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
        .pipe(res)
    }
    const sendHtml = (html: string) => {
      res.writeHead(200, {
        'content-type': MIME['.html'] ?? 'text/html; charset=utf-8',
        // The PAGE needs this as much as the model does. Its bias logic is INLINE, so a
        // cached shell keeps applying an older version of the fix against a freshly
        // rebuilt garment — and reports success while doing it.
        'cache-control': 'no-store, no-cache, must-revalidate',
      })
      res.end(html)
    }
    const notFound = () => {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
    }

    // ⚠️ INDEXES ONLY. `Number.parseInt` on a traversal string yields NaN, and the
    // lookup then misses — nothing from the URL reaches the filesystem.
    const findGarment = (rawDir: string, rawFile: string): ReviewGarment | undefined => {
      if (!/^\d+$/.test(rawDir) || !/^\d+$/.test(rawFile)) return undefined
      const dirIndex = Number(rawDir)
      const fileIndex = Number(rawFile)
      return garments.find((g) => g.dirIndex === dirIndex && g.fileIndex === fileIndex)
    }

    if (url === '/' || url === '/index.html') {
      sendHtml(indexPage(garments, dirs))
      return
    }
    if (url === '/api/garments') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(
        JSON.stringify(
          garments.map((g) => ({
            name: g.name,
            dirIndex: g.dirIndex,
            fileIndex: g.fileIndex,
            family: g.description.family,
            bytes: g.description.bytes,
            overHardMax: g.description.bytes > HARD_MAX_BYTES,
            triangles: g.description.triangles,
            stitchFraction: g.description.stitchFraction,
            colourways: g.description.colourways.count,
            fullyMapped: g.description.colourways.fullyMapped,
            pbrSuspects: g.description.pbrSuspects.map((s) => s.name),
            unclassifiedMetallic: g.description.unclassifiedMetallic.map((s) => s.name),
            error: g.description.error,
          })),
          null,
          2,
        ),
      )
      return
    }
    // The production HDR. Not in viewerAssetMap(): that map is require.resolve'd out of
    // node_modules and shared with the render harness, while this file lives in
    // apps/viewer and is absent wherever this package is installed alone.
    if (url === PRODUCTION_ENVIRONMENT_URL) {
      const hdr = productionEnvironmentPath()
      if (hdr) {
        sendFile(hdr)
        return
      }
      notFound()
      return
    }
    if (assets[url]) {
      sendFile(assets[url])
      return
    }
    const model = /^\/model\/([^/]+)\/([^/]+)$/.exec(url)
    if (model) {
      const garment = findGarment(model[1] ?? '', model[2] ?? '')
      if (!garment) return notFound()
      sendFile(garment.path)
      return
    }
    const page = /^\/g\/([^/]+)\/([^/]+)$/.exec(url)
    if (page) {
      const garment = findGarment(page[1] ?? '', page[2] ?? '')
      if (!garment) return notFound()
      sendHtml(garmentPage(garment))
      return
    }
    notFound()
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not bind the review server.'))
        return
      }
      resolve({
        server,
        port: address.port,
        url: `http://127.0.0.1:${address.port}/`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}
