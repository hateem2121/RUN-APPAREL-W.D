import Link from 'next/link'
import type { Family } from '../../lib/families'
import { aboutLabel, familyGalleryHref, familyPageFor, seeAllLabel } from '../../lib/familyPages'

/**
 * The two links that join a family's buyer page and its filtered gallery (visual audit VA-33,
 * owner's choice 2026-10-01, words approved 2026-10-02). A buyer who met "Outerwear" on the home
 * page landed on the buyer page; one who met it on /products got a filtered grid. Each page now
 * names the other, in the words `lib/familyPages.ts` builds from the family's own name.
 *
 * Both are the site's existing ghost button, never the primary one: a page keeps one primary
 * action per screen (`e2e/copy.spec.ts`, CT-08), and these are ways across, not the way in.
 */

/** On a buyer page: the same garments in the gallery, with the other families beside them. */
export function SeeAllInGallery({ family }: { family: Family }) {
  return (
    <div className="site-actions">
      <Link className="btn btn--ghost" href={familyGalleryHref(family)}>
        {seeAllLabel(family)}
      </Link>
    </div>
  )
}

/** On the filtered gallery: back to the family's buyer page — and nothing for a family without one. */
export function AboutFamily({ family }: { family: Family }) {
  const page = familyPageFor(family)
  if (!page) return null
  return (
    <Link className="btn btn--ghost" href={page.path}>
      {aboutLabel(family)}
    </Link>
  )
}
