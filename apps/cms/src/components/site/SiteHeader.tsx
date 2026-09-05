'use client'

import type { ViewerSiteSettings } from '@run-apparel/shared'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/**
 * The notch — the public site's only navigation.
 *
 * WHY THIS IS A CLIENT COMPONENT AND WHAT THAT COSTS. Only the open/closed boolean
 * needs the browser. Every link is rendered on the server and is present in the HTML
 * whether the menu is open or shut — verified with `curl`, which runs no JavaScript —
 * so the crawlability this whole app exists for is untouched. What the client adds is
 * the small-screen disclosure: Escape to close, click-outside to close, and focus
 * returning to the button. Those are the parts a keyboard or screen-reader user
 * notices, and they are not free in CSS today.
 *
 * WHY NOT THE POPOVER API, which would give all three for nothing: a popover renders
 * in the top layer, so making it grow out of the notch needs CSS anchor positioning,
 * which is still Chromium-led in 2026. The alternative — a second copy of the links
 * inside the popover — puts every link in the page twice, which a screen reader reads
 * twice. One set of links, a few lines of state.
 *
 * Theme needs no script: tokens.css sets `color-scheme: light dark` and every colour
 * is `light-dark()`, so the notch is correct in both themes on first paint.
 */
export function SiteHeader({ settings }: { settings: ViewerSiteSettings }) {
  const [open, setOpen] = useState(false)
  const notchRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Send focus back to the control that opened it, or the keyboard user is
      // dropped at the top of the document with no idea where they are.
      toggleRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (notchRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <header className="notch-shell">
      <div className="notch" data-open={open} ref={notchRef}>
        <Link className="notch__wordmark" href="/" onClick={() => setOpen(false)}>
          {settings.temporaryWordmark}
        </Link>

        <button
          type="button"
          className="notch__toggle"
          ref={toggleRef}
          aria-expanded={open}
          aria-controls="notch-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>

        <div className="notch__panel">
          <nav className="notch__nav" id="notch-nav" aria-label="Main">
            <Link className="nav-link" href="/products" onClick={() => setOpen(false)}>
              Products
            </Link>
            <Link className="nav-link" href="/contact" onClick={() => setOpen(false)}>
              Contact
            </Link>
            <a
              className="btn btn--primary notch__cta"
              href={settings.catalogueUrl}
              rel="noopener"
              onClick={() => setOpen(false)}
            >
              Catalogue
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}

/* Inline SVG rather than an icon package: two glyphs do not justify a dependency,
   and apps/viewer already draws its own for the same reason. */
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
