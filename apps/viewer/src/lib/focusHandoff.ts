/**
 * Is focus still unclaimed — held by nothing but the page itself?
 *
 * `App.tsx` hands focus to the top of the page when the opening curtain leaves, so a screen
 * reader's cursor moves out of the departed overlay and into the live document. That hand-off
 * is for a visitor who has not moved focus yet. It must never run over one who has.
 *
 * ⚠️ IT RAN OVER EVERYONE UNTIL 2026-10-02 (visual audit VA-05). Measured with normal motion:
 * Tab pressed 1.5 s after load put focus on "Skip to main content", and within 400 ms the
 * hand-off pulled it to the page wrapper — the visitor's place gone. The same hand-off threw a
 * keyboard user out of the phone menu: menu opened while the garment was still loading, focus on
 * the menu button, then focus jumped to the top of the page with the menu still open.
 * WCAG 2.2 SC 3.2.1 (On Focus) names removing focus by script as a failure (F55); SC 2.4.3 (Focus
 * Order) asks that focus keep an order that preserves meaning and operability, which a menu left
 * open behind a jump does not.
 *
 * What counts as "unclaimed", per MDN `Document.activeElement` (read 2026-10-02): the browser
 * reports `<body>` when nothing has focus, or `<html>` when the document has no body. The type
 * also allows `null`, which names no element, so that counts as unclaimed too. Anything else —
 * the skip link, a menu button, a colour dot, the `<model-viewer>` host (the browser names the
 * host when focus is inside its shadow tree) — means the visitor already chose where they are.
 */
export function isFocusUnclaimed(
  doc: Pick<Document, 'activeElement' | 'body' | 'documentElement'>,
): boolean {
  const active = doc.activeElement
  return active === null || active === doc.body || active === doc.documentElement
}
