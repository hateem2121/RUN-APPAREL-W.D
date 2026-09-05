import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The page a mistyped or retired URL lands on.
 *
 * ⚠️ IT MUST NOT BE INDEXABLE, AND THIS ROUTE ALWAYS EMITS **TWO** ROBOTS TAGS.
 * The layout sets `robots: { index: true }` for every page beneath it, which is right
 * for the three real ones and wrong for this: a 404 that invites indexing is how a "Page
 * not found" result ends up in Google under the company's name.
 *
 * Next adds its own `noindex` to a not-found route, on top of whatever the metadata
 * chain produces — so there are two tags either way and the only question is what the
 * SECOND one says. Measured in the rendered HTML:
 *
 *   with `robots` here      noindex        +  noindex, follow    <- both restrictive
 *   without it              noindex        +  index, follow      <- contradictory
 *
 * Dropping the override to avoid a duplicate therefore made it worse, not tidier: the
 * page inherited the layout's `index, follow` and told crawlers both things at once.
 * Google resolves a conflict by taking the most restrictive directive, so it would
 * probably have been fine — "probably" being the whole problem.
 *
 * `e2e/notfound.spec.ts` asserts that EVERY robots tag on this page is restrictive,
 * rather than asserting a count, because the count is not the thing that matters.
 *
 * ⚠️ AND IT MUST NOT BE IN THE SITEMAP — see `app/sitemap.ts`, which lists three pages.
 * A sitemap advertises pages that SHOULD be indexed; this is the opposite.
 *
 * WHAT IT OFFERS. A dead end with no way out is the actual failure here, not the 404
 * itself: a visitor who mistypes a garment slug from a printed QR tag has a real
 * intention, and the three routes below are the whole site. No search box, because there
 * is nothing to search across three pages — it would be a control that always disappoints.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <section className="site-hero">
      <div className="blueprint site-hero__grid" aria-hidden="true" />
      <div className="site-container">
        <p className="label">[ 404 · PAGE NOT FOUND ]</p>
        <h1 className="display display--hero">
          That page isn&rsquo;t here. <span className="serif-accent">The rest is.</span>
        </h1>
        <p className="site-lede">
          The address may have changed, or a character may have been mistyped. If you scanned a tag
          on a garment and reached this, the reference has moved — tell us and we will send the
          current link.
        </p>
        <div className="site-actions">
          <Link className="btn btn--primary" href="/products">
            Browse the references
          </Link>
          <Link className="btn btn--ghost" href="/contact">
            Tell us what you were looking for
          </Link>
        </div>
      </div>
    </section>
  )
}
