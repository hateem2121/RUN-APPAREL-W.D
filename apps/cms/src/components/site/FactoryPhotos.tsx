import {
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  factoryPhotoSrc,
} from '../../lib/factoryPhotos'

/**
 * The factory strip's `sizes`, per tile shape, matching `.factory-grid` in site.css: two
 * columns below 900px, four from 900px, inside a content column that stops at 1180px. They
 * only steer which of the two widths a browser fetches, so they are close, not exact.
 */
const SIZES = {
  wide: '(min-width: 1180px) 540px, (min-width: 900px) 50vw, 100vw',
  single: '(min-width: 1180px) 270px, (min-width: 900px) 25vw, 50vw',
} as const

/**
 * "Inside the factory" (OI-3). A server component: no JavaScript ships for it.
 *
 * ⚠️ EVERY PICTURE IS LAZY AND SIZED. The strip sits four sections below the first screen,
 * so nothing here competes with the hero for first paint (RO-08's ceiling,
 * e2e/firstPaint.spec.ts), and each `<img>` carries the width and height of its 1× file so
 * the tile's space is reserved before a byte arrives — the home page failed Cumulative
 * Layout Shift once (FA-L-51), and `composition.spec.ts` fails any `<img>` without both.
 */
export function FactoryPhotos() {
  return (
    <ul className="factory-grid">
      {FACTORY_PHOTOS.map((photo) => {
        const [small, large] = FACTORY_PHOTO_WIDTHS[photo.shape]
        return (
          <li className={`factory-tile factory-tile--${photo.shape}`} key={photo.slug}>
            <figure className="factory-tile__figure">
              <img
                className="factory-tile__img"
                src={factoryPhotoSrc(photo, small)}
                srcSet={`${factoryPhotoSrc(photo, small)} ${small}w, ${factoryPhotoSrc(photo, large)} ${large}w`}
                sizes={SIZES[photo.shape]}
                width={small}
                height={Math.round(small / FACTORY_PHOTO_ASPECT[photo.shape])}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption className="factory-tile__caption">{photo.caption}</figcaption>
            </figure>
          </li>
        )
      })}
    </ul>
  )
}
