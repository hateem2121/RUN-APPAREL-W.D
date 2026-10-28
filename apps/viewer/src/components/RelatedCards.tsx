import {
  buildViewerPath,
  GARMENT_PATH_PREFIX,
  nameSegments,
  resizedCardImage,
  type ViewerRelatedGarment,
} from '@run-apparel/shared'
import { SITE_ORIGIN } from '../lib/siteLinks'
import '../styles/related-cards.css'

/**
 * How wide a card's picture draws, from `.related__list` (related-cards.css) and `.content`
 * (page.css): two columns below 900px and four from it, inside `.content`'s gutters
 * (clamp(16px, 4vw, 48px)) and its 1,200px of words, less the card's two 1px borders. Below 900
 * that is (100vw − two 4vw gutters − a 12px gap) / 2 − 2px = 46vw − 8px, exact from 400px and 3px
 * wide at 320px; from 900 it is (92vw − three 16px gaps) / 4 − 2px = 23vw − 14px; from 1200 the
 * gutters stop at 48px, so (100vw − 96px − 48px) / 4 − 2px = 25vw − 38px; and from 1296 the words
 * stop at 1,200px and the picture at 286px. Since 2026-10-28 the 1,200px counts words only (the
 * edge line-up, page.css), which moved the last two terms: they were 262px from 1200 wide, and the
 * drawn card measured 282px at 1280 and 286px at 1920. The browser only uses it to choose between
 * the three copies (`CARD_WIDTHS`), and `e2e/related.spec.ts` measures it against the drawn
 * picture at seven widths, so a layout change that forgets this line fails there, as that one did.
 */
export const RELATED_CARD_SIZES =
  '(max-width: 899px) calc(46vw - 8px), (max-width: 1199px) calc(23vw - 14px), (max-width: 1295px) calc(25vw - 38px), 286px'

/**
 * The cards of "More from this category" (polish S6), loaded after the page's first paint with
 * their own stylesheet: `RelatedGarments.tsx` says why, and draws the section around them.
 *
 * Each card is ONE link, picture and name together: a buyer taps anywhere on it, and a screen
 * reader hears one link named by the garment's name and code. The picture is `alt=""`, because
 * the name in the same link already says what it shows (MDN `<img>`, modified 2026-09-11: an
 * empty alt marks an image that is not a key part of the content, and hides a broken one).
 * `loading="lazy"`: the section is at the end of the page and never on its first screen.
 */
export default function RelatedCards({ related }: { related: ViewerRelatedGarment[] }) {
  return (
    // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics under list-style: none unless the role is written out
    <ul className="related__list" role="list">
      {related.map((garment) => (
        <li key={garment.slug}>
          <a
            className="related__card"
            href={`${SITE_ORIGIN}${buildViewerPath(garment.slug, garment.colourSlug, GARMENT_PATH_PREFIX)}`}
          >
            <div className="related__frame">
              {garment.imageUrl ? (
                // width and height are the 4:5 box of the default copy (the website's are its
                // renders' 1200 x 1500): the frame already keeps the room, and every picture on
                // the page names its size (SZ-10, e2e/audit-guards.spec.ts).
                <img
                  className="related__img"
                  {...resizedCardImage(garment.imageUrl, RELATED_CARD_SIZES)}
                  width={720}
                  height={900}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
            </div>
            <div className="related__body">
              <h3 className="related__name" translate="no">
                {nameSegments(garment.productName.trim()).map((part) =>
                  part.whole ? (
                    <span key={part.at} className="related__word">
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  ),
                )}
              </h3>
              <p className="related__code" translate="no">
                {garment.productCode}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  )
}
