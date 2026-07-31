/**
 * Privacy-safe diagnostic seam — report what broke, never who it broke for.
 *
 * Dispatches on the `run:diagnostic` DOM event that lib/telemetry.ts listens
 * for, so operational failures reach the backend regardless of Do-Not-Track
 * (they carry no visitor data), and mirrors to the console so the same
 * information is available to anyone with devtools open.
 *
 * Extracted from Stage.tsx, which had the only copy. App.tsx had none at all:
 * every failure to load a product — a network error, a 500 from the CMS, a
 * malformed payload — collapsed into one "unavailable" screen with nothing
 * recorded anywhere, so the most common way for the page to break was the one
 * nobody could see. `telemetry.ts` reads `kind`, `product`, `variant`, `reason`,
 * `module` and `available` from the detail; anything else is carried for the
 * console only.
 */
export function diagnostic(kind: string, detail: Record<string, string> = {}): void {
  document.dispatchEvent(new CustomEvent('run:diagnostic', { detail: { kind, ...detail } }))
  console.warn(`[viewer:${kind}]`, detail)
}
