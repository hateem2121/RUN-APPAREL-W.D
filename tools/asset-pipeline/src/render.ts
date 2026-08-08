import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { chromium } from '@playwright/test'

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
 * LIGHTING IS DELIBERATELY FLAT. Production uses a soft studio HDR, which is
 * right for selling a garment and wrong for diagnosis: specular highlights move
 * when geometry changes, so every A/B diff would light up everywhere. The
 * neutral environment with shadows off isolates the thing under test — the
 * texture and the UVs beneath it.
 *
 * The swiftshader launch flags are the ones already proven in
 * apps/viewer/playwright.config.ts, so this gets a real WebGL context on a CI
 * box with no GPU.
 */

const require = createRequire(import.meta.url)

/** One named camera position. `orbit` is model-viewer's "theta phi radius" form. */
export interface RenderView {
  name: string
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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

/**
 * The page under test. Imports model-viewer as a module and points it at the
 * Meshopt decoder before any model loads — without which every production GLB
 * fails with "setMeshoptDecoder must be called before loading compressed
 * files", which is precisely the bug that made the first real garment render as
 * an empty stage. Draco and KTX2 get self-hosted locations for the same reason,
 * so this harness never depends on a CDN being reachable.
 */
/** Exported so `render.test.ts` can assert on the harness without a browser. */
export const PAGE_HTML = `<!doctype html>
<meta charset="utf-8">
<title>asset-pipeline render harness</title>
<style>
  html, body { margin: 0; background: #808080; }
  model-viewer { width: 100vw; height: 100vh; --poster-color: transparent; }
</style>
<model-viewer
  id="mv"
  src="/model.glb"
  environment-image="neutral"
  tone-mapping="neutral"
  exposure="1"
  shadow-intensity="0"
  interaction-prompt="none"
  disable-zoom
  min-field-of-view="1deg"
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
</script>
`

/** Serve the page, the model-viewer bundle, the Meshopt decoder and the model. */
function startServer(glbFile: string): Promise<{ server: Server; port: number }> {
  const modelViewerBundle = require.resolve('@google/model-viewer/dist/model-viewer.min.js')
  const meshoptDecoder = require.resolve('meshoptimizer/decoder.cjs')
  // three ships the web builds of the Draco and Basis decoders. Resolved through
  // its `./examples/jsm/*` export, which is the only path its exports map allows.
  const threeLibs = dirname(
    dirname(require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js')),
  )
  const decoders: Record<string, string> = {
    '/meshopt_decoder.js': meshoptDecoder,
    '/draco/draco_decoder.js': join(threeLibs, 'gltf', 'draco_decoder.js'),
    '/draco/draco_decoder.wasm': join(threeLibs, 'gltf', 'draco_decoder.wasm'),
    '/draco/draco_wasm_wrapper.js': join(threeLibs, 'gltf', 'draco_wasm_wrapper.js'),
    '/basis/basis_transcoder.js': join(threeLibs, '..', 'basis', 'basis_transcoder.js'),
    '/basis/basis_transcoder.wasm': join(threeLibs, '..', 'basis', 'basis_transcoder.wasm'),
  }

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!
    const send = (file: string) => {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
    }
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': MIME['.html']! })
      res.end(PAGE_HTML)
    } else if (url === '/model-viewer.js') send(modelViewerBundle)
    else if (decoders[url]) send(decoders[url]!)
    else if (url === '/model.glb') send(glbFile)
    else {
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

  await mkdir(outDir, { recursive: true })
  const { server, port } = await startServer(glbFile)

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
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
      const detail = consoleErrors.length ? `\n  Browser console:\n    ${consoleErrors.join('\n    ')}` : ''
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
      await page.evaluate(`document.getElementById('mv').variantName = ${JSON.stringify(options.variant)}`)
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
      `${JSON.stringify({ glb: glbFile, width, height, variant: options.variant ?? null, availableVariants, views }, null, 2)}\n`,
    )
    return { outDir, files, availableVariants }
  } finally {
    await browser.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
