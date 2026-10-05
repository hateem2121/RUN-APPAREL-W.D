/**
 * Whether the home page's 3D garment may start downloading on its own (2026-09-29).
 *
 * Reads the Network Information API where a browser has it (Chromium); where it does not
 * (Safari, Firefox) there is nothing to go on, and the model loads — the page's other
 * safeguard is that it loads only when the section is near the screen. `saveData` is the
 * visitor's own request and always wins.
 */
export type ConnectionHint = { saveData?: boolean; effectiveType?: string }

export function autoLoadAllowed(connection: ConnectionHint | undefined): boolean {
  if (!connection) return true
  if (connection.saveData) return false
  return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g'
}

/**
 * May a swipe that starts on the home garment turn it, rather than scroll the page? (Polish M3,
 * the owner's answer Q7, 2026-10-04.)
 *
 * With `touch-action: pan-y` the browser claims every swipe that leans up or down on its first
 * move (model-viewer's SmoothControls.ts, read 2026-10-03), so a sideways drag meant to turn the
 * garment often scrolled the page. The garment pages use `none`: the garment always wins. That is
 * safe only while the frame leaves room on screen to scroll past it
 * (.claude/rules/viewer-layout.md). Measured on the live home page, 2026-10-04: an upright phone
 * shows the frame at 52–62% of the screen's height, always with room. A phone held sideways shows
 * it at 199% (568x320) and 243% (844x390), and an upright tablet at 84%; there `none` would leave
 * only 29–43px strips at the edges to scroll by. So the garment wins only while the frame fits
 * within GARMENT_WINS_SHARE of the screen's height.
 */
export const GARMENT_WINS_SHARE = 0.65

export function garmentTouchAction(frameHeight: number, screenHeight: number): 'none' | 'pan-y' {
  if (!(frameHeight > 0) || !(screenHeight > 0)) return 'pan-y'
  return frameHeight <= screenHeight * GARMENT_WINS_SHARE ? 'none' : 'pan-y'
}
