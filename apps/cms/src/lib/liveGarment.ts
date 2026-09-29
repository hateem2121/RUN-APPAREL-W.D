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
