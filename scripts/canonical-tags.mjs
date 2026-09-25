/**
 * FI-02 — how many REAL `<link rel="canonical">` tags does a page carry?
 *
 * WHY A HELPER. An audit counted two canonicals on every viewer page, one of them empty.
 * Re-measured 2026-09-23 with a crawler user-agent: two TEXT matches, one TAG. The second
 * match is prose inside the HTML comment in `apps/viewer/index.html` that explains why the
 * static file carries no canonical of its own — the Worker appends the one real tag per
 * request (`apps/viewer/worker/index.ts`, `applyPreview`). A count that reads the raw text
 * reports a duplicate that no crawler sees; a count that ignores the question entirely
 * would not notice a REAL second tag. So comments are removed first, the way a parser
 * would, and only then are tags counted.
 *
 * Used by `scripts/smoke-viewer-preview.mjs` (the live viewer, after every deploy) and by
 * `apps/cms/e2e/findability.spec.ts` (the site's pages). Plain JavaScript with no imports,
 * like `contrast-rules.mjs`, so it runs under bare `node` and TypeScript tests import it
 * through `canonical-tags.d.mts`.
 */

/**
 * Remove HTML comments until none is left. One pass is not enough: removing a comment can
 * splice a fresh `<!--` out of the text either side of it (the same repeat-until-stable
 * loop `apps/viewer/scripts/og.test.ts` uses, for the same CodeQL finding).
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtmlComments(html) {
  let previous
  let current = html
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

/**
 * Every real canonical link's `href`, in document order — attributes in either order,
 * quoted with `"` or `'`. A tag with no `href` is returned as `''`, so an EMPTY canonical
 * is counted, and caught, rather than skipped.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function canonicalHrefs(html) {
  const out = []
  for (const tag of stripHtmlComments(html).matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?canonical\b/i.test(tag[0])) continue
    out.push(tag[0].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? '')
  }
  return out
}
