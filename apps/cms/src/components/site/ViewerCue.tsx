/**
 * The caption on every link that leaves this site for the 3D viewer (audit XS-09).
 *
 * ⚠️ THE OWNER'S WORDS, chosen on 2026-09-17 from three mockups: "Opens the 3D viewer ↗".
 * Do not rephrase them. A card on this site opens a different host — the viewer that
 * printed QR tags lead to — and measured live that day nothing on any card said so: all 16
 * cards' accessible names ran poster alt, name, meta line and description, with no word about
 * where the link goes.
 *
 * ⚠️ ONE TEXT NODE, THEN THE ARROW. `renderToStaticMarkup` puts a `<!-- -->` between two
 * adjacent text nodes, and `publicSite.test.ts` pins the exact markup.
 *
 * The arrow is decoration: `aria-hidden`, so a screen reader hears the words once, and
 * followed by U+FE0E so no platform draws it as an emoji. The copy rules count ↗ as a
 * pictograph, which is also why it never goes inside a heading.
 *
 * A server component with no props; `.viewer-cue` in site.css is its look.
 */
export const VIEWER_CUE_WORDS = 'Opens the 3D viewer'

/** U+2197 NORTH EAST ARROW, then U+FE0E VARIATION SELECTOR-15 (text presentation). */
export const VIEWER_CUE_ARROW = '\u{2197}\u{FE0E}'

export function ViewerCue() {
  return (
    <span className="viewer-cue">
      {`${VIEWER_CUE_WORDS} `}
      <span aria-hidden="true">{VIEWER_CUE_ARROW}</span>
    </span>
  )
}
