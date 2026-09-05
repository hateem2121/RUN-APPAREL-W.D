'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The flipped notch: a volt tab seated on the slab's top edge, carrying the one
 * action. Everywhere it links to /contact; ON /contact — where the visitor already is
 * what the tab would send them to — it links to the email instead (owner decision
 * 2026-09-05). Both are real links with the label in the HTML, so JavaScript-off and
 * crawlers see the same thing. Same `usePathname` pattern NavLinks uses for
 * `aria-current`; it resolves during SSR, so the href is in the markup.
 */
export function FooterTab({ label, email }: { label: string; email: string }) {
  const onContact = usePathname() === '/contact'
  const inner = (
    <>
      <span className="site-footer__tab-label">{label}</span>
      <span className="site-footer__tab-arrow" aria-hidden="true">
        →
      </span>
    </>
  )
  return onContact ? (
    <a className="site-footer__tab" href={`mailto:${email}`}>
      {inner}
    </a>
  ) : (
    <Link className="site-footer__tab" href="/contact">
      {inner}
    </Link>
  )
}
