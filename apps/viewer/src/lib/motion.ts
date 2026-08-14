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
 * Not a token either. Rebinding a variant swaps every material on a 27 MB model,
 * so this exists to coalesce a pointer crossing five tabs into one swap — it is
 * a debounce measured against human pointing, not a value on the motion scale.
 */
export const HOVER_INTENT_MS = 90

/** model-viewer's camera interpolation decay. Higher is snappier. */
export const CAMERA_DECAY_MS = 120

/** Lenis smooth-scroll duration, in SECONDS — Lenis takes seconds, not ms. */
export const SCROLL_DURATION_S = 1.1
