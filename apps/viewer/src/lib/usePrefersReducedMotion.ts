import { useSyncExternalStore } from 'react'
import { onReducedMotionChange, prefersReducedMotion } from './capabilities'

/** Stable, because `useSyncExternalStore` resubscribes whenever this function's identity changes. */
function subscribe(notify: () => void): () => void {
  return onReducedMotionChange(() => notify())
}

/**
 * `prefersReducedMotion()`, but React re-renders when the visitor changes the setting
 * (visual audit VA-20, 2026-10-02).
 *
 * ⚠️ THE PLAIN FUNCTION READ DURING RENDER IS A SNAPSHOT. `<Stage>` set the camera's
 * `interpolation-decay` and chose the loading sweep from `prefersReducedMotion()` while rendering,
 * so whatever the setting said at the last render is what the stage kept: turning reduced motion
 * on mid-visit left the camera easing as before (decay 50 ms against 1 ms; `lib/motion.ts` has the
 * measured settle times) until something else happened to re-render the stage — a colour or camera
 * press, or the hint appearing. The audit saw the change take effect only on the next page.
 * The other readers in the stage (`applyView`, the idle sweep, the placeholder fade) read the
 * setting at the moment they act and were already current; this hook is for the two reads that
 * happen during render.
 *
 * Same shape, and same reasons, as `useCoarsePointer.ts`: `useSyncExternalStore` so the value
 * cannot disagree with the DOM for a frame, and an unsubscribe that is pinned by a test because a
 * leaked listener is invisible. And as there: `capabilities.ts` keeps the plain function. It is
 * called outside React by the polish layer, which decides once at startup (`polish/index.ts` has
 * its own listener for the change), and by code that acts at a moment of its own.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    prefersReducedMotion,
    // Server snapshot. Never called — this SPA does not server-render — but the argument is
    // required. `false` is what `prefersReducedMotion()` says when nothing has been asked.
    () => false,
  )
}
