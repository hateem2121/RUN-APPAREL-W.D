import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FOOTER_FACTS, type FooterFacts, problems } from '../../../scripts/apply-footer-facts.mjs'

/**
 * The owner's footer facts, checked BEFORE they are sent to the live CMS.
 *
 * Why this exists rather than trusting Payload to refuse a bad value: the owner runs
 * `apply-footer-facts.mjs` themselves, with their own key, in their own terminal. A
 * validation error there is a message they did not write, about a field they did not
 * choose, with no way to tell whether it is their mistake or ours. Every rule the CMS
 * enforces is restated in `problems()` so a bad value fails here instead — on a dry run,
 * in CI, with a sentence that says which value and why.
 *
 * Each rule is shown CATCHING its fault as well as passing the real values, because a
 * validator that returns [] for everything passes every test written against it. Same
 * standard as `copyRules.test.ts`.
 */

const CMS_ROOT = join(import.meta.dirname, '..')
const settingsSource = readFileSync(join(CMS_ROOT, 'src', 'globals', 'SiteSettings.ts'), 'utf8')

/** A deep copy, so a broken variant cannot leak into the next case. */
const variant = (change: (f: FooterFacts) => void): FooterFacts => {
  const copy = structuredClone(FOOTER_FACTS)
  change(copy)
  return copy
}

describe('the footer facts the owner supplied, 2026-09-16', () => {
  it('are storable exactly as they stand', () => {
    expect(problems()).toEqual([])
  })

  it("carry the owner's own words, not the field help text's example", () => {
    // The field's description suggests "50 pcs per style"; the owner said "50 pieces per
    // style". Their words win — this is their company speaking to their buyers.
    expect(FOOTER_FACTS.capacity.moq).toBe('50 pieces per style')
    expect(FOOTER_FACTS.capacity.leadTime).toBe('2–4 weeks from order confirmation')
  })

  it('store days as select CODES, not the numbers the footer renders', () => {
    /*
     * `projectHours()` maps 'mon' through DAY_INDEX to 0–6 for `formatHours`, so a fixture
     * showing `firstDay: 1` is the PROJECTED shape. Writing a number here would be refused
     * by the select, and the owner would be the one reading the error.
     */
    expect(FOOTER_FACTS.capacity.hoursFirstDay).toBe('mon')
    expect(FOOTER_FACTS.capacity.hoursLastDay).toBe('sat')
    expect(problems(variant((f) => Object.assign(f.capacity, { hoursFirstDay: '1' })))).toEqual([
      'hoursFirstDay "1" is not a day code',
    ])
  })

  it('pad the hour to two digits, because the CMS demands it', () => {
    // The owner wrote "8:00–17:00". `validateClock` is /^([01]\d|2[0-3]):[0-5]\d$/.
    expect(FOOTER_FACTS.capacity.hoursOpen).toBe('08:00')
    expect(problems(variant((f) => Object.assign(f.capacity, { hoursOpen: '8:00' })))).toEqual([
      'hoursOpen "8:00" is not 24-hour HH:MM',
    ])
  })

  it('refuse a value too long for its field', () => {
    expect(problems(variant((f) => Object.assign(f.capacity, { moq: 'x'.repeat(49) })))).toEqual([
      'capacity.moq is over 48 characters',
    ])
    expect(
      problems(variant((f) => Object.assign(f, { worksCoordinates: 'x'.repeat(41) }))),
    ).toEqual(['worksCoordinates is over 40 characters'])
    expect(
      problems(
        variant((f) =>
          Object.assign(f.socialLinks[0] as { label: string }, { label: 'x'.repeat(25) }),
        ),
      ),
    ).toEqual(['social label "xxxxxxxxxxxxxxxxxxxxxxxxx" is over 24 characters'])
  })

  it('refuse a standard that does not say whose it is', () => {
    /*
     * ⚠️ THE POINT OF THE WHOLE BLOCK. RUN APPAREL holds no certification in its own name;
     * the parent is SEDEX-registered and SMETA-audited and the suppliers hold OEKO-TEX,
     * GOTS and GRS. A bare "GOTS" under the footer's Standards block reads as the company's
     * own, which is a claim its buyers may ask it to prove. The owner asked three times for
     * the bare names before ruling on the qualified form, so this guard is load-bearing.
     */
    expect(FOOTER_FACTS.certifications.map((r) => r.name)).toEqual([
      'Parent: SEDEX-registered, SMETA-audited',
      'Suppliers: OEKO-TEX, GOTS, GRS',
    ])
    expect(
      problems(
        variant((f) => Object.assign(f.certifications[0] as { name: string }, { name: 'GOTS' })),
      ),
    ).toEqual(['certification "GOTS" does not say whose standard it is'])
  })

  it('refuse a social link that is not https', () => {
    // A plain-http profile would be a mixed-content warning on the public site.
    expect(
      problems(
        variant((f) =>
          Object.assign(f.socialLinks[0] as { url: string }, { url: 'http://x.test' }),
        ),
      ),
    ).toEqual(['social url "http://x.test" must start with https://'])
  })

  it('still agree with the field limits the CMS actually declares', () => {
    /*
     * The drift guard, and the reason this test reads the source. `problems()` restates the
     * CMS's rules, and a restatement can go stale silently: lower `maxLength` in
     * SiteSettings.ts and this script would keep passing values the server now refuses,
     * with the owner meeting the error. These fail if the two disagree.
     */
    expect(settingsSource).toContain("{ label: 'Monday', value: 'mon' }")
    expect(settingsSource).toContain("{ label: 'Saturday', value: 'sat' }")
    expect(settingsSource).toMatch(/\/\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$\//)
    expect(settingsSource).toMatch(/name: 'worksCoordinates',[\s\S]{0,80}maxLength: 40/)
    expect(settingsSource).toMatch(/name: 'certifications',[\s\S]{0,400}maxLength: 48/)
    expect(settingsSource).toMatch(/name: 'socialLinks',[\s\S]{0,200}maxLength: 24/)
  })
})
