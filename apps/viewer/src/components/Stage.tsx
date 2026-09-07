import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { boundingRadius, installAdaptiveNearPlane, internalCamera } from '../lib/camera-near-plane'
import { applyDecalDepthBias, correlatedThreeMaterials } from '../lib/decal-depth-bias'
import { track } from '../lib/analytics'
import { canRender3D, prefersReducedMotion } from '../lib/capabilities'
import { displayedColourway } from '../lib/colourwayPreview'
import { diagnostic } from '../lib/diagnostic'
import {
  CUE_IDLE_MS,
  CUE_RETURN_MS,
  CUE_SWEEP_DEGREES,
  offsetOrbitAzimuth,
} from '../lib/interactionCue'
import { fetchWithProgress } from '../lib/fetchWithProgress'
import { describeLoad, showsIndeterminateSweep, smoothRate } from '../lib/loadProgress'
import { adaptivePanSensitivity, PAN_SENS_OUT, shouldWritePan } from '../lib/adaptive-pan'
import { CAMERA_DECAY_MS } from '../lib/motion'
import { placeholderAsset, placeholderBlurPx, placeholderLeaveMs } from '../lib/placeholder'
import { useCoarsePointer } from '../lib/useCoarsePointer'
import { isLive, isPoster, isSwapping, type StagePhase, stagePhase } from './stagePhase'
import { type CameraView, StageControls } from './StageControls'

