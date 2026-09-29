'use client'

import { useEffect, useRef, useState } from 'react'
import { type PosterLoading, posterLoading } from '../../lib/posterLoading'

/**
 * A gallery poster that degrades to the designed placeholder when it fails to load.
 *
 * WHY THIS EXISTS. The card already showed `[ 3D reference ]` when a garment had NO
 * poster — but a poster that exists and fails to load took a different path with no
 * treatment at all. Measured 2026-09-05: the alt text sprawled across an empty card as
 * left-aligned serif prose and read as a broken page. This domain has served CACHED
 * media errors for up to 30 days (the cached-404 trap in CLAUDE.md), so a poster that
 * 404s is a documented event here, not a hypothetical.
 *
 * ⚠️ THIS IS THE SECOND OF TWO LAYERS, AND THE CSS ONE IS NOT REDUNDANT.
 * `site.css` styles a broken image's alt text so the degraded state looks deliberate
 * with no JavaScript at all — including in the window before this component hydrates.
 * That layer alone cannot finish the job: measured across three engines, Firefox
 * applies the FONT to alt text but ignores `text-align` and `text-transform`, and none
 * of the three vertically centres it. `getComputedStyle` reported `text-align: center`
 * in Firefox regardless — the computed value was not the rendered one, which is only
 * visible in a screenshot.
 *
 * So: CSS makes the failure tidy everywhere, and this makes it identical to the
 * designed placeholder wherever scripting is available.
 *
 * Props are two strings already present in the HTML, so nothing new is serialised into
 * the page — the concern that made SiteHeader take a wordmark rather than the settings
 * global does not arise here.
 */
export function ProductPoster({
  src,
  alt,
  index,
  srcSet,
  sizes,
}: {
  src: string
  alt: string
  /** The card's position in the gallery. Omitted means off the first screen: lazy. */
  index?: number
  /** Card-sized copies to choose between (`lib/cardImage.ts`); absent, the one file serves all. */
  srcSet?: string
  sizes?: string
}) {
  const { loading, fetchPriority } =
    index === undefined ? ({ loading: 'lazy' } as PosterLoading) : posterLoading(index)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  /*
   * ⚠️ `onError` ALONE DOES NOT WORK HERE, AND IT LOOKS LIKE IT SHOULD.
   *
   * The markup is server-rendered, so the browser starts fetching the poster while the
   * HTML is still parsing. A poster that 404s therefore fires its `error` event BEFORE
   * React hydrates and attaches the handler — the listener arrives after the event it
   * was waiting for. Measured 2026-09-05 against a forced 404: the image was broken
   * (`complete: true`, `naturalWidth: 0`), React had hydrated (`__react` props present
   * on the element), and the swap never happened.
   *
   * So the already-failed case is detected on mount instead, and `onError` is kept for
   * posters that fail later — a lazy one scrolled into view, or a connection that drops
   * mid-request. Both paths are needed; neither is sufficient.
   *
   * `complete && naturalWidth === 0` is the only reliable "this failed" signal. A lazy
   * image that has not started loading reports `complete: false`, so it cannot be
   * mistaken for a failure.
   */
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) {
    return <span className="product-card__placeholder">[ 3D reference ]</span>
  }

  /*
   * A plain <img>, not next/image. apps/cms runs on Workers without `sharp`, so the
   * optimiser cannot resize anything — next/image would add a proxy hop and ship the
   * identical bytes. `posterLoading()` keeps all but the first row off the critical path; the
   * aspect-ratio box on the figure means no layout shift while they arrive.
   *
   * `srcSet`/`sizes` come from `lib/cardImage.ts` for pictures on media.wear-run.com, which
   * Cloudflare resizes at the edge (owner, 2026-09-29). Until then this said "no srcset":
   * the pipeline emits one 1200x1500 file, and a second size meant a pipeline change or
   * paid resizing. Two things changed that: since PR #80 the cards show 365–791 KB studio
   * renders, which took /products to 0.67 on a phone, and Cloudflare's free image plan
   * (5,000 resizes a month, failing rather than billing past it) covers this page. Any
   * other address — the admin's host, a local build — keeps the single file.
   */
  const img = (
    // biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize — Cloudflare's edge does (lib/cardImage.ts). See above.
    <img
      className="product-card__img"
      ref={ref}
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      width={1200}
      height={1500}
      onError={() => setFailed(true)}
    />
  )
  /*
   * ⚠️ A RESIZED PICTURE SITS IN A <picture>, BECAUSE REACT WOULD OTHERWISE PRELOAD IT. React 19
   * adds a `<link rel="preload" as="image">` for every non-lazy <img> with a srcSet that is not
   * inside a <picture> — one per eager card on /products (3 on the live catalogue, 2 on CI's),
   * competing on a phone with the one picture on screen, which the browser finds in the page at
   * once anyway. CI's preload budget caught it (e2e/perfBudgets.spec.ts). `display: contents`
   * keeps the layout exactly as it was.
   */
  return srcSet ? <picture className="product-card__picture">{img}</picture> : img
}
