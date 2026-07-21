import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { canRender3D, prefersReducedMotion } from '../lib/capabilities'

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

const VARIANT_NOTICE =
  'The 3D preview for this colourway is temporarily unavailable. The static reference and specifications remain accurate.'
const LOAD_NOTICE =
  'The interactive 3D view could not load here, so you are seeing the static reference instead. All product details remain accurate.'

/** Privacy-safe diagnostic seam (no visitor data — just what broke). */
function diagnostic(kind: string, detail: Record<string, string>): void {
  document.dispatchEvent(new CustomEvent('run:diagnostic', { detail: { kind, ...detail } }))
  console.warn(`[viewer:${kind}]`, detail)
}

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
    if (!glbUrl || !canRender3D()) {
      setFallback(true)
      if (glbUrl) diagnostic('render3d-unavailable', { reason: 'capability-or-save-data' })
      return
    }
    let cancelled = false
    import('@google/model-viewer')
      .then(() => {
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
        const src = el.getAttribute('src') ?? ''
        if (loadedSrcRef.current !== src) {
          loadedSrcRef.current = src
          track('model_loaded', { product: product.productCode })
        }
      }
      const onProgress = (event: Event) => {
        const detail = (event as CustomEvent<{ totalProgress?: number }>).detail
        if (typeof detail?.totalProgress === 'number') setProgress(detail.totalProgress)
      }
      const onError = () => {
        if (!loadedSrcRef.current) {
          setFallback(true)
        } else {
          setSwapping(false)
          setNotice(VARIANT_NOTICE)
        }
        diagnostic('model-load-error', { product: product.productCode })
      }
      const onCameraChange = (event: Event) => {
        const detail = (event as CustomEvent<{ source?: string }>).detail
        if (detail?.source === 'user-interaction') setActiveView(null)
      }

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
