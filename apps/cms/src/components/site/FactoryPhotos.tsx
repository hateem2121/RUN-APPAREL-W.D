import {
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  factoryPhotoSrc,
} from '../../lib/factoryPhotos'
import { FactoryLightbox } from './FactoryLightbox'

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
    <>
      <ul className="factory-grid">
        {FACTORY_PHOTOS.map((photo, index) => {
          const [small, large] = FACTORY_PHOTO_WIDTHS[photo.shape]
          return (
            <li className={`factory-tile factory-tile--${photo.shape}`} key={photo.slug}>
              <figure className="factory-tile__figure">
                {/*
                  A real link to the large file, so a tap opens the photo with scripting off;
                  `FactoryLightbox` turns the same tap into the swipeable gallery.
                */}
                <a
                  className="factory-tile__open"
                  href={factoryPhotoSrc(photo, large)}
                  data-index={index}
                >
                  <span className="factory-tile__frame photo-wipe">
                    {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the two widths are pre-built files, picked by srcSet. */}
                    <img
                      className="factory-tile__img photo-parallax"
                      src={factoryPhotoSrc(photo, small)}
                      srcSet={`${factoryPhotoSrc(photo, small)} ${small}w, ${factoryPhotoSrc(photo, large)} ${large}w`}
                      sizes={SIZES[photo.shape]}
                      width={small}
                      height={Math.round(small / FACTORY_PHOTO_ASPECT[photo.shape])}
                      alt={photo.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="visually-hidden"> — open larger</span>
                </a>
                <figcaption className="factory-tile__caption">{photo.caption}</figcaption>
              </figure>
            </li>
          )
        })}
      </ul>
      <FactoryLightbox />
    </>
  )
}
