import { describe, expect, it } from 'vitest'
import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { FAMILIES } from './families'
import { FAMILY_PAGES } from './familyPages'
import { authorName, BYLINES } from './bylines'
import { GUIDES, guideAt } from './guides'
import { ORDER_PHASES } from './orderProcess'
import { buildLlmsFullTxt } from './llmsFullTxt'
import { FAQ_TOPICS, faqVisibleAnswer } from './faqs'
import { GLOSSARY_TERMS } from './glossary'
import type { ProductCard } from './projectPublic'

const SITE = 'https://example.test'

const SAMPLE_PRODUCTS: ProductCard[] = [
  {
    slug: 'rxps',
    productName: 'Velocity Performance Skinsuit',
    productCode: 'R-XPS',
    category: 'Sportswear',
    garmentType: 'Cycling Skinsuit',
    shortDescription: 'High-compression aerodynamic skinsuit designed for track racing.',
    fabricComposition: '80% Recycled Polyester / 20% Elastane',
    gsm: '240 GSM',
    garmentFit: 'Race Fit',
    posterUrl: 'https://media.wear-run.help/rxps-poster.webp',
    posterAlt: 'Velocity Skinsuit Poster',
    defaultColourSlug: 'wine',
    colourNames: ['Wine', 'Midnight Navy', 'Emerald Green'],
    colours: [],
    updatedAt: '2026-10-01T12:00:00Z',
    // Every live garment has a model (getProductCards reads at depth 1, so it is populated).
    model: {
      url: 'https://media.wear-run.com/rxps-2026-09-28-optimized.glb',
      variantId: 'Colorway 2',
      variants: { wine: 'Colorway 2' },
      camera: { orbit: '0deg 82deg 105%', target: 'auto auto auto', fieldOfView: '30deg' },
    },
  },
  {
    // "3D coming soon" (2026-10-08): live on its pictures, no model yet.
    slug: 'r-sps',
    productName: 'STRUCTURE POLO SET',
    productCode: 'R-SPS',
    category: 'Casual Wear',
    garmentType: '',
    shortDescription: '',
    fabricComposition: '',
    gsm: '',
    garmentFit: '',
    posterUrl: 'https://media.wear-run.com/r-sps-sand-poster.webp',
    posterAlt: 'STRUCTURE POLO SET in Sand',
    defaultColourSlug: 'sand',
    colourNames: ['Sand'],
    colours: [],
    updatedAt: '2026-10-08T12:00:00Z',
    model: null,
  },
]

const textWithoutProducts = buildLlmsFullTxt(SITE, [])
const textWithProducts = buildLlmsFullTxt(SITE, SAMPLE_PRODUCTS)

