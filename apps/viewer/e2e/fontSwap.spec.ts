import { expect, type Page, test } from '@playwright/test'
import { LIVE_PRODUCTS } from '../../../scripts/live-products.mjs'

/**
 * TY-02 — the 3D page must not jump when Archivo arrives, for every live garment.
 *
 * Measured live 2026-09-17 on rxps/wine alone, in Chromium: CLS 0 at 390px and 0.00023 at
 * 1440px with the fonts held back 1.5 s, while a planted 300px block read 0.19–0.31. That was
 * one headline in one engine. Unlike the marketing site (apps/cms/e2e/fontSwap.spec.ts), the
 * viewer has no metric-matched stand-in face: a late Archivo paints first in plain
 * `system-ui`, so whether a headline re-wraps depends on the NAME. This lays out every live
 * name both ways. Three sampled live the same day (rxps, r-ajm, r-atw) kept two lines both ways
 * at both widths.
 *
 * Two engines, set in playwright.config.ts: Chromium alone has the Layout Instability API, and
 * WebKit — the engine behind a QR scan on an iPhone — counts the lines. On a phone the headline
 * sits below the first screen, where CLS cannot see it, so the line count is the headline
 * guard and CLS the first-screen guard.
 *
 * ⚠️ THE NAMES ARE THE LIVE PAYLOAD'S (2026-09-17), SERVED IN PLACE OF THE FIXTURE'S. A rename in
 * the CMS does not break this, it only leaves it measuring the old words; a newly published
 * garment does break it, on purpose, in the first test.
 *
 * ⚠️ A LATE LOAD PROVES ITSELF. A font the browser already holds is never late, and a reading
 * taken without a swap measures nothing, so every late load runs in a fresh context and must
 * show the font finishing after the delay and after the headline appeared.
 */
const FONT_FILES = /\.(woff2?|ttf|otf)(\?.*)?$/
/**
 * Longer than the site's 150 ms: this page renders on the client, so a swap only touches the
 * headline if the font lands after the headline does (live, the headline appeared at 0.6–1.1 s).
 */
const FONT_DELAY_MS = 1_000
const WIDTHS = [390, 1440] as const

/** Every live garment's name, as `GET /api/public/viewer/<slug>` served it on 2026-09-17. */
const HEADLINES: Readonly<Record<string, string>> = {
  rxps: 'X-MILO PRO SKIN-SUIT',
  'r-xmp': 'X-MILO PRO BIB',
  'r-afp': 'APEX FLEX PULLOVER',
  'r-atw': 'AERO-TECH WINDBREAKER',
  'r-atj': 'ARMOR-TECH JACKET',
  'r-wzu': 'WOMEN ZIP-UP VEST',
  'r-mm': 'MINECUT MOTION',
  'r-aj': 'THE AGGRESSOR JERSEY',
  'r-ajm': 'THE AGGRESSOR JERSEY MEN',
  'r-css': 'CLASSIC SOCCER SHIRT',
  'r-asb': 'ARISAN SPORTS BRA',
  'r-cch': 'CAPSULE CORE HOODIE',
  'r-gtd': 'GEOVENT TENNIS DRESS',
  'r-au': 'THE AGGRESSOR UNIFORM',
  'r-ect': 'ENDURA CROP TOP',
  'r-et': 'ENDURANCE TRACKSUIT',
}

/** Serve the fixture garment under a live product's name and code; `slug()` says which. */
async function serveLiveName(page: Page, slug: () => string) {
  await page.route('**/api/public/viewer/**', async (route) => {
    const product = LIVE_PRODUCTS.find((row) => row.slug === slug())
    const name = HEADLINES[slug()]
    if (!product || !name) throw new Error(`no live row or headline for "${slug()}"`)
    const response = await route.fetch()
    const body = (await response.json()) as {
      product: { productName: string; productCode: string }
    }
    body.product.productName = name
    body.product.productCode = product.productCode
    await route.fulfill({ response, json: body })
  })
}

interface Headline {
  text: string
  lines: number
  breaks: string
  fontSize: number
  archivoLoaded: boolean
}

/**
 * The headline's lines, counted from word positions — a box height can hide a reflow
 * (apps/cms/e2e/fontSwap.spec.ts). Every rect of a word counts, so a word that
 * `overflow-wrap: anywhere` broke across two lines counts on both.
 */
