import Link from 'next/link'
import type { Family, FamilyPicture } from '../../lib/families'

/**
 * One of the five family cards on the home page.
 *
 * ⚠️ THE WHOLE CARD IS THE LINK (FA-I-02) — it opens the gallery filtered to that family.
 * Since 2026-09-29 it also looks like one (owner: "the active block should change color or
 * animate to indicate that these are clickable"): on a pointer that can hover it lifts, its
 * edge turns the accent colour, its picture eases closer and the arrow moves; a keyboard
 * gets the same through `:focus-visible`; a touch screen gets the press.
 *
 * The picture is a real product of that family (`familyPictures`), so a visitor sees what the
 * family holds. No picture → no `<img>` at all, never a broken one.
 */
export function FamilyCard({ family, picture }: { family: Family; picture: FamilyPicture | null }) {
  return (
    <li className="panel family-card">
      <Link className="family-card__link" href={`/products?family=${family.slug}`}>
        {picture ? (
          <span className="family-card__media">
            {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why). */}
            <img
              className="family-card__img"
              src={picture.url}
              alt={picture.alt}
              width={1200}
              height={1500}
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : (
          /*
           * No picture yet (Sports Accessories has no product and no stand-in photo, the
           * owner's choice). The same 4:5 box, drawn in the blueprint grid, keeps the row even
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
