import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { canRender3D, prefersReducedMotion } from '../lib/capabilities'
import { diagnostic } from '../lib/diagnostic'

type CameraView = 'front' | 'back' | 'side'

/** Subset of the ModelViewerElement API the stage uses. */
interface ModelViewerEl extends HTMLElement {
  availableVariants?: string[]
  variantName: string | null
  cameraOrbit: string
  cameraTarget: string
  fieldOfView: string
  jumpCameraToGoal?: () => void
}

interface StageProps {
  data: ViewerApiSuccess
  selected: ViewerColourway
}

/** All copied into public/ by scripts/copy-decoders.mjs — see its header. */
const MESHOPT_DECODER_URL = '/meshopt_decoder.js'
/** Trailing slash required: model-viewer appends the filenames to these. */
const DRACO_DECODER_URL = '/draco/'
const KTX2_TRANSCODER_URL = '/basis/'

const VARIANT_NOTICE =
  'The 3D preview for this colourway is temporarily unavailable. The static reference and specifications remain accurate.'
const LOAD_NOTICE =
  'The interactive 3D view could not load here, so you are seeing the static reference instead. All product details remain accurate.'

// Image-based lighting for PBR materials. Without an explicit environment,
// <model-viewer>'s built-in neutral scene renders technical fabrics flat and
// low-contrast; this soft studio HDR reveals weave, sheen and depth. Served
// same-origin from public/env (already allowed by the CSP), ≤1024×512 so the
// download stays tiny. Paired with tone-mapping="neutral" (the model-viewer
// v4 default, tuned for e-commerce colour accuracy) so baseColor stays faithful.
const ENVIRONMENT_IMAGE = '/env/studio-soft.hdr'

