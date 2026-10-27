/**
 * How long a buyer waits after a tap on wear-run.com, measured on the live site (faster-taps plan,
 * Task 1; docs/superpowers/specs/2026-10-27-faster-taps-edge-store-intent-design.md, Part 5).
 *
 * WHY. On 26 Oct the first tap after arriving waited 2.85–3.75 s and a product card's garment
 * loading screen lifted after 4.1 s, measured by a throwaway probe. This is that probe made
 * repeatable, so the speed work is judged before and after by a machine, never by eye.
 *
 * WHAT IT MEASURES. Each tap runs in a FRESH browser, so it is a visit's first tap to that page and
 * the browser's own cache never answers. A desktop tap moves the mouse onto the link 300 ms before
 * the click; a phone tap sends `touchstart` 100 ms before it (the intent a real hand gives). The
 * time is the click until the address changes, taken inside the page. The store's verdict comes
 * from the tap answer's `Server-Timing` (`page-cache;desc=…`), so a warm tap and a cold one are
 * never pooled: G1 (under 0.4 s, 3 in 4) is judged on warm taps only, and every row is printed.
 *
 * ⚠️ `--refuse-store` IS THE NEGATIVE CONTROL. It sends a CMS login cookie the store refuses
 * (pageCache.mjs SIGNED_IN_OR_DRAFT), so every answer is drawn and the verdict must FAIL. A
 * measurement that passes with it proves nothing.
 *
 * Prints one JSON document; exit 0 pass, 1 fail, 2 inconclusive (a 403, 429 or 503: a blocked
 * probe is not a slow site). Blocks 3D model files: nothing measured here waits on them.
 *
 * Usage: node apps/cms/scripts/measure-taps.mjs --origin=https://wear-run.com [--taps=20] [--refuse-store]
 */
import { realpathSync } from 'node:fs'

/** G1: a tap shows the new page in under 0.4 s. */
export const TAP_TARGET_MS = 400
/** G2: a card's garment loading screen starts to lift within 1.5 s. */
export const GARMENT_TARGET_MS = 1500

const DESTINATIONS = ['/', '/products', '/about', '/contact', '/faq']
const START_PAGES = ['/faq', '/contact', '/']
const GARMENT_PATH = /^\/products\/[^/]+\/[^/]+$/
const BLOCKED_STATUS = new Set([403, 429, 503])

/** Nearest-rank percentile. */
export function percentile(values, p) {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)))
  return sorted[rank - 1]
}

/** The store's verdict carried in a Server-Timing header, or 'none'. */
export function storeStateOf(serverTiming) {
  const match = /(?:page|api)-cache;desc="(hit|miss|skip)"/.exec(serverTiming ?? '')
  return match ? match[1] : 'none'
}

/**
 * Warm: the store answered (`hit`), or the browser answered the tap itself with no request at all
 * (`client`, which Next can do for a page it has already prefetched whole).
 */
const WARM = new Set(['hit', 'client'])

/**
 * p50/p75 per route and engine over WARM taps; `n` counts every tap. A route with no warm tap
 * fails: a pass must rest on something measured.
 *
 * @param {Array<{ route: string, engine: string, ms: number, state: string }>} rows
 * @param {number} targetMs
 * @returns {{ pass: boolean, byRoute: Record<string, { p50: number, p75: number, n: number }> }}
 */
export function verdict(rows, targetMs) {
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.route} ${row.engine}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  /** @type {Record<string, { p50: number, p75: number, n: number }>} */
  const byRoute = {}
  let pass = groups.size > 0
  for (const [key, group] of groups) {
    const warm = group.filter((row) => WARM.has(row.state)).map((row) => row.ms)
    const p75 = percentile(warm, 75)
    byRoute[key] = { p50: percentile(warm, 50), p75, n: group.length }
    if (!(p75 < targetMs)) pass = false
  }
  return { pass, byRoute }
}

function options(argv) {
  const get = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]
  return {
    origin: get('origin') ?? 'https://wear-run.com',
    taps: Number(get('taps') ?? 20),
    refuseStore: argv.includes('--refuse-store'),
  }
}

const ENGINES = (devices) => [
  { name: 'chromium', launcher: 'chromium', context: { viewport: { width: 1440, height: 900 } } },
  { name: 'webkit-phone', launcher: 'webkit', context: { ...devices['iPhone 15'] } },
]

async function freshPage(browser, engine, opts) {
  const context = await browser.newContext(engine.context)
  await context.route('**/*.glb', (route) => route.abort())
  if (opts.refuseStore) {
    const { hostname } = new URL(opts.origin)
    await context.addCookies([
      { name: 'payload-token', value: 'probe', domain: hostname, path: '/' },
    ])
  }
  return { context, page: await context.newPage() }
}

/** Show intent the way a hand does, then click. */
async function intentClick(link, engine) {
  if (engine.name === 'chromium') {
    await link.hover()
    await link.page().waitForTimeout(300)
    await link.click()
  } else {
    await link.dispatchEvent('touchstart')
    await link.page().waitForTimeout(100)
    await link.tap()
  }
}

