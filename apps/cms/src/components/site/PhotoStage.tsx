import type { CSSProperties, ReactNode } from 'react'
import { type WholePhoto, wholePhotoImage } from '../../lib/factoryPhotos'

/**
 * A photograph as the whole background of its screen, shown WHOLE (owner, 2026-11-05: "I do not
 * want the images to be cut", and "the image takes the whole background"), after what the most
 * liked Awwwards sites do: Lando Norris, Site of the Year 2025, opens on a whole portrait and lets
 * type pass over it; Scout Motors fills the screen with one picture and sets the headline
 * bottom-left on it (both opened and looked at 2026-11-05).
 *
 * ⚠️ NOTHING IS CUT: the `<img>` is `object-fit: contain`, so whatever the screen's shape, the
 * picture is entirely visible. What a whole picture leaves over (the sides of a tall one, the bars
 * above and below a wide one) is filled by a blurred, darkened copy of the SAME picture
 * (`.photo-stage__ext`, a CSS background of the smallest file, which the srcset usually holds
 * already), so the screen is still all picture, not letterbox bars. Below 900 px the stage takes
 * the picture's own shape instead, so a phone shows it edge to edge with nothing left over.
 *
 * ⚠️ WORDS SIT ON AN INK PANEL, NOT BARE ON THE PICTURE (`.photo-stage__copy`), as the photo hero's
 * wash is at least 80% ink: axe cannot compute contrast over an image, so the arithmetic is the
 * check (site.css, "the photo hero"). A portrait has no words, only a decorative year.
 *
 * ⚠️ LAZY AND SIZED: a stage is far below a page's first screen. The width and height attributes
 * reserve its space before a byte arrives (`composition.spec.ts` fails an `<img>` without both).
 * A server component: complete with scripting off, no motion.
 */
export function PhotoStage({
  photo,
  children,
  copy = 'panel',
}: {
  photo: WholePhoto
  children?: ReactNode
  /** `panel`: words on an ink panel. `year`: only a decorative, hidden-from-readers year. */
  copy?: 'panel' | 'year'
}) {
  const image = wholePhotoImage(photo)
  const [ow, oh] = photo.ratio
  const tall = oh > ow
  return (
    <div
      className={`photo-stage photo-stage--${tall ? 'tall' : 'wide'}`}
      style={{ '--stage-ratio': `${ow} / ${oh}` } as CSSProperties}
    >
      <span
        className="photo-stage__ext"
        aria-hidden="true"
        style={{ backgroundImage: `url(${image.src})` }}
      />
      {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize; the widths are pre-built files, picked by srcSet. */}
      <img
        className="photo-stage__img"
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.sizes}
        width={image.width}
        height={image.height}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
      />
      {children ? (
        <div
          className={copy === 'year' ? 'photo-stage__year' : 'photo-stage__copy'}
          aria-hidden={copy === 'year' ? 'true' : undefined}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
