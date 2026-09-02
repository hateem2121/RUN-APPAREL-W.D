import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { chromium } from '@playwright/test'
import {
  CAMERA_FREEDOM_ATTRIBUTES,
  environmentUrl,
  instrumentsScript,
  type LightingMode,
  lightingAttributeHtml,
  PRODUCTION_ENVIRONMENT_URL,
  productionEnvironmentPath,
} from './viewer-page'

/**
 * Headless render harness — screenshot a GLB from fixed camera angles.
 *
 * WHY THIS EXISTS. The artwork on the first real garment came out damaged and
 * the pipeline had no way to show anyone. Presets were tuned against file size
 * alone, which is how a setting that protects logos less got shipped as
 * "Smallest file". Everything downstream of this — the bisect, the fix, the
 * verification — needs the same picture taken twice and put side by side.
 *
 * It renders through <model-viewer>, not a bespoke three.js scene, because the
 * failure is defined as "what the customer sees on viewer.wear-run.help", and
 * that is model-viewer with its own tone mapping, its own decoders and its own
 * material handling. A different renderer would answer a different question.
 *
 * LIGHTING IS A SWITCH, SINCE 2026-09-02. `production` (the default) is what a
 * customer sees — the soft studio HDR, neutral tone-mapping, shadow 0.6 — so a
 * contact sheet shows the product. `diagnostic` is flat neutral light with shadows
 * off: specular highlights move when geometry changes, so a lit A/B diff lights up
 * everywhere, and the flat mode isolates the thing under test — the texture and
 * the UVs beneath it. The artwork evals run in it, and their ceilings were
 * calibrated in it.
 *
 * THE INSTRUMENTS ARE NOT A SWITCH. Whatever the light, the page carries the
 * adaptive near plane and the decal depth bias, re-applied on every colourway,
 * exactly as apps/viewer does — because until 2026-09-02 it carried neither, so
 * it reported 0.00% for a fix that moves 1.8% of the picture (audit HR-2) and
 * resolved depth 183x more coarsely than the product, inventing sparkle no
 * customer sees (HR-3). `instruments: false` exists ONLY as the negative control
 * that proves the difference; it is the old, blind page.
 *
 * The swiftshader launch flags are the ones already proven in
 * apps/viewer/playwright.config.ts, so this gets a real WebGL context on a CI
 * box with no GPU.
 */

const require = createRequire(import.meta.url)

/** One named camera position. `orbit` is model-viewer's "theta phi radius" form. */
export interface RenderView {
  name: string
  /**
   * "theta phi radius". ⚠️ THE RADIUS IS CLAMPED ON BOTH SIDES, and only one side is
   * freed. Measured 2026-09-02 with scripts/probe-camera-clamps.mjs on a finished
   * garment (framed radius 1.8687 m): every request below ~54% of the framed radius —
   * 20%, 42%, 50%, and absolute 0.2m / 0.445m / 1m alike — settled on the SAME
   * 1.0134 m, which is model-viewer's `min-camera-orbit` radius `auto`. So the
   * calibrated views in raw/CANONICAL.json that say "0.445m" have never used that
   * radius; their zoom comes entirely from `fieldOfView`, which is honoured to 1°.
   * That clamp is deliberately LEFT IN PLACE: freeing it would silently re-frame every
   * calibrated crop. The far side IS freed (max-camera-orbit, audit HR-5): 60% to 500%
   * now render distinct frames where 105%..500% used to be one hash. Use fieldOfView
   * to zoom in, radius only to pull back, and run the probe when in doubt.
   */
  orbit: string
  /** Defaults to 'auto', i.e. the model's own centre. */
  target?: string
  /**
   * Defaults to 'auto'. Narrow it to crop in without moving the camera.
   *
   * ⚠️ ANYTHING UNDER 12° WAS SILENTLY IGNORED UNTIL 2026-08-08, because
   * <model-viewer>'s own `min-field-of-view` defaults to 12deg and this harness
   * never overrode it. The element now carries `min-field-of-view="1deg"`.
   *
   * MEASURED, on the real N001 baseline: rendering one print at 1.4° / 2° / 3.1° /
   * 4.5° produced four BYTE-IDENTICAL PNGs (sha256 294291db…), as did 1.9° / 2.7° /
   * 4° / 5.9° on a second print. A third print separated only between 9.2° and
   * 13.5°, placing the floor exactly at the documented 12° default.
   *
   * WHY IT MATTERED, AND WHY NOBODY SAW IT. This is the same trap already recorded
   * for orbit radius — the renderer overrides what you asked for and returns a
   * perfectly plausible frame anyway. `raw/CANONICAL.json` says fieldOfView "is the
   * zoom control, which is why it is fingerprinted rather than range-checked"; that
   * was true only ABOVE the floor, and N001's single view is 14°, sitting just over
   * it. So the one calibrated garment in the repo could never have exposed this.
   * Below the floor a fingerprint records a zoom the renderer never used.
   *
   * CONSEQUENCE FOR ARTWORK COVERAGE. CLAUDE.md lists `TEAM WEAR FRONT LABEL`
   * (0.039 m) and the zip strips as "NOT COVERED", reading as a scoping choice. It
   * was not: at 12° minimum they could not be framed tightly enough to measure. A
   * print smaller than roughly a hand was unguardable by construction.
   *
   * N001's calibration is unaffected — 14° > 12° clamps to itself either way, and
   * that was verified byte-for-byte rather than argued.
   */
  fieldOfView?: string
}

