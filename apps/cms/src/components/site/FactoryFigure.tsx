import type { FactoryPhoto } from '../../lib/factoryPhotos'

/**
 * How wide a photo draws in half of the page's column (`.about`'s second half, site.css): the whole
 * column below 900 px, then `(column - a 64 px gap) / 2` in the page widths of polish D1
 * (2026-10-04): about 373-499 px to 1,279 (45vw - 32px, an over-ask past 1,180, where the page stops
 * at 1,180), `50vw - 96px` to 1,439, 624 px in the 1,312 px column and 704 px in the 1,472 px one
 * from 1,920. It was a flat 540 px, which asked a sharp 1,920 px screen for the 640 px file for a
 * 704 px picture.
 */
export const HALF_COLUMN_SIZES =
  '(max-width: 899px) 100vw, (max-width: 1279px) calc(45vw - 32px), ' +
  '(max-width: 1439px) calc(50vw - 96px), (max-width: 1919px) 624px, 704px'

/**
 * One factory photo placed inside a section (owner, 2026-09-29: "each section should have its
 * own media"). A server component: the picture is complete with scripting off, and the wipe and
 * drift of `.photo-wipe` / `.photo-parallax` in site.css are scroll-driven CSS that a browser
 * without them simply skips.
 *
 * ⚠️ LAZY AND SIZED, like every factory picture: none of these is on the first screen, and the
 * width and height reserve the space before a byte arrives (`composition.spec.ts` fails any
 * `<img>` without both).
 *
 * The frame takes the file's own shape (8:5 or 4:5). The order timeline's square frame went with
 * the timeline (polish D4, 2026-10-05): the order steps are photo cards now (`OrderSteps.tsx`).
 */
export function FactoryFigure({
  photo,
  src,
  srcSet,
  sizes,
  width,
  height,
}: {
  photo: FactoryPhoto
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
}) {
  return (
    <figure className="photo-figure">
      <span className={`photo-figure__frame photo-figure__frame--${photo.shape} photo-wipe`}>
        {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the two widths are pre-built files, picked by srcSet. */}
        <img
          className="photo-figure__img photo-parallax"
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          width={width}
          height={height}
          alt={photo.alt}
          loading="lazy"
          decoding="async"
        />
      </span>
      <figcaption className="photo-figure__caption">{photo.caption}</figcaption>
    </figure>
  )
}
