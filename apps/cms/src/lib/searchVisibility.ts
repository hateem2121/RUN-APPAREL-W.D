import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { Metadata, MetadataRoute } from 'next'

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
 * Three pages and never the garments — those live on viewer.wear-run.help, which has
 * its own sitemap, and a sitemap may only speak for the host that serves it.
 * No `lastModified`: a date nobody updates is worse than none.
 */
export function sitemapFor(visibility: SearchVisibility, origin: string): MetadataRoute.Sitemap {
  if (visibility === 'hidden') return []
  return [
    { url: origin, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/products`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${origin}/contact`, changeFrequency: 'yearly', priority: 0.5 },
  ]
}
