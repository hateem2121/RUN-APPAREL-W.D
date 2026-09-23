'use client'

import { THEME_SWITCH_NAMES } from '@run-apparel/shared'
import { useEffect, useState } from 'react'
import { THEME_STORAGE_KEY } from '../../lib/themeBoot'
import { THEME_COLOR } from '../../lib/themeColor'

type Theme = 'light' | 'dark'

/** The phone's browser-bar colour per theme: the pinned copy of --bg the meta tags carry. */
const BAR_COLOUR: Record<Theme, string> = {
  light: THEME_COLOR.find((entry) => entry.media.includes('light'))?.color ?? '',
  dark: THEME_COLOR.find((entry) => entry.media.includes('dark'))?.color ?? '',
}

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function appliedTheme(): Theme {
  return (
    storedTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )
}

/** `media` follows the OS and cannot see `data-theme`, so an explicit choice repoints them. */
function paintBrowserBar(theme: Theme) {
  for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
    tag.setAttribute('content', BAR_COLOUR[theme])
    tag.removeAttribute('media')
  }
}

function setTheme(theme: Theme) {
  const apply = () => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* storage unavailable — the attribute still applies for this visit */
    }
    paintBrowserBar(theme)
  }
  // The viewer's cross-fade (apps/viewer/src/lib/theme.ts, and why `ready` is caught there).
  type ViewTransitionLike = { ready?: Promise<unknown> }
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => ViewTransitionLike | undefined
  }
  if (
    typeof doc.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    void doc.startViewTransition(apply)?.ready?.catch(() => {})
  } else {
    apply()
  }
}

/**
 * The light/dark switch, in the bar — owner decision 2026-09-17 ("the theme switch sits
 * INSIDE the bar"; on phones, inside the menu). The viewer's switch, brought to the site.
 *
 * ⚠️ ITS NAME AND ICON ARE CHOSEN BY CSS, NOT BY STATE. Both faces are always rendered, and
 * packages/ui/src/notch.css shows the one matching the page's theme (`data-theme`, else the
 * phone's), so the server-rendered button is named and drawn correctly before any script
 * runs, and hydration never disagrees with it. Only the hover tooltip waits for the script.
 *
 * ⚠️ IT WRITES STORAGE ONLY WHEN PRESSED. A plain visit leaves nothing on the device
 * (e2e/headers.spec.ts); lib/themeBoot.ts only reads.
 */
export function ThemeSwitch() {
  const [title, setTitle] = useState<string | undefined>(undefined)

  useEffect(() => {
    const theme = appliedTheme()
    setTitle(theme === 'dark' ? THEME_SWITCH_NAMES.toLight : THEME_SWITCH_NAMES.toDark)
    // A returning visitor's choice reaches the phone's browser bar too.
    if (storedTheme()) paintBrowserBar(theme)
  }, [])

  const onClick = () => {
    const next: Theme = appliedTheme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setTitle(next === 'dark' ? THEME_SWITCH_NAMES.toLight : THEME_SWITCH_NAMES.toDark)
  }

  return (
    <button type="button" className="theme-toggle" title={title} onClick={onClick}>
      <span className="theme-toggle__face theme-toggle__face--to-dark">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20.3 14.6A8.5 8.5 0 0 1 9.4 3.7a8.5 8.5 0 1 0 10.9 10.9Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <span className="visually-hidden">{THEME_SWITCH_NAMES.toDark}</span>
      </span>
      <span className="theme-toggle__face theme-toggle__face--to-light">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="visually-hidden">{THEME_SWITCH_NAMES.toLight}</span>
      </span>
    </button>
  )
}
