import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AboutFamily, SeeAllInGallery } from './components/site/FamilyCrossLinks'
import { FAMILIES } from './lib/families'
import {
  aboutLabel,
  FAMILY_PAGES,
  familyGalleryHref,
  familyHref,
  familyPageFor,
  seeAllLabel,
} from './lib/familyPages'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * VA-33 (visual audit, owner's choice 2026-10-01, words approved 2026-10-02): from the home page
 * "Outerwear" opened the buyer page, and on /products the same word filtered the grid, so a
 * buyer who knew one never found the other. Each page now links to the other.
 *
 * What would have to break for these to fail: a word the owner did not approve (or one that
 * drifted from the family's name), a link that leads to the wrong address — most likely the
 * buyer page linking to ITSELF, because `familyHref` also answers with the buyer page — a link
 * for Sports Accessories, which has no buyer page and no garments, or a page that stops
 * drawing its link. `e2e/familyCrossLinks.spec.ts` clicks every link in a browser.
 */

const FRONTEND = join(import.meta.dirname, 'app', '(frontend)')
// Comments are left out: these pages' own comments quote the words and addresses they replaced.
const code = (file: string) =>
  readFileSync(join(FRONTEND, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const family = (slug: string) => {
  const found = FAMILIES.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no family ${slug}`)
  return found
}

/** The owner's words, family by family: [slug, on the buyer page, on the gallery, buyer page]. */
const APPROVED = [
  ['outerwear', 'See all outerwear in 3D', 'About our outerwear', '/custom-outerwear-manufacturer'],
  [
    'sportswear',
    'See all sportswear in 3D',
    'About our sportswear',
    '/custom-activewear-manufacturer',
  ],
  [
    'teamwear-uniforms',
    'See all teamwear & uniforms in 3D',
    'About our teamwear & uniforms',
    '/custom-teamwear-manufacturer',
  ],
  [
    'casual-wear',
    'See all casual wear in 3D',
    'About our casual wear',
    '/private-label-casual-wear-manufacturer',
  ],
] as const

/** `&amp;` back to `&`: the markup escapes the ampersand in "teamwear & uniforms". */
const decoded = (html: string) => html.replace(/&amp;/g, '&')
const render = (node: ReturnType<typeof createElement>) => decoded(renderToStaticMarkup(node))

describe('the words (owner-approved 2026-10-02)', () => {
  for (const [slug, seeAll, about] of APPROVED) {
    it(`${slug}: "${seeAll}" and "${about}"`, () => {
      expect(seeAllLabel(family(slug))).toBe(seeAll)
      expect(aboutLabel(family(slug))).toBe(about)
    })
  }

  it('are built from the family’s own name, so a rename renames both links', () => {
    const renamed = { ...family('outerwear'), name: 'Rainwear & Shells' }
    expect(seeAllLabel(renamed)).toBe('See all rainwear & shells in 3D')
    expect(aboutLabel(renamed)).toBe('About our rainwear & shells')
  })
})

describe('the addresses', () => {
  for (const [slug, , , page] of APPROVED) {
    it(`${slug}: the gallery link is the filtered view, the back link is the buyer page`, () => {
      expect(familyGalleryHref(family(slug))).toBe(`/products?family=${slug}`)
      expect(familyPageFor(family(slug))?.path).toBe(page)
    })
  }

  // The trap: `familyHref` is "the buyer page when it has one", so using it for the gallery
  // link would send the buyer page back to itself and look fine in the source.
  it('the gallery address is never the buyer page, even for a family that has one', () => {
    for (const [slug] of APPROVED) {
      expect(familyGalleryHref(family(slug))).not.toBe(familyHref(family(slug)))
    }
    // …and where there is no buyer page the two agree, which is why `familyHref` is safe there.
    expect(familyGalleryHref(family('sports-accessories'))).toBe(
      familyHref(family('sports-accessories')),
    )
  })
})

describe('Sports Accessories has no link, because it has no buyer page and no garments', () => {
  it('is the one family the four approved pairs leave out', () => {
    expect(APPROVED.map(([slug]) => slug).sort()).toEqual(
      FAMILY_PAGES.map((page) => page.familySlug).sort(),
    )
    expect(FAMILIES.map((entry) => entry.slug).sort()).toEqual(
      [...APPROVED.map(([slug]) => slug), 'sports-accessories'].sort(),
    )
    expect(familyPageFor(family('sports-accessories'))).toBeNull()
  })

  it('draws no back link on its gallery', () => {
    expect(
      renderToStaticMarkup(createElement(AboutFamily, { family: family('sports-accessories') })),
    ).toBe('')
  })
})

describe('what the two components draw', () => {
  for (const [slug, seeAll, about, page] of APPROVED) {
    it(`${slug}: the buyer page draws one ghost button to its gallery`, () => {
      const html = render(createElement(SeeAllInGallery, { family: family(slug) }))
      expect(html).toBe(
        `<div class="site-actions"><a class="btn btn--ghost" href="/products?family=${slug}">${seeAll}</a></div>`,
      )
    })

    it(`${slug}: the gallery draws one ghost button back to its buyer page`, () => {
      const html = render(createElement(AboutFamily, { family: family(slug) }))
      expect(html).toBe(`<a class="btn btn--ghost" href="${page}">${about}</a>`)
    })
  }

  // A page keeps one primary action per screen (`e2e/copy.spec.ts`, CT-08).
  it('are never the primary button', () => {
    for (const [slug] of APPROVED) {
      const html = render(createElement(SeeAllInGallery, { family: family(slug) }))
      expect(html).not.toContain('btn--primary')
    }
  })
})

describe('the pages draw them, and the gallery keeps naming /products as its address', () => {
  it('the buyer page draws the gallery link', () => {
    expect(code('../../components/site/FamilyLanding.tsx')).toContain(
      '<SeeAllInGallery family={family} />',
    )
  })

  it('the gallery draws the back link, and its chips come from the same address helper', () => {
    const products = code('products/page.tsx')
    expect(products).toContain('<AboutFamily family={family} />')
    expect(products).toContain('href={familyGalleryHref(entry)}')
    expect(products).not.toContain('`/products?family=${')
  })

  it('the filtered view’s canonical is still /products, whatever the filter says', () => {
    expect(code('products/page.tsx')).toMatch(/path: '\/products',\s*\}\)/)
  })

  // NEGATIVE CONTROL: the source check sees a page that lost its link.
  it('sees a page that no longer draws the link', () => {
    const lost = code('products/page.tsx').replace('<AboutFamily family={family} />', '')
    expect(lost).not.toContain('<AboutFamily family={family} />')
  })
})
