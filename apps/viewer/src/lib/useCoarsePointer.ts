import { useSyncExternalStore } from 'react'
import { isCoarsePointer } from './capabilities'

/**
 * The two queries `isCoarsePointer()` reads. Subscribing to BOTH is required, not
 * belt-and-braces: the answer is `primaryIsCoarse && !hasFinePointer`, so either
 * one flipping can change it. Attaching a Magic Keyboard to an iPad moves
 * `(any-pointer: fine)` without necessarily moving `(pointer: coarse)`.
 */
const QUERIES = ['(pointer: coarse)', '(any-pointer: fine)'] as const

function subscribe(onChange: () => void): () => void {
  const lists = QUERIES.map((query) => window.matchMedia(query))
  for (const list of lists) list.addEventListener('change', onChange)
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange)
  }
}

/**
 * `isCoarsePointer()`, but React re-renders when the answer changes.
 *
 * ⚠️ THE PLAIN FUNCTION IS READ DURING RENDER, so whatever it returned at mount
 * is what the page keeps for the whole session — a property capabilities.ts has
 * DOCUMENTED since 2026-08-13 ("it is also computed once per render, so it never
 * re-checked") and nothing fixed until 2026-08-17.
 *
 * Reproduced in a real browser: after emulating a 375px touch viewport and
 * returning to 1440px, `matchMedia('(pointer: coarse)').matches` reported `false`
 * and `navigator.maxTouchPoints` was 0, while the stage hint still read "PINCH TO
 * ZOOM". A reload fixed it — which is what proves the query was right and the
 * cached render was wrong.
 *
 * The real trigger is an iPad with a Magic Keyboard attached or detached, or a
 * Windows 2-in-1 flipped between laptop and tablet mode. On the hint that is only
 * wording; on <ColourwayTabs> it is behaviour, because `canPreview` reads the same
 * value and a hover preview left enabled on a touch screen is the state that
 * component's own comment calls "both invisible and misleading" — the first tap
 * fires mouseenter AND click.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the value is read
 * during render and must not be able to disagree with the DOM for a frame, which
 * is the exact tearing case this hook exists for. It also gives the unsubscribe
 * for free, so a component unmounting cannot leak a listener onto the two
 * MediaQueryList objects — pinned by a test, because a leak here is invisible.
 *
 * ⚠️ `capabilities.ts` KEEPS the plain function and must not be turned into a
 * hook. Four callers are not React at all — `polish/index.ts`, `polish/Cursor.tsx`
 * (before it mounts), `smooth-scroll.ts` and `reveal.ts` — and they read it once
 * at boot to decide whether to start a whole layer. Those are genuinely one-shot
 * decisions, not stale ones.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    isCoarsePointer,
    // Server snapshot. This SPA never server-renders, but the argument is
    // required and `false` is the documented safe default: a preview shown on a
    // device with no hover is invisible, whereas one suppressed on a device WITH
    // hover is the 2026-08-13 bug capabilities.ts records.
    () => false,
  )
}
