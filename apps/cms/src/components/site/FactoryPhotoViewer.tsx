'use client'

import { Dialog } from '@base-ui/react/dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  counterText,
  indexFromScroll,
  photosToLoad,
  stepIndex,
  viewerTitle,
} from '../../lib/photoViewer'

/** One gallery photo as the viewer draws it; the page builds these from `factoryPhotos.ts`. */
export type ViewerPhoto = {
  readonly src: string
  readonly srcSet: string
  readonly width: number
  readonly height: number
  readonly alt: string
}

/**
 * The factory gallery's photo viewer (the about-factory build, 2026-10-09).
 *
 * ⚠️ THE GALLERY WORKS WITHOUT THIS. Each photo is a plain link to its largest file
 * (`a[data-gallery-index]`, FactoryPage.tsx), the site's rule for islands. Once this mounts it
 * listens for a press on those links and opens the same photo here instead. It does not wait
 * for motion: it is a control, not an animation, so it works under reduced motion and under
 * automation alike; only the strip's slide is instant under reduced motion.
 *
 * Built on base-ui's Dialog (docs/DECISION-UI-LIBRARIES.md), as the garment pages' HD picture is:
 * Escape, the focus trap and the page's scroll lock are base-ui's. ⚠️ NOT ALSO `holdPage`: the
 * site's smooth scroll already asks `pageHeld()`, which reads base-ui's own lock
 * (packages/shared/src/pageHold.ts), and a second lock that restores its own "before" can leave the
 * page held after the viewer closes. `e2e/aboutFactory.spec.ts` proves the page behind stays still.
 * ⚠️ base-ui 1.8.0 sets no `aria-modal`; the same spec proves Tab cannot leave the viewer and the
 * page behind is out of the accessibility tree.
 *
 * Swiping is the browser's own: the photos sit in a scroll-snap strip, so a finger moves them
 * before or without any script, and never fights the page's vertical scroll.
 */
export function FactoryPhotoViewer({ photos }: { photos: readonly ViewerPhoto[] }) {
  const count = photos.length
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  // State, not a ref: base-ui's Portal mounts the strip a render later (HdImageDialog.tsx says why).
  const [strip, setStrip] = useState<HTMLDivElement | null>(null)
  const startAt = useRef(0)

  useEffect(() => {
    const onPress = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[data-gallery-index]',
      )
      if (!link) return
      const at = Number(link.dataset.galleryIndex)
      if (!Number.isInteger(at) || at < 0 || at >= count) return
      event.preventDefault()
      opener.current = link
      startAt.current = at
      setIndex(at)
      setOpen(true)
    }
    document.addEventListener('click', onPress)
    return () => document.removeEventListener('click', onPress)
  }, [count])

  // Opened on a photo: put the strip there at once, without a slide.
  useEffect(() => {
    if (!strip) return
    strip.scrollTo({ left: startAt.current * strip.clientWidth, behavior: 'instant' })
  }, [strip])

  /*
   * ⚠️ THE PHOTO A SLIDE IS GOING TO. A key or button slides the strip smoothly, and the slide's
   * own scroll events read the photo it is passing: for half the slide the counter said the photo
   * being left ("3 / 8", "4 / 8", "3 / 8"), a second press in that moment stepped from the wrong
   * photo, and a screen reader heard the count bounce (PR #154's WebKit job, 2026-10-09). So the
   * scroll is ignored until the strip arrives — or until the visitor takes over with a finger, a
   * wheel or a pointer. Not `scrollend`: Baseline only since December 2025 (MDN), older iPhones lack it.
   */
  const heading = useRef<number | null>(null)

  const goTo = useCallback(
    (next: number) => {
      if (!strip) return
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const left = next * strip.clientWidth
      heading.current = Math.abs(strip.scrollLeft - left) < 2 ? null : next
      strip.scrollTo({ left, behavior: reduce ? 'instant' : 'smooth' })
      setIndex(next)
    },
    [strip],
  )

  const onScroll = () => {
    if (!strip) return
    if (heading.current !== null) {
      if (Math.abs(strip.scrollLeft - heading.current * strip.clientWidth) >= 2) return
      heading.current = null
    }
    setIndex(indexFromScroll(strip.scrollLeft, strip.clientWidth, count))
  }

  const takeOver = () => {
    heading.current = null
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(stepIndex(index, -1, count))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(stepIndex(index, 1, count))
    }
  }

  if (count === 0) return null
  const load = photosToLoad(index, count)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="photo-viewer__backdrop" />
        <Dialog.Popup
          className="photo-viewer"
          finalFocus={() => opener.current}
          onKeyDown={onKeyDown}
        >
          <div className="photo-viewer__bar">
            <Dialog.Title className="visually-hidden">{viewerTitle(index, count)}</Dialog.Title>
            <p className="photo-viewer__count" aria-live="polite">
              {counterText(index, count)}
            </p>
            <Dialog.Close className="photo-viewer__button" aria-label="Close the photo">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </Dialog.Close>
          </div>
          <Dialog.Description className="visually-hidden">
            Swipe, or use the left and right arrow keys or the buttons, to see the other photos.
          </Dialog.Description>
          {/* A scroll area a keyboard can reach and a screen reader can name (axe:
              scrollable-region-focusable, found with the viewer open, 2026-10-09). */}
          <div
            className="photo-viewer__strip"
            ref={setStrip}
            onScroll={onScroll}
            onPointerDown={takeOver}
            onTouchStart={takeOver}
            onWheel={takeOver}
            role="group"
            aria-label="Factory photos"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area must take focus so a keyboard can scroll it (WCAG 2.1.1)
            tabIndex={0}
          >
            {photos.map((photo, at) => (
              <div className="photo-viewer__slide" key={photo.src}>
                {load.has(at) ? (
                  // biome-ignore lint/performance/noImgElement: pre-built files picked by srcSet, as every factory photo (FactoryFigure.tsx says why)
                  <img
                    className="photo-viewer__img"
                    src={photo.src}
                    srcSet={photo.srcSet}
                    sizes="100vw"
                    width={photo.width}
                    height={photo.height}
                    alt={photo.alt}
                    decoding="async"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="photo-viewer__steps">
            <button
              type="button"
              className="photo-viewer__button"
              aria-label="Previous photo"
              onClick={() => goTo(stepIndex(index, -1, count))}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              type="button"
              className="photo-viewer__button"
              aria-label="Next photo"
              onClick={() => goTo(stepIndex(index, 1, count))}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