/**
 * Default views. The three whole-garment angles mirror the viewer's own front /
 * back / side buttons; the crops are the ones that matter here, because damaged
 * artwork is invisible at full-garment distance — QA-CHECKLIST.md already says
 * "zoom right in on a printed logo", and this is that, automated.
 */
export const DEFAULT_VIEWS: RenderView[] = [
  { name: 'front', orbit: '0deg 78deg 105%' },
  { name: 'back', orbit: '180deg 78deg 105%' },
  { name: 'side', orbit: '90deg 78deg 105%' },
  { name: 'crop-chest', orbit: '0deg 82deg 45%', fieldOfView: '18deg' },
  { name: 'crop-back', orbit: '180deg 82deg 45%', fieldOfView: '18deg' },
  { name: 'crop-sleeve', orbit: '55deg 88deg 42%', fieldOfView: '18deg' },
]

export interface RenderOptions {
  views?: RenderView[]
  width?: number
  height?: number
  /** KHR_materials_variants name to select before rendering. */
  variant?: string | null
  /** Milliseconds to wait for the model's `load` event. Big raw files are slow. */
  timeoutMs?: number
  /** `production` (default) or `diagnostic`. See the header. */
  lighting?: LightingMode
  /**
   * The near plane and the decal bias. Default true. `false` is the OLD page — the
   * negative control that shows what the instruments change, and nothing else.
   */
  instruments?: boolean
}

export interface RenderResult {
  outDir: string
  /** Written PNG filenames, one per view, in view order. */
  files: string[]
  /** Variant names the model exposes, so a missing `--variant` is visible. */
  availableVariants: string[]
}

export const DEFAULT_RENDER_SIZE = 1024
/** Raw CLO exports run to hundreds of megabytes and parse slowly under swiftshader. */
export const DEFAULT_RENDER_TIMEOUT_MS = 300_000

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  // The production environment map the review server serves so its default light
  // matches apps/viewer. Radiance HDR has no registered type; this is the de-facto one.
  '.hdr': 'image/vnd.radiance',
}

/**
 * Every static asset a local `<model-viewer>` page needs, mapped URL -> disk path.
 *
 * EXTRACTED 2026-08-26 so the headless render harness and the interactive review
 * server (review-server.ts) cannot drift apart. They MUST serve the same
 * model-viewer build and the same decoders: the reason this project renders through
 * `<model-viewer>` rather than a bespoke three.js scene is that the failure is
 * defined as "what the customer sees", and a different decoder is a different
 * renderer. `@google/model-viewer` is pinned to the same version in
 * `apps/viewer/package.json` and `tools/asset-pipeline/package.json`.
 *
 * All three decoder families, not just meshopt: `--draco` and `--ktx2` are supported
 * pipeline outputs. ⚠️ Note `--draco` DOES NOT LOAD on the DEPLOYED viewer and
 * production stays on `--meshopt` (root CLAUDE.md) — but a local file may still
 * carry it, and failing to load one here looks exactly like a broken garment, which
 * is the worst possible thing for a viewer whose whole job is judging garments.
 */