/** Subset of the ModelViewerElement API the stage uses. */
interface ModelViewerEl extends HTMLElement {
  availableVariants?: string[]
  variantName: string | null
  cameraOrbit: string
  cameraTarget: string
  fieldOfView: string
  jumpCameraToGoal?: () => void
  /**
   * model-viewer's scene-graph handle. Only `materials` is used, and only to reach
   * each material's backing three.js material for a depth bias — see
   * src/lib/decal-depth-bias.ts for why that is necessary and what guards it.
   */
  model?: { materials?: readonly { name?: string; isLoaded?: boolean }[] }
  /** Model extents in metres. Feeds the adaptive near plane — see camera-near-plane.ts. */
  getDimensions?: () => { x: number; y: number; z: number }
  /** Current orbit. `radius` is the camera distance the near plane has to follow. */
  getCameraOrbit?: () => { radius: number }
  /** Current field of view in DEGREES. Drives the adaptive pan curve. */
  getFieldOfView?: () => number
  /**
   * Whether THIS device can enter AR. False on every desktop and on Android here
   * (`ar-modes="quick-look"` is iOS-only by choice — see docs/DECISION-AR-SCOPE.md).
   * Read after `load`, because it depends on the loaded model.
   */
  canActivateAR?: boolean
  /**
   * How far a two-finger gesture slides the garment. Written as a PROPERTY:
   * `features/controls.js` observes `changedProperties.has('panSensitivity')`,
   * and React never reflects a custom-element property to an attribute.
   */
  panSensitivity?: number
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
 *
 * ⚠️ LOAD_NOTICE LOST A SECOND FALSE CLAUSE 2026-08-21, and the way it survived is
 * the lesson. It ended "…so this page is showing a photograph of the garment",
 * which stopped being true the moment the poster image was removed from the stage
 * in this same change — the words describing the picture were not deleted with the
 * picture. Every gate stayed green: the one e2e test that asserts this copy checks
 * `.stage img` on the line ABOVE and died there, so the assertion on the sentence
 * itself was never reached. Copy that describes the UI has to be re-read whenever
 * the UI it describes is deleted; nothing here can check that for you.
 */
const VARIANT_NOTICE =
  'The 3D model cannot show this colorway, so it is still showing the previous one. ' +
  'The color name, fabric and specifications on this page are for the colorway you selected.'
const LOAD_NOTICE =
  'The 3D view is not available. ' +
  'The colors, fabric and specifications on this page are correct, ' +
  'and you can still send an inquiry below.'

// Image-based lighting for PBR materials. Without an explicit environment,
// <model-viewer>'s built-in neutral scene renders technical fabrics flat and
// low-contrast; this soft studio HDR reveals weave, sheen and depth. Served
// same-origin from public/env (already allowed by the CSP), ≤1024×512 so the
// download stays tiny. Paired with tone-mapping="neutral" (the model-viewer
// v4 default, tuned for e-commerce colour accuracy) so baseColor stays faithful.
const ENVIRONMENT_IMAGE = '/env/studio-soft.hdr'

/**
 * How far in a buyer may zoom.
 *
 * ⚠️ THIS ELEMENT NEVER SET IT UNTIL 2026-08-17, so the floor was model-viewer's
 * own default of **12deg** — and for this product that capped the visitor's main
 * task. "For a B2B garment reference the printed artwork IS the product"
 * (CLAUDE.md), so reading a chest print is what the page is for, and the page
 * quietly refused to let anyone closer than 12deg.
 *
 * The `/render` route set 1deg from 2026-08-08 until it was removed on
 * 2026-08-17, so the two files disagreed for nine days and the one a BUYER uses
 * was the wrong one. apps/viewer/CLAUDE.md records how the trap hides: below the floor,
 * `fieldOfView` is silently ignored rather than clamped-with-a-warning, and four
 * zoom levels tighter than 12deg produced four BYTE-IDENTICAL PNGs. It returns a
 * plausible frame of the wrong thing. Found there by looking at a contact sheet;
 * found here by noticing that only the robot's page had the floor lifted.
 */
const MIN_FIELD_OF_VIEW = '1deg'

/**
 * Who gets a one-finger drag on a phone: the model, or the page.
 *
 * ⚠️ THIS WAS `pan-y` UNTIL 2026-08-17 AND THE OWNER REPORTED THE CONSEQUENCE:
 * "sometimes when scrolling in the 3D block, checking the 3D model, the screen
 * scrolls down while I am trying to scroll the 3D model."
 *
 * `pan-y` hands every gesture with a vertical component to the browser before
 * model-viewer sees a single event. It is not a heuristic and there is no
 * threshold — the browser claims the touch on the first move. So on a phone,
 * where a garment is inspected by dragging it around, ANY drag that is not
 * almost perfectly horizontal scrolled the page instead of turning the product.
 * A visitor trying to look at the back of a skinsuit got the specifications.
 *
 * `none` gives the whole gesture to the model. THE COST IS REAL AND IS WHY
 * `pan-y` was chosen originally: a visitor can no longer scroll the page by
 * swiping ON the garment, so a canvas that filled the screen would trap them.
 * This one does not, and that is what makes the trade safe here rather than
 * merely preferable — the header, the caption row, the colourway rail, the fixed
 * action bar and the page below the band are all swipeable.
 *
 * ⚠️ THE OLD JUSTIFICATION HERE WAS A RULE OF THUMB AND IT NEARLY EXPIRED. It read
 * "there is more non-canvas height on screen than canvas", measured at 390x844 in
 * a desktop browser. On a real iPhone 17 the canvas is now 350 of 714 usable
 * points and the non-canvas remainder is 364 — still more, by fourteen pixels.
 * A rule of thumb that survives by 14px is not an invariant, and it was never the
 * thing that actually mattered: what a visitor needs is a CONTIGUOUS strip their
 * thumb can reach, not a majority of the screen.
 *
 * That is now asserted directly — `motion-and-layout.spec.ts` -> "a thumb can
 * always scroll the page", which requires >=140 contiguous CSS px below the
 * canvas at 320/375/402/414 and measured 277px. If the canvas is ever grown
 * enough to fail it, the choice is to shrink the canvas or return to `pan-y`;
 * do not lower the threshold.
 */
const TOUCH_ACTION = 'none'

/**
 * A quick tap on the canvas is a COMMAND in model-viewer, and on this page it
 * was the wrong one.
 *
 * Measured against the installed 4.3.1 on 2026-08-19. `SmoothControls.js` runs
 * `recenter()` on pointer-up whenever the touch lasted under `TAP_MS` (300) and
 * moved under `TAP_DISTANCE` (**2px**) — thresholds a finger meeting a phone
 * clears constantly, including on a drag that simply had not started moving yet.
 * Then it branches on whether the ray hit the model:
 *
 *   hit  -> re-targets the camera at that surface point; the garment slides
 *           off-centre with no announcement.
 *   miss -> `userAdjustOrbit(0, 0, 1)`, which model-viewer's own source comments
 *           as "Zoom all the way out."
 *
 * The miss branch is the common one HERE and that is a property of the product,
 * not of the library: the garment is a narrow skinsuit and the canvas is the
 * full column width, so most of what a thumb can land on is empty blueprint
 * grid. The owner reported this as the gestures not working properly, and
 * nothing in this repo had ever configured it — it is model-viewer's default.
 *
 * ⚠️ `disable-pan` would ALSO kill this, because `recenter` is gated on
 * `enablePan && enableTap` — and that is exactly why it is NOT used. Two-finger
 * pan is how a buyer reaches a chest or hem print once zoomed in at
 * MIN_FIELD_OF_VIEW, and "the printed artwork IS the product" (CLAUDE.md). Turn
 * off the misfiring gesture, keep the one the page exists for.
 *
 * The cost, stated plainly: tap-to-focus is model-viewer's intended way to pick
 * a spot before zooming. Two-finger pan still reaches any detail, and every
 * <StageControls> button is a full reset (see `applyView`).
 */
const DISABLE_TAP = true

/**
 * How far a two-finger gesture is allowed to slide the garment sideways.
 *
 * ⚠️ A PINCH IN model-viewer IS ALSO A PAN, BY DESIGN. `touchModeZoom` runs the
 * zoom and then `movePan(dx, dy)` in the same gesture, and `onPointerMove` feeds
 * it `(event.clientX - pointer.clientX) / numTouches` per finger. A *symmetric*
 * pinch nets ~zero pan. A real one is never symmetric — the thumb anchors while
 * the index finger travels — so the centroid moves and the garment slides. That
 * is the owner's 2026-08-19 report that pinch "does not work perfectly".
 *
 * MEASURED on the iOS 26.5 simulator with real two-finger input (`touch2_path`),
 * against the PRODUCTION 28,271,780-byte GLB, framed exactly as the stage frames
 * it. One asymmetric pinch — thumb held at x=141, index 261 -> 341:
 *
 *     pan-sensitivity   target x after   garment
 *          1.0            -0.0979        shoved right, edge clipped off screen
 *          0.3            -0.0290        stays centred
 *          0              +0.0007        no movement at all — and no pan either
 *
 * -0.0290 / -0.0979 = 0.296, i.e. exactly linear, as the source predicts.
 *
 * WHY NOT 0 (or `disable-pan`). Pan is the ONLY way left to reach an off-centre
 * print: `disable-tap` above removed tap-to-focus, and `cameraTarget` is fixed at
 * the model centre, so at `min-field-of-view: 1deg` a buyer could otherwise only
 * ever zoom into the middle of the garment. "The printed artwork IS the product"
 * (CLAUDE.md). The reach was measured too, and 0.3 keeps it: zoomed to fov 4.82
 * (a 0.123 m tall frame), one two-finger stroke still moved the view 0.0216 m —
 * **17.5% of the frame per stroke**.
 *
 * ⚠️ TWO THINGS THAT WILL MISLEAD THE NEXT MEASUREMENT.
 *
 * 1. **Do not use a symmetric pinch as the control.** A symmetric pinch has no x
 *    component, so every `pan-sensitivity` value produces a byte-identical
 *    result — 0.0967 m at both 1.0 and 0.3 here — which reads as "this attribute
 *    does nothing". It reads that way because the test cannot see the axis the
 *    attribute controls.
 * 2. **Target displacement is NOT visible displacement.** A pinch also triggers
 *    `resetRadius()` on pointer-up (gated on pan being enabled, NOT on whether
 *    the user panned), which snaps the target onto the surface at screen centre
 *    and moves the radius to match "so that the camera itself does not move".
 *    That is the whole y/z component of the number above and it is invisible.
 *    Only the **x** component is what a person actually sees slide.
 *
 * ⚠️ SINCE 2026-09-05 THIS IS ONLY THE STARTING VALUE, not the whole story. It is
 * still exactly what ships at the default framing — the measurement above is
 * unchanged and still governs — but `lib/adaptive-pan.ts` raises it as the field
 * of view narrows, up to 1:1 finger tracking at `MIN_FIELD_OF_VIEW`. Read that
 * file before touching either end: the low end exists for the off-screen defect
 * above, and the high end exists because the garment is 56.6x bigger at full zoom.
 */
const PAN_SENSITIVITY = PAN_SENS_OUT

/**
 * Push the field-of-view-appropriate `panSensitivity` onto the element.
 *
 * Module scope on purpose: `onCameraChange` lives inside an effect, and a
 * component-scope helper would become one of that effect's dependencies for no
 * benefit. The only mutable state is the caller's ref.
 *
 * Silent no-ops are correct here. `getFieldOfView` is optional on the interface
 * because the element is dynamically imported and this can fire against a stub in
 * a unit test; a viewer that simply keeps the shipped 0.3 is the safe outcome.
 */
function applyAdaptivePan(
  // Takes the ref's own handle rather than the listener's `HTMLElement`: `attachRef`
  // has already narrowed it once, and re-casting at the call site would assert the
  // same thing a second time in a place nothing verifies.
  el: ModelViewerEl | null,
  lastWritten: { current: number | null },
): void {
  if (!el) return
  const fov = el.getFieldOfView?.()
  if (typeof fov !== 'number') return
  const next = adaptivePanSensitivity(fov)
  if (!shouldWritePan(lastWritten.current, next)) return
  lastWritten.current = next
  el.panSensitivity = next
}

export function Stage({ data, selected, preview = null, onModelReadyChange }: StageProps) {
  const { product } = data
  const separateMode = product.variantMode === 'separate-glb-per-colour'
  const glbUrl = separateMode ? selected.glbUrl : product.glbUrl

  // What the model should currently DISPLAY, as opposed to what is selected.
  const displayed = displayedColourway(separateMode, preview, selected)

  const mvRef = useRef<ModelViewerEl | null>(null)
  /** Last `panSensitivity` written. See PAN_SENS_STEP — one gesture fires ~165 events. */
  const panSensRef = useRef<number | null>(null)
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
  /**
   * The garment reads as a photograph and visitors do not touch it — reported by
   * the owner 2026-09-04. `cueVisible` shows the hint; `cueSpent` makes it a
   * once-per-visit thing. See lib/interactionCue.ts for why the fix is a legible
   * hint FIRST and a sweep second, and why the sweep is only 14 degrees.
   */
  const [cueVisible, setCueVisible] = useState(false)
  /**
   * Whether to offer AR at all. Driven by model-viewer's own `canActivateAR`
   * rather than by sniffing the user agent, so it is false on desktop, false on
   * Android (Quick Look only) and false when the model has not loaded.
   *
   * The button is not merely hidden when this is false — it is not rendered, so it
   * never enters the tab order and never occupies a slot the element would then
   * lay out.
   */
  const [arAvailable, setArAvailable] = useState(false)
  const cueSpentRef = useRef(false)
  /**
   * Once per visit, and permanently. A cue that returns after every colourway
   * switch punishes exactly the buyer who is comparing five colours — someone
   * who has already proved they know the garment is interactive.
   */
  /** The pending return-to-front, so an unmount cannot leave the camera turned. */
  const returnRef = useRef<number | null>(null)
  const dismissCue = useCallback(() => {
    cueSpentRef.current = true
    setCueVisible(false)
  }, [])
  // Re-reads when a keyboard is attached or detached — see lib/useCoarsePointer.ts.
  const coarsePointer = useCoarsePointer()
  const loadedSrcRef = useRef<string | null>(null)
  /**
   * When this colourway's model download began, for the one number a QR-scan
   * business most wants and never had: how long a real customer waits before the
   * garment appears. It was computed on every single load — the progress bar and
   * the "~8s LEFT" readout cannot exist without it — and then thrown away, because
   * `model_loaded` reported only the product code.
   */
  const downloadStartedAtRef = useRef<number | null>(null)
  /**
   * The download's total size, mirrored into a ref.
   *
   * ⚠️ NOT the `bytesTotal` STATE, deliberately. The `load` handler is created
   * inside `attachRef`, a `useCallback` whose dependency array does not list
   * `bytesTotal` — so reading the state there closes over whatever value the
   * render that produced the attached callback happened to hold. It would usually
   * be right, because the element only mounts after the fetch resolves, and
   * "usually right" is precisely the stale-closure shape this file has been bitten
   * by before (`performance` shadowed by a local, green in every unit test). A ref
   * has one value and it is always the current one.
   */
  const downloadTotalRef = useRef(0)

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
   * both the element and our fetch active at once the file downloads twice.
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
    /**
     * Draco and KTX2 must be configured on the GLOBAL, BEFORE the module loads.
     *
     * ⚠️ Setting them on `ModelViewerElement` after the import — which is what the
     * three lines below the import used to do, and which WORKS for meshopt — does
     * NOT work for these two, and the asymmetry is in model-viewer itself.
     * `lib/features/loading.js` bakes them at MODULE-EVALUATION time:
     *
     *     const ModelViewerElement = self.ModelViewerElement || {}
     *     const dracoDecoderLocation =
     *       ModelViewerElement.dracoDecoderLocation || DEFAULT_DRACO_DECODER_LOCATION
     *     CachingGLTFLoader.setDRACODecoderLocation(dracoDecoderLocation)
     *
     * There is NO such line for meshopt (it has no default at all), which is
     * exactly why meshopt has always worked here and draco never did.
     *
     * Measured in production 2026-08-21: on a cold load of viewer.wear-run.help,
     * `ModelViewerElement.dracoDecoderLocation` read
     * `https://www.gstatic.com/draco/versioned/decoders/1.5.6/` while
     * `meshoptDecoderLocation` correctly read `/meshopt_decoder.js`. A draco-encoded
     * garment therefore rendered NOTHING — model-viewer fetched the decoder from
     * gstatic and the CSP (correctly) refused it. The product fell back to its
     * poster with "The 3D view is not available".
     *
     * ⚠️ VERIFY THIS ON A LIVE COLD LOAD BEFORE SHIPPING A DRACO MODEL. The
     * production shrink flags are deliberately still `--meshopt`
     * (packages/shared/src/shrink.ts) and must not be switched back to `--draco`
     * until `customElements.get('model-viewer').dracoDecoderLocation` reads
     * `/draco/` on the deployed site. Checking that the code is committed proves
     * nothing — the previous version was committed, deployed, threw no error, and
     * was inert.
     */
    const globalConfig = self as unknown as {
      ModelViewerElement?: { dracoDecoderLocation?: string; ktx2TranscoderLocation?: string }
    }
    globalConfig.ModelViewerElement = globalConfig.ModelViewerElement ?? {}
    globalConfig.ModelViewerElement.dracoDecoderLocation = DRACO_DECODER_URL
    globalConfig.ModelViewerElement.ktx2TranscoderLocation = KTX2_TRANSCODER_URL

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
          minimumRenderScale: number
        }
        element.meshoptDecoderLocation = MESHOPT_DECODER_URL

