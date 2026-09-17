import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCT } from '../../../scripts/live-products.mjs'
import {
  CATEGORIES,
  classifyRun,
  documentStatus,
  EXPECTED_BELOW_ONE,
  evaluate,
  FORM_FACTORS,
  judgePage,
  LIGHTHOUSE_VERSION,
  measuringMachine,
  median,
  PAGES,
  PERFORMANCE_FLOORS,
  type Run,
  readRun,
} from '../../../scripts/lighthouse-robot.mjs'

/**
 * The Lighthouse robot's judgement, without running Lighthouse.
 *
 * ⚠️ THE FIXTURES COPY TWO REAL REPORTS, because the failure this robot most needs to avoid
 * can only be shown with a real one. Measured 2026-09-16 on Lighthouse 13.4.1 against
 * wear-run.help: the healthy home page (status 200; below one: performance audits and
 * `seo/is-crawlable`) and a page answering 404 — which carried NO `runtimeError` and was
 * scored like any page, with `seo/http-status-code`, `seo/meta-description` and
 * `best-practices/errors-in-console` failing. A Cloudflare challenge is a 403 page of the
 * same kind, so a robot that trusted `runtimeError` would grade Cloudflare as the site.
 *
 * ⚠️ Nothing counts `scripts/` in coverage (see contrastRules.test.ts), so every rule is
 * shown catching its fault AND passing clean input.
 */

type Shape = {
  status?: number
  version?: string
  formFactor?: string
  scores?: Partial<Record<string, number | null>>
  below?: string[]
  url?: string
}

/** A report in the shape Lighthouse 13.4.1 writes, cut to the fields the robot reads. */
const lhr = ({
  status = 200,
  version = '13.4.1',
  formFactor = 'mobile',
  scores = {},
  below = [],
  url = 'https://wear-run.help/',
}: Shape) => ({
  lighthouseVersion: version,
  configSettings: { formFactor },
  mainDocumentUrl: url,
  finalDisplayedUrl: url,
  categories: Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      {
        score: category in scores ? scores[category] : 1,
        auditRefs: below
          .filter((id) => id.startsWith(`${category}/`))
          .map((id) => ({ id: id.slice(category.length + 1), weight: 1 })),
      },
    ]),
  ),
  audits: {
    ...Object.fromEntries(below.map((id) => [id.slice(id.indexOf('/') + 1), { score: 0 }])),
    'network-requests': {
      details: { items: [{ url, resourceType: 'Document', statusCode: status }] },
    },
    'http-status-code': status >= 400 ? { score: 0, displayValue: String(status) } : { score: 1 },
  },
})

const HOME_BELOW = [
  'performance/first-contentful-paint',
  'performance/largest-contentful-paint',
  'performance/speed-index',
  'seo/is-crawlable',
]
const HOME_SCORES = { performance: 0.85, seo: 0.69 }
/** What the real 404 report had failing, beyond `is-crawlable`. */
const ERROR_PAGE_BELOW = [
  'performance/largest-contentful-paint',
  'best-practices/errors-in-console',
  'seo/is-crawlable',
  'seo/meta-description',
  'seo/http-status-code',
]

const runs = (count: number, shape: Shape): Run[] =>
  Array.from({ length: count }, () => readRun(lhr(shape)))

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([0.91, 0.69, 0.86, 0.82, 0.96])).toBe(0.86)
    expect(median([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(0.5, 10)
  })

  it('ignores what is not a number, and has no answer for nothing', () => {
    expect(median([null, 0.5, undefined, Number.NaN, 0.7, 0.9])).toBe(0.7)
    expect(median([])).toBeNull()
    expect(median([null, null])).toBeNull()
  })
})

describe('documentStatus — the guard Lighthouse does not provide', () => {
  it('reads the main document status from network-requests, as in the real 404 report', () => {
    expect(documentStatus(lhr({ status: 404 }))).toBe(404)
    expect(documentStatus(lhr({ status: 200 }))).toBe(200)
  })

  it('falls back to the http-status-code audit when there is no network record', () => {
    expect(
      documentStatus({ audits: { 'http-status-code': { score: 0, displayValue: '403' } } }),
    ).toBe(403)
    expect(documentStatus({ audits: { 'http-status-code': { score: 1 } } })).toBe(200)
  })

  it('never assumes a 200 when the report is silent — negative control', () => {
    expect(documentStatus({ audits: {} })).toBeNull()
    expect(documentStatus({})).toBeNull()
  })
})

