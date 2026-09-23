import { SITE_MENU_ID, SITE_MENU_NAME, SITE_NAV_LABEL } from '@run-apparel/shared'
import Link from 'next/link'
import { NavLinks } from './NavLinks'

/**
 * The menu bar — the public site's only navigation, and since Phase 1b-B the 3D viewer's too:
 * apps/viewer/src/components/Header.tsx renders the same markup, packages/ui/src/notch.css
 * styles both, and apps/cms/src/auditGuards.test.ts fails if either host restyles it.
 *
 * ⚠️ THIS IS A SERVER COMPONENT, AND KEEPING IT ONE IS THE WHOLE POINT.
 *
 * It used to be a client component: `useState` for an open/closed flag, `useEffect` for
 * Escape-to-close and click-outside, a `<button>` with `aria-expanded`, and a `data-open`
 * attribute driving a CSS disclosure. Every piece of that was correct in isolation, and
 * together they made phone navigation depend on JavaScript — measured 2026-09-05 with
 * scripting disabled at 390px: **0 of 2 links reachable**, and the same for the second or two
 * before hydration on a slow connection. It was deleted, and the two links fitted the bar.
 *
 * ⚠️ THE MENU CAME BACK AS THE BROWSER'S OWN POPOVER (owner decisions 2026-09-11 — "in future
 * we will add more pages" — and 2026-09-23, the Speed Lines icon). `popoverTarget` and
 * `popover="auto"` are plain attributes in this component's HTML, so the menu opens, closes
 * on a second tap, on Escape and on a tap outside with scripting OFF and before hydration,
 * and the browser reports it expanded or collapsed to assistive technology itself —
 * measured in Chromium, WebKit and Firefox on 2026-09-23, and in `e2e/navbar.spec.ts` on
 * every change. No aria-expanded is written here, and none may be. The list sits IMMEDIATELY
 * after its button: that makes it next in the Tab order, and notch.css reads the open state
 * through `:has(+ …)`.
 *
 * ONE LIST, TWO PRESENTATIONS. Below the phone boundary the list is a dropdown under the bar;
 * above it notch.css forces the same elements inline. There is never a second copy of the
 * links (`publicSite.test.ts` counts them).
 *
 * ⚠️ DO NOT REINTRODUCE `'use client'` HERE WITHOUT RE-MEASURING WHAT IT SHIPS. Next
 * serialises every prop of a client component into the HTML: when this took the whole
 * `settings` global it printed companyName, email, whatsappNumber, footerLine,
 * legalLine and catalogueUrl into all three pages, minutes after the owner had asked
 * for every catalogue reference removed. It renders one field, so it takes one field.
 * `publicSite.test.ts` pins both that signature and the absence of a client directive.
 *
 * Theme needs no script either: tokens.css sets `color-scheme: light dark` and every
 * colour is `light-dark()`, so the bar is correct in both themes on first paint.
 *
 * ⚠️ IF YOU EVER ADD A THEME TOGGLE HERE, READ THIS FIRST. Inspected the production
 * build 2026-09-05: lightningcss DOWNLEVELS `light-dark()` into
 * `var(--lightningcss-light,<a>) var(--lightningcss-dark,<b>)` plus two
 * `@media (prefers-color-scheme: …)` blocks that switch which half is live. That
 * polyfill keys off the MEDIA QUERY, not off computed `color-scheme` — so the
 * `:root[data-theme="dark"]` override in tokens.css, which works in dev against native
 * `light-dark()`, moves nothing in the built CSS. A toggle would appear to work locally
 * and do nothing in production. The viewer's toggle is unaffected: it is a different
 * build (Vite) with its own pipeline.
 */
export function SiteHeader({ wordmark }: { wordmark: string }) {
  return (
    <header className="notch-shell">
      <div className="notch">
        <Link className="notch__wordmark" href="/">
          {wordmark}
        </Link>

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
            <NavLinks />
          </div>
        </nav>
      </div>
    </header>
  )
}