export function Stage({ data, selected }: StageProps) {
  const { product } = data
  const separateMode = product.variantMode === 'separate-glb-per-colour'
  const glbUrl = separateMode ? selected.glbUrl : product.glbUrl

  const mvRef = useRef<ModelViewerEl | null>(null)
  const [libReady, setLibReady] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<CameraView | null>('front')
  const loadedSrcRef = useRef<string | null>(null)

  // Attempt 3D only when the device/browser/network can carry it.
  useEffect(() => {
    // Two very different failures, previously collapsed into one branch whose
    // diagnostic was guarded by `if (glbUrl)` — so the WORSE of the two reported
    // nothing at all. A published product with no finished model looks healthy
    // from every angle: the poster loads, the specs are right, the page scores
    // green. It is exactly the state N001 was in, and the only signal was a human
    // noticing the garment never spun.
    if (!glbUrl) {
      setFallback(true)
      diagnostic('model-missing', {
        product: product.productCode,
        variant: selected.variantId,
        reason: separateMode ? 'colourway-has-no-glb' : 'product-has-no-glb',
      })
      return
    }
    if (!canRender3D()) {
      setFallback(true)
      diagnostic('render3d-unavailable', {
        product: product.productCode,
        reason: 'capability-or-save-data',
      })
      return
    }
    let cancelled = false
    import('@google/model-viewer')
      .then(({ ModelViewerElement }) => {
        // Tell model-viewer where the Meshopt decoder lives, BEFORE any model
        // loads. Without this every production GLB fails outright with
        //   "THREE.GLTFLoader: setMeshoptDecoder must be called before loading
        //    compressed files"
        // because the asset pipeline compresses geometry with EXT_meshopt_
        // compression (chosen deliberately: Meshopt decodes far faster than Draco
        // on low-end mobile, which is the QR-scan case) and model-viewer ships
        // decoder locations for Draco and KTX2 but leaves Meshopt unset.
        //
        // Nothing caught this until the first real garment reached the viewer on
        // 2026-07-29: the seeded placeholder GLBs are built by `merge` with no
        // geometry compression at all, so they loaded fine and the gap stayed
        // invisible.
        //
        // Served from our own origin (copied into public/ at build time by
        // scripts/copy-decoders.mjs), so the strict CSP needs no new host
        // and the decoder stays locked to the `meshoptimizer` version the
        // pipeline encodes with.
        const element = ModelViewerElement as unknown as {
          meshoptDecoderLocation: string
          dracoDecoderLocation: string
          ktx2TranscoderLocation: string
        }
        element.meshoptDecoderLocation = MESHOPT_DECODER_URL
        // Draco and KTX2 default to gstatic. Pointing them at our own copies too
        // means the "no third-party runtime dependency" claim above is true for
        // ALL THREE codecs rather than just this one, and lets connect-src drop
        // gstatic entirely. --ktx2 is the documented production texture target,
        // so this stops being hypothetical the moment it is switched on.
        element.dracoDecoderLocation = DRACO_DECODER_URL
        element.ktx2TranscoderLocation = KTX2_TRANSCODER_URL
        if (!cancelled) setLibReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setFallback(true)
          diagnostic('module-load-failed', { module: 'model-viewer' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [glbUrl])

  // Wire model events once the element exists.
  const attachRef = useCallback(
    (el: HTMLElement | null) => {
      mvRef.current = el as ModelViewerEl | null
      if (!el) return

      const onLoad = () => {
        setModelLoaded(true)
        setSwapping(false)
        setProgress(1)
        // PROPERTY first, attribute second. React sets `src` on a custom element
        // as a property and never reflects it to an attribute — confirmed on the
        // live element, whose attribute list carries camera-orbit, tone-mapping
        // and a dozen others and no `src` at all. So `getAttribute('src')` was
        // always null and this dedup key was always the empty string.
        //
        // WHAT THIS FIXES, measured: `model_loaded` deduped against a constant,
        // so it could only ever fire once per page however many models loaded.
        //
        // WHAT IT DOES NOT FIX, also measured: the `onError` branch below still
        // never sees a truthy `loadedSrcRef`, so VARIANT_NOTICE remains
        // unreachable and a mid-swap failure still tears the stage down to the
        // poster. An e2e test written to prove otherwise failed. The cause is
        // NOT the attribute-vs-property read and has not been isolated — do not
        // assume this line was the whole story.
        const src = (el as unknown as { src?: string }).src ?? el.getAttribute('src') ?? ''
        if (loadedSrcRef.current !== src) {
          loadedSrcRef.current = src
          track('model_loaded', { product: product.productCode })
        }
      }
      const onProgress = (event: Event) => {
        const detail = (event as CustomEvent<{ totalProgress?: number }>).detail
        if (typeof detail?.totalProgress === 'number') setProgress(detail.totalProgress)
      }
      const onError = (event: Event) => {
        // model-viewer routes THREE different failures through one `error` event
        // and distinguishes them only by `detail.type` (see model-viewer-base.js,
        // which dispatches `{ type: 'webglcontextlost' }` for a lost context).
        // Treating them alike meant a lost GPU context — the model had loaded,
        // so `loadedSrcRef` was set — took the variant-swap branch: a notice
        // saying "this colourway is temporarily unavailable" over a canvas that
        // would never paint again. Wrong message, and the garment stayed gone.
        const type = (event as CustomEvent<{ type?: string }>).detail?.type

        if (type === 'webglcontextlost') {
          // The most likely way the 3D dies in front of a real buyer. iOS Safari
          // caps canvas memory at 256 MB and drops the context on the way past
          // it, and iOS 18.2-18.4 lose contexts in cases 17.x did not — and a QR
          // code on a garment tag is scanned with a phone camera, which opens
          // iOS Safari. The live model decodes to ~72 MB of vertex and index
          // data before textures.
          //
          // Fall back to the poster: still a garment, still the specs, still the
          // contact buttons — rather than a grey rectangle.
          setFallback(true)
          setNotice(null)
          diagnostic('webgl-context-lost', { product: product.productCode })
          return
        }

        if (!loadedSrcRef.current) {
          setFallback(true)
        } else {
          setSwapping(false)
          setNotice(VARIANT_NOTICE)
        }
        diagnostic('model-load-error', {
          product: product.productCode,
          reason: type ?? 'unknown',
        })
      }
      const onCameraChange = (event: Event) => {
        const detail = (event as CustomEvent<{ source?: string }>).detail
        if (detail?.source === 'user-interaction') setActiveView(null)
      }
      // The model loaded fine and THEN the GPU took the context away. Distinct
      // from `error`, which is a load failure, and previously unhandled: the
      // element stayed mounted over a canvas that would never paint again, so
      // the buyer got a grey rectangle where the garment had been.
      //
      // This is the most likely way the 3D dies in front of a real buyer. iOS
      // Safari caps canvas memory at 256 MB and drops the context on the way
      // past it, and iOS 18.2-18.4 lose contexts outright in cases 17.x did not
      // — and a QR code on a garment tag is scanned with a phone camera, which
      // opens iOS Safari. The live model decodes to ~72 MB of vertex and index
      // data before textures.
      //
      // Falling back to the poster keeps the page honest: still a garment, still
      // the specs, still the contact buttons.
      el.addEventListener('load', onLoad)
      el.addEventListener('progress', onProgress)
      el.addEventListener('error', onError)
      el.addEventListener('camera-change', onCameraChange)
    },
    [product.productCode],
  )

  // Apply the selected colourway.
  useEffect(() => {
    const mv = mvRef.current
    if (!mv || !modelLoaded) return
    if (separateMode) return // handled via src/poster attributes below
    const available = mv.availableVariants ?? []
    if (available.includes(selected.variantId)) {
      mv.variantName = selected.variantId
      setNotice(null)
    } else {
      // Keep the current model visible; never a blank stage.
      setNotice(VARIANT_NOTICE)
      diagnostic('variant-missing', {
        product: product.productCode,
        variant: selected.variantId,
        available: available.join(','),
      })
    }
  }, [modelLoaded, selected.variantId, separateMode, product.productCode])

  // In separate-GLB mode a colourway change swaps src — poster-first again.
  const previousGlb = useRef(glbUrl)
  useEffect(() => {
    if (separateMode && previousGlb.current !== glbUrl) {
      previousGlb.current = glbUrl
      setSwapping(true)
      setProgress(0)
      setNotice(null)
    }
  }, [glbUrl, separateMode])

  const applyView = (view: CameraView) => {
    const mv = mvRef.current
    if (!mv) return
    const orbit =
      view === 'front'
        ? product.camera.frontCameraOrbit
        : view === 'back'
          ? product.camera.backCameraOrbit
          : product.camera.sideCameraOrbit
    mv.cameraOrbit = orbit
    mv.cameraTarget = product.camera.cameraTarget
    mv.fieldOfView = product.camera.defaultFieldOfView
    if (prefersReducedMotion()) mv.jumpCameraToGoal?.()
    setActiveView(view)
    track(`camera_${view}_selected`)
  }

  const showPosterOverlay = fallback || !libReady || !modelLoaded || swapping
  const loading = !fallback && libReady && (!modelLoaded || swapping) && progress < 1
  const performance = product.performanceFeatures.join(' / ')

  return (
    <section className="stage" aria-label="Interactive 3D product reference">
      <div className="stage__inner">
        <div className="stage__canvas" data-lenis-prevent>
          <svg className="stage__contours" aria-hidden="true" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M-40 520 C 220 430, 420 610, 700 520 S 1120 430, 1260 500" />
              <path d="M-40 560 C 240 480, 460 640, 740 560 S 1140 470, 1260 540" />
              <path d="M-40 130 C 180 60, 420 190, 660 110 S 1060 40, 1260 120" />
              <path d="M-40 90 C 200 20, 440 150, 680 70 S 1080 0, 1260 80" />
            </g>
          </svg>

          {libReady && glbUrl && !fallback && (
            <model-viewer
              ref={attachRef}
              className="stage__model"
              src={glbUrl}
              poster={selected.poster.url}
              alt={selected.altText}
              camera-controls=""
              camera-orbit={product.camera.frontCameraOrbit}
              camera-target={product.camera.cameraTarget}
              field-of-view={product.camera.defaultFieldOfView}
              min-camera-orbit="auto 20deg auto"
              max-camera-orbit="auto 160deg 200%"
              interaction-prompt="none"
              interpolation-decay={prefersReducedMotion() ? 1 : 120}
              touch-action="pan-y"
              shadow-intensity="0.6"
              shadow-softness="0.8"
              environment-image={ENVIRONMENT_IMAGE}
              tone-mapping="neutral"
              exposure="1"
              loading="eager"
              reveal="auto"
            />
          )}

          {showPosterOverlay && (
            <div className="stage__poster-fallback" aria-hidden={!fallback}>
              <img
                key={selected.slug}
                className="stage__poster-img"
                src={selected.poster.url}
                alt={selected.poster.alt || selected.altText}
                width={selected.poster.width ?? undefined}
                height={selected.poster.height ?? undefined}
                loading="eager"
                decoding="async"
                onError={(event) => {
                  // Fall back to the product-level poster if a colourway poster
                  // 404s, so the stage is never blank while 3D is unavailable.
                  const fb = product.posterFallback?.url
                  if (fb && event.currentTarget.src !== fb) event.currentTarget.src = fb
                }}
              />
            </div>
          )}

          <div className="stage__callouts" aria-hidden="true">
            {product.fabricComposition && (
              <div className="callout" style={{ top: '14%', left: '3%' }}>
                <span className="label">[ FABRIC ]</span>
                <div className="callout__value">{product.fabricComposition}</div>
              </div>
            )}
            {product.gsm && (
              <div className="callout callout--right" style={{ top: '14%', right: '3%' }}>
                <span className="label">[ WEIGHT ]</span>
                <div className="callout__value">{product.gsm}</div>
              </div>
            )}
            {product.garmentFit && (
              <div className="callout" style={{ bottom: '18%', left: '3%' }}>
                <span className="label">[ FIT ]</span>
                <div className="callout__value">{product.garmentFit}</div>
              </div>
            )}
            {performance && (
              <div className="callout callout--right" style={{ bottom: '18%', right: '3%' }}>
                <span className="label">[ PERFORMANCE ]</span>
                <div className="callout__value">{performance}</div>
              </div>
            )}
          </div>

          {!fallback && (
            <p className="stage__hint" aria-hidden="true">
              DRAG TO ROTATE · SCROLL TO ZOOM
            </p>
          )}

          {loading && (
            <div className="stage__loading">
              <span>LOADING 3D</span>
              <span className="stage__loading-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </div>
          )}

          {(notice ?? (fallback ? LOAD_NOTICE : null)) && (
            <p className="stage__error" role="status">
              {notice ?? LOAD_NOTICE}
            </p>
          )}

          {!fallback && (
            <div className="stage__controls" role="group" aria-label="Camera positions">
              {(['front', 'back', 'side'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  className="camera-btn"
                  aria-pressed={activeView === view}
                  onClick={() => applyView(view)}
                >
                  {view}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="visually-hidden" role="status">
          {loading
            ? 'Loading the interactive 3D model.'
            : modelLoaded
              ? `Showing ${product.productName} in ${selected.displayName}. Drag to rotate, use scroll or pinch to zoom.`
              : ''}
        </p>
        <p className="visually-hidden">Drag to rotate. Use scroll or pinch to zoom.</p>
      </div>
    </section>
  )
}
