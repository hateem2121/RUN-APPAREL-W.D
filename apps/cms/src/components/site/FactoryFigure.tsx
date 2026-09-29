import type { FactoryPhoto } from '../../lib/factoryPhotos'

/**
 * One factory photo placed inside a section (owner, 2026-09-29: "each section should have its
 * own media"). A server component: the picture is complete with scripting off, and the wipe and
 * drift of `.photo-wipe` / `.photo-parallax` in site.css are scroll-driven CSS that a browser
 * without them simply skips.
 *
 * ⚠️ LAZY AND SIZED, like every factory picture: none of these is on the first screen, and the
 * width and height reserve the space before a byte arrives (`composition.spec.ts` fails any
 * `<img>` without both).
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