        /**
         * Let a struggling phone degrade PAST model-viewer's own floor.
         *
         * `Renderer.js` defaults `lastStep` to 3, i.e. `SCALE_STEPS[3]` = 0.5x —
         * so a device that cannot hold frame rate at half resolution has nowhere
         * left to go and simply stays janky. That is not hypothetical here: the
         * live model is 28,271,780 bytes, it decodes to ~72 MB of vertex and
         * index data before textures, and the owner confirmed on 2026-08-19 that
         * the audience includes iPhone 11-13 class hardware. Measured on the iOS
         * 26.5 simulator the same day: `devicePixelRatio` is **3**, so a
         * 402x328 canvas is already 1.19 megapixels per frame at scale 1.
         *
         * 0.25 is the lowest model-viewer accepts (it warns and clamps below
         * that). It is a FLOOR, not a target — the renderer still starts at 1
         * and only walks down while frames are slow, then walks back up. Nothing
         * here makes a fast phone render worse.
         *
         * ⚠️ There is no matching CEILING knob: `this.dpr = window.devicePixelRatio`
         * is unconditional, so full-DPR is always the first thing tried and the
         * first second of a heavy visit is degraded-after-the-fact by design.
         * The `render-scale` listener below is what makes that visible.
         */
        element.minimumRenderScale = 0.25
        // Draco and KTX2 default to gstatic. Pointing them at our own copies too
        // means the "no third-party runtime dependency" claim above is true for
        // ALL THREE codecs rather than just this one, and lets connect-src drop
        // gstatic entirely. --ktx2 is the documented production texture target,
        // so this stops being hypothetical the moment it is switched on.
        // Kept as a belt-and-braces second write. Harmless, and it is what makes
        // the value correct if a future model-viewer drops the module-eval baking.
        // It is NOT sufficient on its own — see the block above the import.
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

