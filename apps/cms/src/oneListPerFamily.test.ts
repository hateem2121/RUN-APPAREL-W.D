import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { categoryPath } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { FAMILIES } from './lib/families'
import {
  FAMILY_PAGES,
  familyFilterForward,
  familyHref,
  familyIsSoon,
  familyPageFor,
} from './lib/familyPages'

/**
 * Polish S1–S4 (the owner's answers Q24–Q26, 2026-10-04): one page per job. A family's garments
 * were listed twice — on its buyer page and on its filtered gallery, `/products?family=<slug>` —
 * and the two linked to each other (visual audit VA-33). The buyer page is the family's ONLY list
 * now; the products page shows every family under a heading that opens it; the filter's addresses
 * forward there; and the buyer pages stopped copying the home page's numbers, factory photos and
 * a third telling of the order steps (audit X21).
 *
 * What would have to break for these to fail: a family link that leads anywhere but the family's
 * list, the garment pages and the website sending a category to different places, an old address
 * that no longer forwards, a page that builds a filter link again, or a buyer page that draws the
 * copied sections again. `e2e/oneListPerFamily.spec.ts` follows the links in a browser.
 */

const SRC = import.meta.dirname
// Comments are left out: these files' own comments quote the addresses they replaced.
const code = (file: string) =>
  readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const family = (slug: string) => {
  const found = FAMILIES.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no family ${slug}`)
  return found
}

/** The four families with a page, and the page each one's list now lives on. */
const LISTS = [
  ['sportswear', '/custom-activewear-manufacturer'],
  ['teamwear-uniforms', '/custom-teamwear-manufacturer'],
  ['casual-wear', '/private-label-casual-wear-manufacturer'],
  ['outerwear', '/custom-outerwear-manufacturer'],
] as const

describe('a family’s one list', () => {
  for (const [slug, path] of LISTS) {
    it(`${slug}: every link to the family opens ${path}`, () => {
      expect(familyHref(family(slug))).toBe(path)
      expect(familyPageFor(family(slug))?.path).toBe(path)
    })
  }

  it('Sports Accessories, which has no page, is its group on the products page', () => {
    expect(familyPageFor(family('sports-accessories'))).toBeNull()
    expect(familyHref(family('sports-accessories'))).toBe('/products#sports-accessories')
  })

  // The garment pages build their trail and their "See all … in 3D" in packages/shared, which
  // cannot read `families.ts`: the two must send every category to the same place.
  it('the garment pages send each category where the website does', () => {
    for (const entry of FAMILIES) {
      expect(categoryPath(entry.name), entry.name).toBe(familyHref(entry))
    }
  })

  it('every page the families name is a buyer page the owner approved', () => {
    expect(LISTS.map(([slug]) => slug).sort()).toEqual(
      FAMILY_PAGES.map((page) => page.familySlug).sort(),
    )
  })
})

// Polish F8 (Q21): "[ soon ]" and "Ask what we make →", on the products page and the home page alike.
describe('a family says "[ soon ]" only with no page and no garment', () => {
  it('Sports Accessories, today: no page, no garment', () => {
    expect(familyIsSoon(family('sports-accessories'), 0)).toBe(true)
  })

  it('not once a garment of it is published', () => {
    expect(familyIsSoon(family('sports-accessories'), 1)).toBe(false)
  })

  it('never for a family with a page, even with no garment', () => {
    for (const [slug] of LISTS) expect(familyIsSoon(family(slug), 0), slug).toBe(false)
  })

  it('both pages decide it the same way, and read the same words', () => {
    for (const file of ['app/(frontend)/page.tsx', 'app/(frontend)/products/page.tsx']) {
      expect(code(file), file).toMatch(/familyIsSoon\(/)
    }
    const words = [code('app/(frontend)/products/page.tsx'), code('components/site/FamilyCard.tsx')]
    for (const source of words) {
      expect(source).toMatch(/\bFAMILY_SOON\.label\b/)
      expect(source).toMatch(/\bFAMILY_SOON\.ask\b/)
      expect(source).not.toMatch(/\[ soon \]|Ask what we make/)
    }
  })
})

describe('the old filter addresses forward (polish S3)', () => {
  for (const [slug, path] of LISTS) {
    it(`?family=${slug} forwards to ${path}`, () => {
      expect(familyFilterForward(slug)).toBe(path)
    })
  }

  it('?family=sports-accessories forwards to its group on the products page', () => {
    expect(familyFilterForward('sports-accessories')).toBe('/products#sports-accessories')
  })

  it('an empty or unknown value forwards to the whole products page', () => {
    for (const value of [undefined, '', 'nonsense', 'Outerwear']) {
      expect(familyFilterForward(value), `${value}`).toBe('/products')
    }
  })

  it('the products page forwards every ?family= before it draws anything', () => {
    const page = code('app/(frontend)/products/page.tsx')
    expect(page).toMatch(/permanentRedirect\(\s*familyFilterForward\(/)
    // The title no longer follows a filter: the page's metadata reads no search parameter.
    expect(page).toContain('export async function generateMetadata(): Promise<Metadata>')
  })
})

/** Every page and component the website draws, as source with its comments left out. */
function siteSources(): Array<[string, string]> {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path)
    }
  }
  walk('app/(frontend)')
  walk('components/site')
  return files.map((file) => [file, code(file)])
}

const filterLinks = (sources: Array<[string, string]>) =>
  sources.filter(([, source]) => /\?family=/.test(source)).map(([file]) => file)

describe('nothing on the website links to a filter address any more', () => {
  it('no page or component builds a `?family=` link', () => {
    const sources = siteSources()
    expect(sources.length, 'the walk found no source').toBeGreaterThan(20)
    expect(filterLinks(sources)).toEqual([])
  })

  // NEGATIVE CONTROL: the same check sees a link planted in one file.
  it('sees a planted filter link', () => {
    const planted: Array<[string, string]> = [
      ['planted.tsx', "const href = '/products?family=outerwear'"],
    ]
    expect(filterLinks(planted)).toEqual(['planted.tsx'])
  })
})

describe('a buyer page copies nothing (polish S4)', () => {
  const landing = code('components/site/FamilyLanding.tsx')

  it('draws no numbers, no factory photos and no steps of its own', () => {
    expect(landing).not.toMatch(/<FactsBento\b/)
    expect(landing).not.toMatch(/<FactoryFigure\b/)
    expect(landing).not.toMatch(/page\.steps\b/)
  })

  it('links the order guide instead, in the guide’s own words', () => {
    expect(landing).toContain("guideAt('/guides/how-a-private-label-order-works')")
    expect(landing).toMatch(/href=\{ORDER_GUIDE\.path\}/)
    expect(landing).toMatch(/\{ORDER_GUIDE\.title\}/)
  })

  // NEGATIVE CONTROL: the check sees the numbers drawn again.
  it('sees the numbers if they come back', () => {
    expect(`${landing}<FactsBento worksCoordinates={x} />`).toMatch(/<FactsBento\b/)
  })
})
