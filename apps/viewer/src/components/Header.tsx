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
      <a className="header__wordmark" href="/" aria-label={`${wordmark} home`}>
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
      <a
        className="btn btn--ghost"
        href={catalogueUrl}
        onClick={() => track('catalogue_clicked', { placement: 'header' })}
      >
        Back to Catalogue
      </a>
    </header>
  )
}
