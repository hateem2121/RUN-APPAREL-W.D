/** The targets the ring inflates over — identical to apps/viewer's Cursor.tsx. */
export const INTERACTIVE = 'a, button, [role="tab"], [data-cursor="pointer"]'

/** One 60Hz frame, in milliseconds. `trail`'s `k` is defined against this. */
export const FRAME_MS = 1000 / 60

/**
 * One frame of the ring's trail: close `k` of the remaining gap.
 *
 * ⚠️ `k` IS PER 60Hz FRAME, AND `dt` IS WHAT MAKES THAT TRUE ON OTHER HARDWARE.
 * Without the correction this is a different cursor on every display: at 120Hz it is
 * called twice as often, closes 0.22 of the gap twice as often, and the ring arrives in
 * half the time; on a dropped frame it falls behind and never catches up. Neither shows
 * up in a unit test, because a unit test calls it a fixed number of times.
 *
 * `1 - (1-k)^(dt/FRAME_MS)` is the same exponential decay sampled at the frame that
 * actually happened, so the trail's SHAPE is a property of elapsed time rather than of
 * the monitor. At dt = one frame it reduces to `k` exactly. Audit FA-H-03, 2026-09-07.
 *
 * A long gap (a backgrounded tab) yields a rate approaching 1, which lands the ring on
 * the pointer — the right answer, since the trail is a response to movement and there
 * has been none to respond to. `dt` below zero is treated as zero rather than trusted;
 * `performance.now()` is monotonic but the value reaching here is an argument.
 */
export function trail(current: number, target: number, k: number, dt: number = FRAME_MS): number {
  const elapsed = dt > 0 ? dt : 0
  const rate = 1 - (1 - k) ** (elapsed / FRAME_MS)
  return current + (target - current) * rate
}

/**
 * ⚠️ ONE STRING, TRANSLATE BEFORE SCALE. `translate`/`scale`/`transform` compose in a
 * fixed order you do not control; a standalone `scale` on an element whose position is
 * in `transform` multiplies the position. The viewer measured its ring at (1224, 612)
 * for a pointer at (800, 400) that way.
 *
 * ⚠️ AND NO `-50%` IN HERE. The centring offset is `translate: -50% -50%` on
 * `.cursor-dot, .cursor-ring` in packages/ui/src/base.css — a STANDALONE property,
 * applied outside this string and therefore never multiplied by the scale. Carrying it
 * here as well applied it twice and drew the ring 17px up and left of the pointer on
 * every page of the site — exactly half its own 34px box. Audit FA-R-04 / FA-H-01,
 * measured 2026-09-06.
 *
 * ⚠️ DELETING THE base.css LINE IS NOT THE EQUIVALENT FIX, AND WOULD BREAK THE LIVE
 * VIEWER. The viewer positions its ring with Motion, which emits
 * `transform: translateX(…) translateY(…) scale(…)` and no offset of its own — so that
 * one declaration is the only centring the production 3D pages have. Removing it fixes
 * this page and throws the viewer's ring 17px the other way.
 */
export function ringTransform(x: number, y: number, scale: number): string {
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`
}

export function isInteractive(node: Element | null): boolean {
  return Boolean(node?.closest?.(INTERACTIVE))
}
