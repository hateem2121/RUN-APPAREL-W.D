import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildViewerPath, GARMENT_PATH_PREFIX } from '@run-apparel/shared'
import type { Metadata, MetadataRoute } from 'next'
import { FAMILY_PAGES } from './familyPages'
import { GUIDE_PATHS } from './guides'
import { COMPANY_PATHS } from './companyPages'
import { FAQ_PATHS } from './faqs'
import { GLOSSARY_INDEX } from './glossary'
import { POLICY_PATHS } from './policies'

/**
 * Whether search engines may index the public site.
 *
 * Owner decision 2026-09-06: the site launches as a beta on its real address and stays
 * OUT of search results until the owner calls it final. The switch is a deploy-time
 * setting — `vars.SITE_INDEXING` in wrangler.jsonc — because the owner asked for one
 * that cannot be flipped by a click in the admin. Flipping it is a code change, a PR
 * and a deploy, and the value is read at request time so no rebuild is needed.
 *
 * ⚠️ FAILS CLOSED. Only the exact word `visible` opens the site. Unset, blank, a typo
 * or a wrong case all mean hidden, so a Worker deployed without the var, or a local
 * server that never sees wrangler's vars, can never advertise a half-finished site.
 */
export type SearchVisibility = 'hidden' | 'visible'

export function parseSearchVisibility(raw: unknown): SearchVisibility {
  return raw === 'visible' ? 'visible' : 'hidden'
}

/**
 * The Worker's own bindings first, then the process (`next start` for the browser
 * suite, vitest), then hidden. Same order payload.config.ts uses for its vars.
 */
export async function searchVisibility(): Promise<SearchVisibility> {
  const context = await getCloudflareContext({ async: true }).catch(() => null)
  const fromWorker = (context?.env as Record<string, unknown> | undefined)?.SITE_INDEXING
  return parseSearchVisibility(fromWorker ?? process.env.SITE_INDEXING)
}

/**
 * `undefined` when visible, deliberately — NOT `{ index: true }`. Declaring `index`
 * in the layout replaced the 404 page's own `noindex` after hydration (measured
 * 2026-09-05; the account is in layout.tsx). A crawler indexes by default; only the
 * hidden case needs saying.
 */
export function robotsFor(visibility: SearchVisibility): Metadata['robots'] | undefined {
  return visibility === 'hidden' ? { index: false } : undefined
}

/**
 * The site's own pages, then one entry per garment colour.
 *
 * ⚠️ THE GARMENTS JOINED ON 2026-09-28. Until then they lived on viewer.wear-run.help with
 * its own sitemap, and a sitemap may only speak for the host that serves it. Since the
 * domain move they are pages of this host, at `/products/<product>/<colour>`. Each colour
 * page is its own canonical URL (the viewer Worker writes it); the colourless
 * `/products/<product>` is the default colour's page under a second address and is
 * deliberately not listed. Built from the live catalogue, so a new garment is offered to
 * crawlers the moment it is published — the hand-kept viewer sitemap it replaces had
 * silently missed 45 of 55 garment pages once (2026-09-04).
 *
 * ⚠️ `lastModified` IS THE DATABASE'S OWN DATE OR NOTHING (2026-09-30). This file used to
 * say "no `lastModified`: a date nobody updates is worse than none", and that still holds
 * for the five site pages, which are code and have no honest date. A garment does: the
 * product's `updatedAt`, which Payload moves on every save. Google reads `lastmod` to decide
 * what to fetch again and ignores `changefreq` and `priority` outright, so until this day
 * the sitemap said nothing Google uses about 205 pages. A missing or unreadable date emits
 * no field, never "now".
 *
 * ⚠️ ONE ENTRY PER GARMENT SINCE 2026-10-08, AT ITS DEFAULT COLOUR (owner: "list 40
 * garments"). Search Console that day: 208 addresses "Discovered – currently not indexed",
 * most of them colour pages that differ from their siblings by one word. Google's sitemap
 * guide (updated 2026-07-08): "choose the URL you prefer and include that in the sitemap
 * instead of all URLs that lead to the same content". The other colours keep working, stay
 * their own canonical, and stay linked: /products links all 200 and each garment page's robot
 * copy links its colours (both measured that day). The default colour is the first addressable
 * row (`ProductCard.defaultColourSlug`), so this follows row order and never reorders it.
 *
 * ⚠️ EVERY COLOUR'S PICTURE RIDES ON THAT ONE ENTRY. A garment page draws its picture with
 * JavaScript, so its raw HTML holds no `<img>` (measured 2026-09-30: 0 on
 * /products/rxps/wine). An image entry is how Google Images finds it, and a page may carry up
 * to 1,000 (Google's image-sitemap guide, updated 2025-12-10). Only an absolute https address
 * is listed, and a colour with no picture adds none.
 *
 * ⚠️ A NEW PUBLIC PAGE MUST BE ADDED HERE OR IT IS NEVER OFFERED TO A CRAWLER, and
 * nothing about that is visible: the page works, every test passes, and it is simply
 * never listed. `/privacy` and `/terms` joined on 2026-09-07, in the commit after the one
 * that created them, because the file was held by concurrent work.
 *
 * The legal pages carry a low priority and `yearly` deliberately. They must be findable —
 * a privacy notice nobody can reach is not much of a notice — but they are not what this
 * site is for, and a crawler that treats them as important is spending its budget wrongly.
 */
