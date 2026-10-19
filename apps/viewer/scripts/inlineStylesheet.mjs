/**
 * Put the viewer's main stylesheet INSIDE the built `index.html` (2026-10-19, owner-approved).
 *
 * WHY. A garment page's first paint waits for one thing: the render-blocking stylesheet. On Chrome's
 * "Slow 3G" (400 ms round trip, 50,000 B/s, `apps/viewer/e2e/firstPaint.spec.ts`) that file took
 * 1,138 ms to arrive, not the 300 ms its 15 KB needs, because the browser asked for it in the same
 * burst as the app script, its three preloaded chunks and the two preloaded fonts (about 230 KB of
 * brotli) and the line is shared between all of them. Measured on this machine, median of 5, cold
 * cache, every variant on the same build:
 *
 *     stylesheet linked (as before)                    2,304 ms   page mounts at 6,694 ms
 *     the two font preloads removed                    1,892 ms   page mounts at 5,827 ms, but
 *                                                                 the headline paints in the
 *                                                                 fallback face and swaps later
 *     stylesheet inlined at the top of <head>            884 ms   page mounts at 6,691 ms, both
 *                                                                 fonts loaded when it does
 *     nothing but the stylesheet (no scripts, no fonts) 1,208 ms   (a link, for comparison)
 *
 * Inlined, the CSS rides in the document's own response, so it is on screen before any other
 * request has been made. Nothing else moved: same fonts, same mount time, same pixels.
 *
 * THE COST, stated so nobody finds it later: `index.html` is `max-age=0, must-revalidate`
 * (`_headers`) and the Worker rewrites it per garment, so a REPEAT visit now re-reads the stylesheet
 * inside the page where it used to come from the immutable `/assets/*` cache. The file stays in
 * `dist/` (and in the offline shell) so `scripts/check-bundle-budget.mjs` keeps counting the same
 * bytes; nothing about the budget changed.
 *
 * WHERE IT GOES: straight after `<meta charset>`, not where the `<link>` was. The link sits after the
 * app script and its preloads; a `<style>` in that place would arrive after the requests for them
 * had started, and they would share the line with the rest of the document again.
 *
 * No `replace` on markup: CodeQL (Extended) blocks a merge on a one-pass markup replace, and the tag is
 * cut out by position instead.
 *
 * @param {string} html the built document
 * @param {(href: string) => string | undefined} readCss the stylesheet's text for an `/assets/…css`
 *   href, or undefined to leave that link alone
 * @returns {string}
 */
export function inlineStylesheets(html, readCss) {
  const links = [...html.matchAll(/<link\b[^>]*>/g)].filter(
    (m) => /\brel="stylesheet"/.test(m[0]) && /\bhref="\/assets\/[^"]+\.css"/.test(m[0]),
  )
  let out = html
  const styles = []
  // Back to front, so earlier offsets stay true while the tags are cut out.
  for (const link of links.reverse()) {
    const href = /\bhref="([^"]+)"/.exec(link[0])?.[1] ?? ''
    const css = readCss(href)
    if (css === undefined) continue
    // `</style` inside the text would close the element early and spill the rest into the page.
    if (/<\/style/i.test(css)) throw new Error(`inlineStylesheet: ${href} contains "</style"`)
    styles.unshift(`<style>${css}</style>`)
    const at = link.index ?? 0
    out = out.slice(0, at) + out.slice(at + link[0].length)
  }
  if (styles.length === 0) return html
  const charset = /<meta\b[^>]*\bcharset=[^>]*>/i.exec(out)
  if (!charset) {
    // No charset tag to follow: open the head with them instead (a charset must come first, so
    // never put anything before one).
    const head = /<head\b[^>]*>/i.exec(out)
    if (!head) throw new Error('inlineStylesheet: no <head> to put the stylesheet in')
    const end = (head.index ?? 0) + head[0].length
    return out.slice(0, end) + styles.join('') + out.slice(end)
  }
  const end = (charset.index ?? 0) + charset[0].length
  return out.slice(0, end) + styles.join('') + out.slice(end)
}