async function readHeadline(page: Page): Promise<Headline> {
  await expect(page.locator('#product-heading')).toBeVisible({ timeout: 15_000 })
  await Promise.race([
    page.evaluate(() => document.fonts.ready.then(() => true)),
    page.waitForTimeout(4_000),
  ])
  const reading = await page.evaluate((): Headline | null => {
    const heading = document.getElementById('product-heading')
    if (!heading) return null
    const pieces: { text: string; mid: number }[] = []
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue ?? ''
      for (const match of value.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index ?? 0)
        range.setEnd(node, (match.index ?? 0) + match[0].length)
        for (const rect of range.getClientRects()) {
          if (rect.width > 0.5) pieces.push({ text: match[0], mid: rect.top + rect.height / 2 })
        }
      }
    }
    const fontSize = Number.parseFloat(getComputedStyle(heading).fontSize)
    const tolerance = (fontSize * 0.92) / 2
    const lines: string[][] = []
    let lineMid = Number.NEGATIVE_INFINITY
    for (const piece of pieces) {
      if (Math.abs(piece.mid - lineMid) > tolerance) {
        lines.push([])
        lineMid = piece.mid
      }
      lines[lines.length - 1]?.push(piece.text)
    }
    return {
      text: heading.textContent ?? '',
      lines: lines.length,
      breaks: lines.map((line) => line.join(' ')).join(' / '),
      fontSize,
      archivoLoaded: [...document.fonts].some(
        (face) =>
          face.family.replaceAll('"', '') === 'Archivo Variable' && face.status === 'loaded',
      ),
    }
  })
  if (!reading) throw new Error('no #product-heading on the page')
  return reading
}

test('names a headline for every live garment (TY-02)', () => {
  expect(
    Object.keys(HEADLINES).sort(),
    'scripts/live-products.mjs and this file disagree: a published garment needs its name here',
  ).toEqual(LIVE_PRODUCTS.map((product) => product.slug).sort())
})

test.describe('TY-02 — every live headline keeps its lines when Archivo arrives (WebKit)', () => {
  /**
   * ⚠️ MEASURED 2026-09-17: WITHOUT THIS, THE TEST MOCKS NOTHING PAST THE FIRST NAVIGATION.
   * `e2e/prepare.mjs` runs a PRODUCTION build (`import.meta.env.PROD`), so
   * `registerServiceWorker()` installs `/sw.js` on this page. Once that worker starts
   * CONTROLLING the page — which happens between the first `page.goto()` and the second —
   * WebKit silently stops calling this file's `page.route()` handlers for every later
   * navigation to the SAME url, for EVERY route on the page, not only the ones the worker's
   * own `fetch` listener touches. Isolated with a throwaway probe: a route handler counting
   * its own calls across four `page.goto('/n001/wine')` reached 1 and never moved past it;
   * the identical probe with `serviceWorkers: 'block'` reached 4. An explicit
   * `cache-control: no-store` on the fulfilled response did NOT fix it, which rules out the
   * HTTP disk cache — this is Playwright's documented WebKit/service-worker interaction
   * (recommended fix: block service workers when the test relies on routing). Without this,
   * every navigation after the first silently serves the FIXTURE's raw default name
   * ("Velocity Performance Tee") past both this test's font route AND its identity mock —
   * caught here by the `text`/`archivoLoaded` controls below, not by a `.soft` line-count
   * mismatch, which is what tells the two failure modes apart.
   */
  test.use({ serviceWorkers: 'block' })

  for (const width of WIDTHS) {
    test(`${width}px: fonts blocked and fonts delivered break every name the same way`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(browserName !== 'webkit', 'the lines are counted in WebKit, which a QR scan opens')
      test.setTimeout(240_000)
      let current = ''
      await serveLiveName(page, () => current)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 900 })
      const blocked = new Map<string, Headline>()
      const delivered = new Map<string, Headline>()

      // Blocked first: once this page has loaded Archivo, it keeps it.
      await page.route(FONT_FILES, (route) => route.abort())
      for (const { slug } of LIVE_PRODUCTS) {
        current = slug
        await page.goto('/n001/wine')
        blocked.set(slug, await readHeadline(page))
      }
      /**
       * ⚠️ MEASURED 2026-09-17: A FRESH PAGE, NOT `page.unroute()` ON THIS ONE. WebKit left
       * `Archivo Variable` at FontFace status `"unloaded"` — never even ATTEMPTED — for the
       * entire delivered pass's first navigation on this same page, reproducibly, after the
       * 16 aborted requests above: `document.fonts.ready` resolved in 16 ms (correct — nothing
       * was loading YET) and the font then sat unrequested for 9+ seconds of polling, so no
       * timeout fixes it. A brand-new `page` in the SAME context, navigated once, requested it
       * normally and reached `"loaded"` within ~1.1 s. Sixteen aborts to the identical url on
       * one page leaves WebKit unwilling to retry that url again on THAT page — a real visitor
       * never produces this pattern (one page, one load, no repeated self-inflicted failures),
       * so this is the test's own repeated-abort loop tripping a WebKit retry guard, not a
       * finding about the font. A second page sidesteps it exactly as `serveLiveName` intends:
       * mocked the same way, read the same way, just not carrying the first page's 16 failures.
       */
      const delivery = await context.newPage()
      try {
        await serveLiveName(delivery, () => current)
        await delivery.emulateMedia({ reducedMotion: 'reduce' })
        await delivery.setViewportSize({ width, height: 900 })
        for (const { slug } of LIVE_PRODUCTS) {
          current = slug
          await delivery.goto('/n001/wine')
          delivered.set(slug, await readHeadline(delivery))
        }
      } finally {
        await delivery.close()
      }

      for (const { slug } of LIVE_PRODUCTS) {
        const before = blocked.get(slug)
        const after = delivered.get(slug)
        if (!before || !after) throw new Error(`${slug}: a reading is missing`)
        // The controls: the served name is on the page, each pass had the fonts it claims, and
        // both were laid out at the same size.
        expect(before.text.toLowerCase(), `${slug}: the live name never reached the page`).toBe(
          HEADLINES[slug]?.toLowerCase(),
        )
        expect(before.archivoLoaded, `${slug} ${width}px: the blocked pass had Archivo`).toBe(false)
        expect(after.archivoLoaded, `${slug} ${width}px: Archivo never loaded`).toBe(true)
        expect(
          after.fontSize,
          `${slug} ${width}px: the passes were laid out at different sizes`,
        ).toBe(before.fontSize)
        test.info().annotations.push({
          type: `${slug} ${width}px`,
          description: `system-ui "${before.breaks}" · Archivo "${after.breaks}"`,
        })
        expect
          .soft(
            after.lines,
            `${slug} ${width}px: "${before.breaks}" before Archivo and "${after.breaks}" after — ` +
              'the headline re-wraps when the font arrives',
          )
          .toBe(before.lines)
      }
    })
  }
})

