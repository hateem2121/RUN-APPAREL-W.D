import { useState } from 'react'
import { track } from '../lib/analytics'
import { appliedTheme, toggleTheme, type Theme } from '../lib/theme'

interface HeaderProps {
  wordmark: string
  catalogueUrl: string
}

export function Header({ wordmark, catalogueUrl }: HeaderProps) {
  // Lazy init from the already-applied theme (client-only SPA) so the toggle
  // glyph is correct on first paint — no light→dark flash on dark systems.
  const [theme, setThemeState] = useState<Theme>(() => appliedTheme())

  const onToggle = () => {
    setThemeState(toggleTheme())
  }

  return (
    <header className="header">
      {/*
        The wordmark used to link to "/". This SPA has no route there — the path
        parses to nothing and renders UnavailableState — so clicking the logo took
        a buyer from a working product page to "This reference has moved forward."
        The catalogue is the only real "home" this viewer has.
      */}
      <a
        className="header__wordmark"
        href={catalogueUrl}
        aria-label={`${wordmark} — back to catalogue`}
        onClick={() => track('catalogue_clicked', { placement: 'wordmark' })}
      >
        {wordmark}
      </a>
      <span className="label header__tag">[ 3D PRODUCT REFERENCE ]</span>
      <span className="header__spacer" />
      <button
        type="button"
        className="theme-toggle"
        onClick={onToggle}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M20.3 14.6A8.5 8.5 0 0 1 9.4 3.7a8.5 8.5 0 1 0 10.9 10.9Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {/*
        Two spans, one visible at a time — see `.header__cta-*` in page.css.
        This label wrapped to TWO LINES at every phone width (measured 2026-08-14
        with a Range over the text node: line-boxes at y=25 and y=42, box 56.1px
        against the 40px declared), and still overflowed the document to 325px on
        a 320px viewport. It is the only navigation on the page and it sits above
        the garment, so a buyer met a broken-looking header before they met the
        product.

        The accessible name is deliberately unchanged at every width: the long
        form moves offscreen rather than unmounting, and the short form is
        aria-hidden. A screen reader always hears "Back to Catalogue".
      */}
      <a
        className="btn btn--ghost"
        href={catalogueUrl}
        onClick={() => track('catalogue_clicked', { placement: 'header' })}
      >
        <span className="header__cta-long">Back to Catalogue</span>
        <span className="header__cta-short" aria-hidden="true">
          Catalogue
        </span>
      </a>
    </header>
  )
}
