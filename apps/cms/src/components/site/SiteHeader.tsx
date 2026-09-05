import Link from 'next/link'
import { NavLinks } from './NavLinks'

/**
 * The notch — the public site's only navigation.
 *
 * ⚠️ THIS IS A SERVER COMPONENT, AND KEEPING IT ONE IS THE WHOLE POINT.
 *
 * It used to be a client component: `useState` for an open/closed flag, `useEffect` for
 * Escape-to-close and click-outside, a `<button>` with `aria-expanded`, and a
 * `data-open` attribute driving a CSS disclosure. Every piece of that was correct in
 * isolation, and together they made phone navigation depend on JavaScript — measured
 * 2026-09-05 with scripting disabled at 390px: **0 of 2 links reachable**, and the same
 * for the second or two before hydration on a slow connection. Desktop never showed it,
 * because there the links sit in the bar rather than behind a button.
 *
 * Removing the Catalogue CTA left two short links, and two short links FIT — measured
 * at every width from 320px up (266px needed against 296px usable at the worst case).
 * So there is no button, no panel, no state, and nothing to hydrate. The failure mode
 * was deleted rather than patched.
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

        <nav className="notch__nav" aria-label="Main">
          <NavLinks />
        </nav>
      </div>
    </header>
  )
}
