import { useCallback, useEffect, useRef, useState } from 'react'
import { isAllowedRenderModel } from '../worker/renderGuard'

/**
 * `/render` — a bare, single-model page for task 14's screenshot robot.
 *
 * WHY THIS EXISTS. The publish gate refuses any switched-on colour with no
 * photo, and the public viewer only serves PUBLISHED products — but the
 * garment this needs to photograph is an unpublished draft. This route
 * renders a model directly from query params, independent of publish state,
 * so a headless browser has something to point at (task 13 brief).
 *
 * Sibling of App.tsx, not a child of it — mounted instead of <App/> by
 * main.tsx when the path is exactly `/render`. That split, rather than a
 * conditional inside App's own tree, is what guarantees "no header, no nav,
 * no colour buttons, no footer": those all live in <App/>'s render, which
 * this route never calls. It is also required for a subtler reason —
 * parseViewerPath (packages/shared/src/slugs.ts) treats any one-segment path
 * as a valid product route, so App's own router would read "render" as a
 * product SLUG and show the branded "reference unavailable" state instead.
 *
 * Five requirements, each cited at the line that satisfies it (task 13
 * brief) — read apps/viewer/CLAUDE.md before changing any of them:
 *   1. reject a `model` not on our own host          → isAllowedRenderModel
 *   2. `min-field-of-view="1deg"`                     → the JSX below
 *   3. `src`/`variantName` set as PROPERTIES, in JS    → attachRef
 *   4. `window.__RENDER_READY` after load + settle     → onLoad below
 *   5. webglcontextlost never reaching a host listener → the `error` handler
 */

/** Subset of the ModelViewerElement API this page uses. Mirrors Stage.tsx's. */
interface ModelViewerEl extends HTMLElement {
  src: string
  variantName: string | null
  availableVariants?: string[]
  cameraOrbit: string
  cameraTarget: string
  fieldOfView: string
  jumpCameraToGoal?: () => void
}

/** All copied into public/ by scripts/copy-decoders.mjs — matches Stage.tsx. */
const MESHOPT_DECODER_URL = '/meshopt_decoder.js'
const DRACO_DECODER_URL = '/draco/'
const KTX2_TRANSCODER_URL = '/basis/'

/**
 * Same studio HDR Stage.tsx lights real product pages with (see its own
 * comment on ENVIRONMENT_IMAGE). Deliberately NOT render.ts's flat diagnostic
 * lighting — these captures BECOME the poster a real buyer sees behind the
 * model while it loads (task 14 brief, B2), so they need to look like every
 * other photo on the site, not like a QA tool's output.
 */
const ENVIRONMENT_IMAGE = '/env/studio-soft.hdr'

