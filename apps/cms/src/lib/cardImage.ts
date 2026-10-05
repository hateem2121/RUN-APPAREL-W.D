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
 * How wide a card's picture draws, from `.product-grid` in site.css (visual audit VA-42, 2026-10-02;
 * the page widths of polish D1, 2026-10-04; the tickets of D3b and M1, 2026-10-05): one sideways ticket
 * a row below 560 px, two columns to 900, three from 900, four from 1,440 and five from 1,920.
 *
 * ⚠️ ASKED FOR THE BOX INSIDE VA-55's MARGIN, 86% OF THE PICTURE'S BOX (polish X15, 2026-10-05).
 * Each slide picture is padded 7% of its width a side (`--picture-inset`, site.css), and `contain`
 * fits the render inside that, so no render is drawn wider than 0.86 of the box. Asking for the
 * whole box handed a 3x phone at 375-393 px the 720 file (38-60 KB, measured live) where the 400
 * file (16-26 KB) already covers the picture, and a 2x tablet at 820-834 px or a 2x laptop at
 * 1,280-1,439 px the 1,080 file where 720 covers it. The box, and 0.86 of it:
 *
 *   below 400     the ticket's left 44%: `0.44 × (100vw − two 20 px gutters − its 2 px of border)`,
 *                 122 px at 320 and 153 at 390; inside the margin `37.84vw − 15.9px`, asked as
 *                 `37.84vw − 15.6px`, which keeps a 393 px phone's 3x ask (399.3) under the 400 file
 *   400–559       the same with gutters of 5vw rounded to 2 px, 220 px at 559; inside the margin at
 *                 most `34.06vw`, asked as 34.1vw
 *   560–899       `(100vw − two gutters − a 12 px gap) / 2`, `45vw − 6px` within the gutters'
 *                 rounding (246 px at 560); inside the margin at most `38.7vw − 4.3px`
 *   900–1,279     three in a page of up to 1,180: 254–338 px; inside the margin up to 291
 *   1,280–1,439   three in the screen less two 64 px gutters: (100vw − 128 − 48) / 3, 368–421 px;
 *                 inside the margin `28.67vw − 50.4px`
 *   1,440–1,919   four in 1,312: 310 px; 266.6 inside the margin
 *   1,920 and up  five in 1,472: 275.2 px; 236.7 inside the margin
 *
 * Never less than the margin's box (`e2e/productsGrid.spec.ts` measures it), so a sharp screen is
 * never handed a file it would have to stretch. Until VA-42 this said one column below 586 px (348
 * px at 390) and a phone fetched the 1,080 file for a 169 px card.
 *
 * The `w` numbers describe the 4:5 BOX the file is fitted into, not the picture. In a 4:5 card the
 * margin's box is 4:5 too, so a file as wide as it is as tall as it as well. Below 560 px the card's
 * box is square, or taller only when a long name needs the room: the margin's box there is 0.86 of
 * the width by 0.825 of it (1.25 x 7% above and below), and the file's box, 1.25 times as tall as
 * it is wide, is taller than that. A ticket stretched past 1.25 times its width by a long name is
 * the one case a tall render could come out a little soft.
 */
export const CARD_SIZES =
  '(max-width: 399px) calc(37.84vw - 15.6px), (max-width: 559px) 34.1vw, ' +
  '(max-width: 899px) calc(38.7vw - 4px), (max-width: 1279px) 291px, ' +
  '(max-width: 1439px) calc(28.67vw - 50px), (max-width: 1919px) 267px, 237px'

/**
 * How wide a family ticket's picture on the home page draws (polish D3; `.family-card` in site.css),
 * in the page widths of polish D1. Sideways, it is 40% of the card: one card a row below 560 px
 * (`0.4 x (100vw - two gutters)`, asked as `40vw - 16px`), two from 560 px (`0.2 x (the column -
 * a 24 px gap)`: `18vw - 4px` while the gutters are 5vw, to 1,279; `20vw - 30px` in the screen less
 * 128 px of gutters, to 1,439; 257.6 in the 1,312 px column; 289.6 in the 1,472 px one). The fifth,
 * which spans both columns, keeps the others' picture width, so this is its hint too. In the row of
 * five (a pointer that can hover, from 1,180 px) a closed card's picture is the whole card, `(the
 * column - four 12 px gaps) / 5`, which those same numbers cover within a few pixels (and an opened
 * card's is smaller, 44% of a wider card). Only a hint: the picture it picks is one of the three
 * card sizes above, the only ones the wear-run.com firewall rule lets through. Here, not in
 * `FamilyCard.tsx`, so a browser test can import it without the component's Next imports.
 */
export const FAMILY_SIZES =
  '(max-width: 559px) calc(40vw - 16px), (max-width: 1279px) calc(18vw - 4px), ' +
  '(max-width: 1439px) calc(20vw - 30px), (max-width: 1919px) 258px, 290px'

export function cardImage(url: string): { src: string; srcSet?: string; sizes?: string } {
  return resizedCardImage(url, CARD_SIZES)
}
