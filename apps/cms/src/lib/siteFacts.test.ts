import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as aboutCopy from './aboutCopy'
import * as aboutPages from './aboutPages'
import * as caseStudies from './caseStudies'
import * as companyPages from './companyPages'
import * as faqs from './faqs'
import * as guides from './guides'
import * as journal from './journal'
import * as orderProcess from './orderProcess'
import * as policies from './policies'

/**
 * The site-wide copy guard (PLAN.md Task 1.2). Every new copy list is walked string by
 * string, and the claims the owner has ruled out fail the suite rather than reach a page:
 * a founding date for 1889 (it is the family's trade, G7), a year count that goes stale
 * every year, SMETA or BSCI as certificates (they are audits, G6), "certified factory",
 * the 21–45 day window the owner removed on 2026-09-29, another tool's citation markers
 * (REVIEW.md R-21), British spelling (G9), and a garment claimed GOTS/OEKO-TEX/GRS
 * certified (G6). A second check reads the SOURCE files, because numbers come from
 * `FACTS`/`LEAD_TIME` imports, never retyped (G5).
 *
 * Phase 3 adds `faqs.ts` and `glossary.ts` to COPY_MODULES.
 */

const COPY_MODULES: Record<string, object> = {
  'policies.ts': policies,
  'companyPages.ts': companyPages,
  'aboutPages.ts': aboutPages,
  'journal.ts': journal,
  'caseStudies.ts': caseStudies,
}

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['a founding date for 1889', /founded\b[^.]*1889/i],
  // "+" in the separator class since 2026-10-09: "135+ years" slipped past "135 years".
  ['a year count ("135+ years")', /\b1[3-9]\d[- +] ?years?\b/i],
  ['"SMETA-certified"', /SMETA[- ]certified/i],
  ['"BSCI certified"', /BSCI certif/i],
  ['"certified factory"', /certified factory/i],
  ['the refused 21–45 day window', /21\s*[–-]\s*45/],
  ['another tool’s citation markers', /【/],
  ['British spelling', /\b(fibre|colour|labour|organisation|organise)\b/i],
  [
    'a garment claimed certified',
    /(GOTS|OEKO-TEX|GRS)[- ]certified (garment|product|clothing|apparel)/i,
  ],
]

/** Every string in the value, however it is nested; functions and nulls carry none. */
const stringsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (value === null || typeof value === 'function') return []
  if (Array.isArray(value)) return value.flatMap(stringsOf)
  if (typeof value === 'object') return Object.values(value).flatMap(stringsOf)
  return []
}

describe('the site-wide copy guard', () => {
  it('contains none of the claims the owner has ruled out', () => {
    for (const [name, mod] of Object.entries(COPY_MODULES)) {
      const text = stringsOf(mod).join(' ')
      for (const [what, pattern] of FORBIDDEN) {
        expect(text, `${name} contains ${what}`).not.toMatch(pattern)
      }
    }
  })

  it('types no FACTS number into the source files', () => {
    for (const file of Object.keys(COPY_MODULES)) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      expect(source, `${file} types a number that must be imported from FACTS`).not.toMatch(
        /100,000|193,000/,
      )
    }
  })

  it('THE CONTROL — the matchers fire on the claims they forbid', () => {
    // Without this the loop above would pass on any regex that never matches, and on a
    // walker that collected nothing. One planted string carries every forbidden claim.
    // "135+ years" (not "135 years") since 2026-10-09: the v1.0 copy deck wrote it that way
    // and the old separator class missed the plus — the exact gap the owner's build brief named.
    const planted =
      'Founded in 1889, with 135+ years behind us: our SMETA-certified, BSCI certified ' +
      'factory runs a 21–45 day schedule, printing on fibre with colour, organisation ' +
      'chart in hand, in GOTS-certified garments. 【turn0search1】'
    for (const [what, pattern] of FORBIDDEN) {
      expect(planted, `a matcher no longer fires: ${what}`).toMatch(pattern)
    }
  })
})

/**
 * SIX BUILDINGS ON ONE SITE, NOT ONE BUILDING (owner, 2026-10-15). The works are 193,000 sq m under
 * roof across six buildings. Until that day 13 lines across the home page, the FAQ, the guides and
 * the company pages said "one building", "under one roof" or "the same floor", and 11 more spoke of
 * "our building" as if there were one; the home page's aerial photo showed the other buildings
 * beside the claim. "The same building from above" (the solar photo's description) stays: it IS
 * the building in the photo before it, so `factoryPhotos.ts` is not read here.
 */
const BUILDING_MODULES: Record<string, object> = {
  'aboutCopy.ts': aboutCopy,
  'aboutPages.ts': aboutPages,
  'companyPages.ts': companyPages,
  'faqs.ts': faqs,
  'guides.ts': guides,
  'orderProcess.ts': orderProcess,
  'policies.ts': policies,
}

const ONE_BUILDING =
  /\b(?:one|single|same) building\b|\bunder one roof\b|\bsame floor\b|\bour (?:own )?building\b|\bin the building\b/i

/** The home page's own words live in its JSX, not in a module, so its source is read instead. */
const HOME_SOURCE = readFileSync(new URL('../app/(frontend)/page.tsx', import.meta.url), 'utf8')

describe('six buildings on one site (owner, 2026-10-15)', () => {
  it('no page calls the works one building', () => {
    for (const [name, mod] of Object.entries(BUILDING_MODULES)) {
      expect(stringsOf(mod).join(' '), `${name} calls the works one building`).not.toMatch(
        ONE_BUILDING,
      )
    }
    expect(HOME_SOURCE, 'the home page calls the works one building').not.toMatch(ONE_BUILDING)
  })

  it('THE CONTROL — the walker reads the new words, and the matcher fires on every old form', () => {
    // A walker that collected nothing would pass the loop above, so it must find the new lines.
    const words = Object.values(BUILDING_MODULES).flatMap(stringsOf).join(' ')
    expect(words).toContain('Buildings, first stitch to sealed bag')
    expect(words).toContain('Cut, stitched and finished on one site in Pakistan.')
    expect(HOME_SOURCE).toContain('finished on the same site')
    for (const old of [
      'Cut, stitched and finished in one building in Pakistan.',
      'all happen under one roof',
      'finished on the same floor',
      'The same building, the same team',
      'We do all seven common methods inside our own building.',
      'it applies to everyone in the building.',
      'You collect the goods from our building.',
    ]) {
      expect(old, `the matcher misses "${old}"`).toMatch(ONE_BUILDING)
    }
  })
})
