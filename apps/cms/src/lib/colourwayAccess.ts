/**
 * The one definition of "this colourway can actually be served".
 *
 * WHY IT IS A SHARED FUNCTION AND NOT A REPEATED `if`. `buildViewerResponse`
 * (endpoints/projectViewer.ts) returns null — a 404 — for a published product whose
 * colourways all fail this test. The public product gallery lists products. If the
 * two used their own copies of the rule, the gallery would advertise garments the
 * detail page refuses to serve, and nothing would catch it: both sides would be
 * green, and the only symptom would be a buyer clicking a card and landing on
 * "[ REFERENCE UNAVAILABLE ]".
 *
 * That is the same shape as `isMediaReferenced` and `find-orphan-media.mjs` having to
 * agree on what "referenced" means (CLAUDE.md) — one deletes, the other only reports,
 * and a disagreement is invisible until it costs something.
 *
 * ⚠️ The rule is ADDRESSABILITY, not a poster. It used to be `if (!poster) continue`,
 * and that regressed live on 2026-08-21: detaching a product's posters dropped every
 * colourway and 404'd a PUBLISHED garment with QR tags in the field. A slug is the URL
 * segment and the string printed on the physical tag, so a row without one can be
 * neither linked nor scanned. See the long comment in projectViewer.ts.
 */
export function isAddressableColourway(doc: {
  active?: unknown
  slug?: unknown
  // Callers pass whole colourway documents, which carry a dozen other fields. Without
  // this, TypeScript's excess-property check rejects an object literal at a call site
  // even though the function reads only the two above.
  [key: string]: unknown
}): boolean {
  // `active` defaults to true, so only an explicit false retires a colour.
  if (doc.active === false) return false
  return String(doc.slug ?? '').trim().length > 0
}
