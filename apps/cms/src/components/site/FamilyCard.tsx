import Link from 'next/link'
import { cardImage, FAMILY_LAST_SIZES, FAMILY_SIZES } from '../../lib/cardImage'
import type { Family, FamilyPicture } from '../../lib/families'
import { familyHref } from '../../lib/familyPages'

// How wide a family card draws: `lib/cardImage.ts`, beside the gallery card's, since polish D1.
export { FAMILY_LAST_SIZES, FAMILY_SIZES }

/**
 * One of the five family cards on the home page.
 *
 * ⚠️ THE WHOLE CARD IS THE LINK (FA-I-02) — it opens that family's buyer page where the owner
 * has approved one (`lib/familyPages.ts`, 2026-09-30), else the gallery filtered to the family.
 * Since 2026-09-29 it also looks like one (owner: "the active block should change color or
 * animate to indicate that these are clickable"): on a pointer that can hover it lifts, its
 * edge turns the accent colour, its picture eases closer and the arrow moves; a keyboard
 * gets the same through `:focus-visible`; a touch screen gets the press.
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
}: {
  family: Family
  picture: FamilyPicture | null
  last?: boolean
}) {
  // The site's own photos bring their widths; a product picture gets the resized card sizes.
  const image = picture
    ? picture.srcSet
      ? { src: picture.url, srcSet: picture.srcSet }
      : cardImage(picture.url)
    : null
  return (
    <li className="panel family-card">
      <Link className="family-card__link" href={familyHref(family)}>
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
          </span>
        ) : (
          /*
           * No picture at all: no product and no family photo (`FAMILY_PHOTOS`). The same 4:5 box, drawn in the blueprint grid, keeps the row even
           * and says "reference to come" without a broken image or a fake product.
           */
          <span className="family-card__media family-card__media--empty">
            <span className="product-card__placeholder">[ Photo to come ]</span>
          </span>
        )}
        <span className="family-card__body">
          <h3 className="product-card__name">{family.name}</h3>
          <p className="product-card__desc">{family.body}</p>
          <span className="family-card__cue" aria-hidden="true">
            View the range →
          </span>
        </span>
      </Link>
    </li>
  )
}
