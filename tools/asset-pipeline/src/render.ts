import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
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
  /** 'transparent' keeps the alpha channel in the PNG (posters); default the flat grey. */
  background?: HarnessBackground
}

export interface RenderResult {
  outDir: string
  /** Written PNG filenames, one per view, in view order. */
  files: string[]
  /** Variant names the model exposes, so a missing `--variant` is visible. */
  availableVariants: string[]
  /**
   * Views whose frame came back a single flat colour — nothing in view, or the whole
   * model clipped. A flat frame diffs as 0.00% against another flat frame, which is
   * how three ARISAN macro crops scored a perfect match on 2026-09-02 while showing
   * nothing. A caller that measures must treat any entry here as "measured nothing".
   */
  flatViews: string[]
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
/** The page behind the garment: the harness's flat grey, or nothing (posters). */
export type HarnessBackground = 'grey' | 'transparent'

export interface HarnessPageOptions {
  /** Default 'grey' — what `compare` diffs against. Posters render on 'transparent'. */
  background?: HarnessBackground
  lighting?: LightingMode
  instruments?: boolean
}

/**
 * The custom properties that keep model-viewer's own LOADING CHROME out of a
 * captured frame. `--poster-color` was always here; the progress bar was not, and
 * that shipped a defect into customer-facing posters.
 *
 * ⚠️ MODEL-VIEWER PAINTS A 5px PROGRESS BAR ACROSS THE TOP OF THE ELEMENT, AND A
 * SCREENSHOT CAN CATCH IT. Measured 2026-09-08 on @google/model-viewer 4.3.1:
 * `#default-progress-bar > .bar` is `position: absolute; top: 0; width: 100%;
 * height: var(--progress-bar-height, 5px)` filled with
 * `var(--progress-bar-color, rgba(0, 0, 0, 0.4))` — so on the transparent poster
 * background it captures as **alpha 102 across the whole top edge, exactly 5 rows
 * deep**, which is the `expected 102 to be +0` that `posters.test.ts` reported.
 *
 * IT IS A RACE, NOT A CONSTANT, WHICH IS WHY IT LOOKED LIKE A FLAKY TEST. The bar
 * is only hidden by CSS TRANSITIONS — `transform 0.09s` as it fills, then
 * `opacity 0.3s 1s` once model-viewer adds `.hide` from inside a
 * `requestAnimationFrame`. Both are wall-clock, and the rAF is starved by exactly
 * what CI has: several swiftshader browsers rasterising in software at once. Idle,
 * the capture lands before the bar expands (measured: bar still `scaleX(0)` at
 * 420 ms, corner alpha 0, test green). Loaded, it lands while the bar is expanded
 * AND still opaque: **8 of 8 concurrent `renderPosters` runs came back with the
 * band, 0 of 8 after this fix.**
 *
 * WHY SUPPRESS IT RATHER THAN WAIT FOR IT. There is no scene state here to wait
 * on — this is chrome, not the garment, and it has no business in a poster at any
 * time. A wait would still be racing the rAF that applies `.hide`, and would add
 * ~1.3 s to every one of the 25+ posters a catalogue render writes. Removing the
 * cause cannot be raced.
 *
 * BOTH PROPERTIES ON PURPOSE: either one alone stops the bar painting, so a rename
 * of one in a future model-viewer still leaves a clean frame. Pinned by
 * `render.test.ts`, and `posters.test.ts` measures the pixels in a real browser.
 * ⚠️ Do NOT copy this to `review-server.ts` — that page is interactive and a human
 * loading a 27 MB garment there wants the progress bar.
 */
const CHROME_SUPPRESSION = `--poster-color: transparent;
    --progress-bar-color: transparent;
    --progress-bar-height: 0px;`

/** Build the page under test. See the header for what each option means. */
export function renderHarnessPage(options: HarnessPageOptions = {}): string {
  const lighting = options.lighting ?? 'production'
  const instruments = options.instruments ?? true
  const background = options.background === 'transparent' ? 'transparent' : '#808080'
  return `<!doctype html>
<meta charset="utf-8">
<title>asset-pipeline render harness (${lighting} lighting, instruments ${instruments ? 'on' : 'OFF'})</title>
<style>
  html, body { margin: 0; background: ${background}; }
  model-viewer {
    width: 100vw;
    height: 100vh;
    ${CHROME_SUPPRESSION}
  }
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
  const background = options.background ?? 'grey'
  const { server, port } = await startHarnessServer(
    glbFile,
    renderHarnessPage({ lighting, instruments, background }),
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
    const flatViews: string[] = []
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
        // The near-plane getter is only read when the projection is rebuilt, and a
        // radius-only move never rebuilds it (see viewer-page.ts). Ask for it.
        if (window.__instruments && window.__instruments.refreshProjection) window.__instruments.refreshProjection()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })()`)
      const file = `${view.name}.png`
      await element.screenshot({
        path: join(outDir, file),
        omitBackground: background === 'transparent',
      })
      files.push(file)
      const stats = await sharp(join(outDir, file)).stats()
      if (stats.channels.every((channel) => channel.stdev < 1)) {
        flatViews.push(view.name)
        console.warn(
          `  ⚠️ ${view.name}: a flat frame (rgb ${stats.channels
            .slice(0, 3)
            .map((c) => Math.round(c.mean))
            .join('/')}) — nothing in view or the model clipped. This view measured NOTHING.`,
        )
      }
    }

    await writeFile(
      join(outDir, 'views.json'),
      `${JSON.stringify({ glb: glbFile, width, height, variant: options.variant ?? null, lighting, instruments, availableVariants, flatViews, views }, null, 2)}\n`,
    )
    return { outDir, files, availableVariants, flatViews }
  } finally {
    await browser.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
