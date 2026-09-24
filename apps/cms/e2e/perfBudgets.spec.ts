import { calibratedThrottleRate, cpuBenchmarkInPage, isReferenceClass } from '@run-apparel/shared'
import { expect, type Page, test } from './offlineMedia'
import { evaluateInteractionWalkthrough } from '../scripts/interaction-metrics.mjs'

/**
 * Performance-budget robots for the site pages — the CMS-side half of `where: both`
 * Performance rows. Own file rather than an existing spec: nothing here needs a real
 * browser, so it fetches the built HTML directly (via Playwright's `request` fixture,
 * not `page.goto`), which is also faster and cannot be confused by anything a script
 * does after load. The fixture comes through `./offlineMedia`'s `test` like every CMS
 * spec (biome forbids importing `@playwright/test` here); an API request never goes
 * through `context.route()`, and these fetch only this server's own HTML anyway.
 */

const PAGES = ['/', '/products', '/contact'] as const

/**
 * PF-16 — render-blocking count and preload discipline.
 *
 * Measured fresh against this fixture's own build with one seeded product,
 * 2026-09-24 — never carried forward from the plan's own citation, which was a
 * live-production number against 32 published products (the count of image preload
 * hints on `/products` scales with the catalogue, so a fixture with one product is not
 * the number to pin there; the script-preload count and the render-blocking rule do
 * not scale with catalogue size, so those are what this file asserts).
 */
for (const path of PAGES) {
  test.describe(`PF-16 — render-blocking discipline (${path})`, () => {
    test('every <script src> carries async, defer, type="module" or noModule', async ({
      baseURL,
      request,
    }) => {
      const html = await (await request.get(`${baseURL}${path}`)).text()

      const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
      const withSrc = scriptTags.filter((tag) => /\bsrc="[^"]*"/.test(tag))
      const blocking = withSrc.filter(
        (tag) => !/\basync\b|\bdefer\b|type="module"|noModule/.test(tag),
      )

      expect(
        withSrc.length,
        `no <script src> at all on ${path} — the assertion below would pass vacuously`,
      ).toBeGreaterThan(0)
      expect(
        blocking,
        `classic blocking <script src> found on ${path}: ${blocking.join('\n')}`,
      ).toEqual([])
    })

    test('preload + modulepreload count matches the measured baseline', async ({
      baseURL,
      request,
    }) => {
      const html = await (await request.get(`${baseURL}${path}`)).text()

      const preloadCount = (html.match(/rel="preload"/g) ?? []).length
      const modulePreloadCount = (html.match(/rel="modulepreload"/g) ?? []).length

      // One low-priority script preload (Next's own hydration entry, carrying its own
      // `id`) on every page today — none of the three pages preloads an image via a
      // <link>; /products' first poster instead gets eager loading + fetchPriority on
      // the <img> itself, asserted separately below.
      expect(
        preloadCount,
        `${path} now hints ${preloadCount} preloads — re-measure before changing this number, ` +
          'do not just raise it',
      ).toBe(1)
      expect(modulePreloadCount, `${path} now hints ${modulePreloadCount} modulepreloads`).toBe(0)
    })
  })
}

test.describe('PF-16 — the first poster on /products is eager and high priority', () => {
  test('the first product card image carries loading=eager + fetchPriority=high', async ({
    baseURL,
    request,
  }) => {
    const html = await (await request.get(`${baseURL}/products`)).text()

    const firstImg = html.match(/<img\b[^>]*class="product-card__img"[^>]*>/)?.[0]
    expect(
      firstImg,
      'no product card image found on /products — is the fixture seeded?',
    ).toBeTruthy()
    expect(firstImg).toMatch(/loading="eager"/)
    expect(firstImg).toMatch(/fetchPriority="high"/)
  })
})

/**
 * Collects Long Task and Event Timing samples for whatever `act` does, under
 * whatever CPU throttle the caller already set on the page's own CDP session.
 * Mirrors `apps/viewer/e2e/perfBudgets.spec.ts`'s copy — see that file's own
 * `interaction-metrics.mjs` header for why the two are not shared via one module.
 */
async function collectInteractionMetrics(
  page: Page,
  act: () => Promise<void>,
): Promise<{ longTasks: number[]; events: number[] }> {
  await page.evaluate(() => {
    type Perf = { longTasks: number[]; events: number[] }
    ;(window as unknown as { __pf: Perf }).__pf = { longTasks: [], events: [] }
    const log = (window as unknown as { __pf: Perf }).__pf
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) log.longTasks.push(e.duration)
      }).observe({ type: 'longtask', buffered: false })
    } catch {
      // engine without the entry type — samples stay empty, caller treats as absent.
    }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const ei = e as PerformanceEntry & { interactionId?: number }
          if (ei.interactionId) log.events.push(e.duration)
        }
      }).observe({
        type: 'event',
        buffered: false,
        durationThreshold: 16,
      } as PerformanceObserverInit)
    } catch {
      // engine without Event Timing — samples stay empty, caller treats as absent.
    }
  })

  await act()
  await page.waitForTimeout(500)

  return page.evaluate(
    () => (window as unknown as { __pf: { longTasks: number[]; events: number[] } }).__pf,
  )
}

