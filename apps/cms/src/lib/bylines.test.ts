import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AUTHORS, BYLINES, authorName } from './bylines'
import { ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { CAREERS_PAGE } from './companyPages'
import { GUIDES, type Guide } from './guides'
import { ORDER_PHASES } from './orderProcess'
import { POLICIES } from './policies'

/**
 * The bylines stay true (`bylines.ts`): every page that should have one has one, the writers are
 * the owner's, and no page's words can change while its date stands still.
 *
 * ⚠️ THE FINGERPRINTS ARE THE ONES MEASURED ON 2026-10-08 by rebuilding every earlier version of
 * these pages. A guide's covers what a visitor reads: its title, description, headline, lede and
 * sections, the home page's order steps when it draws them, and the garments it links (added
 * 2026-10-08: absent on a guide with none, so the measured fingerprints of the others hold). A policy's and careers' cover the
 * whole page entry but its address. Change how they are computed and every date is wrong.
 */
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)

const guideWords = (guide: Guide) =>
  sha({
    title: guide.title,
    description: guide.description,
    heading: guide.heading,
    headingAccent: guide.headingAccent,
    lede: guide.lede,
    sections: guide.sections,
    orderSteps: JSON.stringify(guide.sections).includes('"orderSteps"') ? ORDER_PHASES : undefined,
    // The reference garments a guide links, and the sources it quotes, are part of what it
    // shows (2026-10-08).
    garments: guide.garments,
    sources: guide.sources,
  })

const pageWords = ({ path: _path, ...visible }: { path: string }) => sha(visible)

const PAGES: ReadonlyArray<{ path: string; words: string }> = [
  ...GUIDES.map((guide) => ({ path: guide.path, words: guideWords(guide) })),
  ...POLICIES.map((policy) => ({ path: policy.path, words: pageWords(policy) })),
  { path: CAREERS_PAGE.path, words: pageWords(CAREERS_PAGE) },
  // The about and factory pages (the about-factory build, 2026-10-09): what a visitor reads of
  // them is the pages' whole entry, minus the path.
  { path: ABOUT_PAGE.path, words: pageWords(ABOUT_PAGE) },
  { path: FACTORY_PAGE.path, words: pageWords(FACTORY_PAGE) },
]

describe('bylines', () => {
  it('every guide, every policy and the careers page has one, and nothing else does', () => {
    expect(Object.keys(BYLINES).sort()).toEqual(PAGES.map((page) => page.path).sort())
  })

  it.each(PAGES)('$path: its words have not changed since its date', ({ path, words }) => {
    const byline = BYLINES[path]
    expect(
      byline?.changed.words,
      `${path}'s words changed. In bylines.ts set its changed to { on: <now, ISO with zone>, words: '${words}' }` +
        (path.startsWith('/policies/')
          ? ', and its lastReviewed to the day the owner approved them'
          : ''),
    ).toBe(words)
  })

  it('names the writers the owner chose (2026-10-08)', () => {
    const by = (path: string) => (BYLINES[path] ? authorName(BYLINES[path].author) : '')
    for (const path of [
      '/guides/how-a-private-label-order-works',
      '/guides/minimum-order-and-samples',
      '/guides/private-label-packaging',
      '/guides/shipping-and-import-duties',
    ]) {
      expect(by(path)).toBe('Merchandiser, RUN APPAREL')
    }
    expect(by('/guides/garment-printing-methods')).toBe('Production in-charge, RUN APPAREL')
    expect(by('/guides/sportswear-fabrics-and-weights')).toBe('Production in-charge, RUN APPAREL')
    expect(by('/guides/3d-garment-reference')).toBe('M. Hateem Jamshaid')
    expect(by('/guides/cost-to-start-an-activewear-brand')).toBe('M. Hateem Jamshaid')
    expect(by('/guides/pakistan-vs-china-vs-turkey')).toBe('M. Hateem Jamshaid')
    expect(BYLINES['/guides/3d-garment-reference']?.author).toEqual(AUTHORS.hateem)
    for (const policy of POLICIES) expect(by(policy.path)).toBe('HR, RUN APPAREL')
    expect(by('/careers')).toBe('HR, RUN APPAREL')
    expect(by('/about')).toBe('Content Team, RUN APPAREL')
    expect(by('/inside-the-factory')).toBe('Content Team, RUN APPAREL')
  })

  it('dates every page in ISO 8601 with its zone, published first, never in the future', () => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
    for (const [path, byline] of Object.entries(BYLINES)) {
      expect(byline.published, path).toMatch(iso)
      expect(byline.changed.on, path).toMatch(iso)
      expect(Date.parse(byline.published), path).not.toBeGreaterThan(Date.parse(byline.changed.on))
      expect(Date.parse(byline.changed.on), path).not.toBeGreaterThan(Date.now())
    }
  })

  it('gives a policy the day the owner approved its words', () => {
    for (const policy of POLICIES) {
      expect(BYLINES[policy.path]?.changed.on.slice(0, 10), policy.path).toBe(policy.lastReviewed)
    }
  })
})
