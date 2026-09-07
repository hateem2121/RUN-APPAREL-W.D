import type { MetadataRoute } from 'next'
import { searchVisibility, sitemapFor } from '../lib/searchVisibility'
import { SITE_ORIGIN } from '../lib/seo'

/**
 * `/sitemap.xml` for the public marketing site.
 *
 * ⚠️ THIS LISTS THREE PAGES AND DELIBERATELY NOT THE GARMENTS.
 *
 * The obvious version queries the products collection and emits a URL per garment. It
 * would be wrong: a card on `/products` links to `viewer.wear-run.help/<slug>/<colour>`,
 * a DIFFERENT HOST with its own sitemap (`apps/viewer/public/sitemap.xml`). A sitemap
 * may only speak for the host that serves it — cross-host entries are ignored unless
 * both are verified together — so listing garments here would be noise at best.
 *
 * That also means this file needs no database. An earlier draft reached for
 * `getProductCards` and would have made the sitemap fail whenever D1 was unhappy, for
 * data it should not have been publishing in the first place.
 *
 * ⚠️ NO `lastModified`. `apps/viewer/public/sitemap.xml` states the reason and it holds
 * here: a date nobody updates is worse than no date, because a crawler believes it.
 * Next omits the field entirely when it is absent, which is what we want.
 *
 * ⚠️ Must live at `src/app/`, outside both route groups — see the note in robots.ts.
 * When the 404 page lands it does NOT belong here; a sitemap advertises pages that
 * should be indexed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Empty while the beta is hidden — see searchVisibility.ts. An empty urlset is
  // valid XML and is what a crawler should see for a site carrying noindex.
  return sitemapFor(await searchVisibility(), SITE_ORIGIN)
}
