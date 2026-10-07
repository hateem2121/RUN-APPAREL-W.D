import { describe, expect, it } from 'vitest'
import { FAMILY_PAGES } from './familyPages'
import { GUIDES } from './guides'
import {
  JOURNAL_CLUSTERS,
  JOURNAL_HUB,
  JOURNAL_PATH,
  JOURNAL_RELATED_PAGES,
  JOURNAL_RSS_PATH,
  journalClusterLabel,
  journalPostPath,
  relatedPagesFor,
} from './journal'

/**
 * The Journal's fixed words and choices (PLAN.md D7, owner-approved plan of 2026-10-06). The
 * posts themselves are written in the CMS; what is held here is what the CMS offers the writer
 * and what the hub says around the posts.
 */
describe('the Journal clusters', () => {
  it('are the five the plan names, in its order, with no "Buyer guides extended" (T4)', () => {
    expect(JOURNAL_CLUSTERS.map((cluster) => cluster.label)).toEqual([
      'Craft and making',
      'Sialkot stories',
      'Sustainability',
      'Industry insight',
      'Company news',
    ])
    expect(JOURNAL_CLUSTERS.map((cluster) => cluster.label).join(' ')).not.toMatch(/guide/i)
  })

  it('store a lowercase, hyphenated value each (it is a database value and a CSS hook)', () => {
    for (const cluster of JOURNAL_CLUSTERS) {
      expect(cluster.value).toMatch(/^[a-z]+(?:-[a-z]+)*$/)
    }
    expect(new Set(JOURNAL_CLUSTERS.map((cluster) => cluster.value)).size).toBe(5)
  })

  it('name a stored value back to its label, and an unknown value to nothing', () => {
    expect(journalClusterLabel('company-news')).toBe('Company news')
    expect(journalClusterLabel('buyer-guides-extended')).toBeNull()
    expect(journalClusterLabel(undefined)).toBeNull()
  })
})

describe('the "Read more" pages a post can link to', () => {
  it('are every live guide and every buyer page, from the lists that hold their words', () => {
    // Built from GUIDES and FAMILY_PAGES, never typed: a renamed or new guide is offered in
    // the same change that makes it.
    expect(JOURNAL_RELATED_PAGES.map((page) => page.path)).toEqual([
      ...GUIDES.map((guide) => guide.path),
      ...FAMILY_PAGES.map((page) => page.path),
    ])
    for (const page of JOURNAL_RELATED_PAGES) expect(page.label.length).toBeGreaterThan(0)
  })

  it('say which kind each is, so a post can be held to one guide and one buyer page', () => {
    expect(JOURNAL_RELATED_PAGES.filter((page) => page.kind === 'guide')).toHaveLength(
      GUIDES.length,
    )
    expect(JOURNAL_RELATED_PAGES.filter((page) => page.kind === 'buyer')).toHaveLength(
      FAMILY_PAGES.length,
    )
  })

  it('turn stored paths into links, in the order chosen, dropping one no longer offered', () => {
    const [first, second] = JOURNAL_RELATED_PAGES
    expect(
      relatedPagesFor([second!.path, '/guides/a-guide-that-was-removed', first!.path]),
    ).toEqual([
      { href: second!.path, name: second!.label },
      { href: first!.path, name: first!.label },
    ])
    expect(relatedPagesFor(null)).toEqual([])
    expect(relatedPagesFor('not a list')).toEqual([])
  })
})

describe('the Journal addresses', () => {
  it('put a post one folder under /journal, and the feed beside them', () => {
    expect(JOURNAL_PATH).toBe('/journal')
    expect(journalPostPath('made-properly')).toBe('/journal/made-properly')
    expect(JOURNAL_RSS_PATH).toBe('/journal/rss.xml')
  })
})

describe('the Journal hub words (D7)', () => {
  it('are the plan’s label and headline', () => {
    expect(JOURNAL_HUB.eyebrow).toBe('[ Journal ]')
    expect(JOURNAL_HUB.heading).toBe('Notes')
    expect(JOURNAL_HUB.headingAccent).toBe('from the works.')
  })

  it('describe the page within the 160 characters a search result shows', () => {
    expect(JOURNAL_HUB.description.length).toBeLessThanOrEqual(160)
    expect(JOURNAL_HUB.description.length).toBeGreaterThan(50)
  })
})
