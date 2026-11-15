/**
 * The site's two languages (Russian section, owner's decision 2026-11-15, design in
 * `docs/superpowers/specs/2026-11-15-russian-section-design.md`).
 *
 * ⚠️ EVERY PATH IN THIS FILE IS THE ENGLISH PATH. A Russian page is `/ru` + its English twin's
 * path, with the SAME Latin slug, so the pair is found by string, never by a lookup table that
 * can drift. `/ru` alone is the Russian home (not `/ru/`: the site carries no trailing slashes).
 */

export type Locale = 'en' | 'ru'

export const RU_PREFIX = '/ru'

/** `/` → `/ru`; `/guides/aql-inspection` → `/ru/guides/aql-inspection`. */
export function ruPath(enPath: string): string {
  return enPath === '/' ? RU_PREFIX : `${RU_PREFIX}${enPath}`
}

/** The inverse of `ruPath`. Throws on a path that is not Russian rather than guessing. */
export function enPathOf(path: string): string {
  if (path === RU_PREFIX) return '/'
  if (path.startsWith(`${RU_PREFIX}/`)) return path.slice(RU_PREFIX.length)
  throw new Error(`${path} is not a Russian path`)
}

/**
 * Whether an English page has a Russian twin.
 *
 * NO for a single journal post or case study: their words live in the CMS database and the owner
 * chose (2026-11-15) Russian hubs that list the English posts, not Russian posts. NO for the 3D
 * garment pages under `/products/<product>`: the viewer Worker draws them and they stay English
 * (design, non-goals). The gallery `/products` itself is a website page and has a twin.
 */
export function hasRussianTwin(enPath: string): boolean {
  if (/^\/(journal|case-studies)\/./.test(enPath)) return false
  if (/^\/products\/./.test(enPath)) return false
  return true
}
