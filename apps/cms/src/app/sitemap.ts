import type { MetadataRoute } from 'next'
import { getCaseStudies, getJournalPosts, getProductCards } from '../lib/content'
import { searchVisibility, sitemapFor } from '../lib/searchVisibility'
import { SITE_ORIGIN } from '../lib/seo'

/**
 * `/sitemap.xml` for the whole site: its own pages, then every garment colour.
 *
 * ⚠️ THE GARMENTS JOINED ON 2026-09-28, when they moved from viewer.wear-run.help onto
 * this host at `/products/<product>/<colour>` (a sitemap may only speak for the host that
 * serves it, so until then they could not be listed here). `sitemapFor` says which URLs.
 *
 * ⚠️ THE DATABASE IS NOT ALLOWED TO BREAK THIS FILE. An earlier draft that read products
 * was dropped for making the sitemap fail whenever D1 was unhappy. `getProductCards`
 * never throws: a D1 failure returns no cards, and the sitemap still lists the site's
 * own pages.
 *
 * ⚠️ `lastModified` ONLY WHERE THE DATABASE HOLDS A REAL DATE (garments, since 2026-09-30):
 * a date nobody updates is worse than no date, because a crawler believes it. Next omits the
 * field entirely when it is absent, which is what the five site pages want.
 *
 * ⚠️ Must live at `src/app/`, outside both route groups — see the note in robots.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Empty while the site is hidden — see searchVisibility.ts. An empty urlset is valid
  // XML and is what a crawler should see for a site carrying noindex.
  // The Journal and the case studies (2026-10-07): published ones only, read like the
  // garments by readers that never throw; both hubs are listed even with none (owner,
  // 2026-10-07: "Show them right away").
  const [garments, posts, caseStudies] = await Promise.all([
    getProductCards(),
    getJournalPosts(),
    getCaseStudies(),
  ])
  return sitemapFor(await searchVisibility(), SITE_ORIGIN, garments, { posts, caseStudies })
}