async function oneTap(browser, engine, destination, opts) {
  const { context, page } = await freshPage(browser, engine, opts)
  try {
    // No tap answer at all means the browser answered from its own router cache: 'client'.
    let state = 'client'
    let blocked = false
    page.on('response', async (response) => {
      if (BLOCKED_STATUS.has(response.status())) blocked = true
      const url = new URL(response.url())
      if (!url.searchParams.has('_rsc') || url.pathname !== destination) return
      // The tap's own data, or a full intent prefetch of it; never the 2 KB layout prefetch.
      if (response.request().headers()['next-router-prefetch']) return
      state = storeStateOf(await response.headerValue('server-timing'))
    })
    for (const start of START_PAGES.filter((path) => path !== destination)) {
      const answer = await page.goto(opts.origin + start, { waitUntil: 'load', timeout: 60_000 })
      if (answer && BLOCKED_STATUS.has(answer.status())) return { blocked: true }
      // A link a finger can reach: on a phone the menu's links are hidden until it opens.
      const link = page.locator(`a[href="${destination}"]`).filter({ visible: true }).first()
      if ((await link.count()) === 0) continue
      state = 'client'
      await page.waitForTimeout(1500)
      await page.evaluate((to) => {
        window.__tap = { t0: null, t1: null }
        document.addEventListener(
          'click',
          () => {
            window.__tap.t0 ??= performance.now()
            const watch = () => {
              if (location.pathname === to) window.__tap.t1 = performance.now()
              else requestAnimationFrame(watch)
            }
            requestAnimationFrame(watch)
          },
          { capture: true, once: true },
        )
      }, destination)
      await intentClick(link, engine)
      await page.waitForFunction(() => window.__tap?.t1 !== null, null, { timeout: 30_000 })
      const tap = await page.evaluate(() => window.__tap)
      await page.waitForTimeout(300)
      return {
        route: destination,
        engine: engine.name,
        from: start,
        ms: Math.round(tap.t1 - tap.t0),
        state,
        blocked,
      }
    }
    return { route: destination, engine: engine.name, error: 'no start page links here' }
  } finally {
    await context.close()
  }
}

async function oneGarmentOpen(browser, engine, opts) {
  const { context, page } = await freshPage(browser, engine, opts)
  try {
    let state = 'none'
    page.on('response', async (response) => {
      if (response.url().includes('/api/public/viewer/')) {
        state = storeStateOf(await response.headerValue('server-timing'))
      }
    })
    const answer = await page.goto(`${opts.origin}/products`, {
      waitUntil: 'load',
      timeout: 60_000,
    })
    if (answer && BLOCKED_STATUS.has(answer.status())) return { blocked: true }
    await page.waitForTimeout(1500)
    // The card's showing picture: the one slide in the tab order (CardGallery.tsx), the link a
    // finger lands on. Its href is a full address, so the path is read, never matched as text.
    const link = page.locator('.product-card a.card-gallery__slide[tabindex="0"]').first()
    const raw = (await link.count()) > 0 ? await link.getAttribute('href') : null
    const href = raw ? new URL(raw, opts.origin).pathname : null
    if (!href || !GARMENT_PATH.test(href)) {
      return { route: 'card → garment', engine: engine.name, error: 'no garment card' }
    }
    // The clock starts at the click, not at the hover before it, and survives the page change:
    // the garment page is the same origin, so this tab's sessionStorage carries the moment across.
    await page.evaluate(() => {
      document.addEventListener(
        'click',
        () => sessionStorage.setItem('__tapT0', String(Date.now())),
        {
          capture: true,
          once: true,
        },
      )
    })
    await intentClick(link, engine)
    await page.waitForURL((url) => url.pathname === href, { timeout: 60_000 })
    const lifted = await page.waitForFunction(
      () => {
        const screen = document.querySelector('.preloader')
        if (screen && !screen.classList.contains('preloader--exit')) return false
        return Date.now() - Number(sessionStorage.getItem('__tapT0'))
      },
      null,
      { timeout: 60_000, polling: 'raf' },
    )
    const ms = await lifted.jsonValue()
    return { route: 'card → garment', engine: engine.name, garment: href, ms, state }
  } finally {
    await context.close()
  }
}

async function main() {
  const opts = options(process.argv.slice(2))
  const playwright = await import('@playwright/test')
  const rows = []
  const garmentRows = []
  for (const engine of ENGINES(playwright.devices)) {
    const browser = await playwright[engine.launcher].launch()
    try {
      // One failed measurement is a row with its error, never the end of the run.
      const attempt = (measure, route) =>
        measure().catch((error) => ({
          route,
          engine: engine.name,
          error: String(error.message).split('\n')[0],
        }))
      for (const destination of DESTINATIONS) {
        for (let i = 0; i < opts.taps; i++) {
          rows.push(await attempt(() => oneTap(browser, engine, destination, opts), destination))
        }
      }
      for (let i = 0; i < opts.taps; i++) {
        garmentRows.push(
          await attempt(() => oneGarmentOpen(browser, engine, opts), 'card → garment'),
        )
      }
    } finally {
      await browser.close()
    }
  }
  const all = [...rows, ...garmentRows]
  const blocked = all.some((row) => row.blocked)
  const measured = (list) => list.filter((row) => Number.isFinite(row.ms))
  const result = {
    origin: opts.origin,
    at: new Date().toISOString(),
    taps: opts.taps,
    refuseStore: opts.refuseStore,
    verdict: {
      taps: verdict(measured(rows), TAP_TARGET_MS),
      garment: verdict(measured(garmentRows), GARMENT_TARGET_MS),
    },
    rows: all,
  }
  console.log(JSON.stringify(result, null, 1))
  if (blocked) process.exit(2)
  process.exit(result.verdict.taps.pass && result.verdict.garment.pass ? 0 : 1)
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
