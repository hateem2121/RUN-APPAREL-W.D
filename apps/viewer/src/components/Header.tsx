import { useState } from 'react'
import { appliedTheme, toggleTheme, type Theme } from '../lib/theme'

interface HeaderProps {
  wordmark: string
}

export function Header({ wordmark }: HeaderProps) {
  // Lazy init from the already-applied theme (client-only SPA) so the toggle
  // glyph is correct on first paint — no light→dark flash on dark systems.
  const [theme, setThemeState] = useState<Theme>(() => appliedTheme())

  const onToggle = () => {
    setThemeState(toggleTheme())
  }

  return (
    <header className="header">
      {/*
        THE WORDMARK IS DELIBERATELY NOT A LINK, since 2026-09-04.

        Its history is worth keeping, because both previous answers were wrong in
        different ways. It first linked to "/", which this SPA has no route for —
        the path parses to nothing and renders UnavailableState — so clicking the
        logo took a buyer from a working product page to "This reference has moved
        forward." It was then pointed at the catalogue, which fixed that but made
        the logo a second, unlabelled catalogue link.

        Owner decision 2026-09-04: no page may hand a visitor the catalogue. These
        pages are indexed by Google, and the catalogue is a 54 MB B2B PDF that is
        not for arbitrary search traffic. That rules out the wordmark too — its
        visible text says "RUN APPAREL" but it navigated straight there, so it
        defeated the intent more quietly than the button did.

        A plain <span> is the honest answer: this viewer genuinely has no "home"
        to offer, and a logo that goes nowhere is better than one that goes
        somewhere wrong. The enquiry buttons are the intended next step.
      */}
      <span className="header__wordmark">{wordmark}</span>
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
        THE "BACK TO CATALOGUE" BUTTON WAS REMOVED HERE on 2026-09-04, by owner
        decision: search traffic must not be handed the catalogue directly.

        Two measured consequences worth knowing, because they make other comments
        in `page.css` stale rather than wrong:

        1. It freed 118px of header width (104px button + one 14px gap). The
           header's own arithmetic note recorded its children needing 351px of an
           available 343px at 375px wide, which is why it wrapped to two rows and
           stood 117px tall over the garment. That pressure is gone.
        2. `--header-h` carries TWO values (`tokens.css`) because below 360px this
           button wrapped. Re-measure before collapsing them to one — the number
           must be read off the live band, and every estimate in that comment's
           history has been wrong.

        The removed markup used two spans, one visible at a time, so the
        accessible name stayed "Back to Catalogue" at every width. If any
        catalogue affordance ever returns, that is the pattern to return to; do
        not reintroduce a bare responsive label that unmounts, which is what it
        replaced.
      */}
    </header>
  )
}