describe('readRun', () => {
  it('collects weighted audits below 1, and the scores', () => {
    const run = readRun(lhr({ scores: HOME_SCORES, below: HOME_BELOW }))
    expect(run).toMatchObject({
      missing: false,
      version: '13.4.1',
      status: 200,
      formFactor: 'mobile',
    })
    if (run.missing) throw new Error('unreachable')
    expect(run.belowOne).toEqual(HOME_BELOW)
    expect(run.scores.seo).toBe(0.69)
  })

  it('ignores zero-weight and not-applicable audits, which cannot move a score', () => {
    const report = lhr({})
    const seo = report.categories.seo
    if (!seo) throw new Error('the fixture always builds an seo category')
    seo.auditRefs.push({ id: 'informative', weight: 0 })
    seo.auditRefs.push({ id: 'not-applicable', weight: 1 })
    Object.assign(report.audits, { informative: { score: 0 }, 'not-applicable': { score: null } })
    const run = readRun(report)
    if (run.missing) throw new Error('unreachable')
    expect(run.belowOne).toEqual([])
  })

  it('reports a missing report as missing', () => {
    expect(readRun(null)).toEqual({ missing: true, reason: 'no report was written' })
  })
})

describe('classifyRun', () => {
  it('sets a Bot Fight Mode 403 aside instead of judging it', () => {
    expect(classifyRun(readRun(lhr({ status: 403 }))).kind).toBe('inconclusive')
    expect(classifyRun(readRun(lhr({ status: 429 }))).kind).toBe('inconclusive')
  })

  it('calls any other error status a broken page — negative control for the set-aside', () => {
    expect(classifyRun(readRun(lhr({ status: 404 }))).kind).toBe('broken')
    expect(classifyRun(readRun(lhr({ status: 500 }))).kind).toBe('broken')
    expect(classifyRun(readRun(lhr({ status: 200 }))).kind).toBe('valid')
  })

  it('sets aside a page Lighthouse could not load at all', () => {
    const report = { ...lhr({}), runtimeError: { code: 'NO_FCP', message: 'no paint' } }
    expect(classifyRun(readRun(report))).toMatchObject({ kind: 'inconclusive' })
  })

  it('refuses a report from another Lighthouse', () => {
    expect(classifyRun(readRun(lhr({ version: '12.6.1' }))).kind).toBe('wrong-version')
    expect(LIGHTHOUSE_VERSION).toBe('13.4.1')
  })
})

