import { describe, expect, it } from 'vitest'
import { llmsTxtProblems } from '../../../../scripts/copy-rules.mjs'
import { TRAINING_ONLY_UAS } from '../../htmlLimitedBots.mjs'
import { ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { CERTIFICATION, FACTS, LINEAGE, SHIPS_TO } from './companyFacts'
import { FAMILIES } from './families'
import { familyHref } from './familyPages'
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
const text = buildLlmsTxt(SITE)

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
    // The owner's wording of 2026-09-29: the holder is still named — the parent for
    // SEDEX/SMETA, the suppliers for OEKO-TEX, GOTS and GRS.
    expect(text).toContain('operates under our parent company, DURUS INDUSTRIES')
    expect(text).toContain('SMETA-audited')
    // Owner, 2026-09-29 (corrected the same evening): ISO 9001 and amfori BSCI are the
    // SUPPLIERS', not DURUS's; both companies are registered with the SECP (a regulator, so
    // named, never a logo).
    expect(text).toContain('DURUS INDUSTRIES, which is SEDEX-registered and SMETA-audited.')
    expect(text).toContain('our fabric and trim suppliers hold ISO 9001, OEKO-TEX, GOTS, and GRS')
    expect(text).not.toMatch(/DURUS[^.]*ISO 9001/)
    expect(text).toContain('as well as amfori BSCI audits')
    expect(text).toContain(
      'Both companies are registered with the Securities and Exchange Commission of Pakistan (SECP)',
    )
    expect(text).not.toContain('ISO 22000')
    expect(text).not.toContain('SMETA-certified')
  })
})

describe('every family is listed, with a link to its one list (polish S1)', () => {
  for (const family of FAMILIES) {
    it(`lists ${family.name}`, () => {
      expect(text).toContain(family.name)
      expect(text).toContain(`${SITE}${familyHref(family)}`)
    })
  }

  it('names no filter address, which only forwards now', () => {
    expect(text).not.toContain('?family=')
  })
})

describe('the origins come from configuration, not from typing', () => {
  it('uses the origins it is given and hardcodes neither host', () => {
    expect(text).toContain(`${SITE}/products`)
    expect(text).toContain(`${SITE}/contact`)
    expect(text).toContain(`${SITE}/robots.txt`)
    expect(text).not.toContain('wear-run.')
  })

  // The garment pages moved into the site at /products on 2026-09-28 (domain move).
  it('describes the garment URL shape a QR tag actually produces, on this site', () => {
    expect(text).toContain(`${SITE}/products/<product-code>/<colorway>`)
    expect(text).not.toContain('separate host')
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

describe('it passes Lighthouse 13.5.0’s llms-txt audit (FI-08)', () => {
  it('has an H1, at least one Markdown link, and enough text', () => {
    expect(llmsTxtProblems(text)).toEqual([])
  })

  it('links every page it names instead of printing bare addresses', () => {
    for (const path of ['', '/products', '/contact', '/privacy', '/terms', '/robots.txt']) {
      expect(text).toContain(`](${SITE}${path})`)
    }
    expect(text).toContain(`](${SITE}/sitemap.xml)`)
    for (const family of FAMILIES) {
      expect(text).toContain(`[${family.name}](${SITE}${familyHref(family)})`)
    }
  })
})

/**
 * The Journal and the case studies (PLAN.md E9): named from day one, even before anything is
 * published (owner, 2026-10-07: "Show them right away"; both hubs are indexable when empty).
 */
describe('the Journal and the case studies', () => {
  it('are linked to their hubs while nothing is published', () => {
    expect(text).toContain('## Journal')
    expect(text).toContain(`](${SITE}/journal)`)
    expect(text).toContain(`](${SITE}/case-studies)`)
    expect(llmsTxtProblems(text)).toEqual([])
  })
})

/**
 * Three sentences the findability audit of 2026-10-08 found untrue, read against the live site
 * that day: /products has jump links to each family but filters nothing; the case-studies hub
 * is empty; and robots.txt refuses the training-only crawlers while this file said it allowed
 * every user agent. An AI reader quotes llms.txt as the site's own word, so each is pinned.
 */
describe('says only what the site does (findability audit, 2026-10-08)', () => {
  it('does not call the product list filterable', () => {
    expect(text).not.toMatch(/filterable/i)
    expect(text).toContain('grouped by family')
  })

  it('does not promise case studies that are not published', () => {
    expect(text).not.toContain('orders we have made')
    expect(text).toContain('added as each is published')
  })

  it('names every crawler robots.txt refuses, from the same list robots.txt is built from', () => {
    expect(text).not.toMatch(/allows all user agents/i)
    expect(text).toContain(`${TRAINING_ONLY_UAS.length} crawlers that only gather training data`)
    expect(text).toContain(TRAINING_ONLY_UAS.join(', '))
  })

  // The about and factory pages (the about-factory build, 2026-10-09): each line is built from the
  // page's own title and description, in the file's `- [Title](url) — description` format.
  it('names the about and factory pages in the Company section, in the list format', () => {
    for (const page of [ABOUT_PAGE, FACTORY_PAGE]) {
      expect(text).toContain(`- [${page.title}](${SITE}${page.path}) — ${page.description}`)
      expect(text, `${page.path} fell back to a bare line`).not.toContain(
        `- [${page.path}](${SITE}${page.path})`,
      )
    }
  })
})