      /**
       * Pull printed cut-outs toward the camera so they win the depth test.
       *
       * A decal authored flush with the cloth gives the GPU two surfaces at
       * near-identical depth; the winner changes per pixel and per frame, and the
       * artwork shatters. Measured 2026-08-27 on `p001`, whose decals sit
       * **0.001 mm** off the cloth: without this the chevrons break into fragments
       * and "NEVER LOOK BACK" fills with holes. On `n001`, at **0.169 mm**, it
       * changes nothing — the control that makes that measurement mean something.
       * glTF 2.0 cannot express a polygon offset, and the only file-side lever is
       * moving decal geometry, which tore multi-panel prints open along their seams.
       *
       * ⚠️ CALLED ON EVERY COLOURWAY, NOT ONLY ON LOAD — the load-time-only version
       * shipped on 2026-08-27 and reached 6 of 26 decals on the live garment.
       * model-viewer builds only the arriving variant's materials; everything
       * reachable solely through `KHR_materials_variants` is a lazy stub whose
       * backing three.js material does not exist yet, so four of five colourways
       * kept flickering. Verified in a browser, not reasoned about: 11/11 biased on
       * load, then 16/16, 21/21, 26/26 as each colourway was visited.
       */
      const biasDecals = () => {
        const materials = (el as ModelViewerEl).model?.materials
        if (!materials) return
        // EVERY three.js material behind each wrapper, not the first (audit DV-01): a
        // colourway switch draws another entry of the same set, and the bib drew 0 of 5.
        const result = applyDecalDepthBias(materials, (m) => correlatedThreeMaterials(m))
        // `pending` is the normal case — those materials belong to colourways the
        // visitor has not opened, and the next `variant-applied` catches them. Only
        // a LOADED material with no backing means the internal symbol has gone, and
        // that failure is otherwise completely silent. Reported, never `pending`,
        // because `variant-missing` already proved what burying signal costs.
        if (result.unreachable > 0) {
          diagnostic('decal-bias-unreachable', {
            product: product.productCode,
            unreachable: String(result.unreachable),
            biased: String(result.biased.length),
          })
        }
      }

      /**
       * Give the depth buffer enough precision at the garment that CLO's 0.100 mm
       * graphic offset survives being zoomed out. model-viewer pins `near` at
       * 0.00436 m, which leaves a 1.5x margin at full zoom-out and 5.1x zoomed in —
       * and the owner's report was exactly that asymmetry: "spots blink on and off,
       * but only zoomed out; zoomed in it seems perfect". See camera-near-plane.ts.
       *
       * Once per load, not per colourway: the override reads the orbit radius on
       * every access, so it follows the camera without being reinstalled.
       */
      const clampNearPlane = () => {
        const mv = el as ModelViewerEl
        const dims = mv.getDimensions?.()
        if (!dims) return
        const ok = installAdaptiveNearPlane(
          internalCamera(mv),
          () => mv.getCameraOrbit?.().radius ?? 0,
          boundingRadius(dims),
        )
        // Silence here would mean the flicker quietly returning on a model-viewer
        // upgrade, which is the failure shape this repo keeps paying for.
        if (!ok) diagnostic('near-plane-unavailable', { product: product.productCode })
      }

