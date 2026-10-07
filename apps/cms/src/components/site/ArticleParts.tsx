import Link from 'next/link'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'
import type { PublicImage } from '../../lib/journalPublic'

/**
 * Pieces the Journal and the case studies share (PLAN.md E4). Every sentence here is one the
 * site already says: the closing block is `GuidePage.tsx`'s and the home page's №06, word for
 * word, and its one primary button is the buyer pages' (`e2e/copy.spec.ts`, CT-08).
 */

/** The site's closing block: "Tell us what you're making." and its one primary button. */
export function SiteClosing() {
  return (
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
      </div>
    </div>
  )
}

/** A group of links under its own heading, drawn as the guides draw theirs (44px rows). */
export function LinkList({
  id,
  title,
  links,
  plain = false,
}: {
  id: string
  title: string
  links: ReadonlyArray<{ href: string; name: string }>
  /**
   * Plain anchors, for the garment pages: the viewer Worker draws them, not Next, so Next's
   * client navigation and prefetch have nothing to load there (`CardGallery.tsx` links the same
   * way).
   */
  plain?: boolean
}) {
  if (links.length === 0) return null
  return (
    <nav className="see-also" aria-labelledby={id}>
      <div className="see-also__group">
        <h2 className="product-card__name" id={id}>
          {title}
        </h2>
        <ul className="see-also__list">
          {links.map((link) => (
            <li key={link.href}>
              {plain ? (
                <a href={link.href}>{link.name}</a>
              ) : (
                <Link href={link.href}>{link.name}</Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

/**
 * A CMS picture. Width and height always (no layout shift); lazy unless it is the page's
 * largest paint. ⚠️ AN EAGER ONE GOES INSIDE `<picture>`: React 19 adds a preload for a bare
 * eager `<img>`, and `e2e/perfBudgets.spec.ts` allows one hint per page (contact/page.tsx).
 */
export function ArticleImage({
  image,
  className,
  sizes,
  eager = false,
}: {
  image: PublicImage
  className: string
  sizes: string
  eager?: boolean
}) {
  const img = (
    <img
      className={className}
      src={image.url}
      width={image.width}
      height={image.height}
      alt={image.alt}
      sizes={sizes}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
    />
  )
  return eager ? <picture>{img}</picture> : img
}
