import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Browser, expect, type Page, test } from '@playwright/test'
import { BEACON_SRC } from '../../../packages/shared/src/analyticsBeacon'

/**
 * The visit counter's loader, run where it runs: the BUILT garment page, in a browser, under the
 * page's own security policy (2026-10-08; `packages/shared/src/analyticsBeacon.ts` has the rule).
 *
 * `e2e/serve.mjs` strips the loader from every other test's page so the suite never reports to
 * Cloudflare. This file hands the browser the page exactly as it is built instead, and answers the
 * beacon itself, so nothing leaves the machine either.
 *
 * WHY A BROWSER. The first version ran the loader's text in Node (`node:vm`), which CodeQL reports
 * as hard-coded data interpreted as code (PR #152). A browser is also the better instrument: the
 * person's case below fails if the page's policy stops admitting the loader (its hash comes from
 * `scripts/csp.mjs`), which no Node run could see.
 */
const BUILT = readFileSync(join(import.meta.dirname, '..', 'dist', 'index.html'), 'utf8')
const PATH = '/n001/wine'
/** The wear-run.com Web Analytics site's public tag (a site tag, not a secret). */
const TOKEN = '17250268831a423ea902fe766fa5feed'
const PERSON =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

interface Visit {
  loaderInPage: boolean
  requested: string[]
  added: { type: string; src: string }[]
}

async function visit(page: Page, { webdriver }: { webdriver: boolean }): Promise<Visit> {
  const requested: string[] = []
  await page.route(`${BEACON_SRC}*`, async (route) => {
    requested.push(route.request().url())
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
  })
  // The page as built, with the headers the test server sends for it (the real policy).
  await page.route(
    (url) => url.pathname === PATH,
    async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      delete headers['content-length']
      delete headers['content-encoding']
      await route.fulfill({ status: response.status(), headers, body: BUILT })
    },
  )
  if (!webdriver) {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    })
  }
  await page.goto(PATH)
  await page.waitForLoadState('load')
  const seen = await page.evaluate(() => ({
    // The instrument's control: the loader really is in this page, so "nothing added" means
    // the loader chose not to, not that it was missing.
    loaderInPage: [...document.scripts].some(
      (script) => !script.src && script.text.startsWith('if(!navigator.webdriver'),
    ),
    added: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((script) => ({
      type: script.type,
      src: script.src,
    })),
  }))
  return { ...seen, requested }
}

async function asAgent(browser: Browser, userAgent: string, webdriver: boolean) {
  const context = await browser.newContext({ userAgent })
  const result = await visit(await context.newPage(), { webdriver })
  await context.close()
  return result
}

/** Every script the page added from the beacon's host, compared by origin, never by text. */
const BEACON_ORIGIN = new URL(BEACON_SRC).origin
const beaconTags = (seen: Visit) =>
  seen.added.filter((tag) => new URL(tag.src).origin === BEACON_ORIGIN)

test.describe('the visit counter skips automated browsers, on the built garment page', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'one engine: the rule is plain script, and Chromium is what Playwright and Lighthouse drive',
  )

  test('a person: the beacon is added once, as a module, with the site tag in its address', async ({
    browser,
  }) => {
    const seen = await asAgent(browser, PERSON, false)
    expect(seen.loaderInPage, 'the built page carries the loader').toBe(true)
    expect(seen.requested).toEqual([`${BEACON_SRC}?token=${TOKEN}`])
    expect(beaconTags(seen)).toEqual([{ type: 'module', src: `${BEACON_SRC}?token=${TOKEN}` }])
  })

  // A person's user agent, so only the webdriver rule can be what stops it: Playwright's own
  // headless agent says "HeadlessChrome", which the second rule would catch on its own.
  test('navigator.webdriver, with a person’s user agent: nothing is added or requested', async ({
    browser,
  }) => {
    const seen = await asAgent(browser, PERSON, true)
    expect(seen.loaderInPage, 'the built page carries the loader').toBe(true)
    expect(seen.requested).toEqual([])
    expect(beaconTags(seen)).toEqual([])
  })

  for (const [name, userAgent] of [
    ['HeadlessChrome', PERSON.replace('Chrome/141', 'HeadlessChrome/141')],
    ['Chrome-Lighthouse', `${PERSON} Chrome-Lighthouse`],
  ] as const) {
    test(`${name} in the user agent, even without webdriver: nothing is added or requested`, async ({
      browser,
    }) => {
      const seen = await asAgent(browser, userAgent, false)
      expect(seen.loaderInPage, 'the built page carries the loader').toBe(true)
      expect(seen.requested).toEqual([])
      expect(beaconTags(seen)).toEqual([])
    })
  }
})
