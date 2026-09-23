import { describe, expect, it } from 'vitest'
import {
  FLAG_AT,
  judgePosters,
  median,
  OWNER_EXCEPTIONS,
  type PosterSample,
} from '../../../scripts/poster-sizes.mjs'

/**
 * poster-sizes.mjs judges live poster weight against a per-family median (audit
 * L-11/IM-02). Every number below is a LIVE measurement, not invented — read
 * verbatim off production on 2026-09-17 (rows: r-afp, r-wzu, r-asb, r-ect, the
 * Sportswear family; see scripts/poster-sizes.mjs for how the whole catalogue is
 * fetched). "Before" is what production carried before the trim in
 * scripts/shrink-posters-gently.mjs; "after" is the byte counts that script
 * produces — GENTLE_TRIMS there is judged against this same median.
 */

const SPORTSWEAR = 'Sportswear'

const row = (slug: string, colour: string, bytes: number, family = SPORTSWEAR): PosterSample => ({
  slug,
  colour,
  family,
  bytes,
})

const BEFORE: PosterSample[] = [
  row('r-afp', 'petrol', 24830),
  row('r-afp', 'mustard', 33846),
  row('r-afp', 'sky', 38296),
  row('r-afp', 'mauve', 46580),
  row('r-afp', 'butter', 48988),
  row('r-wzu', 'blush', 173448),
  row('r-wzu', 'butter', 177230),
  row('r-wzu', 'powder-blue', 191264),
  row('r-wzu', 'beige', 181698),
  row('r-wzu', 'plum', 168964),
  row('r-asb', 'petrol', 40548),
  row('r-asb', 'sage', 88260),
  row('r-asb', 'pebble', 107208),
  row('r-asb', 'blush', 105972),
  row('r-asb', 'burgundy', 46690),
  row('r-ect', 'rust', 52024),
  row('r-ect', 'ash', 42704),
  row('r-ect', 'mustard', 50100),
  row('r-ect', 'lilac', 50934),
  row('r-ect', 'sage', 49566),
]

// Only r-wzu (all five, VEST) and r-asb blush/pebble are in GENTLE_TRIMS — the
// other twelve rows are exactly the BEFORE bytes above.
const AFTER: PosterSample[] = BEFORE.map((poster) => {
  const trimmed: Record<string, number> = {
    'r-wzu:blush': 133930,
    'r-wzu:butter': 133180,
    'r-wzu:powder-blue': 139524,
    'r-wzu:beige': 132298,
    'r-wzu:plum': 130004,
    'r-asb:blush': 99020,
    'r-asb:pebble': 99040,
  }
  const bytes = trimmed[`${poster.slug}:${poster.colour}`]
  return bytes === undefined ? poster : { ...poster, bytes }
})

describe('median', () => {
  it('is 0 for an empty list', () => {
    expect(median([])).toBe(0)
  })

  it('is the middle value for an odd count', () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it('is the mean of the two middle values for an even count', () => {
    expect(median([10, 20, 30, 40])).toBe(25)
  })

  it('matches the live Sportswear median measured 2026-09-17', () => {
    expect(median(BEFORE.map((p) => p.bytes))).toBe(50517)
  })
})

describe('OWNER_EXCEPTIONS', () => {
  it('is pinned to the one 2026-09-17 exception', () => {
    expect(OWNER_EXCEPTIONS).toEqual([
      {
        product: 'r-wzu',
        maxRatio: 3,
        reason: 'owner\'s choice on 2026-09-17, "Shrink gently": the vest keeps its detail',
      },
    ])
  })

  it('FLAG_AT is 2', () => {
    expect(FLAG_AT).toBe(2)
  })
})

describe('judgePosters — before the trim', () => {
  it('flags all five r-wzu (above the 3× exception ceiling) and two r-asb', () => {
    const { rows, medians, flagged, excepted } = judgePosters(BEFORE)
    expect(medians).toEqual({ [SPORTSWEAR]: 50517 })
    expect(flagged.map((r) => `${r.slug}:${r.colour}`).sort()).toEqual(
      [
        'r-wzu:blush',
        'r-wzu:butter',
        'r-wzu:powder-blue',
        'r-wzu:beige',
        'r-wzu:plum',
        'r-asb:pebble',
        'r-asb:blush',
      ].sort(),
    )
    expect(excepted).toEqual([])
    expect(rows).toHaveLength(20)
    // Every flagged r-wzu row says why the exception did not cover it.
    for (const r of flagged.filter((r) => r.slug === 'r-wzu')) {
      expect(r.note).toContain('above the 3× exception ceiling')
    }
  })

  it('leaves the rest ok, including r-cch at 1.96× measured live (kept out of this fixture)', () => {
    const { flagged } = judgePosters(BEFORE)
    expect(flagged).toHaveLength(7)
  })
})

describe('judgePosters — after the trim', () => {
  it('flags nothing and excepts the five r-wzu rows', () => {
    const { flagged, excepted } = judgePosters(AFTER)
    expect(flagged).toEqual([])
    expect(excepted.map((r) => r.colour).sort()).toEqual(
      ['blush', 'butter', 'powder-blue', 'beige', 'plum'].sort(),
    )
    expect(excepted.every((r) => r.slug === 'r-wzu')).toBe(true)
  })

  it('negative control: WITHOUT the exception, those same five r-wzu rows flag instead', () => {
    // Proves the exception is doing real work rather than being vacuously true —
    // root CLAUDE.md, "a negative control must run both ways".
    const { flagged, excepted } = judgePosters(AFTER, { exceptions: [] })
    expect(excepted).toEqual([])
    expect(flagged.filter((r) => r.slug === 'r-wzu')).toHaveLength(5)
  })
})

describe('judgePosters — a planted spike', () => {
  it('a 21st Sportswear poster at 110000 moves the median and is itself flagged', () => {
    const planted = [...BEFORE, row('r-ect', 'planted', 110000)]
    const { medians, rows } = judgePosters(planted)
    expect(medians[SPORTSWEAR]).toBe(50934)
    const spike = rows.find((r) => r.colour === 'planted')
    expect(spike?.verdict).toBe('flagged')
    expect(spike?.ratio).toBeCloseTo(2.16, 2)
  })
})

describe('judgePosters — families are judged separately', () => {
  it('the same byte count is ok in one family and flagged in another', () => {
    // Family A's median is 1000 (three equal posters); family B's is 500, made of
    // two small posters and one already-heavy one. A poster of 1900 bytes in family
    // B is 3.8× ITS OWN median — flagged. Judged against family A's median instead
    // it would read as 1.9× — ok. If the two medians were ever accidentally pooled,
    // this is the case that would silently pass.
    const posters: PosterSample[] = [
      row('a1', 'x', 1000, 'Family A'),
      row('a2', 'x', 1000, 'Family A'),
      row('a3', 'x', 1000, 'Family A'),
      row('b1', 'x', 500, 'Family B'),
      row('b2', 'x', 500, 'Family B'),
      row('b3', 'x', 1900, 'Family B'),
    ]
    const { medians, rows } = judgePosters(posters, { exceptions: [] })
    expect(medians).toEqual({ 'Family A': 1000, 'Family B': 500 })
    const spike = rows.find((r) => r.slug === 'b3')
    expect(spike?.ratio).toBeCloseTo(3.8, 5)
    expect(spike?.verdict).toBe('flagged')
    for (const r of rows.filter((r) => r.family === 'Family A')) expect(r.verdict).toBe('ok')
  })
})
