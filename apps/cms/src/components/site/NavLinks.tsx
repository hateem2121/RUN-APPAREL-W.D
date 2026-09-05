'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The two navigation links, with the current one marked.
 *
 * ⚠️ THIS IS A CLIENT COMPONENT AND NAVIGATION STILL DOES NOT DEPEND ON JAVASCRIPT.
 * That combination is the whole design, so read this before "simplifying" either half.
 *
 * `usePathname` is a client hook, but a client component is still RENDERED ON THE
 * SERVER for the initial response — and these pages are dynamically rendered, so the
 * server knows the path. The `aria-current` attribute is therefore present in the
 * delivered HTML, correct, before any script runs. Verified by fetching the page with
 * `curl`, which executes nothing: `/products` comes back with
 * `aria-current="page"` on the Products link and no attribute on Contact.
 *
 * What ships to the browser is this component's code, not the site's navigability: the
 * links are ordinary `<a href>` elements in the HTML either way. Phase A removed a menu
 * whose OPEN STATE lived in React, which is a different thing entirely — that hid the
 * links behind `visibility: hidden` until hydration. Nothing here hides anything.
 *
 * ⚠️ DO NOT MOVE THIS BACK INTO SiteHeader. The header would become a client component,
 * and Next serialises every prop of one into the HTML — which is how the entire
 * `settings` global, `catalogueUrl` included, ended up in the page source on 2026-09-05.
 * Keeping the boundary here means the header still takes one string and passes nothing.
 *
 * WHY NOT MIDDLEWARE, the other server-side route to a pathname: it would run on every
 * request to this Worker, including `/admin` and `/api/*`, to decorate two links.
 */
const LINKS = [
  { href: '/products', label: 'Products' },
  { href: '/contact', label: 'Contact' },
] as const

export function NavLinks() {
  const pathname = usePathname()

  return (
    <>
      {LINKS.map(({ href, label }) => (
        <Link
          className="nav-link"
          key={href}
          href={href}
          // `page`, not `true` — the value names WHAT is current, and assistive
          // technology announces "current page" for it. `true` is the generic fallback
          // and reads as "current item" with no context.
          aria-current={pathname === href ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </>
  )
}