export function viewerAssetMap(): Record<string, string> {
  // three ships the web builds of the Draco and Basis decoders. Resolved through
  // its `./examples/jsm/*` export, which is the only path its exports map allows.
  const threeLibs = dirname(
    dirname(require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js')),
  )
  return {
    '/model-viewer.js': require.resolve('@google/model-viewer/dist/model-viewer.min.js'),
    '/meshopt_decoder.js': require.resolve('meshoptimizer/decoder.cjs'),
    '/draco/draco_decoder.js': join(threeLibs, 'gltf', 'draco_decoder.js'),
    '/draco/draco_decoder.wasm': join(threeLibs, 'gltf', 'draco_decoder.wasm'),
    '/draco/draco_wasm_wrapper.js': join(threeLibs, 'gltf', 'draco_wasm_wrapper.js'),
    '/basis/basis_transcoder.js': join(threeLibs, '..', 'basis', 'basis_transcoder.js'),
    '/basis/basis_transcoder.wasm': join(threeLibs, '..', 'basis', 'basis_transcoder.wasm'),
  }
}

/**
 * The page under test. Imports model-viewer as a module and points it at the
 * Meshopt decoder before any model loads — without which every production GLB
 * fails with "setMeshoptDecoder must be called before loading compressed
 * files", which is precisely the bug that made the first real garment render as
 * an empty stage. Draco and KTX2 get self-hosted locations for the same reason,
 * so this harness never depends on a CDN being reachable.
 */
export interface HarnessPageOptions {
  lighting?: LightingMode
  instruments?: boolean
}

/** Build the page under test. See the header for what each option means. */
export function renderHarnessPage(options: HarnessPageOptions = {}): string {
  const lighting = options.lighting ?? 'production'
  const instruments = options.instruments ?? true
  return `<!doctype html>
<meta charset="utf-8">
<title>asset-pipeline render harness (${lighting} lighting, instruments ${instruments ? 'on' : 'OFF'})</title>
<style>
  html, body { margin: 0; background: #808080; }
  model-viewer { width: 100vw; height: 100vh; --poster-color: transparent; }
</style>
<model-viewer
  id="mv"
  src="/model.glb"
  ${lightingAttributeHtml(lighting, environmentUrl())}
  interaction-prompt="none"
  disable-zoom
  ${CAMERA_FREEDOM_ATTRIBUTES}
></model-viewer>
<script type="module">
  import { ModelViewerElement } from '/model-viewer.js'
  // All three decoders, self-hosted, matching apps/viewer/src/components/Stage.tsx.
  // Not just meshopt: --draco and --ktx2 are supported pipeline outputs, and a
  // harness that cannot open them would fail exactly when someone tried to
  // compare a KTX2 encode against a WebP one — which is the comparison the
  // texture work exists to make.
  ModelViewerElement.meshoptDecoderLocation = '/meshopt_decoder.js'
  ModelViewerElement.dracoDecoderLocation = '/draco/'
  ModelViewerElement.ktx2TranscoderLocation = '/basis/'
  const mv = document.getElementById('mv')
  window.__ready = new Promise((resolve, reject) => {
    mv.addEventListener('load', () => resolve(true), { once: true })
    mv.addEventListener('error', (event) => reject(new Error(String(event.detail?.sourceError ?? 'model error'))), { once: true })
  })
${instruments ? instrumentsScript() : '  // instruments OFF: the old, blind page (negative control only)'}
</script>
`
}

/** The default page — exported so `render.test.ts` can assert on it without a browser. */
export const PAGE_HTML = renderHarnessPage()

/**
 * Serve the page, the model-viewer bundle, the Meshopt decoder and the model.
 * Exported for the browser test that reads the instruments back (HR-7).
 */
export function startHarnessServer(
  glbFile: string,
  page: string,
): Promise<{ server: Server; port: number }> {
  // Shared with review-server.ts — see viewerAssetMap. `/model-viewer.js` is served
  // from the same map as the decoders now; it used to be a separate branch below.
  const assets = viewerAssetMap()

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!
    const send = (file: string) => {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': MIME['.html']! })
      res.end(page)
    } else if (assets[url]) send(assets[url]!)
    else if (url === '/model.glb') send(glbFile)
    else if (url === PRODUCTION_ENVIRONMENT_URL && productionEnvironmentPath()) {
      // Production lighting needs the real HDR, the same file apps/viewer ships.
      send(productionEnvironmentPath() as string)
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not bind the render harness server.'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

/**
 * Render `glbFile` from every view into `outDir` as PNG.
 *
 * Screenshots are taken off the element, not via model-viewer's `toDataURL()`.
 * That looked like the more exact route and is in fact useless here: three.js
 * runs with `preserveDrawingBuffer: false`, so by the time the readback happens
 * the drawing buffer has been cleared and every capture comes back fully
 * transparent (measured — all four channels zero). An element screenshot
 * captures what the compositor actually put on screen, which is also the thing
 * being asked about.
 *
 * The page is deliberately nothing but a full-viewport <model-viewer> on a flat
 * grey, at deviceScaleFactor 1, so the captured region is the render and the
 * framing is identical between two runs. That is what makes `compare`'s diffs
 * mean anything.
 */
export async function renderViews(
  glbFile: string,
  outDir: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const views = options.views ?? DEFAULT_VIEWS
  const width = options.width ?? DEFAULT_RENDER_SIZE
  const height = options.height ?? DEFAULT_RENDER_SIZE
  const timeout = options.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS
  const lighting = options.lighting ?? 'production'
  const instruments = options.instruments ?? true

  await mkdir(outDir, { recursive: true })
  const { server, port } = await startHarnessServer(
    glbFile,
    renderHarnessPage({ lighting, instruments }),
  )

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}),
    // Software WebGL — the same flags the viewer's own webgl e2e project uses,
    // so this runs on a CI box with no GPU.
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  })

  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForFunction('window.__ready !== undefined', null, { timeout: 30_000 })
      await page.evaluate('window.__ready', { timeout } as never)
    } catch (error) {
      const detail = consoleErrors.length
        ? `\n  Browser console:\n    ${consoleErrors.join('\n    ')}`
        : ''
      throw new Error(
        `The model never finished loading in <model-viewer>: ` +
          `${error instanceof Error ? error.message : String(error)}${detail}`,
      )
    }

    const availableVariants = await page.evaluate<string[]>(
      `Array.from(document.getElementById('mv').availableVariants ?? [])`,
    )
    if (options.variant) {
      if (!availableVariants.includes(options.variant)) {
        throw new Error(
          `This GLB has no variant "${options.variant}". It offers: ${availableVariants.join(', ') || '(none)'}`,
        )
      }
      // Wait for the swap to RESOLVE, not merely to be requested. model-viewer applies
      // a variant asynchronously (its materials load on demand) and fires
      // 'variant-applied' when the scene actually shows it. Rendering straight after
      // the assignment could capture the default colourway under the new name.
      await page.evaluate(`(async () => {
        const mv = document.getElementById('mv')
        const applied = new Promise((resolve) => mv.addEventListener('variant-applied', resolve, { once: true }))
        mv.variantName = ${JSON.stringify(options.variant)}
        await Promise.race([applied, new Promise((resolve) => setTimeout(resolve, 15000))])
        await mv.updateComplete
      })()`)
    }

    const element = page.locator('#mv')
    const files: string[] = []
    for (const view of views) {
      // jumpCameraToGoal skips the interpolation, so the frame captured is the
      // one asked for rather than wherever the easing happened to be. The two
      // chained rAFs then let model-viewer draw it before the screenshot: the
      // first resolves on the frame the camera change is applied, the second
      // after that frame has been painted.
      await page.evaluate(`(async () => {
        const mv = document.getElementById('mv')
        mv.cameraOrbit = ${JSON.stringify(view.orbit)}
        mv.cameraTarget = ${JSON.stringify(view.target ?? 'auto')}
        mv.fieldOfView = ${JSON.stringify(view.fieldOfView ?? 'auto')}
        mv.jumpCameraToGoal()
        await mv.updateComplete
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })()`)
      const file = `${view.name}.png`
      await element.screenshot({ path: join(outDir, file) })
      files.push(file)
    }

    await writeFile(
      join(outDir, 'views.json'),
      `${JSON.stringify({ glb: glbFile, width, height, variant: options.variant ?? null, lighting, instruments, availableVariants, views }, null, 2)}\n`,
    )
    return { outDir, files, availableVariants }
  } finally {
    await browser.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