test.describe('TY-02 — the layout-shift score while Archivo arrives late (Chromium)', () => {
  const observe = (page: Page) =>
    page.addInitScript(() => {
      const store = window as unknown as { __cls: number; __headingAt: number | null }
      store.__cls = 0
      store.__headingAt = null
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as { hadRecentInput: boolean; value: number }
          if (!shift.hadRecentInput) store.__cls += shift.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
      const watch = () => {
        if (document.getElementById('product-heading')) store.__headingAt = performance.now()
        else requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
    })

  test('the instrument reports a planted shift (negative control)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
    await observe(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.locator('#product-heading')).toBeVisible()
    await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const block = document.createElement('div')
      block.style.height = '300px'
      document.querySelector('main')?.prepend(block)
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(
      await page.evaluate(() => (window as unknown as { __cls: number }).__cls),
      'a 300px block pushed the page and the observer saw nothing',
    ).toBeGreaterThan(0.1)
  })

  /**
   * 1440 for every name: the headline is on the first screen there. 390 once: on a phone the
   * headline is below the first screen, and nothing a name changes is above it.
   */
  const LOADS = [
    ...LIVE_PRODUCTS.map((product) => ({ slug: product.slug, width: 1440 })),
    { slug: LIVE_PRODUCTS[0]?.slug ?? 'rxps', width: 390 },
  ]

  test(`every live headline stays at or under 0.02 while Archivo arrives ${FONT_DELAY_MS} ms late`, async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the Layout Instability API is Chromium-only')
    test.setTimeout(240_000)
    const baseURL = test.info().project.use.baseURL
    for (const { slug, width } of LOADS) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 900 } })
      try {
        const page = await context.newPage()
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await serveLiveName(page, () => slug)
        await page.route(FONT_FILES, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, FONT_DELAY_MS))
          await route.continue()
        })
        await observe(page)
        await page.goto('/n001/wine')
        await expect(page.locator('#product-heading')).toBeVisible({ timeout: 15_000 })
        await page.evaluate(() => document.fonts.ready.then(() => true))
        await page.waitForTimeout(300)
        const reading = await page.evaluate(() => {
          const store = window as unknown as { __cls: number; __headingAt: number | null }
          const fonts = performance
            .getEntriesByType('resource')
            .filter((entry) =>
              /\.(woff2?|ttf|otf)(\?|$)/.test(entry.name),
            ) as PerformanceResourceTiming[]
          return {
            cls: store.__cls,
            headingAt: store.__headingAt,
            fontEnd: Math.max(0, ...fonts.map((font) => font.responseEnd)),
            fonts: fonts.length,
          }
        })
        // The controls: a font was requested, it really was late, and the headline was already
        // on the page when it landed.
        expect(reading.fonts, `${slug}: no web font was requested`).toBeGreaterThan(0)
        expect(reading.fontEnd, `${slug}: the font was not held back`).toBeGreaterThanOrEqual(
          FONT_DELAY_MS * 0.9,
        )
        expect(
          reading.headingAt ?? Number.POSITIVE_INFINITY,
          `${slug}: the headline appeared only after the font, so nothing swapped under it`,
        ).toBeLessThan(reading.fontEnd)
        test.info().annotations.push({
          type: `${slug} ${width}px`,
          description: `CLS ${reading.cls.toFixed(4)} (headline at ${Math.round(reading.headingAt ?? 0)} ms, font at ${Math.round(reading.fontEnd)} ms)`,
        })
        expect
          .soft(reading.cls, `${slug} ${width}px: the page moved while Archivo swapped in`)
          .toBeLessThanOrEqual(0.02)
      } finally {
        await context.close()
      }
    }
  })
})
