import { cardImage } from '../../lib/cardImage'
import type { FamilyPicture } from '../../lib/families'
import { ProductPoster } from './ProductPoster'

/**
 * How wide the hero picture draws, from `.family-hero__*` in site.css: the page's column on a phone
 * (`100vw` less two 20px gutters, the gutter being 20px up to 400px wide and 5vw above it) and 420px
 * from 480px, where the frame stops growing. Only a hint for choosing between the three card sizes
 * `cardImage` offers, so close is enough.
 */
export const HERO_PICTURE_SIZES = '(min-width: 480px) 420px, calc(100vw - 40px)'

/**
 * The picture a buyer page opens on (visual audit VA-48, owner's choice 2026-10-02): the SAME one
 * the family's card shows on the home page (`familyPictures`: its first garment's studio render,
 * else that garment's poster, else the family's own photo), so a buyer who clicked the card meets
 * the picture they clicked.
 *
 * ⚠️ IT IS THE PAGE'S LARGEST PAINT, SO IT LOADS FIRST, ON THE `<img>` ITSELF. `ProductPoster` with
 * `index={0}` is eager with `fetchpriority="high"`, and a picture with a `srcSet` sits in a
 * `<picture>` so React adds no `<link rel=preload>` for it: `e2e/perfBudgets.spec.ts` pins one
 * preload per page, and web.dev's LCP guide (updated 2025-03-31, read 2026-10-02) puts the priority
 * hint on the image. `ProductPoster` also gives the failure state the cards have: a poster that
 * fails to load becomes the designed placeholder, not a broken icon over the hero.
 *
 * ⚠️ THE SIZE IS RESERVED BEFORE A BYTE ARRIVES: the frame is a 4:5 box (`aspect-ratio` in
 * site.css) and the `<img>` carries the width and height of the 1200 x 1500 renders, so nothing
 * moves when it lands. The alt text is the picture's own, never rewritten here. A product picture
 * takes the same resized card sizes as the cards (`cardImage`), the only ones the wear-run.com
 * firewall rule lets through; the site's own photo (`FAMILY_PHOTOS`) brings its widths.
 */
export function FamilyHeroPicture({ picture }: { picture: FamilyPicture }) {
  const image = picture.srcSet
    ? { src: picture.url, srcSet: picture.srcSet }
    : cardImage(picture.url)
  return (
    <div className="family-hero__picture">
      <span className="family-hero__frame">
        <ProductPoster
          src={image.src}
          srcSet={image.srcSet}
          sizes={image.srcSet ? HERO_PICTURE_SIZES : undefined}
          alt={picture.alt}
          index={0}
        />
      </span>
    </div>
  )
}