      const onLoad = () => {
        dispatchPhase({ type: 'loaded' })

        // AFTER load: `canActivateAR` depends on the loaded model, and reading it
        // before returns false on a device that can.
        setArAvailable(mvRef.current?.canActivateAR === true)
        clampNearPlane()
        biasDecals()
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
          /*
           * ⚠️ THE DURATION IS THE POINT, AND IT USED TO BE DISCARDED. This event
           * carried only the product code, so the question the business actually
           * has — "how long does a buyer wait after scanning a tag?" — could not be
           * answered from the data, despite the browser computing it on every load
           * to draw the progress bar.
           *
           * Measured from the start of OUR fetch, not from navigation: that is the
           * span the visitor spends looking at a blurred photo, and it is the one
           * this page can act on. Navigation-relative timing is what Core Web
           * Vitals is for.
           *
           * Rounded to 10ms and sent as a string because `track` takes
           * Record<string, string> — sub-10ms precision would be false anyway, since
           * the sample is one visitor on one connection.
           *
           * `bytes` rides along because a duration without a size is uninterpretable
           * across an 1.8-7.8 MB catalogue: 4s means something very different for
           * the 1.8 MB pullover than for the 7.8 MB bib.
           */
          const startedAt = downloadStartedAtRef.current
          track('model_loaded', {
            product: product.productCode,
            ...(startedAt !== null
              ? { durationMs: String(Math.round((performance.now() - startedAt) / 10) * 10) }
              : {}),
            ...(downloadTotalRef.current > 0 ? { bytes: String(downloadTotalRef.current) } : {}),
          })
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
        if (detail?.source === 'user-interaction') {
          setActiveView(null)
          // They have found it. `user-interaction` is model-viewer's own word for
          // "a human did this", so the programmatic sweep below cannot dismiss
          // its own cue by firing this handler.
          dismissCue()
        }
        // Retune the pan for the new zoom level — see src/lib/adaptive-pan.ts.
        //
        // ⚠️ HERE AND NOT ON `pointerdown`. model-viewer reads `panSensitivity`
        // once per gesture, inside `initializePan()`, which runs in ITS OWN
        // pointerdown handler — registered when the element connected, so before
        // any listener we add. A value written from our pointerdown would land one
        // gesture late, which is worse than not adapting at all: the sensitivity
        // would always belong to the previous zoom level.
        //
        // ⚠️ NOT gated on `user-interaction`. A FRONT/BACK/SIDE press also changes
        // the field of view, and the next two-finger gesture after one must not
        // inherit the sensitivity from wherever the visitor had zoomed to before.
        applyAdaptivePan(mvRef.current, panSensRef)
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
      /**
       * The only honest way to know this page is struggling on a phone.
       *
       * model-viewer degrades its own render resolution under load, but it does
       * so REACTIVELY and silently: `Renderer.js` walks `SCALE_STEPS`
       * ([1, .79, .62, .5, .4, .31, .25]) whenever `avgFrameDuration` crosses a
       * threshold, stopping at `DEFAULT_LAST_STEP` (3) = 0.5x unless
       * `minimumRenderScale` says otherwise. So a janky visit and a smooth one
       * produce the same logs, and "the mobile version feels laggy" — reported
       * by the owner 2026-08-19 — had no number attached to it anywhere.
       *
       * `render-scale` carries model-viewer's own verdict, including a `reason`
       * string it sets to 'GPU throttling' when the step moved because frames
       * were slow. Report only when it is NOT 1: a full-resolution render is
       * the expected case and logging it every resize would bury the signal,
       * which is the mistake `variant-missing` already made once.
       */
      const onRenderScale = (event: Event) => {
        const d = (
          event as CustomEvent<{
            renderedDpr?: number
            reportedDpr?: number
            minimumDpr?: number
            reason?: string
          }>
        ).detail
        if (!d || d.reason === '') return
        // `diagnostic` takes Record<string, string> — telemetry.ts reads the
        // detail as strings, so the numbers are formatted here rather than
        // widening that contract for one caller.
        diagnostic('render-scale-degraded', {
          product: product.productCode,
          renderedDpr: String(d.renderedDpr ?? ''),
          reportedDpr: String(d.reportedDpr ?? ''),
          minimumDpr: String(d.minimumDpr ?? ''),
          reason: d.reason ?? 'unknown',
        })
      }

      el.addEventListener('load', onLoad)
      // Fires AFTER `await model[$switchVariant](name)` resolves — i.e. after the
      // newly-active colourway's materials exist and can finally be biased.
      el.addEventListener('variant-applied', biasDecals)
      el.addEventListener('error', onError)
      el.addEventListener('camera-change', onCameraChange)
      el.addEventListener('render-scale', onRenderScale)

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
        el.removeEventListener('variant-applied', biasDecals)
        el.removeEventListener('error', onError)
        el.removeEventListener('camera-change', onCameraChange)
        el.removeEventListener('render-scale', onRenderScale)
      }
    },
    // `dismissCue` is a `useCallback([])`, so it is stable and cannot re-run this
    // ref callback — which would detach and reattach every model event listener.
    [product.productCode, dismissCue],
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
    // `canRender3D()`, NOT `libReady`. The model download used to wait for the
    // model-viewer module to finish downloading and parsing first, serialising
    // two independent transfers on the connection that matters least — a phone
    // on 4G, where the model is already ~23s.
    //
    // ⚠️ TWO TRAPS HERE, BOTH OF WHICH SHIP GREEN.
    // (1) `libReady` was silently doing double duty as the Save-Data / no-WebGL
    //     guard: the effect above returns early WITHOUT importing the module in
    //     those cases, so libReady never became true and this effect never ran.
    //     Removing it without calling canRender3D() would start a 1.9-8.2 MB download
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
    downloadStartedAtRef.current = lastAt

    fetchWithProgress(
      glbUrl,
      ({ loaded, total }) => {
        if (cancelled) return
        setBytesLoaded(loaded)
        setBytesTotal(total)
        downloadTotalRef.current = total
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
      // Releases the megabytes the blob is holding (~27 MB when written; 1.8-7.8 MB
      // measured across every live GLB on 2026-09-04). Without this a visitor moving
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
    // A FRONT/BACK/SIDE press is interaction too, and it does NOT come through
    // `camera-change` as `user-interaction` — that source is model-viewer's word
    // for a drag or a wheel. Without this the cue would still appear over a
    // visitor who has just used the controls.
    dismissCue()
    track(`camera_${view}_selected`)
  }

  /**
   * Show the cue only if nobody has touched the garment for a few seconds, then
   * nudge it once.
   *
   * ⚠️ THE SWEEP IS THE SECOND HALF, NOT THE FIRST. The hint below already
   * existed and was 10px of `var(--muted)` in a corner; motion beside an
   * invisible label would have been the expensive half of the fix. Reasoning,
   * the research it came from, and the measured cost of orbiting this garment
   * are in lib/interactionCue.ts.
   *
   * ⚠️ NO MOTION UNDER `prefers-reduced-motion`, and the hint still appears. A
   * garment that turns on its own is a textbook vestibular trigger, and it is
   * the reinforcement here rather than the message — so removing it costs the
   * visitor nothing except the part they asked not to receive.
   */
  useEffect(() => {
    if (fallback || !modelLoaded || swapping || cueSpentRef.current) return
    const idle = window.setTimeout(() => {
      if (cueSpentRef.current) return
      setCueVisible(true)
      if (prefersReducedMotion()) return
      const mv = mvRef.current
      if (!mv) return
      const home = product.camera.frontCameraOrbit
      // null when the CMS value is not the "<deg> <deg> <radius>" this expects.
      // Skipping the sweep leaves the visitor exactly where they already were;
      // guessing would aim the camera somewhere nobody calibrated.
      const turned = offsetOrbitAzimuth(home, CUE_SWEEP_DEGREES)
      if (!turned) return
      mv.cameraOrbit = turned
      returnRef.current = window.setTimeout(() => {
        // Only if they still have not touched it — otherwise this would drag the
        // camera back out from under someone who started exploring mid-sweep.
        if (!cueSpentRef.current && mvRef.current) mvRef.current.cameraOrbit = home
      }, CUE_RETURN_MS)
    }, CUE_IDLE_MS)
    return () => {
      window.clearTimeout(idle)
      if (returnRef.current !== null) window.clearTimeout(returnRef.current)
    }
  }, [fallback, modelLoaded, swapping, product.camera.frontCameraOrbit])

  /**
   * The photo appears ONLY when 3D cannot run at all.
   *
   * It used to cover the stage for the whole download, and it could not fit:
   * every poster is an opaque WebP with its background baked in at #f0efeb. On
   * the light `--bg` (#f1efea) that nearly matches but still hides the blueprint
   * grid, leaving a visible rectangle; on the dark `--bg` (#1c1f18) it is a
   * near-white slab on near-black. A fixed background cannot follow a themed
   * stage, so during loading the stage shows its own ground instead — which is
   * drawn from tokens and therefore correct in both modes by construction.
   *
   * ⚠️ THAT WAS ONLY HALF TRUE UNTIL 2026-08-17, and the owner reported the other
   * half: "remove the snapshot shown while it's loading — I still see it
   * working". This overlay had indeed been gated to `fallback` since 2026-08-05,
   * but `<model-viewer>` was still being handed the same image via its own
   * `poster` attribute, which it paints as `#default-poster`'s background until
   * the model reveals. `page.css` tried to suppress that with `--poster-color`
   * and `--progress-mask`; **both were removed in model-viewer 4.x** (verified
   * against the installed 4.3.1), so the suppression had done nothing for an
   * entire major version while looking like it did. The attribute is gone now;
   * `e2e/webgl.spec.ts` asserts the PROPERTY is null, because React never
   * reflects it to an attribute and the attribute check would pass vacuously.
   *
   * As the 3D-unavailable fallback the photo is still exactly right, and it is
   * KEPT deliberately: what the owner asked to remove is the automatic capture
   * job (it is billed) and the loading snapshot. Here the image is the only
   * garment a visitor whose device cannot run WebGL will ever see, and it now
   * comes from a photo the owner uploaded by hand, so it costs nothing to show.
   */
  const load = describeLoad({
    bytesLoaded,
    bytesTotal,
    modelLoaded: modelLoaded && !swapping,
    bytesPerSecond: rate,
  })
  // No longer gated on `libReady`: the download now starts immediately rather
  // than after the model-viewer module lands, so gating the readout on the
  // module would leave the stage blank for the first seconds of a 1.9-8.2 MB
  // transfer — the exact dead time the byte-accurate readout exists to remove.
  // `!fallback` already covers Save-Data and no-WebGL, which is what libReady
  // was standing in for here.
  const loading = !fallback && load.phase !== 'ready'

  /**
   * The colourway's photo WHILE THE MODEL DOWNLOADS (fix plan Rank 6, 2026-09-03; audits
   * LIVE-04, LIVE-06). Blurred by how much is still to come, then cross-faded into the 3D
   * on `load` and unmounted once the fade is over. See lib/placeholder.ts for the rules.
   * It is never shown in a failure state — those keep the 2026-08-21 decision: a notice,
   * the specs and the enquiry buttons, no still image standing in for the model.
   */
  const placeholder = placeholderAsset(displayed, product)
  const [placeholderStage, setPlaceholderStage] = useState<'shown' | 'leaving' | 'gone'>('shown')
  useEffect(() => {
    if (!modelLoaded) {
      setPlaceholderStage('shown')
      return
    }
    const ms = placeholderLeaveMs(prefersReducedMotion())
    if (ms === 0) {
      setPlaceholderStage('gone')
      return
    }
    setPlaceholderStage('leaving')
    const timer = window.setTimeout(() => setPlaceholderStage('gone'), ms)
    return () => window.clearTimeout(timer)
  }, [modelLoaded])
  const showPlaceholder =
    placeholder !== null &&
    !fallback &&
    (loading ? placeholderStage !== 'gone' : placeholderStage === 'leaving')
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
    // Save-Data, module load failure, lost context — where nothing in the section
    // can be interacted with.
    //
    // ⚠️ It then claimed "photograph" until 2026-08-21, which outlived the picture:
    // the poster image was removed from the stage in that change and this name was
    // not, so a screen-reader user was told the region held a photograph of the
    // garment while a sighted user saw an empty stage. The accessible name is copy
    // like any other and goes stale the same way — see the LOAD_NOTICE note above,
    // which lost the identical clause in the identical way on the same day.
    <section
      className="stage"
      aria-label={fallback ? 'Product reference' : 'Interactive 3D product reference'}
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
              alt={selected.altText}
              camera-controls=""
              camera-orbit={product.camera.frontCameraOrbit}
              camera-target={product.camera.cameraTarget}
              field-of-view={product.camera.defaultFieldOfView}
              min-camera-orbit="auto 20deg auto"
              max-camera-orbit="auto 160deg 200%"
              min-field-of-view={MIN_FIELD_OF_VIEW}
              interaction-prompt="none"
              interpolation-decay={prefersReducedMotion() ? 1 : CAMERA_DECAY_MS}
              touch-action={TOUCH_ACTION}
              disable-tap={DISABLE_TAP}
              pan-sensitivity={PAN_SENSITIVITY}
              shadow-intensity="0.6"
              shadow-softness="0.8"
              environment-image={ENVIRONMENT_IMAGE}
              tone-mapping="neutral"
              exposure="1"
              loading="eager"
              reveal="auto"
              /**
               * AR — iOS Quick Look only. docs/DECISION-AR-SCOPE.md has the full
               * reasoning; the two facts that matter here:
               *
               *   - NO USDZ FILE IS NEEDED. model-viewer 4.3.1 exports one in the
               *     browser from the loaded GLB, so the pipeline is untouched and
               *     this costs zero new bytes — the AR code already ships inside
               *     the model-viewer chunk every build emits.
               *   - ANDROID IS DELIBERATELY EXCLUDED. Scene Viewer cannot read a
               *     `blob:` URL, and `src` here is a blob because we fetch the GLB
               *     ourselves to drive the byte-accurate progress readout. Listing
               *     `scene-viewer` would crash or silently fail rather than
               *     degrade, so it is left out and Android simply sees no button.
               *
               * `ar-scale="fixed"` is the point of the feature — a buyer judging
               * fit needs real size, not a scalable toy. Verified 2026-09-05 that
               * the exports are authored in metres: rxps 0.60x0.76x0.24,
               * r-xmp 0.37x0.92x0.27, r-afp 0.55x0.73x0.28.
               */
              ar
              ar-modes="quick-look"
              ar-placement="floor"
              ar-scale="fixed"
            >
              {/*
                OUR button, not model-viewer's.
                ⚠️ The default `#default-ar-button` is a Google-styled pill placed
                inside the shadow root, over the canvas — the exact geometry
                StageControls.tsx measured and moved OUT of `.stage__canvas` in
                August, when it covered 26px of garment at 1440x900 and 38px at
                390x844. Letting the default render re-creates that defect.
              */}
              {arAvailable && (
                <button type="button" slot="ar-button" className="stage__ar">
                  VIEW IN YOUR SPACE
                </button>
              )}
            </model-viewer>
          )}

          {showPlaceholder && placeholder && (
            <img
              className={`stage__placeholder${
                placeholderStage === 'leaving' ? ' stage__placeholder--leaving' : ''
              }`}
              src={placeholder.url}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
              /*
               * The payload has carried these since the CMS started storing them,
               * and this element ignored them until 2026-09-04. They do NOT affect
               * layout here — `.stage__placeholder` is `position: absolute; inset: 0`
               * with `width/height: 100%` and `object-fit: contain`, so CSS wins —
               * which is why their absence never showed up as layout shift and why
               * nothing caught it.
               *
               * What they buy is the intrinsic ratio BEFORE the bytes arrive, so the
               * browser can plan the decode instead of discovering the dimensions
               * from the file. This is the first thing a phone visitor sees and it
               * holds the screen for the whole model download.
               *
               * Guarded because both are `number | null` on ViewerMediaAsset: a
               * product whose poster predates the dimension fields still renders.
               * Emitting `width="0"` would be worse than emitting nothing.
               */
              {...(placeholder.width && placeholder.height
                ? { width: placeholder.width, height: placeholder.height }
                : {})}
              style={{ filter: `blur(${placeholderBlurPx(load.phase, load.percent)}px)` }}
            />
          )}

          {/*
           * THE POSTER IMAGE WAS REMOVED 2026-08-21 by owner decision — the stage
           * never shows a photograph of the garment now, either as a pre-3D
           * placeholder or as a failure fallback.
           *
           * SINCE 2026-09-03 (fix plan Rank 6) ONE HALF OF THAT IS BACK, BY THE OWNER'S
           * OWN DESIGN: the colourway's photo is painted DURING THE DOWNLOAD only —
           * `.stage__placeholder` above, aria-hidden, blurred by the bytes still to
           * come, cross-fading into the 3D on `load`. Measured 2026-08-30, a customer
           * on 2 Mbit looked at an empty stage for 45–62 s. Every failure state is
           * unchanged: no image, the notice below, the specs and the enquiry buttons.
           *
           * The explanatory MESSAGE is deliberately KEPT (see `LOAD_NOTICE`
           * above): when 3D genuinely cannot run, the visitor is still told why and
           * still gets the colour, fabric, specs and the enquiry buttons. What they
           * no longer get is a still image standing in for the model.
           *
           * The CMS side matches: `publishGating.ts` no longer demands a photo per
           * colour, and its photo-DESCRIPTION rule now applies only where a photo
           * actually exists. `colourways.posterPreview` still exists and is still
           * served by the API when set, so nothing breaks for a product that has
           * one — it is simply never painted here.
           */}

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
            {/*
              ⚠️ THE BOTTOM PAIR IS ONE ROW, NOT TWO ABSOLUTE BOXES — 2026-09-07,
              audit FA-D-07. They were `bottom: 18%` each, which pins their BOTTOM
              edges and lets their chips float apart by however many lines of text
              the CMS put in each: measured at 1440x900, [ FIT ] top 636.7 against
              [ PERFORMANCE ] top 621.2 on the fixture, and 15.5 / 31.0 / 46.5 /
              62.0 across six live products — always a whole multiple of 15.5px, one
              line of the value text. Three corners of a technical-drawing layout
              lined up and the fourth floated, by an amount the CMS decided.

              `align-items: flex-start` inside a bottom-anchored row gives both
              chips one baseline while keeping the row's bottom edge exactly where
              it was, so nothing moves toward the plinth. The taller block sets the
              line and the shorter one rises to meet it.

              The pair is deliberately still rendered by the same two conditions:
              either half can be absent, and `.callout--right`'s `margin-left: auto`
              keeps a lone right-hand block on the right.
            */}
            {(product.garmentFit || performanceSummary) && (
              <div className="stage__callouts-bottom">
                {product.garmentFit && (
                  <div className="callout">
                    <span className="label">[ FIT ]</span>
                    <div className="callout__value">{product.garmentFit}</div>
                  </div>
                )}
                {performanceSummary && (
                  <div className="callout callout--right">
                    <span className="label">[ PERFORMANCE ]</span>
                    <div className="callout__value">{performanceSummary}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Only once there is something to drag. It used to show throughout the
              download, inviting the visitor to rotate a garment that had not
              arrived — on a 4G phone that is 22.6 s of instructions for an empty
              stage. */}
          {/* Pointer-conditional: the two devices need different words, because
              scroll-to-zoom and pinch-to-zoom are not the same gesture.
              `useCoarsePointer()` gates the same class of decision in
              ColourwayTabs.tsx, and is a HOOK rather than the plain
              `isCoarsePointer()` for the reason recorded there: the function is
              read during render and never re-checked, so detaching an iPad's
              keyboard mid-visit left this line saying "PINCH TO ZOOM" on a
              device that now had a mouse.

              ⚠️ THIS COMMENT USED TO EXPLAIN THAT A VERTICAL SWIPE WAS HANDED TO
              THE DOCUMENT, which was true under `touch-action="pan-y"` and is
              the exact behaviour the owner reported as a bug on 2026-08-17. See
              TOUCH_ACTION above: a one-finger drag now turns the garment, in any
              direction, and the page is scrolled from outside the canvas. */}
          {!fallback && modelLoaded && !swapping && cueVisible && (
            /*
             * ⚠️ STILL `aria-hidden`, AND DELIBERATELY SO. A `visually-hidden`
             * paragraph below already tells a screen reader how to rotate and
             * zoom, INCLUDING the keyboard route this line cannot describe.
             * Un-hiding this would restore the triple-description the comment
             * down there records consolidating.
             *
             * The ICON is not decoration. Baymard's gesture research says to pair
             * the word "Pinch" with one when selling internationally, because the
             * term is not understood by all non-native speakers — and this
             * catalogue is aimed at buyers in North America, South America,
             * Europe, the GCC and Oceania.
             */
            <p className="stage__hint" aria-hidden="true">
              <svg className="stage__hint-icon" viewBox="0 0 24 24" focusable="false">
                <title>Rotate</title>
                {/* An arc with an arrowhead: "this turns". Stroked, not filled,
                    so it inherits the hint's colour and weight. */}
                <path
                  d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M17.3 3.4v3.3h-3.3M6.7 20.6v-3.3h3.3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {coarsePointer ? 'DRAG TO ROTATE · PINCH TO ZOOM' : 'DRAG TO ROTATE · SCROLL TO ZOOM'}
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
              {/*
                ⚠️ THE SWEEP IS OMITTED UNDER REDUCED MOTION, NOT COLLAPSED, and the
                preloader next door already learned this the hard way.

                `base.css` collapses every animation to a single 0.01ms iteration for
                a reduced-motion visitor. On a LOOPING sweep with no fill-mode that
                leaves a static bar frozen at its 40% width — which reads as a
                stalled download, on the one screen where a visitor is already
                waiting and looking for reassurance. `page.css` and `Preloader.tsx`
                both record that exact conclusion ("a sweep that cannot sweep is a
                bar frozen at one width"), and the preloader solved it by not
                rendering its sweep at all. This is the same keyframe with the same
                problem; it simply did not get the same treatment.

                Full, not empty, and that is the honest reading rather than a
                cosmetic choice: `preparing` means every byte has arrived and the
                model is decoding. The download IS complete. A full bar beside
                "PREPARING 3D MODEL…" tells the truth; a 40% stub does not.
              */}
              <span
                className={`stage__loading-bar${
                  showsIndeterminateSweep(load.phase, prefersReducedMotion())
                    ? ' stage__loading-bar--indeterminate'
                    : ''
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
        </div>

        {/*
          The camera controls, in a row under the garment.

          ⚠️ `.stage__caption` — the garment's name repeated directly under the
          garment — WAS REMOVED FROM THIS ROW ON 2026-08-21, owner decision. Do
          not put it back without reading why it existed.

          It was a desktop-only, `aria-hidden` echo of the page's <h1>, which sat
          below the fold in `.content`. Once <ProductIdentity> moved that <h1>
          into `.stage__aside` — beside the garment, on exactly the screens where
          this caption rendered — the caption became a third printing of the same
          name on one screen. It was decoration justified entirely by the distance
          to the real heading, and that distance is gone.

          What survives is the ROW, and the reason it is one row: the caption and
          the controls were two stacked rows for about an hour and it cost 37px of
          garment on a 900px-tall window — measured, and that band has no 37px to
          give (see `.stage__canvas`'s budget).

          OUTSIDE `.stage__canvas`, which is the fix for the owner's "the buttons
          are on top of the 3D product" — see StageControls.tsx for the numbers.
        */}
        <div className="stage__plinth">
          {/* `!fallback` because the poster branch has no camera to point;
              `disabled` rather than unmounted while the model downloads, so the
              row cannot shove the page around 23 seconds late. */}
          {!fallback && (
            <StageControls
              activeView={activeView}
              onSelect={applyView}
              disabled={!modelLoaded || swapping}
            />
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
