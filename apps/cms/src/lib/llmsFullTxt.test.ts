import { describe, expect, it } from 'vitest'
import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { FAMILIES } from './families'
import { FAMILY_PAGES } from './familyPages'
import { GUIDES } from './guides'
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
    model: null,
  },
]

const textWithoutProducts = buildLlmsFullTxt(SITE, [])
const textWithProducts = buildLlmsFullTxt(SITE, SAMPLE_PRODUCTS)

describe('buildLlmsFullTxt', () => {
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
