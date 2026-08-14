import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { canRender3D, isCoarsePointer, prefersReducedMotion } from '../lib/capabilities'
import { displayedColourway } from '../lib/colourwayPreview'
import { diagnostic } from '../lib/diagnostic'
import { fetchWithProgress } from '../lib/fetchWithProgress'
import { describeLoad, smoothRate } from '../lib/loadProgress'
import { isLive, isPoster, isSwapping, type StagePhase, stagePhase } from './stagePhase'

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
  /**
   * Colourway being hovered in <ColourwayTabs>, or null. Drives the model's
   * variant only — the selection, the URL and the enquiry payload stay put, so
   * a hover never looks like a choice the visitor did not make.
   */
  preview?: ViewerColourway | null
  /**
   * Fires when the model becomes able to accept a variant swap. <ColourwayTabs>
   * uses it to decide between previewing on the real garment and falling back to
   * a thumbnail.
   */
  onModelReadyChange?: (ready: boolean) => void
}

/** All copied into public/ by scripts/copy-decoders.mjs — see its header. */
const MESHOPT_DECODER_URL = '/meshopt_decoder.js'
/** Trailing slash required: model-viewer appends the filenames to these. */
const DRACO_DECODER_URL = '/draco/'
const KTX2_TRANSCODER_URL = '/basis/'

/**
 * Both strings were rewritten 2026-08-14 because they said things that were not
 * true, in a product where the words are the only thing telling a buyer that
 * what they are looking at is not what they were promised.
 *
 * VARIANT_NOTICE said "temporarily unavailable". It fires when the selected
 * colourway's variant is missing from the GLB — a pipeline state that persists
 * until somebody re-runs the shrink job. Nothing the visitor does, and nothing
 * this page does, will change it. It also described a screen the visitor is not
 * looking at ("the static reference"), when what they are actually seeing is the
 * PREVIOUS colourway still on the model.
 *
 * LOAD_NOTICE said "could not load". That is false in the commonest of the four
 * causes that reach it — a lost WebGL context, where the model DID load and was
 * then taken away by the GPU. It is the failure apps/viewer/CLAUDE.md names as
 * the most likely one a real buyer meets.
 *
 * Both are now written for a non-native English reader: short sentences, no
 * idiom, and each states what is wrong, what the visitor is actually seeing, and
 * which part of the page they can still trust.
 */
const VARIANT_NOTICE =
  'The 3D model cannot show this colourway, so it is still showing the previous one. ' +
  'The colour name, fabric and specifications on this page are for the colourway you selected.'
const LOAD_NOTICE =
  'The 3D view is not available, so this page is showing a photograph of the garment. ' +
  'The colours, fabric and specifications are correct, and you can still send an enquiry below.'

// Image-based lighting for PBR materials. Without an explicit environment,
// <model-viewer>'s built-in neutral scene renders technical fabrics flat and
// low-contrast; this soft studio HDR reveals weave, sheen and depth. Served
// same-origin from public/env (already allowed by the CSP), ≤1024×512 so the
// download stays tiny. Paired with tone-mapping="neutral" (the model-viewer
// v4 default, tuned for e-commerce colour accuracy) so baseColor stays faithful.
const ENVIRONMENT_IMAGE = '/env/studio-soft.hdr'

