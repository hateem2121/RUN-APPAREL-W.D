import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  REGION_TARGETS_MAX,
  regionTargets,
  regionVerdict,
  regionWarmPlan,
} from '../../../scripts/warm-regions.mjs'

/**
 * The buyer regions' warm-up (faster-taps plan, Task 8): after each deploy, home-network probes in
 * Pakistan (Globalping, free) ask for the main pages and their taps, so the shared store's copies
 * in the buyers' own region are drawn before a buyer arrives. The spike of 27 Oct: 21 pages cold
 * when two Pakistan probes asked, then hit for the other Pakistan probes (Karachi, Islamabad,
 * Lahore data centres) and this Mac. It must never fail a deploy, never send a credential, and
 * stay inside Globalping's free 250 tests an hour.
 */
const ORIGIN = 'https://wear-run.com'
const pages = [
  `${ORIGIN}/`,
  `${ORIGIN}/products`,
  `${ORIGIN}/about`,
  `${ORIGIN}/guides`,
  `${ORIGIN}/guides/how-a-private-label-order-works`,
  `${ORIGIN}/llms.txt`,
]

describe('regionTargets', () => {
  it('asks for the top-level pages, then the tap into each from the home page', async () => {
    const targets = await regionTargets(pages, ORIGIN)
    const paths = targets.map((target) => new URL(target.url).pathname)
    expect(paths.slice(0, 4)).toEqual(['/', '/products', '/about', '/guides'])
    expect(paths).not.toContain('/guides/how-a-private-label-order-works')
    expect(paths).not.toContain('/llms.txt')
    const taps = targets.filter((target) => target.headers.rsc === '1')
    expect(taps.map((tap) => new URL(tap.url).pathname)).toEqual(['/products', '/about', '/guides'])
    for (const tap of taps) expect(new URL(tap.url).searchParams.get('_rsc')).toMatch(/^.{16}$/)
  })

  it(`never asks for more than ${REGION_TARGETS_MAX}`, async () => {
    const many = Array.from({ length: 40 }, (_, i) => `${ORIGIN}/page-${i}`)
    expect((await regionTargets(many, ORIGIN)).length).toBe(REGION_TARGETS_MAX)
  })
})

describe('regionWarmPlan', () => {
  const targets = Array.from({ length: 30 }, (_, i) => ({
    url: `${ORIGIN}/page-${i}?_rsc=abc`,
    headers: { rsc: '1', 'next-router-state-tree': '%5B%22%22%5D' },
  }))

  it('stays well inside the free 250 tests an hour: under 100 for 30 targets, one country, 2 probes', () => {
    const plan = regionWarmPlan(targets, ['PK'], 2)
    const tests = plan.reduce(
      (sum, body) =>
        sum +
        body.locations.reduce((n: number, location: { limit: number }) => n + location.limit, 0),
      0,
    )
    expect(tests).toBe(60)
    expect(tests).toBeLessThan(100)
  })

  it('asks home-network probes in each country for the exact page and headers', () => {
    const [body] = regionWarmPlan(targets.slice(0, 1), ['PK', 'AE'], 2)
    expect(body).toEqual({
      type: 'http',
      target: 'wear-run.com',
      locations: [
        { country: 'PK', tags: ['eyeball-network'], limit: 2 },
        { country: 'AE', tags: ['eyeball-network'], limit: 2 },
      ],
      measurementOptions: {
        protocol: 'HTTPS',
        request: {
          method: 'GET',
          path: '/page-0',
          query: '_rsc=abc',
          headers: { rsc: '1', 'next-router-state-tree': '%5B%22%22%5D' },
        },
      },
    })
  })

  it('never sends a cookie or an authorization header', () => {
    const [body] = regionWarmPlan(
      [
        {
          url: `${ORIGIN}/`,
          headers: { cookie: 'payload-token=x', Authorization: 'users x', rsc: '1' },
        },
      ],
      ['PK'],
      2,
    )
    if (!body) throw new Error('no measurement planned')
    const sent = Object.keys(body.measurementOptions.request.headers ?? {}).map((name) =>
      name.toLowerCase(),
    )
    expect(sent).toEqual(['rsc'])
  })
})

describe('regionVerdict', () => {
  it("counts each probe's store state per country, from page or garment-data timing", () => {
    const answer = (country: string, timing?: string | string[]) => {
      const headers: Record<string, string | string[]> = {}
      if (timing !== undefined) headers['server-timing'] = timing
      return { probe: { country }, result: { headers } }
    }
    const verdict = regionVerdict([
      {
        results: [
          answer('PK', 'page-cache;desc="hit"'),
          answer('PK', ['cfL4;desc="x"', 'api-cache;desc="miss"']),
          answer('PK'),
          answer('AE', 'page-cache;desc="miss"'),
        ],
      },
      { results: [answer('PK', 'page-cache;desc="hit"')] },
    ])
    expect(verdict).toEqual({
      PK: { hit: 2, miss: 1, other: 1 },
      AE: { hit: 0, miss: 1, other: 0 },
    })
  })
})

describe('warm-regions.countries.json', () => {
  it('names the buyer regions the owner chose: Pakistan', () => {
    const file = new URL('../../../scripts/warm-regions.countries.json', import.meta.url)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['PK'])
  })
})
