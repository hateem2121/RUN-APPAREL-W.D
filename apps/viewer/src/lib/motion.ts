/**
 * JS-side motion constants, each naming the CSS token it must agree with.
 *
 * WHY THIS EXISTS. `tokens.css:8` declares itself THE SOURCE OF TRUTH and
 * `docs/DESIGN.md` §8 rule 3 forbids raw values in components — but that rule is
 * only enforceable in CSS, and the motion layer has a JS half. An audit on
 * 2026-08-14 found those values hardcoded at six sites, and one of them had
 * already drifted: `<Preloader>` waited **760ms** for a wipe that CSS runs for
 * `--slow`, i.e. **800ms**. The hand-off fired 40ms before the animation it was
 * waiting for had finished.
 *
 * ⚠️ THESE ARE NOT INDEPENDENT VALUES. Where a constant must equal a CSS token,
 * that is stated on the line and the two must be changed together. CSS custom
 * properties cannot be read from JS without a layout read on an element that has
 * the variable in scope, which is not worth doing on a hot path — so the
 * duplication is deliberate and the comments are what keep it honest.
 */

/** Must equal `--slow` in tokens.css. The preloader's clip-path wipe. */
export const PRELOADER_WIPE_MS = 800

/**
 * Minimum time the preloader stays on screen before it begins leaving.
 *
 * Not a token: it is a perception floor, not a motion duration. A branded
 * entrance that flashes past in 80ms on a fast connection reads as a glitch
 * rather than as an entrance.
 */
export const PRELOADER_MIN_DWELL_MS = 400

/**
 * Hover intent before a colourway preview is applied to the model.
 *
 * Not a token either. Rebinding a variant swaps every material on the model,
 * so this exists to coalesce a pointer crossing five tabs into one swap — it is
 * a debounce measured against human pointing, not a value on the motion scale.
 */
export const HOVER_INTENT_MS = 90

/**
 * model-viewer's camera interpolation decay, in milliseconds.
 *
 * ⚠️ THIS SAID "Higher is snappier" UNTIL 2026-09-05, AND IT IS EXACTLY BACKWARDS.
 * `Damper.setDecayTime` sets `naturalFrequency = 1 / decayMilliseconds`, and each
 * frame applies `Math.exp(-naturalFrequency · dt)`. A LARGER decay time gives a
 * LOWER natural frequency, so the term stays closer to 1 and the camera converges
 * more SLOWLY. model-viewer's own default is `DECAY_MILLISECONDS = 50`.
 *
 * A wrong comment is worse than no comment here: the next person wanting a
 * snappier viewer reads that line, raises the number, makes it worse, and believes
 * they improved it.
 *
 * MEASURED on the live `rxps` page with trusted drag events, counting
 * `camera-change` and timing from pointer-up to the last one:
 *
 *     decay   settle after release
 *      120    1071 ms      <- what shipped, and what the owner felt as "laggy"
 *       50     396 ms      <- model-viewer's own default; shipped since 2026-09-05
 *       16      96 ms
 *
 * ⚠️ DO NOT CHASE 96 ms. 50 is the library's tuned default. This same damper also
 * drives `applyView()`'s FRONT/BACK/SIDE moves and the idle interaction sweep, and
 * at 16 both read as a jump-cut rather than a camera move.
 *
 * ⚠️ IT ALSO DAMPS THE PAN TARGET, not just the orbit — `features/controls.js`
 * passes this to `setDamperDecayTime` AND `scene.setTargetDamperDecayTime`. So it
 * is half of the owner's two-finger complaint; `lib/adaptive-pan.ts` is the other
 * half.
 *
 * Reduced motion collapses this to `1` at the call site in `Stage.tsx`.
 */
export const CAMERA_DECAY_MS = 50

/** Lenis smooth-scroll duration, in SECONDS — Lenis takes seconds, not ms. */
export const SCROLL_DURATION_S = 1.1