/**
 * PF-04 (long tasks / Total Blocking Time) + PF-05 (an INP proxy) — the site-side
 * half of `where: both`. Two real, scripted interactions on `/contact`: the theme
 * toggle (behind the header's popover menu, shared markup with the viewer's) and
 * typing into the enquiry form's name field. Not the original audit's full six —
 * this codebase has no accordion component, and `/products`' filter chips are real
 * navigations (`next/link`), which this in-page sample collector cannot safely
 * straddle.
 */
test.describe('PF-04 + PF-05 — long tasks and an INP proxy across real interactions', () => {
  test('the theme toggle and typing into the enquiry form stay under the ceilings', async ({
    page,
    browserName,
  }) => {
    // CDP (the throttle and the long-task/event-timing plumbing it enables) is a
    // Chromium-only protocol — same guard as the viewer's copy. Without it the firefox
    // project fails at newCDPSession (measured 2026-09-25; CI never reached it because
    // the viewer step failed first).
    test.skip(browserName !== 'chromium', 'CDP is only available in Chromium')
    // The menu button (and the theme toggle behind it) only exists in the DOM's
    // visible sense below 720px — `packages/ui/src/notch.css`'s own
    // `@media (width < 720px)` rule; at desktop width the button is `display: none`.
    // Most visitors here reach this page from a QR-scanned phone, so a phone width is
    // also the representative shape, not just what makes the element clickable.
    await page.setViewportSize({ width: 375, height: 812 })
    // Score this machine UNTHROTTLED, then throttle it to imitate the reference machine at
    // 4x (packages/shared/src/cpuCalibration.ts): a flat 4x read ~2.2x higher on CI's
    // runner than on the Mac for the viewer's copy of this walkthrough.
    await page.goto('about:blank')
    const scores: number[] = []
    for (let i = 0; i < 5; i++) scores.push(await page.evaluate(cpuBenchmarkInPage))
    const score = scores.sort((a, b) => a - b)[2] as number
    const rate = calibratedThrottleRate(score)
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate })

    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const samples = await collectInteractionMetrics(page, async () => {
      await page.locator('.notch__menu-btn').click()
      await page.locator('.theme-toggle').click()
      await page.locator('input[name="name"]').click()
      await page.locator('input[name="name"]').fill('Perf Budget Robot')
    })

    // TWO TIERS, by the machine's own score (packages/shared/src/cpuCalibration.ts):
    //   reference-class (this Mac) — 150/150. Clean at 4x: tbt 0-14ms, inpProxy 56-72ms.
    //     NOT 300, measured 2026-09-25: at 300 a planted 300ms freeze in ThemeSwitch's
    //     onClick read tbt 260 / inp 320 and failed only by 20ms on INP. At 150 it fails on
    //     both; 150 is also under Google's 200ms INP "good" line.
    //   slower (CI's runner, scores 104-171 on the viewer's run) — 300/300, the ceiling this
    //     test shipped with. CI has not yet printed this page's numbers (its viewer step
    //     failed first on every run so far), so this tier is the conservative one: this page
    //     draws no 3D, so the throttle's calibration applies to nearly all of its work, and
    //     the planted freeze alone reads inp 320.
    const referenceClass = isReferenceClass(score)
    const ceiling = referenceClass ? 150 : 300
    const result = evaluateInteractionWalkthrough(samples, {
      tbtCeilingMs: ceiling,
      inpCeilingMs: ceiling,
    })
    // Printed on a pass too, so CI's own numbers are readable in the job log.
    console.log(
      `CMS PF-04/05 measured: tbt=${result.tbt.toFixed(0)}ms worstTask=${result.worstTask.toFixed(0)}ms ` +
        `inpProxy=${result.inpProxy.toFixed(0)}ms (host benchmark ${score}, throttle ${rate.toFixed(2)}x, ${referenceClass ? 'reference-class' : 'slower'} tier, ceiling ${ceiling}ms)`,
    )
    expect(
      result.ok,
      `${result.problems.join('; ')} (tbt=${result.tbt.toFixed(0)}ms, ` +
        `worstTask=${result.worstTask.toFixed(0)}ms, inpProxy=${result.inpProxy.toFixed(0)}ms)`,
    ).toBe(true)
  })
})
