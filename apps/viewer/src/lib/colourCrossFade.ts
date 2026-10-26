/**
 * MO2 (polish, 2026-10-04): picking a colour fades from the old colour to the new one over
 * `--fast` (200ms, the audit's "quick cross-fade that feels like changing the fabric") instead of
 * snapping. The garment's current frame is copied onto a canvas laid over it, the colour changes
 * underneath, and once model-viewer has drawn it the copy fades away.
 *
 * ⚠️ NOT A VIEW TRANSITION, though the HD picture's switch is one (Stage.tsx, D9). A view
 * transition pauses the whole page's drawing while its update runs, and a colour swap takes
 * 121-131ms of main thread on the live garment (viewer-model-viewer rule): the dots, the colour's
 * name and the address would freeze for that long on every pick. This touches the 3D window only.
 *
 * The copy itself is `copyModelFrame` (packages/shared/src/frameCopy.ts, moved there on 2026-10-26 so
 * the website copies the same way); its header says why it is a REGION of model-viewer's canvas.
 *
 * Anything missing (no frame drawn yet, a canvas of another shape, no 2D context) means no copy,
 * and the colour then changes the way it always did, at once.
 */

import { copyModelFrame } from '@run-apparel/shared'

/** The overlay's states, which page.css draws: the old frame wholly shown, or fading away. */
export type CrossFadeState = 'held' | 'fading'

/** How many holds each overlay has seen, so an older colour's release cannot fade a newer one. */
const holds = new WeakMap<HTMLCanvasElement, number>()

/**
 * Copies the garment's current frame onto `overlay` and shows it. Returns false, showing
 * nothing, when there is no frame to copy.
 */
export function holdFrame(model: HTMLElement, overlay: HTMLCanvasElement): boolean {
  if (!copyModelFrame(model, overlay)) return false
  holds.set(overlay, (holds.get(overlay) ?? 0) + 1)
  overlay.dataset.state = 'held' satisfies CrossFadeState
  return true
}

/**
 * Fades the held frame away once model-viewer has applied the new colour (`variant-applied`, then
 * two frames, the first of which draws it), or after `timeoutMs` if it never says so, so a frame
 * can never be left over the garment. A newer hold supersedes this one: its fade does nothing.
 * Returns `stop`, which fades it at once: for a stage that changes or goes before the colour lands.
 */
export function fadeWhenApplied(
  model: HTMLElement,
  overlay: HTMLCanvasElement,
  timeoutMs = 1500,
): () => void {
  const hold = holds.get(overlay) ?? 0
  let done = false
  const fade = () => {
    if (holds.get(overlay) === hold && overlay.dataset.state === 'held') {
      overlay.dataset.state = 'fading' satisfies CrossFadeState
    }
  }
  const finish = () => {
    done = true
    model.removeEventListener('variant-applied', release)
    window.clearTimeout(timer)
  }
  const release = () => {
    if (done) return
    finish()
    requestAnimationFrame(() => requestAnimationFrame(fade))
  }
  model.addEventListener('variant-applied', release)
  const timer = window.setTimeout(release, timeoutMs)
  return () => {
    if (done) return
    finish()
    fade()
  }
}