export interface SitemapGarment {
  slug: string
  /** The first addressable colour, in row order; absent → the first listed colour. */
  defaultColourSlug?: string
  /** The product's `updatedAt` as the database wrote it. Absent or unreadable: no date. */
  updatedAt?: string | null
  colours: ReadonlyArray<{ slug: string; image?: { url: string } | null }>
}

/**
 * ⚠️ NEXT WRITES AN IMAGE ADDRESS INTO THE XML UNESCAPED (read in next 16's
 * `resolve-route-data.js`, 2026-09-30: `<image:loc>${image}</image:loc>`). One `&` in one
 * picture's address would make the WHOLE sitemap malformed, and a crawler then reads none
 * of its 205 pages. So an address carrying a character XML reserves is left out: losing one
 * picture entry is nothing beside losing the file. Escaping it here instead would turn into
 * double escaping the day Next starts doing it.
 */
function isListablePicture(url: string): boolean {
  return url.startsWith('https://') && !/[&<>"'\s]/.test(url)
}

function realDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time)
}

/** A published Journal post or case study: its address and the database's date. */
export interface SitemapArticle {
  path: string
  updatedAt?: string | null
}

/**
 * ⚠️ THE HUB IS LISTED EVEN EMPTY (owner, 2026-10-07: "Show them right away"). It was listed
 * only with its first published page while an empty hub carried `noindex` (T5); both hubs are
 * indexable from day one now, and a sitemap must list what the pages allow. Each published page
 * carries its own `updatedAt`.
 */
function articleEntries(
  origin: string,
  hub: string,
  articles: ReadonlyArray<SitemapArticle> = [],
): MetadataRoute.Sitemap {
  return [
    { url: `${origin}${hub}`, changeFrequency: 'weekly', priority: 0.6 },
    ...articles.map((article) => {
      const changed = realDate(article.updatedAt)
      return {
        url: `${origin}${article.path}`,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
        ...(changed ? { lastModified: changed } : {}),
      }
    }),
  ]
}

export function sitemapFor(
  visibility: SearchVisibility,
  origin: string,
  garments: ReadonlyArray<SitemapGarment> = [],
  content: {
    posts?: ReadonlyArray<SitemapArticle>
    caseStudies?: ReadonlyArray<SitemapArticle>
  } = {},
): MetadataRoute.Sitemap {
  if (visibility === 'hidden') return []
  return [
    { url: origin, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/products`, changeFrequency: 'weekly', priority: 0.8 },
    // The buyer pages (2026-09-30), read from the list that holds their words, so a page
    // the owner approves is offered to crawlers in the same change that creates it.
    ...FAMILY_PAGES.map((page) => ({
      url: `${origin}${page.path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...GUIDE_PATHS.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    // The policies hub and the approved policies (2026-10-07), from the list that holds
    // their words, so an approved policy is offered to crawlers in the same change.
    ...POLICY_PATHS.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    // The company pages — careers and community (2026-10-07), same reasoning.
    ...COMPANY_PATHS.map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    // The FAQ and the glossary (2026-10-07), from the lists that hold their words.
    ...[...FAQ_PATHS, GLOSSARY_INDEX.path].map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...articleEntries(origin, '/journal', content.posts),
    ...articleEntries(origin, '/case-studies', content.caseStudies),
    { url: `${origin}/contact`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${origin}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    ...garments.flatMap((garment) => {
      const colour = garment.defaultColourSlug || garment.colours[0]?.slug
      if (!colour) return []
      const changed = realDate(garment.updatedAt)
      const pictures = [
        ...new Set(garment.colours.map((each) => each.image?.url ?? '').filter(isListablePicture)),
      ]
      return [
        {
          url: `${origin}${buildViewerPath(garment.slug, colour, GARMENT_PATH_PREFIX)}`,
          changeFrequency: 'monthly' as const,
          priority: 0.7,
          ...(changed ? { lastModified: changed } : {}),
          ...(pictures.length > 0 ? { images: pictures } : {}),
        },
      ]
    }),
  ]
}
