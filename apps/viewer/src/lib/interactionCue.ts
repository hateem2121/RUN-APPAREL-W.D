/**
 * The garment reads as a photograph, and visitors do not touch it.
 *
 * Reported by the owner 2026-09-04: "on first glance it looks like an image so
 * some visitors ignore it thinking that it's an image." That is the documented
 * failure mode of a 3D viewport, not a local quirk — Baymard's gesture research
 * finds users treat image gestures as hidden functionality they routinely miss,
 * and a viewer with no visible affordance "functions as an unusually heavy
 * static image".
 *
 * ⚠️ THE CUE ALREADY EXISTED AND WAS THE PROBLEM, which is why this file is not
 * simply an auto-rotate. `.stage__hint` has said "DRAG TO ROTATE · PINCH TO
 * ZOOM" since long before the complaint, at `font-size: 0.625rem` (10px) in
 * `var(--muted)`, pinned to the top-left corner away from the garment. It reads
 * as a technical caption rather than an invitation. Adding motion beside an
 * invisible label would have shipped the expensive half of the fix.
 *
 * Two further findings shaped this:
 *
 *   - Baymard: pair the word "Pinch" with an ICON when selling internationally,
 *     because the term is not understood by all non-native speakers. This
 *     catalogue is aimed at buyers in North America, South America, Europe, the
 *     GCC and Oceania, so that applies directly.
 *   - Motion alone is not sufficient and can backfire: a model that rotates by
 *     itself is read as a video, which is also "not something I can touch".
 *
 * So the hint is the primary instrument and the sweep is the reinforcement.
 */

/** How long a visitor may do nothing before the cue appears. */
export const CUE_IDLE_MS = 3000

/**
 * How far the sweep turns, in degrees of azimuth.
 *
 * Small on purpose. The garment is 2,419,902 triangles — 98.9% of it decorative
 * topstitch — and orbiting was measured at a 33.4ms median frame under a 4x CPU
 * throttle. A large sweep is a long stretch of that, at the exact moment a phone
 * is still uploading textures to the GPU. 14 degrees is enough to see the
 * silhouette change and short enough to stay cheap.
 */
export const CUE_SWEEP_DEGREES = 14

/** How long the sweep dwells before returning to the calibrated view. */
export const CUE_RETURN_MS = 900

/**
 * Offset an orbit string's azimuth, preserving the other two components.
 *
 * model-viewer orbits are `"<theta> <phi> <radius>"`, e.g. `"12deg 82deg auto"`.
 * Only theta moves; phi and radius are handed back untouched, because both are
 * calibrated per product and `docs/` records a radius clamp that silently eats
 * any value under ~54% of the framed distance.
 *
 * ⚠️ RETURNS null RATHER THAN GUESSING. The camera values come from the CMS, so
 * an unexpected format is an operator error rather than a code error, and the
 * caller skips the sweep entirely when this returns null. A best-effort parse
 * would point the camera somewhere nobody calibrated, on a page whose whole job
 * is showing the garment accurately — the failure mode of no animation is a
 * visitor who is not nudged, which is exactly where they already are.
 */
export function offsetOrbitAzimuth(orbit: string, deltaDeg: number): string | null {
  const [azimuth, ...rest] = orbit.trim().split(/\s+/)
  if (azimuth === undefined || rest.length < 1) return null
  const theta = /^(-?\d+(?:\.\d+)?)deg$/.exec(azimuth)?.[1]
  if (theta === undefined) return null
  const turned = Number(theta) + deltaDeg
  if (!Number.isFinite(turned)) return null
  return [`${turned}deg`, ...rest].join(' ')
}