describe('judgePage', () => {
  it('passes the healthy home page as measured', () => {
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, { scores: HOME_SCORES, below: HOME_BELOW }),
    })
    expect(verdict.failures).toEqual([])
    expect(verdict.inconclusive).toEqual([])
  })

  it('does NOT report the error-page signature when Cloudflare answered 403', () => {
    // The whole reason documentStatus exists: these five runs look like a regression.
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, {
        status: 403,
        scores: { seo: 0.45, 'best-practices': 0.96 },
        below: ERROR_PAGE_BELOW,
      }),
    })
    expect(verdict.failures).toEqual([])
    expect(verdict.inconclusive.join()).toMatch(/not judged/)
  })

  it('fails the same signature when the page itself answered 404 — negative control', () => {
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, { status: 404, below: ERROR_PAGE_BELOW }),
    })
    expect(verdict.failures.join()).toMatch(/HTTP 404 in 5 of 5 runs/)
  })

  it('names a new failing audit that appears in most runs', () => {
    const broken = runs(3, {
      scores: HOME_SCORES,
      below: [...HOME_BELOW, 'accessibility/color-contrast'],
    })
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: [...broken, ...runs(2, { scores: HOME_SCORES, below: HOME_BELOW })],
    })
    expect(verdict.failures).toEqual([
      'home.mobile: accessibility/color-contrast fails in 3 of 5 valid runs.',
    ])
  })

  it('reports a one-run flake as occasional, not as a failure', () => {
    // inspector-issues failed in 1 of 5 products phone runs on 2026-09-15.
    const verdict = judgePage({
      page: 'products',
      formFactor: 'mobile',
      machine: 'local',
      runs: [
        readRun(
          lhr({ scores: HOME_SCORES, below: [...HOME_BELOW, 'best-practices/inspector-issues'] }),
        ),
        ...runs(4, { scores: HOME_SCORES, below: HOME_BELOW }),
      ],
    })
    expect(verdict.failures).toEqual([])
    expect(verdict.advisories.join()).toMatch(/inspector-issues failed in 1 of 5 runs/)
  })

  it('fails when an expected failure stops failing, so the exemption cannot hide a return', () => {
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, { scores: { performance: 0.85 }, below: HOME_BELOW.slice(0, 3) }),
    })
    expect(verdict.failures.join()).toMatch(/seo\/is-crawlable was expected to fail and now passes/)
  })

  it('fails a performance median below the floor, and passes one above it', () => {
    const at = (performance: number) =>
      judgePage({
        page: 'products',
        formFactor: 'mobile',
        machine: 'local',
        runs: runs(5, { scores: { ...HOME_SCORES, performance }, below: HOME_BELOW }),
      }).failures
    expect(at(0.5).join()).toMatch(/performance median 0\.5 is below the local floor of 0\.55/)
    expect(at(0.56)).toEqual([])
  })

  it('does not judge a page with too few valid runs', () => {
    const verdict = judgePage({
      page: 'home',
      formFactor: 'mobile',
      machine: 'local',
      runs: [
        ...runs(2, { scores: HOME_SCORES, below: HOME_BELOW }),
        readRun(null),
        readRun(null),
        readRun(null),
      ],
    })
    expect(verdict.failures).toEqual([])
    expect(verdict.inconclusive.join()).toMatch(/2 valid run\(s\), 3 needed/)
  })

  it('fails agentic browsing on the viewer, where nothing is expected to fail', () => {
    const verdict = judgePage({
      page: 'viewer-rxps-wine',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, {
        scores: { performance: 0.56, 'agentic-browsing': 0.67 },
        below: ['agentic-browsing/llms-txt'],
      }),
    })
    expect(verdict.failures).toEqual([
      'viewer-rxps-wine.mobile: agentic-browsing/llms-txt fails in 5 of 5 valid runs.',
    ])
  })

  it('fails a page with no recorded floor instead of borrowing one', () => {
    const verdict = judgePage({
      page: 'viewer-some-other-garment',
      formFactor: 'mobile',
      machine: 'local',
      runs: runs(5, { scores: { performance: 0.9 } }),
    })
    expect(verdict.failures.join()).toMatch(/no performance floor is recorded/)
  })
})

describe('CSP issues — judged like any other audit', () => {
  /** A run carrying the real `inspector-issues` shape: issue types, each with sub-items. */
  const withInspector = (types: string[]) => {
    const report = lhr({
      scores: { ...HOME_SCORES, 'best-practices': 0.96 },
      below: [...HOME_BELOW, 'best-practices/inspector-issues'],
    })
    Object.assign(report.audits, {
      'inspector-issues': {
        score: 0,
        details: {
          items: types.map((issueType) => ({
            issueType,
            subItems: { items: [{ url: 'https://wear-run.help/_next/static/chunks/a.js' }] },
          })),
        },
      },
    })
    return readRun(report)
  }
  const contactDesktop = (types: string[]) =>
    judgePage({
      page: 'contact',
      formFactor: 'desktop',
      machine: 'local',
      runs: Array.from({ length: 5 }, () => withInspector(types)),
    }).failures

  // The 2026-09-16 live pattern, which an exemption briefly sheltered. The report keeps only
  // each issue's URL, so the same shape is also what a REAL enforced block looks like.
  it('fails CSP-only inspector issues in most runs', () => {
    expect(contactDesktop(['Content security policy'])).toEqual([
      'contact.desktop: best-practices/inspector-issues fails in 5 of 5 valid runs.',
    ])
  })

  it('fails every other issue type the same way (positive control)', () => {
    expect(contactDesktop(['Mixed content'])).toEqual([
      'contact.desktop: best-practices/inspector-issues fails in 5 of 5 valid runs.',
    ])
  })

  it('records a CSP-only run under the plain audit id, with no triage suffix', () => {
    const run = withInspector(['Content security policy'])
    expect(run.missing).toBe(false)
    if (run.missing) return
    expect(run.belowOne).toContain('best-practices/inspector-issues')
    expect(run.belowOne.filter((id) => id.includes('['))).toEqual([])
  })
})

