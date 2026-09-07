import { describe, expect, it } from 'vitest'
import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { FAMILIES } from './families'
import { buildLlmsTxt } from './llmsTxt'

/**
 * The drift gate for `/llms.txt` (audit FA-N-16).
 *
 * The whole risk of this file is quiet disagreement: a number changes on the home page,
 * nobody remembers there is a second audience reading a second copy, and the site tells a
 * buyer one thing and a language model another. Nothing about that state looks wrong, and
 * an AI answer engine is precisely the reader least likely to be checked by hand.
 *
 * So every assertion below is generated from the same constants the pages render. There
 * is no literal `100,000` in this file either.
 */

const SITE = 'https://example.test'
const VIEWER = 'https://viewer.example.test'
const text = buildLlmsTxt(SITE, VIEWER)

describe('every confirmed fact reaches the file', () => {
  for (const fact of FACTS) {
    it(`states ${fact.label}`, () => {
      expect(text).toContain(fact.value)
      expect(text).toContain(fact.label)
    })
  }

  it('carries the shipping regions, the certification paragraph and the 1889 wording', () => {
    expect(text).toContain(SHIPS_TO)
    expect(text).toContain(CERTIFICATION)
    expect(text).toContain(LINEAGE)
  })

  /*
   * The certification paragraph names DURUS INDUSTRIES because a buyer's compliance team
   * checks the holder first. An llms.txt is quoted back verbatim more often than a page
   * is, so dropping the holder here would be worse than dropping it on the page.
   */
  it('names the certificate holder rather than implying the certificates are ours', () => {
    expect(text).toContain('DURUS INDUSTRIES')
    expect(text).toContain('does not hold certification in its own name')
    expect(text).toContain('SMETA-audited')
    expect(text).not.toContain('SMETA-certified')
  })
})

describe('every family is listed, with a working filter link', () => {
  for (const family of FAMILIES) {
    it(`lists ${family.name}`, () => {
      expect(text).toContain(family.name)
      expect(text).toContain(`${SITE}/products?family=${family.slug}`)
    })
  }
})

describe('the origins come from configuration, not from typing', () => {
  it('uses the origins it is given and hardcodes neither host', () => {
    expect(text).toContain(`${SITE}/products`)
    expect(text).toContain(`${SITE}/contact`)
    expect(text).toContain(`${SITE}/robots.txt`)
    expect(text).toContain(`${VIEWER}/llms.txt`)
    expect(text).not.toContain('wear-run.help')
  })

  it('describes the viewer URL shape a QR tag actually produces', () => {
    expect(text).toContain(`${VIEWER}/<product-code>/<colorway>`)
  })
})

describe('the conventions this site has already settled', () => {
  /*
   * Owner decision, docs/CUSTOMISATION-COPY-2026-09-04.md: American spelling, because
   * "colorway" is the higher-volume search term in the largest target market. FA-Q-05 was
   * this decision reaching one surface and not the other; a new surface must not reopen it.
   */
  it.each(['colour', 'customis', 'organis', 'enquir', 'catalogue'])(
    'uses American spelling, so %s does not appear',
    (british) => {
      expect(text.toLowerCase()).not.toContain(british)
    },
  )

  /*
   * Prices are absent everywhere by decision, and a model asked "how much?" will invent
   * one from silence. Saying so is the point of the section.
   */
  it('says explicitly that no price exists, rather than leaving it unsaid', () => {
    expect(text).toContain('Prices are deliberately absent')
    expect(text).toContain('would be invented')
  })

  /*
   * 1889 is a family trade, not a founding date — the same reason structuredData.ts omits
   * `foundingDate`. It is the single most quotable line here, so the correction is stated
   * where a summarizer will read it.
   */
  it('warns that 1889 is not the entity’s founding date', () => {
    expect(text).toContain('not the founding date')
  })

  /*
   * FA-Q-07 is still open: every mailto on this site names an unconfirmed address.
   * Repeating it into a file built to be quoted verbatim would multiply the error.
   */
  it('embeds no email address, and points at /contact instead', () => {
    expect(text).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/)
    expect(text).toContain(`${SITE}/contact`)
  })
})

describe('it is a text file', () => {
  it('opens with an H1 and a blockquote summary, as the format asks', () => {
    const lines = text.split('\n')
    expect(lines[0]).toBe('# RUN APPAREL')
    expect(lines.some((line) => line.startsWith('> '))).toBe(true)
  })

  /*
   * ⚠️ THE OBVIOUS ASSERTION IS WRONG HERE. `/<[a-z][^>]*>/` was the first version and it
   * failed on `<product-code>/<colorway>` — the URL-shape placeholder, which is the most
   * useful line in the file. What must not appear is markup, so the check names closing
   * tags and the elements a stray copy-paste would actually bring.
   */
  it('contains no markup', () => {
    expect(text).not.toMatch(/<\/[a-z]/i)
    expect(text).not.toMatch(/<(a|p|div|span|br|html|head|body|script|meta|link)\b/i)
  })
})
