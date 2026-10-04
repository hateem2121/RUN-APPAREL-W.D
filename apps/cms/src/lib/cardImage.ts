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
 * How wide a card draws, from `.product-grid` in site.css (visual audit VA-42, 2026-10-02; the page
 * widths of polish D1, 2026-10-04): two columns below 900 px, three from 900, four from 1,440 and
 * five from 1,920. Below 900 a card is `(100vw − two gutters − a 12 px gap) / 2`. `45vw − 6px` is
 * exact above 400 px, where the gutter is 5vw, and 4 px too wide at 320 px (138 px asked for, 134 px
 * drawn): close enough, since the browser only uses it to choose between three files. Then:
 *
 *   900–1,279     three in a page of up to 1,180: 254–338 px, asked as 340
 *   1,280–1,439   three in the screen less two 64 px gutters: (100vw − 128 − 48) / 3, 368–421 px
 *   1,440–1,919   four in 1,312: 310 px
 *   1,920 and up  five in 1,472: 275.2 px, asked as 276
 *
 * Never less than the card draws (`e2e/productsGrid.spec.ts` measures it), so a sharp screen is
 * never handed the smaller file for a card it would have to stretch. Until VA-42 this said one
 * column below 586 px (348 px at 390) and a phone fetched the 1,080 file for a 169 px card.
 *
 * The `w` numbers describe the 4:5 BOX, not the picture inside it. A render taller than 4:5 comes
 * back narrower than the box, but it is height-bound in the card too (`object-fit: contain`), so
 * the height it needs is what the box gives: a 3x phone's 434 px-tall card needs 1,302 px, and
 * the 1,080 box is 1,350 px tall. Below 560 px the box is square (169 px tall at 390 px), which
 * only means the file is a little larger than the picture needs.
 */
export const CARD_SIZES =
  '(max-width: 899px) calc(45vw - 6px), (max-width: 1279px) 340px, ' +
  '(max-width: 1439px) calc(33.34vw - 58px), (max-width: 1919px) 310px, 276px'

/**
 * How wide a family card on the home page draws, from `.family-grid` in site.css: one column below
 * 560 px, two up to 1,179 (each `(100vw - 42 px of gutters - a 24 px gap) / 2`), five across above
 * that, in the page widths of polish D1 (2026-10-04): about 193 px to 1,279 (asked as 200), then
 * `(100vw - 128 px of gutters - four 24 px gaps) / 5` to 1,439, 243.2 px in the 1,312 px column to
 * 1,919 and 275.2 px in the 1,472 px one from 1,920. Only a hint: the picture it picks is one of the
 * three card sizes above, the only ones the wear-run.com firewall rule lets through. Here, not in
 * `FamilyCard.tsx`, so a browser test can import it without the component's Next imports.
 */
export const FAMILY_SIZES =
  '(max-width: 559px) calc(100vw - 42px), (max-width: 1179px) calc(50vw - 33px), ' +
  '(max-width: 1279px) 200px, (max-width: 1439px) calc(20vw - 44px), (max-width: 1919px) 244px, 276px'

/**
 * The fifth family card's: from 560 to 1,179 px it spans both columns, and its `<li>` keeps
 * base.css's `p, li { max-width: 60ch }`, so it is the column's width on a narrow tablet and then
 * stops at 60 characters, which is a width in the FONT: 557 px in Chromium and 584 px in Firefox
 * (measured 2026-10-04 at 900 px). No pixel number is right in both, so from 560 px the hint is
 * the column itself, `90vw` (the page less two 5vw gutters), which the card can never exceed: a
 * larger copy than a capped card needs, never a smaller one. With the shared hint it asked for
 * 417 px at 900 px while drawing 555, a softer copy of Sports Accessories' picture
 * (`e2e/homePicture.spec.ts` found it, polish D1).
 */
export const FAMILY_LAST_SIZES =
  '(max-width: 559px) calc(100vw - 42px), (max-width: 1179px) 90vw, (max-width: 1279px) 200px, ' +
  '(max-width: 1439px) calc(20vw - 44px), (max-width: 1919px) 244px, 276px'

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  return resizedCardImage(url, CARD_SIZES)
}