describe('evaluate', () => {
  it('is ok when nothing fails, even with a page not judged', () => {
    const verdict = evaluate([
      {
        page: 'home',
        formFactor: 'mobile',
        machine: 'local',
        runs: runs(5, { scores: HOME_SCORES, below: HOME_BELOW }),
      },
      { page: 'contact', formFactor: 'mobile', machine: 'local', runs: runs(5, { status: 403 }) },
    ])
    expect(verdict.ok).toBe(true)
    expect(verdict.lines).toHaveLength(2)
  })

  it('is not ok when any page fails', () => {
    const verdict = evaluate([
      { page: 'home', formFactor: 'mobile', machine: 'local', runs: runs(5, { status: 404 }) },
    ])
    expect(verdict.ok).toBe(false)
  })
})

describe('the page list and its floors cannot drift apart', () => {
  it('takes the viewer page from DEFAULT_PRODUCT, never a typed slug', () => {
    const viewer = PAGES.find((page) => page.name.startsWith('viewer-'))
    expect(viewer?.url).toBe(
      `https://viewer.wear-run.help/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`,
    )
  })

  it('has a floor for every page on every form factor', () => {
    const keys = PAGES.flatMap((page) => FORM_FACTORS.map((factor) => `${page.name}.${factor}`))
    for (const machine of ['local', 'github-runner'] as const) {
      const missing = keys.filter((key) => !(key in PERFORMANCE_FLOORS[machine]))
      expect(missing).toEqual([])
      for (const value of Object.values(PERFORMANCE_FLOORS[machine])) {
        expect(typeof value).toBe('number')
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('pins the same Lighthouse that the root package.json installs', () => {
    // `npx lighthouse@x` would fetch at run time, past the lockfile, the release cooldown and
    // Socket. The robot runs the installed binary, so the two versions must never differ.
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
    expect(pkg.devDependencies?.lighthouse).toBe(LIGHTHOUSE_VERSION)
  })

  it('only exempts pages that exist', () => {
    const names = new Set(PAGES.map((page) => page.name))
    expect(Object.keys(EXPECTED_BELOW_ONE).filter((name) => !names.has(name))).toEqual([])
  })
})

describe('each measuring machine has its own floors', () => {
  it('a GitHub runner is recognised by the variable every runner sets', () => {
    expect(measuringMachine({ GITHUB_ACTIONS: 'true' })).toBe('github-runner')
    expect(measuringMachine({})).toBe('local')
    expect(measuringMachine({ GITHUB_ACTIONS: 'false' })).toBe('local')
  })

  it('judges a page against the floors it is given, not a global', () => {
    const at = (floor: number) =>
      judgePage({
        page: 'products',
        formFactor: 'mobile',
        machine: 'github-runner',
        floors: { 'products.mobile': floor },
        runs: runs(5, { scores: { ...HOME_SCORES, performance: 0.6 }, below: HOME_BELOW }),
      }).failures
    expect(at(0.5)).toEqual([])
    expect(at(0.7).join()).toMatch(
      /performance median 0\.6 is below the github-runner floor of 0\.7/,
    )
  })

  it('prints every run and the median slowest round-trip, so a failure explains itself', () => {
    const scored = [0.61, 0.58, 0.55, 0.9, 0.82].map((performance, index) => ({
      ...readRun(lhr({ scores: { ...HOME_SCORES, performance }, below: HOME_BELOW })),
      rttMs: [596, 518, 126, 280, 375][index],
    })) as Run[]
    const { line } = judgePage({
      page: 'products',
      formFactor: 'mobile',
      machine: 'local',
      runs: scored,
    })
    expect(line).toContain('perf runs 0.61/0.58/0.55/0.9/0.82')
    expect(line).toContain('rtt 375ms')
  })

  it('reads the round-trip time from the report, and says so when it is absent', () => {
    const report = lhr({ scores: HOME_SCORES, below: HOME_BELOW })
    expect((readRun(report) as { rttMs: number | null }).rttMs).toBeNull()
    Object.assign(report.audits, { 'network-rtt': { score: null, numericValue: 212.4 } })
    expect((readRun(report) as { rttMs: number | null }).rttMs).toBe(212.4)
  })
})
