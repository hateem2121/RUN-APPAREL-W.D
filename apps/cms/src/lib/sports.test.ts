import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_TEAMWEAR } from '../../e2e/fixtures/teamwear'
import { FAMILIES } from './families'
import { sportCounts, sportOf, sportPlaces, sportsFor, TEAMWEAR_SPORTS } from './sports'

/**
 * Polish S7, the owner's answer Q44 (2026-10-04): Teamwear's 19 garments under six sports, with a
 * button for each on the Teamwear page. `e2e/sportFilter.spec.ts` presses them in a browser.
 *
 * What would have to break for these to fail: a garment type sorted under the wrong sport (or none),
 * the buttons in another order than the owner's, a family other than Teamwear growing buttons, or
 * a card's last-row mark disagreeing with its place among its own sport.
 */

const family = (slug: string) => {
  const found = FAMILIES.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no family ${slug}`)
  return found
}

/** The 19 live Teamwear garments, their types and the sport each belongs under (Q44). */
const LIVE = LIVE_TEAMWEAR

const garments = LIVE.map(([, garmentType]) => ({ garmentType }))

describe('Teamwear’s garments under the owner’s six sports (Q44)', () => {
  it('each live garment type is sorted under its sport', () => {
    for (const [name, garmentType, key] of LIVE) {
      expect(sportOf(garmentType, TEAMWEAR_SPORTS)?.key, name).toBe(key)
    }
  })

  it('the buttons are the owner’s, in the owner’s order, with the owner’s counts', () => {
    const counts = sportCounts(sportPlaces(garments, TEAMWEAR_SPORTS), TEAMWEAR_SPORTS)
    expect(counts.map(({ sport, count }) => `${sport.label} ${count}`)).toEqual([
      'Soccer 4',
      'American football 3',
      'Cycling 2',
      'Tennis & pickleball 6',
      'Training 3',
      'Water sports 1',
    ])
  })

  it('a type that names no sport, or no type at all, stays under "All" only', () => {
    for (const garmentType of ["Men's Polo Shirt", 'Football Jersey', 'Bib', '', '   ']) {
      expect(sportOf(garmentType, TEAMWEAR_SPORTS), garmentType).toBeNull()
    }
  })

  it('the first sport a type names wins, in the owner’s order', () => {
    expect(sportOf('Soccer Training Top', TEAMWEAR_SPORTS)?.key).toBe('soccer')
  })

  it('only Teamwear is divided by sport', () => {
    expect(sportsFor(family('teamwear-uniforms'))).toBe(TEAMWEAR_SPORTS)
    for (const entry of FAMILIES.filter(({ slug }) => slug !== 'teamwear-uniforms')) {
      expect(sportsFor(entry), entry.slug).toEqual([])
    }
  })
})

describe('each card knows its place among its own sport (VA-42 while one sport is shown)', () => {
  it('the live order: the cards that move or lie down, and only those', () => {
    const places = sportPlaces(garments, TEAMWEAR_SPORTS)
    const marked = places
      .map((place, at) => ({ name: LIVE[at]?.[0], ...place }))
      .filter((place) => place.cut.length > 0 || place.lie)
      .map(
        ({ name, cut, lie }) =>
          `${name}: ${cut.length ? `starts the last row at ${cut}` : ''}${lie ? 'lies down' : ''}`,
      )
    expect(marked).toEqual([
      // Tennis & pickleball, 6: five columns would leave the sixth alone.
      'TIGER TAIL PROFLEX: starts the last row at 5',
      // American football, 3: two columns would leave the third alone.
      'THE AGGRESSOR UNIFORM: lies down',
      // Soccer, 4: three columns would leave the fourth alone.
      'CLASSIC SOCCER SHIRT: starts the last row at 3',
      // Training, 3.
      'X-MILO TRAINING VEST: lies down',
    ])
  })

  it('a garment under no sport has no marks', () => {
    expect(sportPlaces([{ garmentType: 'Polo Shirt' }], TEAMWEAR_SPORTS)).toEqual([
      { sport: null, cut: [], lie: false },
    ])
  })
})

/*
 * ⚠️ THE STYLESHEET NAMES THE SPORTS. A rule can show one sport's cards only by naming it (CSS cannot
 * compare a radio's value with a card's), so site.css holds one selector per sport. A sport added
 * here without its selector would show every garment under its button.
 */
describe('site.css shows each sport’s cards alone', () => {
  const css = readFileSync(join(import.meta.dirname, '..', 'app', '(frontend)', 'site.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')

  const hides = (key: string) =>
    css.includes(
      `.sport-scope:has(.sport-filter__input[value="${key}"]:checked) .product-grid > .product-card:not([data-sport="${key}"])`,
    )

  it('one rule hides the other sports’ cards, for every sport', () => {
    for (const sport of TEAMWEAR_SPORTS) expect(hides(sport.key), sport.key).toBe(true)
  })

  // NEGATIVE CONTROL: the check does not pass for a sport the stylesheet does not name.
  it('sees a sport with no rule', () => {
    expect(hides('basketball')).toBe(false)
  })
})
