'use client'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  FILM_FRAME,
  FILM_SOURCES,
  filmMayAutoplay,
  filmStillSrc,
  filmStillSrcSet,
} from '../../lib/productsFilm'

/**
 * The /products hero with the hoodie film behind its words (owner, 2026-10-01; files and rules in
 * `lib/productsFilm.ts`).
 *
 * ⚠️ THE STILL IS THE PAGE UNTIL THE FILM CAN PLAY. The server sends the hero with the film's first
 * frame as a picture, so with scripting off, under reduced motion, on Data Saver or before anything
 * loads, the hero is already complete. The `<video>` element only exists once the film is wanted,
 * the page has finished loading and the hero is on screen, so the 0.3–0.9 MB never competes with
 * the page's own first paint. The film's first frame IS the still, so the change is invisible.
 *
 * ⚠️ IT PAUSES WHEN NOBODY CAN SEE IT: scrolled off screen, or the tab hidden. A visitor's own
 * "Pause video" holds until they press "Play video" (WCAG 2.2 SC 2.2.2: moving content that lasts
 * more than five seconds needs a way to pause it). Reduced motion switched on mid-visit pauses it
 * at once, as the 3D garment pages do since VA-20.
 *
 * ⚠️ A REFUSED play() IS NORMAL: iPhone Low Power Mode and some autoplay settings refuse it. The page
 * then shows "Play video", which works because it is a tap. An `AbortError` only means a pause
 * arrived before play() settled (a quick scroll past), so it changes nothing.
 *
 * The hero's words are the server's own `children`, so they are complete HTML before any script.
 */
type Want = 'play' | 'pause'

export function ProductsFilmHero({ children }: { children: ReactNode }) {
  const heroRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // null until the script has run: then there is no button and no video, exactly as with scripting off.
  const [want, setWant] = useState<Want | null>(null)
  const [mounted, setMounted] = useState(false)
  const [tick, setTick] = useState(0)
  const seen = useRef({ loaded: false, onScreen: false })

  useEffect(() => {
    const connection = (
      navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    setWant(
      filmMayAutoplay({
        reducedMotion: reduced.matches,
        saveData: connection?.saveData === true,
        effectiveType: connection?.effectiveType,
        webdriver: navigator.webdriver === true,
      })
        ? 'play'
        : 'pause',
    )
    const onMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) setWant('pause')
    }
    reduced.addEventListener('change', onMotionChange)
    return () => reduced.removeEventListener('change', onMotionChange)
  }, [])

  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const recheck = () => setTick((count) => count + 1)
    const onLoad = () => {
      seen.current.loaded = true
      recheck()
    }
    if (document.readyState === 'complete') seen.current.loaded = true
    else window.addEventListener('load', onLoad, { once: true })
    const observer = new IntersectionObserver(([entry]) => {
      seen.current.onScreen = entry?.isIntersecting === true
      recheck()
    })
    observer.observe(hero)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('load', onLoad)
      observer.disconnect()
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the signal that the page loaded, scrolled or was hidden; the values it stands for live in `seen`.
  useEffect(() => {
    const { loaded, onScreen } = seen.current
    const playing = want === 'play' && loaded && onScreen && document.visibilityState === 'visible'
    if (playing && !mounted) {
      setMounted(true)
      return
    }
    const video = videoRef.current
    if (!video) return
    if (!playing) {
      video.pause()
      return
    }
    // Muted is what lets a browser start a film by itself; set as a property, before play().
    video.muted = true
    video.play().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== 'AbortError') setWant('pause')
    })
  }, [want, mounted, tick])

  const label = want === 'play' ? 'Pause video' : 'Play video'

  return (
    <section className="site-hero site-hero--photo site-hero--film" ref={heroRef}>
      <div className="site-hero__photo">
        <picture>
          <source type="image/avif" srcSet={filmStillSrcSet('avif')} sizes="100vw" />
          {/* A plain <img>: the still is pre-built at two widths, like the home hero's photo. */}
          <img
            className="site-hero__img site-hero__film"
            src={filmStillSrc(720, 'webp')}
            srcSet={filmStillSrcSet('webp')}
            sizes="100vw"
            width={FILM_FRAME.width}
            height={FILM_FRAME.height}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        {mounted ? (
          <video
            ref={videoRef}
            className="site-hero__img site-hero__film"
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            width={FILM_FRAME.width}
            height={FILM_FRAME.height}
          >
            {FILM_SOURCES.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>
        ) : null}
      </div>
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">{children}</div>
      {want ? (
        <button
          type="button"
          className="film-toggle"
          aria-label={label}
          onClick={() => setWant((current) => (current === 'play' ? 'pause' : 'play'))}
        >
          {want === 'play' ? (
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M4 2.5v11a.75.75 0 0 0 1.13.65l9.1-5.5a.75.75 0 0 0 0-1.3l-9.1-5.5A.75.75 0 0 0 4 2.5Z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      ) : null}
    </section>
  )
}
