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

export function isCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