describe('buildLlmsFullTxt', () => {
  it('calls a garment with a model interactive 3D, and one without "3D view coming soon"', () => {
    expect(textWithProducts).toContain(`- **Interactive 3D URL:** ${SITE}/products/rxps/wine`)
    expect(textWithProducts).toContain(
      `- **Product page (3D view coming soon):** ${SITE}/products/r-sps/sand`,
    )
    // NEGATIVE CONTROL: the model-less garment is never called interactive 3D.
    expect(textWithProducts).not.toContain(`Interactive 3D URL:** ${SITE}/products/r-sps`)
  })

  describe('confirmed operational facts and company lineage', () => {
    for (const fact of FACTS) {
      it(`states ${fact.label} (${fact.value})`, () => {
        expect(textWithoutProducts).toContain(fact.value)
        expect(textWithoutProducts).toContain(fact.label)
      })
    }

    it('states lineage, shipping regions, and certifications', () => {
      expect(textWithoutProducts).toContain(LINEAGE)
      expect(textWithoutProducts).toContain(SHIPS_TO)
      expect(textWithoutProducts).toContain(CERTIFICATION)
      expect(textWithoutProducts).toContain('DURUS INDUSTRIES')
      expect(textWithoutProducts).toContain('SMETA-audited')
    })
  })

  describe('product families and buyer pages', () => {
    for (const family of FAMILIES) {
      it(`includes family ${family.name}`, () => {
        expect(textWithoutProducts).toContain(family.name)
      })
    }

    for (const page of FAMILY_PAGES) {
      it(`includes buyer page ${page.title} and path`, () => {
        expect(textWithoutProducts).toContain(page.title)
        expect(textWithoutProducts).toContain(page.path)
      })
    }
  })

  describe('8-step order workflow', () => {
    for (const phase of ORDER_PHASES) {
      it(`includes order phase ${phase.name}`, () => {
        expect(textWithoutProducts).toContain(`Phase: ${phase.name}`)
      })
      for (const step of phase.steps) {
        it(`includes step: ${step.title}`, () => {
          expect(textWithoutProducts).toContain(step.title)
          expect(textWithoutProducts).toContain(step.body)
        })
      }
    }
  })

  describe('complete buyer guides', () => {
    for (const guide of GUIDES) {
      it(`includes guide ${guide.title}`, () => {
        expect(textWithoutProducts).toContain(guide.title)
        expect(textWithoutProducts).toContain(`${SITE}${guide.path}`)
        expect(textWithoutProducts).toContain(guide.lede)
      })
    }
  })

  describe('reference garment catalog rendering', () => {
    it('handles empty product list with a descriptive note', () => {
      expect(textWithoutProducts).toContain('Live reference catalog is updated in real time')
    })

    it('renders technical product specifications when products are supplied', () => {
      expect(textWithProducts).toContain('R-XPS — Velocity Performance Skinsuit')
      expect(textWithProducts).toContain('80% Recycled Polyester / 20% Elastane')
      expect(textWithProducts).toContain('240 GSM')
      expect(textWithProducts).toContain('Race Fit')
      expect(textWithProducts).toContain(`${SITE}/products/rxps/wine`)
      expect(textWithProducts).toContain('Wine, Midnight Navy, Emerald Green')
    })
  })

  describe('American spelling convention', () => {
    it.each(['colourway', 'customis', 'organis', 'enquir', 'catalogue'])(
      'uses American spelling, so %s does not appear in generated text',
      (british) => {
        expect(textWithProducts.toLowerCase()).not.toContain(british)
      },
    )
  })
})

describe('the FAQ and the glossary, whole (2026-10-07, PLAN.md E9)', () => {
  const text = buildLlmsFullTxt('https://wear-run.com')
  for (const topic of FAQ_TOPICS) {
    for (const entry of topic.entries) {
      it(`answers "${entry.question}" as the page does`, () => {
        expect(text).toContain(entry.question)
        expect(text).toContain(faqVisibleAnswer(entry))
      })
    }
  }
  it('defines every glossary term as the page does', () => {
    for (const term of GLOSSARY_TERMS)
      expect(text).toContain(`**${term.name}**: ${term.definition}`)
  })
})

/**
 * 2026-10-08: each guide carries its byline, as the page does, and the country comparison its
 * official sources as links (`bylines.ts`, `guides.ts`).
 */
describe('guide bylines and sources in llms-full.txt', () => {
  const full = buildLlmsFullTxt('https://wear-run.com', [])

  it('names who wrote each guide and the day its words last changed', () => {
    for (const guide of GUIDES) {
      const byline = BYLINES[guide.path]
      expect(byline, guide.path).toBeDefined()
      expect(full).toContain(
        `URL: https://wear-run.com${guide.path}\nWritten by: ${authorName(byline!.author)} · last checked ${byline!.changed.on.slice(0, 10)}`,
      )
    }
  })

  it('links every source the comparison guide quotes', () => {
    for (const source of guideAt('/guides/pakistan-vs-china-vs-turkey').sources ?? []) {
      expect(full).toContain(`- [${source.name}](${source.url})`)
    }
  })
})
