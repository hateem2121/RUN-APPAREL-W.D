import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as companyPages from './companyPages'
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
}

const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['a founding date for 1889', /founded\b[^.]*1889/i],
  ['a year count ("135 years")', /\b1[3-9]\d[- ]years?\b/i],
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
    const planted =
      'Founded in 1889, with 135 years behind us: our SMETA-certified, BSCI certified ' +
      'factory runs a 21–45 day schedule, printing on fibre with colour, organisation ' +
      'chart in hand, in GOTS-certified garments. 【turn0search1】'
    for (const [what, pattern] of FORBIDDEN) {
      expect(planted, `a matcher no longer fires: ${what}`).toMatch(pattern)
    }
  })
})
