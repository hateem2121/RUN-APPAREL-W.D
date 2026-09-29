'use client'

import { Dialog } from '@base-ui/react/dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  factoryPhotoSrc,
} from '../../lib/factoryPhotos'

/**
 * The factory gallery, large (owner, 2026-09-29: the photos should feel dynamic — "tap to
 * enlarge, swipe through").
 *
 * ⚠️ IT ENHANCES LINKS THAT ALREADY WORK. Each tile in `FactoryPhotos` is an `<a>` to its large
 * file, so with scripting off a tap opens the photo itself. This island listens for those taps
 * on the gallery (one delegated listener) and opens the same photo here instead.
 *
 * ⚠️ `base-ui`'s Dialog, NOT A HAND-ROLLED ONE (`docs/DECISION-UI-LIBRARIES.md`): focus is held
 * inside, Escape and a tap on the backdrop close it, the page behind is inert, and a screen
 * reader hears a dialog with a name. `finalFocus` returns focus to the tile that opened it.
 *
 * The strip is a native scroll-snap row, so a finger swipes it, a trackpad scrolls it and the
 * arrow keys (handled here) step it — the same choice `CardGallery` made, for the same reason:
 * no gesture handler to fight the browser.
 */
export function FactoryLightbox() {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  const strip = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    const grid = document.querySelector('.factory-grid')
    if (!grid) return
    const onClick = (event: Event) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        '.factory-tile__open',
      )
      if (!link) return
      const at = Number(link.dataset.index)
      if (!Number.isInteger(at)) return
      event.preventDefault()
      opener.current = link
      setIndex(at)
      setOpen(true)
    }
    grid.addEventListener('click', onClick)
    return () => grid.removeEventListener('click', onClick)
  }, [])

  const show = useCallback((at: number, animate: boolean) => {
    const smooth = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches
    const count = FACTORY_PHOTOS.length
    const next = (at + count) % count
    setIndex(next)
    const slide = strip.current?.children[next] as HTMLElement | undefined
    slide?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
      inline: 'center',
      block: 'nearest',
    })
  }, [])

  // Land on the tapped photo the moment the strip exists.
  const onOpenComplete = useCallback(
    (isOpen: boolean) => {
      if (isOpen) show(index, false)
    },
    [index, show],
  )

  // Keep the counter honest when the visitor swipes rather than presses a button.
  const onScroll = useCallback(() => {
    const row = strip.current
    if (!row || row.clientWidth === 0) return
    setIndex(Math.round(row.scrollLeft / row.clientWidth))
  }, [])

  const photo = FACTORY_PHOTOS[index]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={onOpenComplete}>
      <Dialog.Portal>
        <Dialog.Backdrop className="lightbox__backdrop" />
        <Dialog.Popup
          className="lightbox"
          finalFocus={opener}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') show(index + 1, true)
            if (event.key === 'ArrowLeft') show(index - 1, true)
          }}
        >
          <Dialog.Title className="visually-hidden">Inside the factory</Dialog.Title>
          {/*
            Focusable, and named: a region that scrolls must be reachable by keyboard (axe
            `scrollable-region-focusable`, the rule `CardGallery` met too). Once focused, the
            arrow keys scroll it natively and the dialog's handler steps the counter.
          */}
          <ul
            className="lightbox__strip"
            ref={strip}
            onScroll={onScroll}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll region must take focus, see above.
            tabIndex={0}
            aria-label="Factory photos — swipe or use the arrow keys"
          >
            {FACTORY_PHOTOS.map((entry, at) => {
              const large = FACTORY_PHOTO_WIDTHS[entry.shape][1]
              return (
                <li className="lightbox__slide" key={entry.slug} aria-hidden={at !== index}>
                  <figure className="lightbox__figure">
                    {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why). */}
                    <img
                      className="lightbox__img"
                      src={factoryPhotoSrc(entry, large)}
                      width={large}
                      height={Math.round(large / FACTORY_PHOTO_ASPECT[entry.shape])}
                      alt={entry.alt}
                      loading={Math.abs(at - index) <= 1 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                    <figcaption className="lightbox__caption">{entry.caption}</figcaption>
                  </figure>
                </li>
              )
            })}
          </ul>
          <div className="lightbox__bar">
            <button
              type="button"
              className="btn btn--ghost lightbox__step"
              onClick={() => show(index - 1, true)}
            >
              ← Previous
            </button>
            <p className="lightbox__count" aria-live="polite">
              {index + 1} / {FACTORY_PHOTOS.length}
              <span className="visually-hidden"> — {photo?.caption}</span>
            </p>
            <button
              type="button"
              className="btn btn--ghost lightbox__step"
              onClick={() => show(index + 1, true)}
            >
              Next →
            </button>
            <Dialog.Close className="btn btn--ghost lightbox__close">Close</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
