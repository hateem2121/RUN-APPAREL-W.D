import Link from 'next/link'
import type { CompanyPage as CompanyContentType } from '../../lib/companyPages'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'

/**
 * The company pages' closing block: the site's one primary action, and "More about us".
 *
 * Careers and community each have their own layout since 2026-10-07 (`CareersPage.tsx`,
 * `CommunityPage.tsx`): the guides' heading-left, list-right sections this file used to draw for
 * them left half of every screen empty, which the owner turned down.
 *
 * ⚠️ "MORE ABOUT US" SITS IN THE RIGHT COLUMN, UNDER THE BUTTON. Under the whole block it was four
 * short links in the left corner with the rest of the row empty (measured 9% of a 1312px column at
 * 1440, 2026-10-07); beside the heading it finishes the column the button starts.
 */
export function CompanyClosing({ links }: { links: CompanyContentType['links'] }) {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container">
        <div className="section-head">
          <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
          <div className="section-head__words">
            <p className="site-lede">
              Send the styles, quantities and specs you have — a sketch is enough to start. We reply
              within 24 hours.
            </p>
            <div className="site-actions">
              <Link className="btn btn--primary" href="/contact#inquiry">
                {FAMILY_PAGE_ACTION}
              </Link>
            </div>
            <nav className="see-also company-closing__more" aria-label="More about us">
              <div className="see-also__group">
                <h3 className="product-card__name" id="more-about-us">
                  More about us
                </h3>
                <ul className="see-also__list">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </section>
  )
}