function markRenderReady(): void {
  // Read by Part B's Puppeteer session via page.waitForFunction (task 14
  // brief) and by this route's own e2e spec via page.waitForFunction — both
  // documented in task-13-brief.md's test snippet. Not a React state flag: it
  // has to exist as soon as it is true, before React has any reason to
  // re-render, and a page.evaluate-based screenshot loop is the reader, not
  // this component.
  ;(window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY = true
}

export default function RenderPage() {
  const mvRef = useRef<ModelViewerEl | null>(null)
  // Read once. This route is loaded fresh per screenshot (one navigation per
  // colourway — see the task 14 brief's B2), never client-side-routed to, so
  // there is no "params changed under us" case to react to.
  const paramsRef = useRef(new URLSearchParams(window.location.search))
  const [libReady, setLibReady] = useState(false)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    // base.css's `body { background: var(--bg) }` is opaque in BOTH themes.
    // Part B screenshots with `omitBackground: true` (task 14 brief, B2),
    // which only yields a transparent PNG if nothing else already painted an
    // opaque background — so this route overrides it directly rather than
    // relying on a CSS variable that every other page correctly wants opaque.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
  }, [])

  useEffect(() => {
    const model = paramsRef.current.get('model')
    // Requirement 1: reject a model not on our own host. The Worker
    // (worker/index.ts) and the e2e fixture server (e2e/serve.mjs) already
    // answer a bad host with a real HTTP 400 before this bundle ever loads —
    // this only matters for `vite dev`/`vite preview`, which have no such
    // gate in front of them. Checked here too rather than trusted, because a
    // route that will load an arbitrary remote URL into our own browser is a
    // hazard regardless of which server happened to be in front of it.
    if (!isAllowedRenderModel(model, window.location.origin)) {
      setRefused(true)
      console.error('[render] refused: "model" is missing or not on our own host:', model)
      return
    }
    let cancelled = false
    import('@google/model-viewer')
      .then(({ ModelViewerElement }) => {
        if (cancelled) return
        // Same three lines as Stage.tsx, same reason (see its comment): every
        // production GLB is Meshopt-compressed, and model-viewer ships decoder
        // locations for Draco/KTX2 but leaves Meshopt unset, and points the
        // other two at gstatic unless redirected here too.
        const element = ModelViewerElement as unknown as {
          meshoptDecoderLocation: string
          dracoDecoderLocation: string
          ktx2TranscoderLocation: string
        }
        element.meshoptDecoderLocation = MESHOPT_DECODER_URL
        element.dracoDecoderLocation = DRACO_DECODER_URL
        element.ktx2TranscoderLocation = KTX2_TRANSCODER_URL
        setLibReady(true)
      })
      .catch((error: unknown) => {
        console.error('[render] could not load the model-viewer module:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Wired once the element exists, which only happens once `libReady` is
  // true — so `model` below is never null here (the effect above would have
  // set `refused` and this JSX would never have mounted the element).
  const attachRef = useCallback((el: HTMLElement | null) => {
    mvRef.current = el as ModelViewerEl | null
    if (!el) return
    const mv = el as ModelViewerEl
    const params = paramsRef.current
    const model = params.get('model')
    const variant = params.get('variant')
    const orbit = params.get('orbit') || 'auto auto auto'
    const fov = params.get('fov') || 'auto'
    if (!model) return

    // Requirement 3: PROPERTY, not attribute. Setting `src` in JSX/HTML
    // markup does nothing reliable here — see apps/viewer/CLAUDE.md's trap on
    // this exact element (`el.getAttribute('src')` is always null) — so it is
    // assigned imperatively, in the same place every other dynamic value on
    // this element is assigned, rather than split across JSX and a ref.
    mv.src = model

    const onLoad = () => {
      if (variant) {
        const available = mv.availableVariants ?? []
        if (!available.includes(variant)) {
          // NEVER signal ready over the wrong colour. For a B2B garment
          // reference the printed artwork IS the product (CLAUDE.md) — a
          // photograph of the default variant silently mislabelled as
          // `variant` is worse than no photograph at all. Part B's own
          // navigation times out waiting for __RENDER_READY and reports the
          // miss (posters.ts / capturePosters) rather than uploading a photo
          // of the wrong colour under the right name.
          console.error(
            `[render] requested variant "${variant}" is not in this file. Available: ` +
              `${available.join(', ') || '(none)'}`,
          )
          return
        }
        // Requirement 3 again: variantName has no HTML attribute at all —
        // model-viewer exposes it only as a JS property (confirmed against
        // tools/asset-pipeline/src/render.ts, which sets it the same way).
        mv.variantName = variant
      }

      // Requirement 4, and the established settle in this repo: copied from
      // tools/asset-pipeline/src/render.ts rather than reinvented.
      // jumpCameraToGoal skips the interpolation so the frame captured is the
      // one asked for, not wherever the easing happened to be; the two
      // chained rAFs then let model-viewer actually draw that frame before
      // __RENDER_READY fires — the first resolves on the frame the camera
      // change is applied, the second after that frame has been painted.
      mv.cameraOrbit = orbit
      mv.cameraTarget = 'auto'
      mv.fieldOfView = fov
      mv.jumpCameraToGoal?.()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markRenderReady()
        })
      })
    }

    const onError = (event: Event) => {
      // Requirement 5: `webglcontextlost` never reaches a listener added the
      // ordinary way on <model-viewer> (apps/viewer/CLAUDE.md) — it fires on
      // the shadow-root <canvas> and is not composed. The library's own
      // contract is its `error` event with `detail.type === 'webglcontextlost'`,
      // dispatched on the HOST element, which this listener is on. Logged
      // rather than retried: __RENDER_READY simply never fires, Part B's
      // navigation times out, and that per-colourway failure is reported
      // without failing the whole job (task 14 brief, B3/B4) — the same
      // "never signal ready on a bad result" argument as the variant-miss
      // branch above.
      const detail = (event as CustomEvent<{ type?: string; sourceError?: unknown }>).detail
      console.error(
        '[render] model-viewer error:',
        detail?.type ?? 'unknown',
        detail?.sourceError ?? '',
      )
    }

    el.addEventListener('load', onLoad, { once: true })
    el.addEventListener('error', onError)
  }, [])

  // Refused (bad host) or not ready yet: render nothing rather than a
  // half-configured <model-viewer>. Either way __RENDER_READY never fires,
  // which is the correct signal — a blank page a caller times out on, not a
  // photograph of the wrong thing.
  if (refused || !libReady) return null

  return (
    <model-viewer
      ref={attachRef}
      alt="Garment reference photograph"
      // Requirement 2: the default floor is 12deg and anything tighter is
      // SILENTLY ignored (apps/viewer/CLAUDE.md; measured 2026-08-08 as four
      // byte-identical PNGs across four different zoom settings). Set as an
      // attribute, like tools/asset-pipeline/src/render.ts's own PAGE_HTML —
      // unlike src/variantName this one IS a plain observed attribute.
      min-field-of-view="1deg"
      environment-image={ENVIRONMENT_IMAGE}
      tone-mapping="neutral"
      exposure="1"
      shadow-intensity="0.6"
      shadow-softness="0.8"
      interaction-prompt="none"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: 'transparent',
      }}
    />
  )
}
