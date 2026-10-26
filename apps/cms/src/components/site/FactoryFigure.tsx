import type { FactoryPhoto } from '../../lib/factoryPhotos'

/**
 * How wide a photo draws in half of the page's column (`.about`'s second half, site.css): the whole
 * column below 900 px, then `(column - a 64 px gap) / 2` in the page widths of polish D1
 * (2026-10-04): about 373-499 px to 1,279 (45vw - 32px, an over-ask past 1,180, where the page stops
 * at 1,180), `50vw - 96px` to 1,439, 624 px in the 1,312 px column and 704 px in the 1,472 px one
 * from 1,920. It was a flat 540 px, which asked a sharp 1,920 px screen for the 640 px file for a
 * 704 px picture.
 *
 * Below 900 px the column is the screen less two gutters (20 px to 399 px, then 5vw rounded to 2 px),
 * written as the order steps write it (`ORDER_STEP_SIZES`). It said `100vw` until polish X16
 * (2026-10-05), 86 px too wide at 834 px: a 2x tablet asked for 1,668 px to draw 748, more than
 * the widest file.
 */
export const HALF_COLUMN_SIZES =
  '(max-width: 399px) calc(100vw - 40px), (max-width: 899px) calc(90vw + 2px), ' +
  '(max-width: 1279px) calc(45vw - 32px), (max-width: 1439px) calc(50vw - 96px), ' +
  '(max-width: 1919px) 624px, 704px'

/**
 * How wide a photo draws across the whole column, in the same page widths: the column itself below
 * 900 px as above, then 90vw to 1,279 (the page's 5vw gutters), `100vw - 128px` to 1,439, and the
 * 1,312 / 1,472 px columns. The factory gallery's closing photo (2026-10-26) draws this wide, and
 * offers its `fullWidths` files for it (lib/factoryPhotos.ts).
 */
export const FULL_COLUMN_SIZES =
  '(max-width: 399px) calc(100vw - 40px), (max-width: 899px) calc(90vw + 2px), ' +
  '(max-width: 1279px) 90vw, (max-width: 1439px) calc(100vw - 128px), ' +
  '(max-width: 1919px) 1312px, 1472px'

/**
 * One factory photo placed inside a section (owner, 2026-09-29: "each section should have its
 * own media"). A server component: the picture is complete with scripting off, and the wipe and
 * drift of `.photo-wipe` / `.photo-parallax` in site.css are scroll-driven CSS that a browser
 * without them simply skips.
 *
 * ⚠️ LAZY EVERYWHERE EXCEPT A PAGE'S FIRST-SCREEN FIGURE, AND ALWAYS SIZED. A factory picture is
 * lazy: most sit far down a page. The one exception is `priority`, for the single figure a page
 * draws in its first spread (a guide's first section, `GuidePage.tsx`), which a visitor sees
 * without scrolling and which can be the page's largest paint: it loads `eager` with
 * `fetchPriority="high"`. web.dev "Optimize Largest Contentful Paint" (updated 31 Mar 2025):
 * "Never lazy-load your LCP image", and put `fetchpriority="high"` on that ONE image only, since
 * a second high-priority image takes bandwidth from the first. So a page passes `priority` to at
 * most one figure (`GuidePage.test.ts` fails a second). The width and height reserve the space
 * before a byte arrives (`composition.spec.ts` fails any `<img>` without both), eager or lazy.
 *
 * NO LABEL UNDER THE PHOTO (the owner, 2026-10-05: "remove all the image names"). Each one said
 * which room it was (`caption` in lib/factoryPhotos.ts, kept there); the picture's `alt` still
 * describes it to a screen reader.
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
  priority = false,
}: {
  photo: FactoryPhoto
  src: string
  srcSet: string
  sizes: string
  width: number
  height: number
  /** The page's one first-screen figure: eager and high priority, not lazy. Default: lazy. */
  priority?: boolean
}) {
  return (
    <figure className="photo-figure">
      <span className={`photo-figure__frame photo-figure__frame--${photo.shape} photo-wipe`}>
        {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the widths are pre-built files, picked by srcSet. */}
        <img
          className="photo-figure__img photo-parallax"
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          width={width}
          height={height}
          alt={photo.alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
        />
      </span>
    </figure>
  )
}