export function Stage({ data, selected, preview = null, onModelReadyChange }: StageProps) {
  const { product } = data
  const separateMode = product.variantMode === 'separate-glb-per-colour'
  const glbUrl = separateMode ? selected.glbUrl : product.glbUrl

  // What the model should currently DISPLAY, as opposed to what is selected.
  const displayed = displayedColourway(separateMode, preview, selected)

  const mvRef = useRef<ModelViewerEl | null>(null)
  const [libReady, setLibReady] = useState(false)
  /**
   * ONE value, not three booleans. `fallback`, `modelLoaded` and `swapping` were
   * eight combinations of which one is actively wrong — `fallback &&
   * modelLoaded`, "showing a photograph AND an interactive model is loaded" —
   * and that state SHIPPED, as the live region offering to rotate a poster after
   * a lost GPU context. See stagePhase.ts. The three derived booleans below keep
   * every read site reading the way it did.
   */
  const [phase, dispatchPhase] = useReducer(stagePhase, { kind: 'loading' } as StagePhase)
  const fallback = isPoster(phase)
  const modelLoaded = isLive(phase)
  const swapping = isSwapping(phase)
  const [notice, setNotice] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<CameraView | null>('front')
  const loadedSrcRef = useRef<string | null>(null)

  // Real bytes, counted by us. See `fetchWithProgress` for why model-viewer's own
  // `progress` event cannot supply them.
  const [bytesLoaded, setBytesLoaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [rate, setRate] = useState<number | null>(null)
  /**
   * What <model-viewer> is actually given: a `blob:` URL once we have fetched the
   * file ourselves, or the plain URL if that failed.
   *
   * The element is not rendered until this is set, which is load-bearing — with
   * both the element and our fetch active at once the 27 MB file downloads twice.
   */
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)

  // Attempt 3D only when the device/browser/network can carry it.
  //
  // `product.productCode`, `selected.variantId` and `separateMode` appear in this
  // effect only inside diagnostic() payloads — they label a report, they never
  // decide anything. The effect's actual input is `glbUrl`, which already changes
  // whenever any of the three could. Adding them would re-run the model set-up on
  // identity changes that mean nothing, in the most delicate component here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: report labels only, never inputs — see above
  useEffect(() => {
    // Two very different failures, previously collapsed into one branch whose
    // diagnostic was guarded by `if (glbUrl)` — so the WORSE of the two reported
    // nothing at all. A published product with no finished model looks healthy
    // from every angle: the poster loads, the specs are right, the page scores
    // green. It is exactly the state N001 was in, and the only signal was a human
    // noticing the garment never spun.
    if (!glbUrl) {
      dispatchPhase({ type: 'load-failed', reason: 'no-model' })
      diagnostic('model-missing', {
        product: product.productCode,
        variant: selected.variantId,
        reason: separateMode ? 'colourway-has-no-glb' : 'product-has-no-glb',
      })
      return
    }
    if (!canRender3D()) {
      dispatchPhase({ type: 'load-failed', reason: 'no-webgl' })
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
          dispatchPhase({ type: 'load-failed', reason: 'module-failed' })
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
        dispatchPhase({ type: 'loaded' })
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
        // never sees a truthy `loadedSrcRef`, so VARIANT_NOTICE is unreachable
        // FROM THERE and a mid-swap failure tears the stage down to the poster.
        //
        // ⚠️ ANSWERED 2026-08-14 — nothing is broken, and the question above was
        // asking about a path the visitor does not take. VARIANT_NOTICE has two
        // producers, and only one of them is this branch. The one that actually
        // fires is the variant effect below, which sets it when the requested
        // variantId is absent from `availableVariants` — that is the real
        // "colourway missing from the GLB" case, it works, and it is the path an
        // e2e test exercises. The `onError` limb is for a mid-swap LOAD failure,
        // which only separate-GLB mode can reach; N001 is single-GLB with KHR
        // material variants, where a colour change rebinds materials and issues
        // no new request, so no error can arrive mid-swap to observe.
        //
        // Keep the branch: it is correct for the mode that can reach it. The
        // earlier e2e test failed because it was written against single-GLB mode,
        // where the state it asserts is unreachable by construction.
        const src = (el as unknown as { src?: string }).src ?? el.getAttribute('src') ?? ''
        if (loadedSrcRef.current !== src) {
          loadedSrcRef.current = src
          track('model_loaded', { product: product.productCode })
        }
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
          // Reset modelLoaded too. Without this, `loading` (below) evaluates
          // false — it reads `!fallback && …` — so the persistent live region
          // fell through to its `modelLoaded ?` branch and announced "Showing …
          // Drag to rotate, use scroll or pinch to zoom" over a static poster.
          // The sighted visitor sees a photograph; the screen-reader user was
          // invited to interact with a model that no longer exists. Found
          // 2026-08-14. The model is genuinely gone here, so the flag saying it
          // is loaded was simply wrong.
          dispatchPhase({ type: 'context-lost' })
          setNotice(null)
          diagnostic('webgl-context-lost', { product: product.productCode })
          return
        }

        if (!loadedSrcRef.current) {
          dispatchPhase({ type: 'load-failed', reason: 'load-failed' })
        } else {
          dispatchPhase({ type: 'loaded' })
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
      el.addEventListener('error', onError)
      el.addEventListener('camera-change', onCameraChange)

      // React 19 supports returning a cleanup from a ref callback, and this is
      // the only removal path there is: the `if (!el) return` above is exactly
      // the null call React makes on detach, so nothing was ever unbound.
      //
      // Verified 2026-08-14 that it is LATENT rather than live — `productCode`
      // cannot change while <Stage> stays mounted, because the only history
      // entries this document pushes are same-product colourway changes and
      // every catalogue link is external. One line removes the need for that
      // four-step argument to keep being true.
      return () => {
        el.removeEventListener('load', onLoad)
        el.removeEventListener('error', onError)
        el.removeEventListener('camera-change', onCameraChange)
      }
    },
    [product.productCode],
  )

  // Apply the colourway currently being displayed — the hovered one if there is
  // one, otherwise the selected one.
  useEffect(() => {
    const mv = mvRef.current
    if (!mv || !modelLoaded) return
    if (separateMode) return // handled via src/poster attributes below
    const available = mv.availableVariants ?? []
    if (available.includes(displayed.variantId)) {
      mv.variantName = displayed.variantId
      setNotice(null)
    } else {
      // Keep the current model visible; never a blank stage.
      setNotice(VARIANT_NOTICE)
      // Only report a variant the visitor actually CHOSE. A hover that finds no
      // variant is a no-op they never see, and logging it would bury the real
      // signal — `variant-missing` is one of the two diagnostics that had
      // collected six weeks of unread rows.
      if (displayed.slug === selected.slug) {
        diagnostic('variant-missing', {
          product: product.productCode,
          variant: displayed.variantId,
          available: available.join(','),
        })
      }
    }
  }, [
    modelLoaded,
    displayed.variantId,
    displayed.slug,
    selected.slug,
    separateMode,
    product.productCode,
  ])

  // Tell the parent when a variant swap would actually be visible, so the tabs
  // can choose between previewing on the garment and showing a thumbnail.
  const variantSwapReady = modelLoaded && !fallback && !separateMode
  useEffect(() => {
    onModelReadyChange?.(variantSwapReady)
  }, [variantSwapReady, onModelReadyChange])

  // In separate-GLB mode a colourway change swaps src — poster-first again.
  const previousGlb = useRef(glbUrl)
  useEffect(() => {
    if (separateMode && previousGlb.current !== glbUrl) {
      previousGlb.current = glbUrl
      dispatchPhase({ type: 'swap-started' })
      setNotice(null)
    }
  }, [glbUrl, separateMode])

  /**
   * Fetch the GLB ourselves so the readout can show real megabytes and a real
   * time remaining.
   *
   * ⚠️ EVERY failure here falls back to handing <model-viewer> the plain URL,
   * which is precisely the behaviour that shipped before this existed. Offline,
   * CORS, a 5xx, an aborted navigation — none of them may produce an error
   * screen, because none of them stops the element from loading the file itself.
   * That fallback is what makes counting bytes a safe thing to do at all.
   */
  useEffect(() => {
    // `canRender3D()`, NOT `libReady`. The 27 MB download used to wait for the
    // model-viewer module to finish downloading and parsing first, serialising
    // two independent transfers on the connection that matters least — a phone
    // on 4G, where the model is already ~23s.
    //
    // ⚠️ TWO TRAPS HERE, BOTH OF WHICH SHIP GREEN.
    // (1) `libReady` was silently doing double duty as the Save-Data / no-WebGL
    //     guard: the effect above returns early WITHOUT importing the module in
    //     those cases, so libReady never became true and this effect never ran.
    //     Removing it without calling canRender3D() would start a 27 MB download
    //     on a connection that explicitly asked us not to.
    // (2) `libReady` must leave the dependency array in the SAME edit. Left in,
    //     the effect re-runs when it flips and the file downloads twice.
    if (!glbUrl || fallback || !canRender3D()) return
    let cancelled = false
    let objectUrl: string | null = null
    const controller = new AbortController()

    setBytesLoaded(0)
    setBytesTotal(0)
    setRate(null)
    setResolvedSrc(null)

    // Instantaneous rate between samples, exponentially smoothed. The running
    // average would also be smooth but reacts too slowly to a network that drops
    // mid-download, leaving the countdown confidently wrong for many seconds.
    let smoothed: number | null = null
    let lastAt = performance.now()
    let lastLoaded = 0

    fetchWithProgress(
      glbUrl,
      ({ loaded, total }) => {
        if (cancelled) return
        setBytesLoaded(loaded)
        setBytesTotal(total)
        const now = performance.now()
        const seconds = (now - lastAt) / 1000
        // Sample no faster than ~10 Hz: below that the deltas are dominated by
        // chunk boundaries rather than throughput.
        if (seconds >= 0.1) {
          smoothed = smoothRate(smoothed, (loaded - lastLoaded) / seconds)
          setRate(smoothed)
          lastAt = now
          lastLoaded = loaded
        }
      },
      controller.signal,
    )
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setResolvedSrc(objectUrl)
      })
      .catch(() => {
        if (cancelled) return
        diagnostic('model-prefetch-failed', {
          product: product.productCode,
          reason: 'falling back to direct model-viewer fetch',
        })
        setResolvedSrc(glbUrl)
      })

    return () => {
      cancelled = true
      controller.abort()
      // Releases the ~27 MB the blob is holding. Without this a visitor moving
      // between colourways in separate-GLB mode accumulates a copy per swap.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [glbUrl, fallback, product.productCode])

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

  /**
   * The poster now appears ONLY when 3D cannot run at all.
   *
   * It used to cover the stage for the whole download, and it could not fit:
   * every poster is an opaque WebP with its background baked in at #f0efeb. On
   * the light `--bg` (#f1efea) that nearly matches but still hides the blueprint
   * grid, leaving a visible rectangle; on the dark `--bg` (#1c1f18) it is a
   * near-white slab on near-black. A fixed background cannot follow a themed
   * stage, so during loading the stage shows its own ground instead — which is
   * drawn from tokens and therefore correct in both modes by construction.
   *
   * As the 3D-unavailable fallback the poster is still exactly right: there, it
   * is the only garment the visitor can be shown.
   */
  const showPosterOverlay = fallback
  const load = describeLoad({
    bytesLoaded,
    bytesTotal,
    modelLoaded: modelLoaded && !swapping,
    bytesPerSecond: rate,
  })
  // No longer gated on `libReady`: the download now starts immediately rather
  // than after the model-viewer module lands, so gating the readout on the
  // module would leave the stage blank for the first seconds of a 27 MB
  // transfer — the exact dead time the byte-accurate readout exists to remove.
  // `!fallback` already covers Save-Data and no-WebGL, which is what libReady
  // was standing in for here.
  const loading = !fallback && load.phase !== 'ready'
  // NOT `performance`: that name shadows the global for the whole component, and
  // the byte-counting effect above calls `performance.now()`. As a shadowed
  // string it would throw "performance.now is not a function" at runtime, with
  // every unit test still green — the pure helpers never touch the clock.
  // Caught by the linter's exhaustive-deps rule, of all things.
  const performanceSummary = product.performanceFeatures.join(' / ')

  /**
   * Coarse progress for assistive technology, at 25% steps.
   *
   * The visible readout changes several times a second. Announcing that verbatim
   * is what made the old preloader read out ~90 times in under two seconds; the
   * live region below therefore takes this value, which changes four times.
   */
  const announcedPercent = load.percent === null ? null : Math.floor(load.percent / 25) * 25

  return (
    // The name claimed "Interactive" in every fallback state — no GLB, no WebGL,
    // Save-Data, module load failure, lost context — where the section contains
    // a photograph and nothing interactive at all.
    <section
      className="stage"
      aria-label={fallback ? 'Product reference photograph' : 'Interactive 3D product reference'}
    >
      <div className="stage__inner">
        <div className="stage__canvas" data-lenis-prevent>
          <svg
            className="stage__contours"
            aria-hidden="true"
            viewBox="0 0 1200 640"
            preserveAspectRatio="xMidYMid slice"
          >
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M-40 520 C 220 430, 420 610, 700 520 S 1120 430, 1260 500" />
              <path d="M-40 560 C 240 480, 460 640, 740 560 S 1140 470, 1260 540" />
              <path d="M-40 130 C 180 60, 420 190, 660 110 S 1060 40, 1260 120" />
              <path d="M-40 90 C 200 20, 440 150, 680 70 S 1080 0, 1260 80" />
            </g>
          </svg>

          {libReady && resolvedSrc && !fallback && (
            <model-viewer
              ref={attachRef}
              className="stage__model"
              src={resolvedSrc}
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
            {performanceSummary && (
              <div className="callout callout--right" style={{ bottom: '18%', right: '3%' }}>
                <span className="label">[ PERFORMANCE ]</span>
                <div className="callout__value">{performanceSummary}</div>
              </div>
            )}
          </div>

          {/* Only once there is something to drag. It used to show throughout the
              download, inviting the visitor to rotate a garment that had not
              arrived — on a 4G phone that is 22.6 s of instructions for an empty
              stage. */}
          {/* Pointer-conditional, because on touch NEITHER half was true.
              model-viewer is mounted `touch-action="pan-y"`, so a vertical swipe
              is deliberately handed to the document and only a horizontal drag
              orbits; zoom is pinch. For a B2B reference the printed artwork IS
              the product, so zooming into the chest print is the visitor's main
              task — and the page told them to do it with a gesture that scrolls
              the garment off screen. isCoarsePointer() already gates the same
              class of decision in ColourwayTabs.tsx. */}
          {!fallback && modelLoaded && !swapping && (
            <p className="stage__hint" aria-hidden="true">
              {isCoarsePointer()
                ? 'DRAG TO ROTATE · PINCH TO ZOOM'
                : 'DRAG TO ROTATE · SCROLL TO ZOOM'}
            </p>
          )}

          {/*
            The honest readout, centred where the garment will appear rather than
            tucked at the top edge. `aria-hidden` because it changes several times
            a second; the coarse live region at the end of the section is what
            assistive technology hears.
          */}
          {loading && (
            <div className="stage__loading" aria-hidden="true">
              <span className="stage__loading-title">
                {/* "3D MODEL", not "REFERENCE". The live region below already
                    said "the interactive 3D model" while this line said
                    "REFERENCE", so the sighted and the screen-reader visitor
                    were given different names for the same 23-second event —
                    and "reference" is also what the whole page calls itself. */}
                {load.phase === 'preparing' ? 'PREPARING 3D MODEL…' : 'LOADING 3D MODEL'}
                {load.percent !== null && ` · ${load.percent}%`}
              </span>
              <span
                className={`stage__loading-bar${
                  load.phase === 'preparing' ? ' stage__loading-bar--indeterminate' : ''
                }`}
              >
                {/* scaleX, not width. `width` is a layout property and this is
                    retargeted at ~10 Hz for the ~23s a 27 MB model takes on
                    average 4G — roughly 230 layout passes during the single
                    heaviest thing the page does, on the phone that is also
                    decoding the model. The fill is width:100% and scaled; see
                    `.stage__loading-bar span` in page.css. */}
                <span
                  style={
                    load.phase === 'downloading' && load.percent !== null
                      ? { transform: `scaleX(${load.percent / 100})` }
                      : undefined
                  }
                />
              </span>
              {load.detail && <span className="stage__loading-detail">{load.detail}</span>}
            </div>
          )}

          {/* Mounted UNCONDITIONALLY, with only its text driven. A live region
              has to exist before its contents change for the announcement to be
              reliable; inserting an already-populated role="status" is the
              classic silent case, and iOS VoiceOver — the browser a QR scan
              opens — is the least forgiving about it. `hidden` keeps it out of
              the layout and off screen while empty, without unmounting it. */}
          <p
            className="stage__error"
            role="status"
            hidden={!(notice ?? (fallback ? LOAD_NOTICE : null))}
          >
            {notice ?? (fallback ? LOAD_NOTICE : '')}
          </p>

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

        {/* Coarse on purpose — see `announcedPercent`. This string changes at most
            four times during a download, where the visible readout changes
            several times a second. */}
        <p className="visually-hidden" role="status">
          {loading
            ? load.phase === 'preparing'
              ? 'Download complete. Preparing the interactive 3D model.'
              : announcedPercent === null
                ? 'Loading the interactive 3D model.'
                : `Loading the interactive 3D model, ${announcedPercent} percent.`
            : modelLoaded
              ? `Showing ${product.productName} in ${selected.displayName}.`
              : ''}
        </p>
        {/* ONE instruction, and it names the keyboard.
            Three overlapping strings described this object — this one, the
            sentence that used to be appended to the live region above, and the
            visible hint — and both authored here described only pointer
            gestures. The model IS keyboard-operable: model-viewer orbits with
            the arrow keys and zooms with Page Up / Page Down. A keyboard-only
            visitor was told to drag. Gated on the same condition as the visible
            hint, so it is absent when there is nothing to operate. */}
        {!fallback && modelLoaded && (
          <p className="visually-hidden">
            Drag or press the arrow keys to rotate. Scroll, pinch, or press Page Up and Page Down to
            zoom.
          </p>
        )}
      </div>
    </section>
  )
}
