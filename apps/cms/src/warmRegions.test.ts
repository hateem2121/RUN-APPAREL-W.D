import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  cardGarments,
  JUDGED_COUNTRIES,
  PROBES_PER_COUNTRY,
  READ_BACK_BUDGET_MS,
  READ_BACK_MAX,
  REGION_GARMENTS_MAX,
  REGION_TARGETS_MAX,
  readBackPlan,
  regionJudgement,
  regionReport,
  regionTargets,
  regionTimings,
  regionVerdict,
  regionWarmPlan,
  STORE_FIRST_BYTE_P75_MS,
  siteBuildOf,
  stillCold,
  WARM_BUDGET_MS,
  warmWithin,
} from '../../../scripts/warm-regions.mjs'
import { intentTreeFor, stateTreeFor } from '../tapStore.mjs'

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
  it('asks first for the five pages the speed targets are judged on, then the tap and the hover into each, Home included', async () => {
    const targets = await regionTargets({ pages, garments }, ORIGIN)
    const first = ['/', '/products', '/about', '/contact', '/faq']
    expect(targets.slice(0, 5).map(pathOf)).toEqual(first)
    expect(targets.slice(0, 5).every((target) => target.headers.rsc === undefined)).toBe(true)
    expect(targets.slice(5, 15).map(pathOf)).toEqual(first.flatMap((path) => [path, path]))
    expect(targets.slice(5, 15).map((target) => target.headers['next-router-state-tree'])).toEqual(
      first.flatMap((path) => [stateTreeFor(path), intentTreeFor(path)]),
    )
    for (const tap of targets.slice(5, 15)) {
      expect(tap.headers.rsc).toBe('1')
      expect(new URL(tap.url).searchParams.get('_rsc')).toMatch(/^.{16}$/)
    }
  })

  /*
   * 4 Nov 2026: with nested pages left to the US warm-up, 33 of 43 website pages were cold from
   * Lahore 45 minutes after a deploy, every guide, policy and FAQ page among them.
   */
  it("then the first garments' data in the order given, the other top-level pages, then every nested page", async () => {
    const targets = await regionTargets({ pages, garments }, ORIGIN)
    expect(targets.slice(15, 18).map((target) => target.url)).toEqual(garments)
    expect(targets.slice(18).map(pathOf)).toEqual([
      '/custom-teamwear-manufacturer',
      '/guides',
      '/press',
      '/guides/how-a-private-label-order-works',
    ])
    expect(targets.map(pathOf)).not.toContain('/llms.txt')
  })

  it('at 70 it fits every page of the 4 Nov sitemap; at today’s 25 it keeps the judged pages, their taps and the garments', async () => {
    const live = {
      pages: [
        ...pages.slice(0, 7),
        ...Array.from({ length: 16 }, (_, i) => `${ORIGIN}/top-${i}`),
        ...Array.from({ length: 20 }, (_, i) => `${ORIGIN}/guides/nested-${i}`),
      ],
      garments: Array.from({ length: 41 }, (_, i) => `${API}/r-${i}/wine`),
    }
    // The size of 4 Nov to 21 Nov 2026 (one country): every one of the 43 pages.
    const wide = await regionTargets(live, ORIGIN, 70)
    expect(
      wide.filter((target) => !target.headers.rsc && !target.url.startsWith(API)),
    ).toHaveLength(43)
    // Today's (seven countries, 21 Nov 2026): what a buyer opens first, and no nested page.
    const targets = await regionTargets(live, ORIGIN)
    expect(targets).toHaveLength(REGION_TARGETS_MAX)
    expect(targets.filter((target) => target.url.startsWith(API))).toHaveLength(REGION_GARMENTS_MAX)
    const pathsAsked = targets.map((target) => new URL(target.url).pathname)
    // Every judged page this sitemap lists (the fixture holds three of the five).
    const listed = live.pages.map((url) => new URL(url).pathname)
    const judgedHere = ['/', '/products', '/about', '/contact', '/faq'].filter((path) =>
      listed.includes(path),
    )
    expect(judgedHere.length).toBeGreaterThanOrEqual(3)
    for (const judged of judgedHere) expect(pathsAsked, judged).toContain(judged)
    expect(pathsAsked.some((path) => path.startsWith('/guides/nested-'))).toBe(false)
  })

  /**
   * WHAT PRODUCTION DID (21 to 24 Nov 2026). The warm-up's note promised "five more top-level
   * pages" after the garments, and the 25-address cut fell before the first of them: the Russian
   * home page was warmed in none of the seven countries. The sitemap here has the live one's
   * shape: the five judged pages, then /ru and the buyer pages.
   */
  it('warms the first two pages beyond the five judged ones: the Russian home page is one', async () => {
    const live = {
      pages: [
        ...['/', '/products', '/about', '/contact', '/faq'].map((path) => `${ORIGIN}${path}`),
        `${ORIGIN}/ru`,
        `${ORIGIN}/custom-teamwear-manufacturer`,
        `${ORIGIN}/custom-activewear-manufacturer`,
      ],
      garments: Array.from({ length: 41 }, (_, i) => `${API}/r-${i}/wine`),
    }
    const pathsOf = (targets: Array<{ url: string; headers: Record<string, string> }>) =>
      targets.filter((target) => !target.headers.rsc).map((target) => new URL(target.url).pathname)
    const asked = pathsOf(await regionTargets(live, ORIGIN))
    expect(asked).toContain('/ru')
    expect(asked).toContain('/custom-teamwear-manufacturer')
    // The cut is still a cut: the third page beyond the judged five is left to the shared copy.
    expect(asked).not.toContain('/custom-activewear-manufacturer')
    // Nothing was given up for them: every judged page and all ten garments are still asked.
    for (const judged of ['/', '/products', '/about', '/contact', '/faq']) {
      expect(asked, judged).toContain(judged)
    }
    expect(asked.filter((path) => path.startsWith('/api/public/viewer/'))).toHaveLength(
      REGION_GARMENTS_MAX,
    )
    // NEGATIVE CONTROL: at the size of 21 Nov (25) the same sitemap warms neither page.
    const before = pathsOf(await regionTargets(live, ORIGIN, 25))
    expect(before).not.toContain('/ru')
    expect(before).not.toContain('/custom-teamwear-manufacturer')
  })

  it(`asks for at most ${REGION_GARMENTS_MAX} garments, and never more than ${REGION_TARGETS_MAX} addresses`, async () => {
    const many = {
      pages: Array.from({ length: 80 }, (_, i) => `${ORIGIN}/page-${i}`),
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

  // The second pass runs in the same step, so the step's limit must outlast both budgets, or
  // Actions kills it mid-pass (the 27 Oct review found that shape once already).
  it('gives the step more time than the warm-up and the second pass together', () => {
    const at = step('Post-deploy warm-up of the buyer regions')
    const body = ci.slice(at, ci.indexOf('\n      - name:', at + 1))
    const minutes = Number(/\n {8}timeout-minutes: (\d+)\n/.exec(body)?.[1])
    expect(minutes * 60_000).toBeGreaterThan(WARM_BUDGET_MS + READ_BACK_BUDGET_MS + 30_000)
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

/** One probe's answer: its country, the store's verdict (or none) and Globalping's timings. */
const timed = (
  country: string,
  state: string | null,
  firstByte: number,
  total = firstByte + 200,
) => {
  const headers: Record<string, string> = {}
  if (state) headers['server-timing'] = `page-cache;desc="${state}"`
  return { probe: { country }, result: { headers, timings: { firstByte, total } } }
}

/*
 * Review of 27 Oct: Pakistan's timings pooled the store's answers with fresh drawings, so a store
 * that stopped answering there only moved a pooled number. Each state now has its own p75.
 */
describe('regionTimings (the weekly watch, --measure)', () => {
  it("gives each country's p75 per store state, to the first byte and to the last, nearest rank", () => {
    const timings = regionTimings([
      {
        results: [
          timed('PK', 'hit', 100, 300),
          timed('PK', 'hit', 200, 400),
          timed('PK', 'hit', 300, 500),
          timed('PK', 'hit', 900, 1200),
          timed('PK', 'miss', 2500, 3000),
        ],
      },
      { results: [timed('AE', null, 50, 80), { probe: { country: 'AE' }, result: {} }] },
    ])
    expect(timings).toEqual({
      PK: {
        hit: { n: 4, firstByteP75: 300, totalP75: 500 },
        miss: { n: 1, firstByteP75: 2500, totalP75: 3000 },
      },
      AE: { other: { n: 1, firstByteP75: 50, totalP75: 80 } },
    })
  })
})

/*
 * Review of 27 Oct, spec Part 6 Step 2: a second pass after the warm-up, from the same probes, says
 * whether the region then finds the pages kept. The deploy's log showed only "drawn now".
 */
describe('readBackPlan', () => {
  const plan = Array.from({ length: 30 }, (_, i) => ({ type: 'http', target: `t${i}` }))

  it(`asks the first ${READ_BACK_MAX} addresses again, from the probes the warm-up used`, () => {
    const again = readBackPlan(plan, 'warm-id')
    expect(again.length).toBe(READ_BACK_MAX)
    expect(again.map((body) => body.target)).toEqual(
      plan.slice(0, READ_BACK_MAX).map((b) => b.target),
    )
    expect(again.every((body) => body.locations === 'warm-id')).toBe(true)
  })

  it('stays inside the free 250 tests an hour with the warm-up, in every country on the list', () => {
    const file = new URL('../../../scripts/warm-regions.countries.json', import.meta.url)
    const countries = JSON.parse(readFileSync(file, 'utf8')).length
    const tests = (REGION_TARGETS_MAX + READ_BACK_MAX) * countries * PROBES_PER_COUNTRY
    // 27 addresses and 8 read back, seven countries, one probe each (24 Nov 2026; 25 and 231
    // from 21 Nov, which left no room for any page beyond the five judged ones).
    expect(tests).toBe(245)
    expect(tests).toBeLessThan(250)
    // One more address would not fit: the next page has to take a garment's place.
    expect(
      (REGION_TARGETS_MAX + 1 + READ_BACK_MAX) * countries * PROBES_PER_COUNTRY,
    ).toBeGreaterThan(250)
    // NEGATIVE CONTROL: the sizes of 20 Nov (70 addresses, 15 read back, 2 probes) in seven
    // countries would ask for 1,190 tests, nearly five free hours.
    expect((70 + 15) * countries * 2).toBeGreaterThan(250)
  })
})

/*
 * Pakistan's own pass mark (owner, 27 Oct): the second pass must find the store answering, and the
 * store's answers must reach the first byte within 1 s at p75. No Globalping answers at all is
 * inconclusive, never a failure: a probe network that did not answer is not a slow site.
 */
describe('regionJudgement', () => {
  it(`passes when the second pass finds pages kept and kept answers start within ${STORE_FIRST_BYTE_P75_MS} ms`, () => {
    const readBack = [
      { results: [timed('PK', 'hit', 400), timed('PK', 'hit', 600), timed('PK', 'miss', 2000)] },
    ]
    expect(regionJudgement(readBack, readBack)).toEqual({
      PK: { verdict: 'pass', hits: 2, asked: 3, firstByteP75: 600 },
    })
  })

  it('counts a hedged miss (storeHedge.mjs) as a miss, never as a hit or as nothing', () => {
    const readBack = [
      {
        results: [
          timed('PK', 'hit', 400),
          timed('PK', 'hit', 600),
          timed('PK', 'miss-direct', 900),
          timed('PK', 'miss-copy', 300),
        ],
      },
    ]
    expect(regionJudgement(readBack, readBack)).toEqual({
      PK: { verdict: 'pass', hits: 2, asked: 4, firstByteP75: 600 },
    })
  })

  it('fails when the second pass finds nothing kept: the store or the warm-up is broken there', () => {
    const readBack = [{ results: [timed('PK', 'miss', 2000), timed('PK', 'miss', 2100)] }]
    expect(regionJudgement(readBack, readBack).PK).toEqual({
      verdict: 'fail',
      hits: 0,
      asked: 2,
      firstByteP75: null,
    })
  })

  it(`fails when the kept answers take over ${STORE_FIRST_BYTE_P75_MS} ms to the first byte at p75`, () => {
    const readBack = [
      { results: [timed('PK', 'hit', 900), timed('PK', 'hit', 1100), timed('PK', 'hit', 1300)] },
    ]
    expect(regionJudgement(readBack, readBack).PK).toEqual({
      verdict: 'fail',
      hits: 3,
      asked: 3,
      firstByteP75: 1300,
    })
  })

  it("times the store's answers from both passes", () => {
    const warmed = [
      { results: [timed('PK', 'hit', 300), timed('PK', 'hit', 300), timed('PK', 'hit', 300)] },
    ]
    const readBack = [{ results: [timed('PK', 'hit', 1500)] }]
    expect(regionJudgement(readBack, [...warmed, ...readBack]).PK?.firstByteP75).toBe(300)
  })

  it('is inconclusive for a country the second pass got no answer from', () => {
    expect(regionJudgement([{ results: [] }], [])).toEqual({})
  })
})

describe('regionReport: what the log says, and the exit code', () => {
  const pass = [{ results: [timed('PK', 'hit', 400), timed('PK', 'hit', 500)] }]
  const nothingKept = [{ results: [timed('PK', 'miss', 2400)] }]

  it('the weekly watch fails on a broken pass mark, naming the numbers', () => {
    const report = regionReport({ warmed: nothingKept, readBack: nothingKept, measuring: true })
    expect(report.exitCode).toBe(1)
    expect(report.lines.join('\n')).toMatch(/::error::.*PK.*0 of 1/)
  })

  it('the weekly watch passes quietly, printing each state on its own', () => {
    const report = regionReport({ warmed: pass, readBack: pass, measuring: true })
    expect(report.exitCode).toBe(0)
    expect(report.lines.join('\n')).not.toMatch(/::error::|::warning::/)
    expect(report.lines.join('\n')).toMatch(/PK: kept answers p75 500 ms to the first byte/)
  })

  it('after a deploy it only warns, and never fails the deploy', () => {
    const report = regionReport({ warmed: nothingKept, readBack: nothingKept, measuring: false })
    expect(report.exitCode).toBe(0)
    expect(report.lines.join('\n')).toMatch(/::warning::.*PK/)
  })

  it('prints counts and timings only: the Actions log is public', () => {
    const report = regionReport({ warmed: pass, readBack: pass, measuring: true })
    for (const line of report.lines) expect(line).not.toMatch(/https?:\/\/|wear-run|token|cookie/i)
  })
})

describe('the weekly pass mark belongs to the countries it was set for', () => {
  const answer = (country: string, state: 'hit' | 'miss', firstByte: number) => ({
    results: [
      {
        probe: { country },
        result: {
          statusCode: 200,
          headers: { 'server-timing': `page-cache;desc="${state}"` },
          timings: { firstByte, total: firstByte + 50 },
        },
      },
    ],
  })

  it('a slow country with no mark warns in the weekly run and never fails it', () => {
    expect(JUDGED_COUNTRIES).toEqual(['PK'])
    const slowAbroad = [answer('AU', 'hit', 2400), answer('PK', 'hit', 300)]
    const report = regionReport({ warmed: slowAbroad, readBack: slowAbroad, measuring: true })
    expect(report.exitCode).toBe(0)
    expect(report.lines.join('\n')).toMatch(/::warning::AU: .*no pass mark is set/)
    expect(report.lines.join('\n')).not.toMatch(/::error::/)
  })

  it('negative control: the same slow answers from Pakistan do fail it', () => {
    const slowAtHome = [answer('PK', 'hit', 2400), answer('AU', 'hit', 300)]
    const report = regionReport({ warmed: slowAtHome, readBack: slowAtHome, measuring: true })
    expect(report.exitCode).toBe(1)
    expect(report.lines.join('\n')).toMatch(/::error::PK: /)
  })
})

describe('warm-regions.countries.json', () => {
  it('names the buyer regions the owner chose (21 Nov 2026): seven countries', () => {
    // Pakistan, the United States and Canada, the UK and Europe, the Middle East, Australia.
    const file = new URL('../../../scripts/warm-regions.countries.json', import.meta.url)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([
      'PK',
      'US',
      'CA',
      'GB',
      'DE',
      'AE',
      'AU',
    ])
  })
})

/*
 * A deploy that did not change the website build (apps/cms/siteBuild.mjs) leaves every region's
 * pages kept, so warming them again would only spend Globalping's free hour (4 Nov 2026).
 */
describe('the skip when the website build is unchanged', () => {
  const build = `site-${'0123456789abcdef0123'}.${'0123456789ab'}`
  const targets = [
    { url: `${ORIGIN}/`, headers: {} },
    { url: `${ORIGIN}/about?_rsc=x`, headers: { rsc: '1' } },
    { url: `${API}/rxps/wine`, headers: {} },
  ]

  it('reads the build off the page answer’s Server-Timing, and nothing else', () => {
    expect(siteBuildOf(`page-cache;desc="hit", site-build;desc="${build}"`)).toBe(build)
    expect(siteBuildOf('page-cache;desc="hit"')).toBeNull()
    expect(siteBuildOf('site-build;desc="per-deploy"')).toBeNull()
    expect(siteBuildOf(null)).toBeNull()
  })

  it('warms only the garments when the build is known and the same', () => {
    expect(stillCold(targets, build, build).map(pathOf)).toEqual(['/api/public/viewer/rxps/wine'])
  })

  // NEGATIVE CONTROL: any doubt warms everything, as before.
  it('warms everything when the build changed or either side is unknown', () => {
    const other = build.replace('0123', 'ffff')
    expect(stillCold(targets, build, other)).toEqual(targets)
    expect(stillCold(targets, null, build)).toEqual(targets)
    expect(stillCold(targets, build, null)).toEqual(targets)
  })
})
