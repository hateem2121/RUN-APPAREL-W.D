import { hasRussianTwin, ruPath } from '../locale'
import { isRussianPath } from './islandWords'

/**
 * AN INTERNAL LINK ON A RUSSIAN PAGE GOES TO THE RUSSIAN TWIN (Russian section, 2026-11-15).
 *
 * The Russian words files keep every `href` exactly as English (their parity tests require it), so
 * a guide's link to `/custom-teamwear-manufacturer` is the same string in both languages. This turns
 * it into `/ru/custom-teamwear-manufacturer` when, and only when, the page drawing it is Russian.
 * `IntentLink` calls it, which covers nearly every link on the site in one place.
 *
 * Left alone: links on English pages; anything not a site path (`https:`, `mailto:`, `//host`);
 * a path already Russian; the 3D garment pages and single posts, which have no twin
 * (`hasRussianTwin`); the admin, the API and Next's own files; and any file (`/x.csv`).
 */
export function localHref(href: string, pathname: string | null): string {
  if (!isRussianPath(pathname)) return href
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const hashAt = href.indexOf('#')
  const fragment = hashAt === -1 ? '' : href.slice(hashAt)
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt)
  const queryAt = beforeHash.indexOf('?')
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt)
  const path = (queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)) || '/'
  if (isRussianPath(path)) return href
  if (/^\/(admin|api|_next)(\/|$)/.test(path)) return href
  if (/\.[a-z0-9]+$/i.test(path)) return href
  if (!hasRussianTwin(path)) return href
  return `${ruPath(path)}${query}${fragment}`
}
