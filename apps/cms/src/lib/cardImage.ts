/**
 * A card-sized copy of a gallery picture, resized by Cloudflare at the edge (owner, 2026-09-29).
 *
 * The URLs are built in packages/shared/src/cardImage.ts since polish S6 (2026-10-04), where the
 * reasons live: the firewall rule that allows exactly those copies, the quality the owner chose,
 * and why the page's own address asks for them. The garment pages' "More from <category>" cards
 * use the same builder, so the two can never ask for a size the rule refuses. What stays here is
 * how wide THIS site's gallery draws a card.
 */

import { CARD_WIDTHS, resizedCardImage } from '@run-apparel/shared'

export { CARD_WIDTHS }

/**
 * How wide a card draws, from `.product-grid` in site.css (visual audit VA-42, 2026-10-02): two
 * columns below 900 px, three from 900 and four from 1,600, so the card is ~134–169 px on a phone
 * and ~250–390 px up to 899, then ~254–335 px. Below 900 a card is
 * `(100vw − two gutters − a 12 px gap) / 2`. `45vw − 6px` is exact above 400 px, where the gutter is
 * 5vw, and 4 px too wide at 320 px (138 px asked for, 134 px drawn): close enough, since the browser
 * only uses it to choose between three files. From 900 px it is the 340 px the
 * live page measured 2026-09-29 (333 px at 1280, 308 at 1920). Until VA-42 this said one column
 * below 586 px (348 px at 390) and a phone fetched the 1,080 file for a 169 px card.
 *
 * The `w` numbers describe the 4:5 BOX, not the picture inside it. A render taller than 4:5 comes
 * back narrower than the box, but it is height-bound in the card too (`object-fit: contain`), so
 * the height it needs is what the box gives: a 3x phone's 434 px-tall card needs 1,302 px, and
 * the 1,080 box is 1,350 px tall. Below 560 px the box is square (169 px tall at 390 px), which
 * only means the file is a little larger than the picture needs.
 */
export const CARD_SIZES = '(max-width: 899px) calc(45vw - 6px), 340px'

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  return resizedCardImage(url, CARD_SIZES)
}
