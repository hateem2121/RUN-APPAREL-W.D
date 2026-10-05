import Link from 'next/link'
import { Fragment } from 'react'
import { cardImage, FAMILY_SIZES } from '../../lib/cardImage'
import type { Family, FamilyPicture } from '../../lib/families'
import { FAMILY_SOON, familyHref, familyTypes, MINIMUM } from '../../lib/familyPages'

// How wide a family card draws: `lib/cardImage.ts`, beside the gallery card's, since polish D1.
export { FAMILY_SIZES }

/**
 * One of the five family cards on the home page: a ticket (polish D3, the owner's version 2 of
 * 3 October 2026).
 *
 * ⚠️ TWO HALVES AND A TEAR LINE. Closed, the picture sits over a stub with the family's name and
 * how many garments it holds. On a computer whose pointer can hover, the card opens sideways as
 * the pointer rests on it (a short pause first, so a pointer crossing the row opens nothing) or as
 * the keyboard reaches it: the picture moves to the left, its neighbours fade back, and the rest
 * arrives a line at a time: the count and the minimum, the name, the description, what the family
 * makes, and the way in. Everywhere else (a phone, a tablet, a touch screen) the card is sideways
 * all the time, picture left and words right (M1), so nothing waits on a hover a finger cannot
 * give. All of it is CSS (site.css, "The family tickets"); `TicketDismiss` adds only Escape.
 *
 * ⚠️ ONE LINK, ITS NAME THE FAMILY'S. The title is the link and stretches over the whole card
 * (Inclusive Components, "Cards", as the guide cards since VA-47), so a click anywhere opens it and
 * a screen reader hears "Sportswear, link" rather than every word on the card. The stub repeats
 * the name and count for the eye, so it is hidden from a screen reader, which reads the opened
 * half's words in full whether or not they are on show.
 *
 * ⚠️ A FAMILY WITH NOTHING TO SHOW GOES TO CONTACT (polish F8, the owner's answer Q21). Sports
 * Accessories has no garments and no page: its card says "[ soon ]" and opens Contact as "Ask what
 * we make →". Its link's name carries those words too, or a screen reader would hear "Sports
 * Accessories" and land on Contact (WCAG 2.2, "Understanding Link Purpose (In Context)", updated 18
 * May 2026).
 *
 * The picture is a real product of that family (`familyPictures`), so a visitor sees what the
 * family holds. No picture → no `<img>` at all, never a broken one.
 *
 * ⚠️ A CARD-SIZED COPY, NOT THE STUDIO RENDER (2026-09-30). The renders are the ones /products
 * showed before PR #93, 365–791 KB each for a box at most 369 px wide. The same Cloudflare resize
 * serves them here (`cardImage`), and a picture from any other address is left as it is.
 *
 * `count`: the family's garments on the site.
 */
export function FamilyCard({
  family,
  picture,
  soon = false,
  count = 0,
}: {
  family: Family
  picture: FamilyPicture | null
  /** No page and no garment yet (`familyIsSoon`): "[ soon ]", and the card opens Contact. */
  soon?: boolean
  /** How many of the family's garments the site shows. */
  count?: number
}) {
  // The site's own photos bring their widths; a product picture gets the resized card sizes.
  const image = picture
    ? picture.srcSet
      ? { src: picture.url, srcSet: picture.srcSet }
      : cardImage(picture.url)
    : null
  const types = familyTypes(family)
  // A family with a page but no garment on show (CI's database, a database wobble) shows no count.
  const counted = (short: boolean) =>
    soon
      ? FAMILY_SOON.label
      : count > 0
        ? `[ ${count} ${short ? 'ref' : 'reference'}${count === 1 ? '' : 's'} ]`
        : null
  return (
    <li className={soon ? 'panel family-card family-card--soon' : 'panel family-card'}>
      {picture ? (
        <span className="family-card__media">
          {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why). */}
          <img
            className="family-card__img"
            src={image?.src}
            srcSet={image?.srcSet}
            sizes={image?.srcSet ? FAMILY_SIZES : undefined}
            alt={picture.alt}
            width={1200}
            height={1500}
            loading="lazy"
            decoding="async"
          />
        </span>
      ) : (
        /*
         * No picture at all: no product and no family photo (`FAMILY_PHOTOS`). The same box, drawn in
         * the blueprint grid, keeps the row even and says "reference to come" without a broken
         * image or a fake product.
         */
        <span className="family-card__media family-card__media--empty">
          <span className="product-card__placeholder">[ Photo to come ]</span>
        </span>
      )}
      <span className="family-card__stub" aria-hidden="true">
        <span className="family-card__stub-name">{family.name}</span>
        {/* Both forms: the card's own width picks one, so a narrow card never wraps its count. */}
        {counted(false) ? (
          <span className="family-card__count">
            <span className="family-card__count-long">{counted(false)}</span>
            <span className="family-card__count-short">{counted(true)}</span>
          </span>
        ) : null}
      </span>
      <div className="family-card__more">
        <p className="family-card__meta">
          {counted(true) ? <span>{counted(true)}</span> : null}
          {MINIMUM ? <span>From {MINIMUM} pcs</span> : null}
        </p>
        <h3 className="family-card__title">
          <Link className="family-card__link" href={soon ? FAMILY_SOON.href : familyHref(family)}>
            {family.name}
            {soon ? <span className="visually-hidden">. {FAMILY_SOON.ask}</span> : null}
          </Link>
        </h3>
        <span className="family-card__line" aria-hidden="true">
          <i />
        </span>
        <p className="family-card__desc">{family.body}</p>
        {/*
          Each "/" held to the kind before it by a no-break space, so a line never starts with one (X9
          found a "·" opening a line on a 320px phone). A kind itself may wrap: held whole, "Tennis
          and pickleball" ran past a phone's edge at 24px text (composition.spec.ts).
        */}
        {types.length > 0 ? (
          <p className="family-card__types">
            {types.map((type, index) => (
              <Fragment key={type}>
                {index > 0 ? <>&nbsp;/ </> : null}
                <span className="family-card__type">{type}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
        <span className="family-card__cue" aria-hidden="true">
          {soon ? FAMILY_SOON.ask : 'View the range'} <b>→</b>
        </span>
      </div>
    </li>
  )
}
