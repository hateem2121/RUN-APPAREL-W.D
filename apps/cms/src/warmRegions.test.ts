import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cardGarments,
  REGION_GARMENTS_MAX,
  REGION_TARGETS_MAX,
  regionTargets,
  regionTimings,
  regionVerdict,
  regionWarmPlan,
  warmWithin,
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
const API = 'https://cms.wear-run.help/api/public/viewer'
// In the live sitemap's order (read 27 Oct): the buyer pages and guides come before About, FAQ and
// Contact.
const pages = [
  `${ORIGIN}/`,
  `${ORIGIN}/products`,
  `${ORIGIN}/custom-teamwear-manufacturer`,
  `${ORIGIN}/guides`,
  `${ORIGIN}/press`,
  `${ORIGIN}/about`,
  `${ORIGIN}/faq`,
  `${ORIGIN}/guides/how-a-private-label-order-works`,
  `${ORIGIN}/contact`,
  `${ORIGIN}/llms.txt`,
]
const garments = [`${API}/r-xmp/wine`, `${API}/rxps/wine`, `${API}/r-wsa/plum`]
const pathOf = (target: { url: string }) => new URL(target.url).pathname

/*
 * Review, 27 Oct: the list followed the sitemap's order and dropped the tap into Home, so with the
 * cap the taps warmed in Pakistan were /products, the buyer pages, /guides, /policies, /careers,
 * /community and /press, never About, Contact, FAQ or Home, and no garment's data, though the spec
 * (Part 6, Step 2) names "the main pages, their tap data and the most-opened garments' data".
 */
describe('regionTargets', () => {
  it('asks first for the five pages the speed targets are judged on, then the tap into each, Home included', async () => {
    const targets = await regionTargets({ pages, garments }, ORIGIN)
    const first = ['/', '/products', '/about', '/contact', '/faq']
    expect(targets.slice(0, 5).map(pathOf)).toEqual(first)
    expect(targets.slice(0, 5).every((target) => target.headers.rsc === undefined)).toBe(true)
    expect(targets.slice(5, 10).map(pathOf)).toEqual(first)
    for (const tap of targets.slice(5, 10)) {
      expect(tap.headers.rsc).toBe('1')
      expect(new URL(tap.url).searchParams.get('_rsc')).toMatch(/^.{16}$/)
    }
  })

  it("then the first garments' data in the order given, then the other top-level pages", async () => {
    const targets = await regionTargets({ pages, garments }, ORIGIN)
    expect(targets.slice(10, 13).map((target) => target.url)).toEqual(garments)
    expect(targets.slice(13).map(pathOf)).toEqual([
      '/custom-teamwear-manufacturer',
      '/guides',
      '/press',
    ])
    expect(targets.map(pathOf)).not.toContain('/guides/how-a-private-label-order-works')
    expect(targets.map(pathOf)).not.toContain('/llms.txt')
  })

  it(`asks for at most ${REGION_GARMENTS_MAX} garments, and never more than ${REGION_TARGETS_MAX} addresses`, async () => {
    const many = {
      pages: Array.from({ length: 40 }, (_, i) => `${ORIGIN}/page-${i}`),
      garments: Array.from({ length: 41 }, (_, i) => `${API}/r-${i}/wine`),
    }
    const targets = await regionTargets(many, ORIGIN)
    expect(targets.length).toBe(REGION_TARGETS_MAX)
    expect(targets.filter((target) => target.url.startsWith(API)).length).toBe(REGION_GARMENTS_MAX)
  })
})

/*
 * Measured 27 Oct: the products page leads with r-asb, r-wzu, r-ect…, which the sitemap lists 20th
 * to 30th, so the sitemap's first ten are not the cards a buyer sees first. Each card holds one
 * slide link per colour; the one in the tab order is the colour it shows (markup copied from the
 * live page that day).
 */
