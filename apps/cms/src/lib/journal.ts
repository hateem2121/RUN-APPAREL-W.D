import { FAMILY_PAGES } from './familyPages'
import { GUIDES } from './guides'

/**
 * The Journal's fixed words and the choices the CMS offers its writers (PLAN.md D7; the owner
 * chose on 2026-10-06 that the Journal is written in the CMS and every other new page is code).
 *
 * The posts are database rows (`collections/JournalPosts.ts`); everything a post does NOT
 * choose for itself is here, so the admin's options and the public pages read one list.
 */

/** The Journal's address, its feed, and a post's address under it. */
export const JOURNAL_PATH = '/journal'
export const JOURNAL_RSS_PATH = '/journal/rss.xml'
export const journalPostPath = (slug: string) => `${JOURNAL_PATH}/${slug}`

/**
 * The five clusters (D7), in the plan's order. "Buyer guides extended" is deliberately absent
 * (T4, REVIEW.md R-15): its topics are the live guides, and two pages on one topic compete.
 *
 * ⚠️ THE VALUE IS STORED ON EVERY POST AND IS THE HUB FILTER'S CSS HOOK. Rename a label freely;
 * never change a value once a post carries it, or that post drops out of its filter.
 */
export const JOURNAL_CLUSTERS = [
  { value: 'craft-and-making', label: 'Craft and making' },
  { value: 'sialkot-stories', label: 'Sialkot stories' },
  { value: 'sustainability', label: 'Sustainability' },
  { value: 'industry-insight', label: 'Industry insight' },
  { value: 'company-news', label: 'Company news' },
] as const

export type JournalClusterValue = (typeof JOURNAL_CLUSTERS)[number]['value']

/** A stored cluster value's label; null for a value no longer offered. */
export function journalClusterLabel(value: unknown): string | null {
  return JOURNAL_CLUSTERS.find((cluster) => cluster.value === value)?.label ?? null
}

/**
 * The pages a post's "Read more" can point at (D7: at least one guide and one buyer page,
 * chosen in the CMS from a fixed list). Built from `GUIDES` and `FAMILY_PAGES`, which hold
 * those pages' own titles, so the list offers only pages that exist, under their real names.
 *
 * The stored value is the PATH: a guide renamed keeps its links; a guide removed stops being
 * offered and `relatedPagesFor` drops it from any post that had it, rather than linking a 404.
 */
export const JOURNAL_RELATED_PAGES: ReadonlyArray<{
  path: string
  label: string
  kind: 'guide' | 'buyer'
}> = [
  ...GUIDES.map((guide) => ({ path: guide.path, label: guide.title, kind: 'guide' as const })),
  ...FAMILY_PAGES.map((page) => ({ path: page.path, label: page.title, kind: 'buyer' as const })),
]

/** A post's stored "Read more" paths as links, in the writer's order, unknown ones dropped. */
export function relatedPagesFor(stored: unknown): Array<{ href: string; name: string }> {
  if (!Array.isArray(stored)) return []
  return stored.flatMap((path) => {
    const page = JOURNAL_RELATED_PAGES.find((entry) => entry.path === path)
    return page ? [{ href: page.path, name: page.label }] : []
  })
}

/**
 * A post's date as the page prints it: "October 8, 2026" (American, G9). Read in UTC, so the
 * day printed is the day stored whatever the server's clock zone, and the page and its data
 * (`datePublished`) can never name different days.
 */
export function formatPostDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

/** Whether two dates fall on different days (UTC): a post shows "Updated" only then. */
export const differentDay = (a: string, b: string) => a.slice(0, 10) !== b.slice(0, 10)

/**
 * The hub's words around the posts (D7: "[ Journal ]", "Notes" + accent "from the works.").
 * `description` is the search-result and feed description.
 */
export const JOURNAL_HUB = {
  title: 'Journal',
  eyebrow: '[ Journal ]',
  heading: 'Notes',
  headingAccent: 'from the works.',
  description:
    'Notes from the works in Sialkot: craft and making, Sialkot stories, sustainability, industry insight and company news from RUN APPAREL.',
} as const
