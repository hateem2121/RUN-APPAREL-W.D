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
 * `.viewer-cue` in site.css is its look. `locale` (Russian section, 2026-11-15): on a Russian page
 * the same caption in Russian. Until 2026-11-16 it added «(на английском)», because the 3D viewer
 * was English; since PR #408 a Russian card opens the garment's Russian page (`/ru/products/…`,
 * every card on a Russian page, checked live), so the owner chose the plain words that day. Only
 * the garment's own CMS text stays English there, and the caption does not mention it.
 */
export const VIEWER_CUE_WORDS = 'Opens the 3D viewer'
export const VIEWER_CUE_WORDS_RU = 'Открывает 3D-просмотр'

/** U+2197 NORTH EAST ARROW, then U+FE0E VARIATION SELECTOR-15 (text presentation). */
export const VIEWER_CUE_ARROW = '\u{2197}\u{FE0E}'

export function ViewerCue({ locale = 'en' }: { locale?: 'en' | 'ru' }) {
  return (
    <span className="viewer-cue">
      {`${locale === 'ru' ? VIEWER_CUE_WORDS_RU : VIEWER_CUE_WORDS} `}
      <span aria-hidden="true">{VIEWER_CUE_ARROW}</span>
    </span>
  )
}
