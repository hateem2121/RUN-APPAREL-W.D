import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FEATURE_NOTES, FIBRE_NOTES, FIT_NOTES } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from '../../../../scripts/seo-page-rules.mjs'
import { PUBLIC_PAGE_SOURCES } from '../../publicViewerHeaders.mjs'
import { FAQ_TOPICS, faqVisibleAnswer } from './faqs'
import { GLOSSARY_CATEGORIES, GLOSSARY_INDEX, GLOSSARY_TERMS, termsIn } from './glossary'
import { GUIDES } from './guides'

/**
 * The glossary's rules (PLAN.md D6, Task 3.3): a definition that drifts from the page it came
 * from, an anchor that lands nowhere, or a "Read more" to a page that does not exist.
 */
const FRONTEND = join(import.meta.dirname, '..', 'app', '(frontend)')
const BRAND_SUFFIX = ' — RUN APPAREL'

describe('the glossary terms', () => {
  it('every id is unique and an anchor', () => {
    const ids = GLOSSARY_TERMS.map((term) => term.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  it('every term sits in a listed category, and every category has terms', () => {
    for (const term of GLOSSARY_TERMS) expect(GLOSSARY_CATEGORIES).toContain(term.category)
    for (const category of GLOSSARY_CATEGORIES)
      expect(termsIn(category).length, category).toBeGreaterThan(0)
  })

  /*
   * ⚠️ THE WORDS ARE THE ONES APPROVED. A term written out in glossary.ts must read exactly as the
   * owner approved it (drafts reviewed 2026-10-07, four of them new sentences); every other term
   * is looked up from its source and must be found there word for word. So no definition can
   * say what neither the owner nor the site has said.
   */
  const APPROVED_AS_WRITTEN: Record<string, string> = {
    gsm: 'GSM means grams per square meter: how heavy a fabric is.',
    neoprene:
      'The chemical name is polychloroprene: a rubbery foam that keeps you warm when wet. Neoprene is sold by thickness: thicker is warmer, thinner bends more easily.',
    'raglan-sleeve':
      'A sleeve sewn on a diagonal from the neck to the underarm, for free arm movement.',
    ripstop: 'A fabric woven with a grid that stops tears spreading.',
    'private-label': 'Private label means the garment leaves under your brand, not ours.',
    'tech-pack':
      'The document that describes a garment for the factory: its measurements, fabrics, trims, colors and artwork. A sketch is enough to start; a reference garment or a tech pack is better.',
    moq: 'The fewest pieces a factory makes in one order. At RUN APPAREL it is 50 pieces per style.',
    sample:
      'One garment made before bulk production, for you to approve. A sample takes 7 working days, and its fee is credited back against your bulk order.',
    'lead-time':
      'The time from order confirmation to a finished order. Usually 2–4 weeks from order confirmation; your quote states the exact date.',
    '3d-garment-reference':
      'A garment you can turn and zoom on your screen. It lets you and your team check the construction, the fit and where the artwork sits before a sample is cut.',
    colorway: 'One color version of a garment. Every colorway of a garment has its own page.',
    incoterms:
      'The International Chamber of Commerce’s rules for who pays for and arranges each part of a shipment.',
    secp: 'The Securities and Exchange Commission of Pakistan. Both companies are registered with it.',
  }

  it('a term written out reads exactly as approved', () => {
    for (const [id, words] of Object.entries(APPROVED_AS_WRITTEN)) {
      expect(GLOSSARY_TERMS.find((term) => term.id === id)?.definition, id).toBe(words)
    }
  })

  it('every other term is found, word for word, where it came from', () => {
    const notes = new Set([
      ...Object.values(FIBRE_NOTES),
      ...Object.values(FEATURE_NOTES),
      ...Object.values(FIT_NOTES),
    ])
    const guides = JSON.stringify(GUIDES)
    const answers = new Set(FAQ_TOPICS.flatMap((topic) => topic.entries.map(faqVisibleAnswer)))
    const unsourced = GLOSSARY_TERMS.filter((term) => !(term.id in APPROVED_AS_WRITTEN))
      .filter((term) => {
        if (notes.has(term.definition) || answers.has(term.definition)) return false
        // A fabric: "Usually <the guide's weight>. <the guide's point>".
        const fabric = term.definition.match(/^Usually (\d+ to \d+ GSM)\. (.+)$/)
        if (fabric) return !(guides.includes(fabric[1] ?? '') && guides.includes(fabric[2] ?? ''))
        return !guides.includes(JSON.stringify(term.definition))
      })
      .map((term) => term.id)
    expect(unsourced).toEqual([])
  })

  it('every "Read more" is a page this site serves', () => {
    const served = new Set(PUBLIC_PAGE_SOURCES)
    for (const term of GLOSSARY_TERMS) {
      for (const path of term.seeAlso) {
        expect(served.has(path.split('#')[0] ?? ''), `${term.id} → ${path}`).toBe(true)
      }
    }
  })

  it('names spandex, never the LYCRA brand', () => {
    expect(JSON.stringify(GLOSSARY_TERMS)).not.toMatch(/lycra/i)
  })
})

describe('/glossary has an address, a route and a title that fits', () => {
  it('a route folder', () => {
    expect(existsSync(join(FRONTEND, 'glossary', 'page.tsx'))).toBe(true)
  })

  it('the whole title fits and the description can be the snippet', () => {
    expect((GLOSSARY_INDEX.title + BRAND_SUFFIX).length).toBeLessThanOrEqual(TITLE_MAX)
    expect(GLOSSARY_INDEX.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
    expect(GLOSSARY_INDEX.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
  })
})
