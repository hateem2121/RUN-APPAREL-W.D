/**
 * Decide whether interactive 3D should even be attempted. When it
 * shouldn't, the page keeps the full experience (poster, specs, colourway
 * tabs, contacts, catalogue link) minus the live model.
 */
export function canRender3D(): boolean {
  // Respect reduced-data mode.
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return false
  // WebGL capability check.
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Call `callback` with the new answer each time the visitor turns reduced motion on or off, until
 * the returned function is called (visual audit VA-20, 2026-10-02).
 *
 * `prefersReducedMotion()` is never stale in itself — it asks the browser every time — but code
 * that decides ONCE (the polish layer's smooth scroll and cursor) or reads while rendering
 * (`usePrefersReducedMotion`) cannot see a change that lands between its reads, and a visitor who
 * turned reduced motion on mid-visit kept the motion they had just asked to stop. This is how they
 * hear it. `addEventListener('change', …)` on the query's list is the form MDN recommends
 * (`MediaQueryList: change event`, read 2026-10-02).
 *
 * Plain on purpose, with no React: the polish modules import this file and must stay React-free
 * (the comment at the top of `polish/index.ts`).
 */
export function onReducedMotionChange(callback: (reduce: boolean) => void): () => void {
  const list = window.matchMedia('(prefers-reduced-motion: reduce)')
  const listener = (event: MediaQueryListEvent) => callback(event.matches)
  list.addEventListener('change', listener)
  return () => list.removeEventListener('change', listener)
}

/**
 * True only when the device has NO fine pointer at all.
 *
 * ⚠️ It asked `(pointer: coarse)` alone until 2026-08-13, and that describes only
 * the PRIMARY pointer. On a touchscreen laptop the primary pointer can be
 * reported as coarse while a mouse is attached and hovering works perfectly — so
 * `canPreview = !isCoarsePointer()` in <ColourwayTabs> switched the colourway
 * hover preview off entirely, permanently, on exactly the machines most likely
 * to be used to review a garment. It is also computed once per render, so it
 * never re-checked.
 *
 * The pair of queries is deliberate. `(any-pointer: fine)` alone would report
 * "coarse" on any browser that does not support the query — including older
 * desktops, where hover is real — because an unsupported media query simply
 * does not match. Requiring `(pointer: coarse)` to be true as well means the
 * unsupported case falls through to "fine", which is the safe default here: a
 * preview that appears on a device without hover is invisible, whereas one that
 * is suppressed on a device WITH hover is the bug being fixed.
 */
export function isCoarsePointer(): boolean {
  const primaryIsCoarse = window.matchMedia('(pointer: coarse)').matches
  const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches
  return primaryIsCoarse && !hasFinePointer
}
