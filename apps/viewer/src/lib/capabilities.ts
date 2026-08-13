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
