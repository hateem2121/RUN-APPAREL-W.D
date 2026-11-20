import {
  PRODUCT_FILM_SIZE,
  PRODUCT_FILM_TYPES,
  productFilmFor,
  productFilmUrl,
  type ViewerApiSuccess,
} from '@run-apparel/shared'
import { useEffect, useRef, useState } from 'react'
import { words } from '../lib/words'

/**
 * The product's 360° film, under its facts (owner, 2026-11-20: each soccer ball's film on its own
 * 3D page). Only products in `PRODUCT_FILMS` (packages/shared/src/productFilms.ts) have one.
 *
 * ⚠️ IT DOWNLOADS NOTHING UNTIL IT IS NEAR THE SCREEN. The page's first job is the 3D model,
 * 6-9 MB on a ball page; a 2 MB film fetched in parallel would slow the model it sits under.
 * `preload="none"` plus an IntersectionObserver: the sources are attached only when part of the
 * figure is on screen.
 *
 * ⚠️ IT PLAYS BY ITSELF ONLY WHERE THE PRODUCTS-PAGE FILM DOES (apps/cms/src/lib/productsFilm.ts →
 * `filmMayAutoplay`): never under reduced motion, on Data Saver, on a 2G connection, or under
 * automation. There the still shows and the button offers to play.
 *
 * ⚠️ IT HAS A PAUSE BUTTON, WHERE THE PRODUCTS-PAGE FILM HAS NONE. That film is decoration behind a
 * headline; this one is the product, ten seconds, looping, beside the page's other content — which
 * is exactly what WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide) asks a pause for (moving content that starts
 * automatically, lasts more than five seconds and is presented in parallel with other content).
 */

type Visit = {
  reducedMotion: boolean
  saveData: boolean
  effectiveType?: string
  webdriver: boolean
}

export function filmMayAutoplay(visit: Visit): boolean {
  if (visit.reducedMotion || visit.saveData || visit.webdriver) return false
  return visit.effectiveType !== 'slow-2g' && visit.effectiveType !== '2g'
}

function currentVisit(): Visit {
  const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection
  return {
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    saveData: Boolean(connection?.saveData),
    effectiveType: connection?.effectiveType,
    webdriver: Boolean(navigator.webdriver),
  }
}

export function ProductFilm({ data }: { data: ViewerApiSuccess }) {
  const film = productFilmFor(data.product.slug)
  const shown = film ? data.colourways.find((c) => c.slug === film.colourSlug) : undefined
  const figureRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const figure = figureRef.current
    if (!figure || near) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      // On screen, not "within a screen": the film sits just under the first screen, and a
      // one-screen margin fetched it on arrival in Chromium and Firefox (productFilm.spec.ts,
      // 2026-11-20), in parallel with the 3D model it sits under. The still covers the wait.
      { rootMargin: '0px' },
    )
    observer.observe(figure)
    return () => observer.disconnect()
  }, [near])

  useEffect(() => {
    const video = videoRef.current
    if (!near || !video) return
    video.load()
    if (filmMayAutoplay(currentVisit())) {
      // A refused play() (a browser policy) leaves the still and the Play button: nothing to report.
      video.play().catch(() => undefined)
    }
  }, [near])

  // A film for a colour this product no longer offers would caption itself with nothing: skip it.
  if (!film || !shown) return null

  const toggle = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => undefined)
    else video.pause()
  }

  const caption = words().filmCaption(data.product.productName, shown.displayName)

  return (
    <figure className="product-film" ref={figureRef}>
      <video
        ref={videoRef}
        className="product-film__video"
        width={PRODUCT_FILM_SIZE}
        height={PRODUCT_FILM_SIZE}
        poster={productFilmUrl(film.still)}
        muted
        loop
        playsInline
        preload="none"
        aria-label={caption}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {near && <source src={productFilmUrl(film.av1)} type={PRODUCT_FILM_TYPES.av1} />}
        {near && <source src={productFilmUrl(film.h264)} type={PRODUCT_FILM_TYPES.h264} />}
      </video>
      <figcaption className="product-film__caption">
        <span>{caption}</span>
        <button
          type="button"
          className="btn btn--ghost product-film__toggle"
          aria-pressed={playing}
          onClick={toggle}
        >
          {playing ? words().filmPause : words().filmPlay}
        </button>
      </figcaption>
    </figure>
  )
}
