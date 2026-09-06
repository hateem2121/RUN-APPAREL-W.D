/** The targets the ring inflates over — identical to apps/viewer's Cursor.tsx. */
export const INTERACTIVE = 'a, button, [role="tab"], [data-cursor="pointer"]'

/** One frame of the ring's trail: close `k` of the remaining gap. 0.22 ≈ the viewer's spring feel. */
export function trail(current: number, target: number, k: number): number {
  return current + (target - current) * k
}

/**
 * ⚠️ ONE STRING, TRANSLATE BEFORE SCALE. `translate`/`scale`/`transform` compose in a
 * fixed order you do not control; a standalone `scale` on an element whose position is
 * in `transform` multiplies the position. The viewer measured its ring at (1224, 612)
 * for a pointer at (800, 400) that way.
 */
export function ringTransform(x: number, y: number, scale: number): string {
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`
}

export function isInteractive(node: Element | null): boolean {
  return Boolean(node?.closest?.(INTERACTIVE))
}
