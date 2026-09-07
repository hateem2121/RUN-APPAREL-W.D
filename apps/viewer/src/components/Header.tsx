import { useState } from 'react'
import { SITE_ORIGIN } from '../lib/siteLinks'
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
        THE WORDMARK IS A LINK HOME AGAIN since 2026-09-07 — owner decision D5,
        `docs/DECISIONS-BETA-WEBSITE.md`. Two earlier answers were wrong and the
        third was right for a premise that has now expired; all four are recorded
        because each one reads as the obvious fix for the last.

        1. It linked to "/", which this SPA has no route for — the path parses to
           nothing and renders UnavailableState — so the most natural click on the
           page took a buyer from a working product to "This reference is no longer
           live". `viewer.spec.ts` still guards that exact regression.
        2. It was pointed at the catalogue, which fixed the dead end and made the
           logo a second, unlabelled link to a 54.3 MB B2B PDF.
        3. Owner decision 2026-09-04 removed it: no indexed page may hand arbitrary
           search traffic the catalogue, and a <span> was the honest answer while
           this viewer genuinely had no home to offer. `wear-run.help` served two
           PDFs and a 404 that day.
        4. It has one now. The marketing site launches on `wear-run.help` with
           `/products` indexing the same eleven garments this viewer serves. That
           is an ordinary web page, not the catalogue, so the 2026-09-04 decision
           does not reach it — see the docblock in `lib/siteLinks.ts`.

        Someone who scans a QR tag on a garment reached a page describing that one
        garment with no route to the other sixty-six (audit FA-W-01/FA-W-02).

        The destination is the ORIGIN, not `/products`: a wordmark is a home
        affordance, and every visitor here already has a garment in front of them.
        `UnavailableState` is the screen that needs the index, and links to it.
      */}
      <a className="header__wordmark" href={SITE_ORIGIN}>
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
