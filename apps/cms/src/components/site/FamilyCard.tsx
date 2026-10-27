import Link from 'next/link'
import type { CSSProperties } from 'react'
import { cardImage, FAMILY_SIZES } from '../../lib/cardImage'
import type { Family, FamilyGarment, FamilyPicture } from '../../lib/families'
import { FAMILY_SOON, familyHref } from '../../lib/familyPages'

// How wide a family card draws: `lib/cardImage.ts`, beside the gallery card's, since polish D1.
export { FAMILY_SIZES }

/** How many of a family's list a card shows before "+ N more" (D44, owner, 2026-10-15). */
export const LIST_SHOWN = 6

/**
 * One of the five family cards on the home page (polish D3, the owner's version 2 of 3 October 2026;
 * rebuilt as D44, the owner's option C2 of 15 October 2026).
 *
 * ⚠️ CLOSED, A PICTURE AND A LINE UNDER IT; OPEN, THE WORDS BESIDE IT. On a computer whose pointer can
 * hover, in a row of five, the card opens as the pointer rests on it or as the keyboard reaches it:
 * its words slide out beside the picture, the picture turns to ANOTHER COLOUR OF THE SAME GARMENT,
 * the line under it names the garment, and the other cards step back. Everywhere else (a phone, a
 * tablet, a touch screen) the card is open all the time, picture left and words right, so nothing
 * waits on a hover a finger cannot give; there it keeps its first colour and draws no dots. All of it
 * is CSS (site.css, "№02 the family cards"); `TicketDismiss` adds only Escape.
 *
 * ⚠️ NOTHING IS SAID TWICE (the owner's rule, 2026-10-15). The family's name is the title, so the
 * line under an opened picture names the garment instead, and the colour's name sits over the dots
 * alone. The minimum is the hero's to say, so the card no longer repeats it.
 *
 * ⚠️ ONE LINK, ITS NAME THE FAMILY'S. The title is the link and stretches over the whole card
 * (Inclusive Components, "Cards", as the guide cards since VA-47), so a click anywhere opens it and
 * a screen reader hears "Sportswear, link" rather than every word on the card. "+ N more" is part of
 * that card, not a second link to the same page. The line under the picture repeats the name and
 * count for the eye, so it is hidden from a screen reader, which reads the words in full whether or
 * not they are on show.
 *
 * ⚠️ A FAMILY WITH NOTHING TO SHOW GOES TO CONTACT (polish F8, the owner's answer Q21). Sports
 * Accessories has no garments and no page: its card says "[ ask us ]" and opens Contact as "Ask what
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
 */
export function FamilyCard({
  family,
  picture,
  garment = null,
  list = [],
  index = 0,
  soon = false,
  count = 0,
}: {
  family: Family
  picture: FamilyPicture | null
  /** The garment in the picture and the colour an opened card shows (`familyGarments`). */
  garment?: FamilyGarment | null
  /** The family's list from the CMS (D44), in order; the card shows the first six. */
  list?: readonly string[]
  /** The card's place in the row, from 0: an opened card moves the others by it (site.css). */
  index?: number
  /** No page and no garment yet (`familyIsSoon`): "[ ask us ]", and the card opens Contact. */
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
  const second = garment ? cardImage(garment.open.url) : null
  // A family with a page but no garment on show (CI's database, a database wobble) shows no count.
  const counted = (short: boolean) =>
    soon
      ? FAMILY_SOON.label
      : count > 0
        ? `${count} ${short ? 'ref' : 'reference'}${count === 1 ? '' : 's'}`
        : null
  const more = list.length - LIST_SHOWN
  return (
    <li
      className={soon ? 'family-card family-card--soon' : 'family-card'}
      style={{ '--card': index } as CSSProperties}
    >
      <span className="family-card__face">
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
            {garment && second ? (
              // The same garment in another colour, for the eye: the picture above already names it,
              // so this one is silent rather than said twice.
              // biome-ignore lint/performance/noImgElement: as above.
              <img
                className="family-card__img family-card__img--open"
                src={second.src}
                srcSet={second.srcSet}
                sizes={second.srcSet ? FAMILY_SIZES : undefined}
                alt=""
                width={1200}
                height={1500}
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {garment && second ? (
              // The colour change's layer (FamilyDye.tsx): a copy of a picture already on screen.
              // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas has no tabindex and takes no focus (as LiveGarment.tsx's).
              <canvas className="dye-layer" aria-hidden="true" />
            ) : null}
          </span>
        ) : (
          /*
           * No picture at all: no product and no family photo (`FAMILY_PHOTOS`). The same box, drawn
           * in the blueprint grid, keeps the row even and says "reference to come" without a broken
           * image or a fake product.
           */
          <span className="family-card__media family-card__media--empty">
            <span className="product-card__placeholder">[ Photo to come ]</span>
          </span>
        )}
        <span className="family-card__under" aria-hidden="true">
          <span className="family-card__stub">
            <span className="family-card__stub-name">{family.name}</span>
            {counted(true) ? (
              <span className="family-card__count">
                {soon ? counted(true) : `[ ${counted(true)} ]`}
              </span>
            ) : null}
          </span>
          {garment ? <span className="family-card__garment">{garment.name}</span> : null}
        </span>
      </span>
      <div className="family-card__more">
        {counted(false) ? <p className="family-card__meta">{counted(false)}</p> : null}
        <h3 className="family-card__title">
          <Link className="family-card__link" href={soon ? FAMILY_SOON.href : familyHref(family)}>
            {family.name}
            {soon ? <span className="visually-hidden">. {FAMILY_SOON.ask}</span> : null}
          </Link>
        </h3>
        <p className="family-card__desc">{family.body}</p>
        {list.length > 0 ? (
          <>
            <p className="family-card__label">{family.listLabel}</p>
            <ul className="family-card__list">
              {list.slice(0, LIST_SHOWN).map((name) => (
                <li key={name}>{name}</li>
              ))}
              {more > 0 ? <li className="family-card__list-more">+ {more} more</li> : null}
            </ul>
          </>
        ) : null}
        {garment ? (
          <div className="family-card__colour" aria-hidden="true">
            <p className="family-card__label">{garment.open.colourName}</p>
            <span className="family-card__dots">
              {garment.swatches.map((swatch, at) => (
                <i
                  // Swatches repeat; their place in the row does not.
                  // biome-ignore lint/suspicious/noArrayIndexKey: the row's order is the key.
                  key={at}
                  className={at === garment.shown ? 'is-shown' : undefined}
                  style={swatch ? ({ '--swatch': swatch } as CSSProperties) : undefined}
                />
              ))}
            </span>
          </div>
        ) : null}
        <span className="family-card__cue" aria-hidden="true">
          {soon ? FAMILY_SOON.ask : 'View the range'} <b>→</b>
        </span>
      </div>
    </li>
  )
}
