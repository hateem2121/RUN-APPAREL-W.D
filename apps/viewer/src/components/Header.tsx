import {
  SITE_MENU_ID,
  SITE_MENU_NAME,
  SITE_NAV_LABEL,
  SITE_NAV_LINKS,
  THEME_SWITCH_NAMES,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'
import { SITE_ORIGIN } from '../lib/siteLinks'
import { appliedTheme, type Theme, toggleTheme } from '../lib/theme'

interface HeaderProps {
  wordmark: string
}

/**
 * The website's menu bar, in the viewer — owner decisions 2026-09-11 (a menu button on
 * phones), 2026-09-17 ("Same menu bars everywhere. The one I prefer is at wear-run.help";
 * V1: the switch inside the bar, the label on its own line under it) and 2026-09-23 (the
 * Speed Lines icon, named "Menu").
 *
 * THE SAME MARKUP AS THE SITE'S apps/cms/src/components/site/SiteHeader.tsx, styled by the
 * same packages/ui/src/notch.css; the words come from packages/shared/src/siteBar.ts.
 * apps/cms/src/auditGuards.test.ts checks both headers carry the same markers, and both
 * browser suites hold the rendered bar to one accessibility tree. Two differences, both
 * deliberate: the links go to the site's origin, and the switch keeps this app's own
 * behaviour (lib/theme.ts: the stored choice, the view-transition cross-fade).
 *
 * ⚠️ THE MENU IS THE BROWSER'S OWN POPOVER. `popoverTarget` + `popover="auto"`: Escape and a
 * tap outside close it, and the browser reports it expanded or collapsed. No aria-expanded
 * is written here, and none may be.
 *
 * ⚠️ IN THE PAGE FLOW. page.css makes this bar sticky (the site fixes its own), so the stage
 * band starts where the bar and the label row under it end, and --header-h is that measured start.
 */
export function Header({ wordmark }: HeaderProps) {
  // Lazy init from the already-applied theme (client-only SPA), so the tooltip is right on
  // first paint. The NAME and the ICON are chosen by CSS (notch.css), not by this state.
  const [theme, setThemeState] = useState<Theme>(() => appliedTheme())

  /*
   * ⚠️ A MENU LEFT OPEN WHILE THE SCREEN WIDENS DRAWS AT THE TOP-LEFT CORNER (measured
   * 2026-09-23 in three engines): the popover stays in the top layer while notch.css lays the
   * list inline. When the button stops being displayed — a phone rotated, a window widened —
   * the phone layout has ended, so close it. Same as the site's NavLinks.tsx.
   */
  useEffect(() => {
    const menu = document.getElementById(SITE_MENU_ID)
    const button = document.querySelector<HTMLElement>(`[popovertarget="${SITE_MENU_ID}"]`)
    if (!menu || !button || typeof menu.hidePopover !== 'function') return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (button.getClientRects().length === 0 && menu.matches(':popover-open')) {
        menu.hidePopover()
      }
    })
    observer.observe(button)
    return () => observer.disconnect()
  }, [])

  const title = theme === 'dark' ? THEME_SWITCH_NAMES.toLight : THEME_SWITCH_NAMES.toDark

  return (
    <header className="notch-shell">
      <div className="notch">
        {/*
          THE WORDMARK IS A LINK HOME since 2026-09-07 — owner decision D5,
          `docs/DECISIONS-BETA-WEBSITE.md`. It once linked to "/", which this SPA has no route
          for (a buyer went from a working garment to "This reference is no longer live");
          then to the 54 MB catalogue PDF; then it was a <span> while the site had no pages.
          The destination is the site's ORIGIN: a wordmark is a home affordance, and every
          visitor here already has a garment in front of them. `viewer.spec.ts` guards it.
        */}
        <a className="notch__wordmark" href={SITE_ORIGIN}>
          {wordmark}
        </a>
        <nav className="notch__nav" aria-label={SITE_NAV_LABEL}>
          <button type="button" className="notch__menu-btn" popoverTarget={SITE_MENU_ID}>
            <span className="notch__icon" aria-hidden="true">
              <span className="notch__icon-line" />
              <span className="notch__icon-line" />
              <span className="notch__icon-line" />
            </span>
            <span className="visually-hidden">{SITE_MENU_NAME}</span>
          </button>
          <div className="notch__menu" id={SITE_MENU_ID} popover="auto">
            {SITE_NAV_LINKS.map(({ href, label }) => (
              <a className="nav-link" key={href} href={`${SITE_ORIGIN}${href}`}>
                {label}
              </a>
            ))}
            <button
              type="button"
              className="theme-toggle"
              title={title}
              onClick={() => setThemeState(toggleTheme())}
            >
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
          </div>
        </nav>
      </div>
    </header>
  )
}
