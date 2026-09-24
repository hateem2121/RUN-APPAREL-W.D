/**
 * The tap-target floor, in ONE place, for every robot that asks whether a control is big
 * enough to hit.
 *
 * WHY A SHARED MODULE. The shared helpers come in two halves: the contrast half shipped as
 * `contrast-rules.mjs`, and this is the geometry half.
 * `apps/cms/e2e/navbar.spec.ts` (`:178`, `:280`) and `apps/cms/e2e/inquiry.spec.ts` (`:77`)
 * each carry their own bare `43.95` literal with no shared constant between them — three
 * copies of the same measurement, unlinked, exactly the drift risk `contrast-rules.mjs`'s
 * own header describes for contrast. This module is built and unit-proven now. Wiring it
 * into those three call sites follows in a separate change, after the shared menu-bar
 * work that also edits those two files has merged.
 *
 * WHY 43.95, NOT 44. `getBoundingClientRect().height` is `bottom - top` in floating point.
 * Where an element sits at a fractional offset — which a fluid `clamp()` type above it
 * guarantees — that subtraction loses precision: measured 2026-09-07 in `navbar.spec.ts`,
 * two filter chips with a computed `min-height: 44px` reported **43.999969482421875** while
 * four identical chips on later flex lines reported exactly 44. A strict `< 44` comparison
 * fails elements that are 44px by declaration and ~3.1e-5px short by arithmetic — a false
 * positive that says nothing about a thumb. `MEASURED_TOLERANCE_PX` is that measurement,
 * not a concession: the tolerance costs nothing against a real miss, since every actual
 * undersized control this codebase has shipped measured 19px or smaller.
 *
 * ⚠️ PLAIN JAVASCRIPT WITH NO IMPORTS, ON PURPOSE — the same rule and the same reason as
 * `contrast-rules.mjs` and `copy-rules.mjs`. Root scripts run under bare `node` in CI, the
 * apps' TypeScript tests import it through `geometry-rules.d.mts`, and a caller may hand
 * `isWithinTargetFloor` straight into a `page.evaluate` closure's own body (it has no
 * closure-captured state, so inlining its one-line source is safe where a full import is
 * not — see `contrast-rules.mjs`'s header for why an IMPORT cannot cross that boundary).
 */

/** The design system's touch-target floor. `packages/ui/src/tokens.css`'s `--target-min`
 * and `docs/DESIGN.md`'s "Targets" section both declare 44px. */
export const MIN_TARGET_PX = 44

/**
 * The measured floating-point slack at the 44px floor (see header). Exported as its own
 * literal, rather than only ever appearing inside a subtraction, so extracting this module
 * could not silently change the number three call sites already depend on.
 */
export const MEASURED_TOLERANCE_PX = 43.95

/**
 * The measured slack itself (see header), independent of which floor it is applied to:
 * 0.05px. Kept separate from `MIN_TARGET_PX - MEASURED_TOLERANCE_PX` on purpose —
 * `44 - 43.95` is `0.049999999999997157829` in IEEE 754 double precision, not `0.05`, so
 * deriving the slack by subtraction would have reintroduced, inside this module's OWN
 * defaults, the exact class of floating-point error the module exists to tolerate.
 * Measured with `node -e` while writing this file, not assumed.
 */
const MEASURED_SLACK_PX = 0.05

/**
 * Whether a measured dimension clears `floor`, allowing for the floating-point slack
 * measured at the 44px floor. At the default floor this returns `MEASURED_TOLERANCE_PX`
 * verbatim — no arithmetic — so the exact figure the three existing call sites depend on
 * cannot drift. A different `floor` (e.g. the 24px desktop control floor, SZ-04) carries
 * the same absolute slack forward: `floor - 0.05` is exact for both 44 and 24, verified
 * with `node -e` (unlike the subtraction above, this direction does not lose precision).
 */
export function isWithinTargetFloor(
  measuredPx,
  floor = MIN_TARGET_PX,
  tolerance = floor === MIN_TARGET_PX ? MEASURED_TOLERANCE_PX : floor - MEASURED_SLACK_PX,
) {
  return measuredPx >= tolerance
}
