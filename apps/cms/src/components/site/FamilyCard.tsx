import Link from 'next/link'
import { cardImage, FAMILY_LAST_SIZES, FAMILY_SIZES } from '../../lib/cardImage'
import type { Family, FamilyPicture } from '../../lib/families'
import { FAMILY_SOON, familyHref } from '../../lib/familyPages'

// How wide a family card draws: `lib/cardImage.ts`, beside the gallery card's, since polish D1.
export { FAMILY_LAST_SIZES, FAMILY_SIZES }

/**
 * One of the five family cards on the home page.
 *
 * ⚠️ THE WHOLE CARD IS THE LINK (FA-I-02) — it opens that family's buyer page where the owner
 * has approved one (`lib/familyPages.ts`, 2026-09-30), else its group on the products page
 * (`familyHref`). Since 2026-09-29 it also looks like one (owner: "the active block should
 * change color or animate to indicate that these are clickable"): on a pointer that can hover
 * it lifts, its edge turns the accent colour, its picture eases closer and the arrow moves; a
 * keyboard gets the same through `:focus-visible`; a touch screen gets the press.
 *
 * ⚠️ A FAMILY WITH NOTHING TO SHOW GOES TO CONTACT (polish F8, the owner's answer Q21,
 * 2026-10-04). Sports Accessories has no garments and no page, and its card opened an empty
 * list: a buyer clicked a picture of backpacks and found nothing. While that holds (`soon`, from
 * `familyIsSoon`) it keeps its card, wears "[ soon ]" on the picture's corner (where it changes
 * no card's height: at 1440px all five cards' words are 149px tall, and a line of their own
 * would have left a 30px gap under the other four) and opens Contact as "Ask what we make →".
 *
 * ⚠️ THAT CARD'S CUE IS SPOKEN. The card's words are its link's name. The other cards hide their
 * "View the range →", which repeats where the name already leads; on this card the name alone
 * would promise a range and land on Contact, so "Ask what we make" is part of the name (WCAG 2.2,
 * "Understanding Link Purpose (In Context)", updated 18 May 2026; a hidden node adds nothing to a
 * name, Accessible Name and Description Computation 1.2, step 2A).
 *
 * The picture is a real product of that family (`familyPictures`), so a visitor sees what the
 * family holds. No picture → no `<img>` at all, never a broken one.
 *
 * ⚠️ A CARD-SIZED COPY, NOT THE STUDIO RENDER (2026-09-30). The renders are the ones /products
 * showed before PR #93, 365–791 KB each for a box at most 369 px wide. The same Cloudflare resize
 * serves them here (`cardImage`), and a picture from any other address is left as it is.
 *
 * `last`: the fifth card, which spans both columns from 560 to 1,179 px and so draws wider than
 * the others there (`FAMILY_LAST_SIZES`).
 */
export function FamilyCard({
  family,
  picture,
  last = false,
  soon = false,
}: {
  family: Family
  picture: FamilyPicture | null
  last?: boolean
  /** No page and no garment yet (`familyIsSoon`): "[ soon ]", and the card opens Contact. */
  soon?: boolean
}) {
  // The site's own photos bring their widths; a product picture gets the resized card sizes.
  const image = picture
    ? picture.srcSet
      ? { src: picture.url, srcSet: picture.srcSet }
      : cardImage(picture.url)
    : null
  // After the picture, so it is drawn over it, and read after it.
  const label = soon ? <span className="label family-card__soon">{FAMILY_SOON.label}</span> : null
  return (
    <li className="panel family-card">
      <Link className="family-card__link" href={soon ? FAMILY_SOON.href : familyHref(family)}>
        {picture ? (
          <span className="family-card__media">
            {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why). */}
            <img
              className="family-card__img"
              src={image?.src}
              srcSet={image?.srcSet}
              sizes={image?.srcSet ? (last ? FAMILY_LAST_SIZES : FAMILY_SIZES) : undefined}
              alt={picture.alt}
              width={1200}
              height={1500}
              loading="lazy"
              decoding="async"
            />
            {label}
          </span>
        ) : (
          /*
           * No picture at all: no product and no family photo (`FAMILY_PHOTOS`). The same 4:5 box, drawn in the blueprint grid, keeps the row even
           * and says "reference to come" without a broken image or a fake product.
           */
          <span className="family-card__media family-card__media--empty">
            <span className="product-card__placeholder">[ Photo to come ]</span>
            {label}
          </span>
        )}
        <span className="family-card__body">
          <h3 className="product-card__name">{family.name}</h3>
          <p className="product-card__desc">{family.body}</p>
          {soon ? (
            <span className="family-card__cue">
              {FAMILY_SOON.ask}
              <span aria-hidden="true"> →</span>
            </span>
          ) : (
            <span className="family-card__cue" aria-hidden="true">
              View the range →
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}
