import { adaptivePanSensitivity, PAN_SENS_OUT, shouldWritePan } from '../lib/adaptive-pan'

/**
 * The stage's fixed settings: the decoder paths, the three notices a buyer can read, the
 * lighting, and the camera and gesture limits — each with the measurement that set it.
 *
 * Moved out of `Stage.tsx` on 2026-09-27, word for word, so the component file holds the
 * component. Nothing here reads React state; `applyAdaptivePan` is the one function, and
 * it was already at module scope for the reason its own comment gives.
 */
/** Subset of the ModelViewerElement API the stage uses. */
export interface ModelViewerEl extends HTMLElement {
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

/** All copied into public/ by scripts/copy-decoders.mjs — see its header. */
export const MESHOPT_DECODER_URL = '/meshopt_decoder.js'
/** Trailing slash required: model-viewer appends the filenames to these. */
export const DRACO_DECODER_URL = '/draco/'
export const KTX2_TRANSCODER_URL = '/basis/'

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
export const VARIANT_NOTICE =
  'The 3D model cannot show this colorway, so it is still showing the previous one. ' +
  'The color name, fabric and specifications on this page are for the colorway you selected.'
export const LOAD_NOTICE =
  'The 3D view is not available. ' +
  'The colors, fabric and specifications on this page are correct, ' +
  'and you can still send an inquiry below.'
/**
 * "3D coming soon" (owner decision 2026-10-08): the garment is live on its studio pictures
 * while its 3D file is redone. LOAD_NOTICE's shape — what is happening, what is still true,
 * what to do — but nothing here is broken, so it says "coming soon", never "not available".
 */
export const COMING_SOON_NOTICE =
  'The 3D view of this garment is coming soon. ' +
  'The picture, colors, fabric and specifications on this page are correct, ' +
  'and you can send an inquiry below.'
/**
 * A download that answered and then stopped sending, three times running (issue #41). The owner chose the button
 * label; the rest follows NN/g's error-message guidelines and LOAD_NOTICE's own shape: what happened, what to do,
 * and what on the page is still true.
 *
 * ⚠️ IT DOES NOT BLAME THE VISITOR'S CONNECTION, ON PURPOSE. The stall this was written for (2026-09-24) was
 * Cloudflare's Islamabad edge failing to fetch fresh copies during its Asia-Pacific incident — every visitor there
 * saw it, on every connection. "Your connection may be slow" would have been false for all of them.
 */
export const STALL_NOTICE =
  'The 3D model stopped downloading. Press TRY 3D AGAIN, or come back later. ' +
  'The colors, fabric and specifications on this page are correct, ' +
  'and you can still send an inquiry below.'

// Image-based lighting for PBR materials. Without an explicit environment,
// <model-viewer>'s built-in neutral scene renders technical fabrics flat and
// low-contrast; this soft studio HDR reveals weave, sheen and depth. Served
// same-origin from public/env (already allowed by the CSP), ≤1024×512 so the
// download stays tiny. Paired with tone-mapping="neutral" (the model-viewer
// v4 default, tuned for e-commerce colour accuracy) so baseColor stays faithful.
export const ENVIRONMENT_IMAGE = '/env/studio-soft.hdr'

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
export const MIN_FIELD_OF_VIEW = '1deg'

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
export const TOUCH_ACTION = 'none'

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
 * <StageControls> button is a full reset (see `applyView` in `Stage.tsx`).
 */
export const DISABLE_TAP = true

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
export const PAN_SENSITIVITY = PAN_SENS_OUT

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
export function applyAdaptivePan(
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