describe('cardGarments', () => {
  const slide = (product: string, colour: string, showing: boolean) =>
    `<a class="card-gallery__slide" href="${ORIGIN}/products/${product}/${colour}" tabindex="${showing ? 0 : -1}" data-kind="render"></a>`
  const card = (product: string, showing: string, others: string[]) =>
    `<li class="product-card">${slide(product, showing, true)}${others.map((colour) => slide(product, colour, false)).join('')}</li>`

  it("reads each card's showing garment, in the page's order, as its data address", () => {
    const html = `<ul>${card('r-asb', 'petrol', ['sage', 'pebble'])}${card('r-wzu', 'blush', ['navy'])}${card('r-ect', 'rust', [])}</ul>`
    expect(cardGarments(html)).toEqual([
      `${API}/r-asb/petrol`,
      `${API}/r-wzu/blush`,
      `${API}/r-ect/rust`,
    ])
  })

  it('reads a card link written as a path, and nothing that is not a card', () => {
    const html = `<a href="${ORIGIN}/products/r-zz/red">a plain link</a><a class="card-gallery__slide" href="/products/r-cat/maroon" tabindex="0"></a>`
    expect(cardGarments(html)).toEqual([`${API}/r-cat/maroon`])
  })
})

/*
 * Review, 27 Oct: the 4-minute budget was checked only before a NEW measurement started, so three
 * slow ones already running could carry the step past its 5 minutes; Actions would kill it, turn a
 * good deploy red, fire the failed-deploy alert and skip the checks after it.
 */
describe('warmWithin', () => {
  const plan = [{ type: 'http', target: 'wear-run.com' }, { type: 'http' }, { type: 'http' }]

  it('asks the first address alone, then every other one from the same probes', async () => {
    const asked: unknown[] = []
    const result = await warmWithin(
      plan,
      async (body: unknown) => {
        asked.push(body)
        return { id: 'first-id', results: [] }
      },
      1_000,
    )
    expect(result.stopped).toBeNull()
    expect(result.done.length).toBe(3)
    expect(asked.slice(1)).toEqual([
      { type: 'http', locations: 'first-id' },
      { type: 'http', locations: 'first-id' },
    ])
  })

  it('stops waiting at its budget even when a measurement never ends', async () => {
    const started = Date.now()
    const result = await warmWithin(plan, () => new Promise(() => {}), 50)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(result).toEqual({ done: [], stopped: 'budget' })
  })

  it("hands each measurement the budget's signal, so a request still in flight is cancelled", async () => {
    let signal: AbortSignal | undefined
    await warmWithin(
      plan,
      (_body: unknown, given: AbortSignal) => {
        signal = given
        return new Promise(() => {})
      },
      50,
    )
    expect(signal?.aborted).toBe(true)
  })

  it('reports a Globalping error by its sentence, keeping what was warmed before it', async () => {
    let calls = 0
    const result = await warmWithin(
      plan,
      async () => {
        calls += 1
        if (calls === 2) throw new Error('Globalping limit reached (429)')
        return { id: 'first-id', results: [] }
      },
      1_000,
    )
    expect(result.stopped).toBe('Globalping limit reached (429)')
    expect(result.done.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ci.yml', () => {
  const ci = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const step = (name: string) => ci.indexOf(`      - name: ${name}`)

  it('warms the buyer regions after the checks that gate the deploy, and never fails it', () => {
    const at = step('Post-deploy warm-up of the buyer regions')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(step('Post-deploy security.txt and redirect headers'))
    expect(at).toBeGreaterThan(step('Post-deploy Bing IndexNow instant indexation'))
    const body = ci.slice(at, ci.indexOf('\n      - name:', at + 1))
    expect(body).toMatch(/\n {8}continue-on-error: true\n/)
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

describe('regionTimings (the weekly watch, --measure)', () => {
  it("gives each country's p75 of the time to the first byte and to the last, nearest rank", () => {
    const answer = (country: string, firstByte: number, total: number) => ({
      probe: { country },
      result: { timings: { firstByte, total } },
    })
    const timings = regionTimings([
      {
        results: [
          answer('PK', 100, 300),
          answer('PK', 200, 400),
          answer('PK', 300, 500),
          answer('PK', 900, 1200),
        ],
      },
      { results: [answer('AE', 50, 80), { probe: { country: 'AE' }, result: {} }] },
    ])
    expect(timings).toEqual({
      PK: { n: 4, firstByteP75: 300, totalP75: 500 },
      AE: { n: 1, firstByteP75: 50, totalP75: 80 },
    })
  })
})

describe('warm-regions.countries.json', () => {
  it('names the buyer regions the owner chose: Pakistan', () => {
    const file = new URL('../../../scripts/warm-regions.countries.json', import.meta.url)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(['PK'])
  })
})
