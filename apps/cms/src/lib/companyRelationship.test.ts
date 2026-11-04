import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { ABOUT } from './aboutCopy'
import { ABOUT_PAGE, FACTORY_PAGE } from './aboutPages'
import { CERTIFICATION, CERTIFICATION_LINES, RELATIONSHIP, SITE_COMPANY } from './companyFacts'
import { CAREERS_PAGE, COMMUNITY_PAGE, PRESS_PAGE } from './companyPages'
import { FAMILY_PAGES } from './familyPages'
import { FAQ_TOPICS } from './faqs'
import { GLOSSARY_TERMS } from './glossary'
import { GUIDES } from './guides'
import { buildLlmsFullTxt } from './llmsFullTxt'
import { buildLlmsTxt } from './llmsTxt'
import { POLICIES } from './policies'
import { PRESS_FACTS } from './press'
import { EMPTY_FOOTER, type PublicSiteSettings } from './projectPublic'
import { organizationJsonLd } from './structuredData'

/**
 * HOW THE SITE MAY DESCRIBE RUN APPAREL AND DURUS INDUSTRIES (legal review, 2026-11-04; the
 * owner's go-ahead to draft that day).
 *
 * The owner's facts of that day: RUN APPAREL (PRIVATE) LIMITED and DURUS INDUSTRIES are separate
 * companies of one family, and DURUS INDUSTRIES is not RUN's holding company; the two share one
 * site in Sialkot; some production steps are DURUS INDUSTRIES' and some RUN's own. So:
 *
 * - "parent company", "parentOrganization", "division", "spins off" are untrue. Companies Act
 *   2017 s.2(68): a subsidiary is a company whose board, or more than half of whose voting
 *   securities, another company controls. Competition Act 2010 s.10(2)(b) forbids misleading
 *   information about the "place of production".
 * - "GOTS" may not appear: GOTS's Conditions for Use of Signs v4.0, s.3.3.1 (in force
 *   2026-08-01), "Uncertified processors, manufacturers, Traders shall not use GOTS Signs or make
 *   any claims referring to GOTS". RUN APPAREL is not certified.
 *
 * The site used every one of these words until that day, in about twenty places, including the
 * machine-readable data Google and AI answers copy. This test reads every body of copy the site
 * publishes from code and refuses them all, so a new page cannot quietly bring one back. The
 * CMS's own fields (the footer's Standards lines) are not code and are not covered here.
 */

const settings: PublicSiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  logoUrl: null,
  logoMimeType: null,
  footer: EMPTY_FOOTER,
  familyLists: {},
}

const ORIGIN = 'https://wear-run.com'

/** Every body of copy the site publishes from code, by a name for the failure message. */
const PUBLISHED: Readonly<Record<string, string>> = {
  'llms.txt': buildLlmsTxt(ORIGIN),
  'llms-full.txt': buildLlmsFullTxt(ORIGIN),
  'organisation data': JSON.stringify(organizationJsonLd(settings)),
  'home №01': JSON.stringify(ABOUT),
  '/about': JSON.stringify(ABOUT_PAGE),
  '/inside-the-factory': JSON.stringify(FACTORY_PAGE),
  '/careers': JSON.stringify(CAREERS_PAGE),
  '/community': JSON.stringify(COMMUNITY_PAGE),
  '/press': JSON.stringify([PRESS_PAGE, PRESS_FACTS]),
  '/faq': JSON.stringify(FAQ_TOPICS),
  '/glossary': JSON.stringify(GLOSSARY_TERMS),
  '/guides': JSON.stringify(GUIDES),
  '/policies': JSON.stringify(POLICIES),
  'family pages': JSON.stringify(FAMILY_PAGES),
  'certification lines': JSON.stringify([CERTIFICATION, CERTIFICATION_LINES]),
}

/** The words refused, each with the reason a reader of the failure needs. */
const REFUSED: readonly { words: RegExp; why: string }[] = [
  { words: /parent\s+compan/i, why: 'DURUS INDUSTRIES is not RUN APPAREL’s holding company' },
  { words: /parentOrganization|subOrganization/, why: 'the same, in Google’s data' },
  { words: /\bparent\b/i, why: 'DURUS INDUSTRIES is not RUN APPAREL’s parent' },
  { words: /\bdivision\b/i, why: 'RUN APPAREL is its own company, not part of DURUS INDUSTRIES' },
  { words: /spins?\s+off|spun\s+off/i, why: 'nothing was spun off: RUN is a separate company' },
  { words: /\bGOTS\b/i, why: 'GOTS sign rules s.3.3.1: no claim referring to GOTS' },
]

/** Each refused word found, as "where: why (the words around it)". */
function findings(texts: Readonly<Record<string, string>>): string[] {
  const found: string[] = []
  for (const [where, text] of Object.entries(texts)) {
    for (const { words, why } of REFUSED) {
      const hit = text.match(words)
      if (hit?.index === undefined) continue
      const around = text.slice(Math.max(0, hit.index - 40), hit.index + 40)
      found.push(`${where}: ${why} (…${around}…)`)
    }
  }
  return found
}

describe('how the site describes RUN APPAREL and DURUS INDUSTRIES', () => {
  it('reads real copy, so a pass means something', () => {
    for (const [where, text] of Object.entries(PUBLISHED)) {
      expect(text.length, `${where} came back empty, so nothing was checked`).toBeGreaterThan(200)
    }
    // DURUS INDUSTRIES is still named where it belongs: the site, and the audits it holds.
    expect(PUBLISHED['/about']).toContain(SITE_COMPANY)
    expect(PUBLISHED['llms.txt']).toContain('DURUS INDUSTRIES, a separate company')
  })

  it('never calls DURUS INDUSTRIES a parent, RUN a division, or names GOTS', () => {
    expect(findings(PUBLISHED)).toEqual([])
  })

  // NEGATIVE CONTROL, run both ways: each sentence the site carried until 2026-11-04 is caught,
  // and the sentence that replaced it is not.
  it('catches every wording the site used until 2026-11-04', () => {
    const old = {
      certification: 'RUN APPAREL operates under our parent company, DURUS INDUSTRIES.',
      timeline: 'Durus spins off RUN APPAREL as an apparel division of its own.',
      data: '{"parentOrganization":{"@type":"Organization","name":"DURUS INDUSTRIES"}}',
      footer: 'Parent: SEDEX-registered, SMETA-audited',
      suppliers: 'Our fabric and trim suppliers hold ISO 9001, OEKO-TEX, GOTS, and GRS.',
    }
    expect(findings(old)).toHaveLength(7)
    expect(findings({ now: RELATIONSHIP })).toEqual([])
  })

  it('states the relationship as the owner’s facts allow', () => {
    expect(RELATIONSHIP).toContain('separate company')
    expect(RELATIONSHIP).toContain('family behind DURUS INDUSTRIES')
    expect(RELATIONSHIP).toContain('some by our own team')
    // Only once the owner confirms a written agreement is signed.
    expect(RELATIONSHIP).not.toMatch(/agreement|contract/i)
  })
})
