import { expect, request, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { evaluateInteractionWalkthrough } from '../scripts/interaction-metrics.mjs'

/**
 * Performance-budget robots for the viewer's own page.
 *
 * Deliberately its own file, not `motion-and-layout.spec.ts` — that file is shared
 * Phase-2 territory (Phase 1b-B's header work, Batch C's `.stage__callouts` gate,
 * Batch E's IM-06), and every Performance/Cross-surface robot in this batch avoids
 * adding to it for the same reason.
 *
 * Fetches the BUILT page's own HTML via `request`, not a full `page.goto()` — the
 * questions here (which tags exist, what attributes they carry) are answered by the
 * markup itself, and a raw fetch is faster and cannot be confused by anything a script
 * does after load.
 */

/**
 * PF-16 — render-blocking count and preload discipline.
 *
 * The e2e fixture omits the Cloudflare beacon script on purpose (see
 * `e2e/serve.mjs`, "cf beacon omitted: e2e runs offline"), so this counts one fewer
 * `<script src>` than production. That does not weaken the assertion: production's
 * beacon also carries `type="module"`, so the "every script with a src is
 * async/defer/module/noModule" rule holds for both shapes; what changes is only how
 * many script tags exist to check.
 */
test.describe('PF-16 — render-blocking discipline (viewer product page)', () => {
  test('every <script src> carries async, defer, type="module" or noModule', async ({
    baseURL,
  }) => {
    const ctx = await request.newContext()
    const html = await (await ctx.get(`${baseURL}/n001/wine`)).text()
    await ctx.dispose()

    const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
    const withSrc = scriptTags.filter((tag) => /\bsrc="[^"]*"/.test(tag))
    const blocking = withSrc.filter(
      (tag) => !/\basync\b|\bdefer\b|\btype="module"|\bnoModule\b/.test(tag),
    )

    expect(
      withSrc.length,
      'no <script src> at all — the assertion below would pass vacuously',
    ).toBeGreaterThan(0)
    expect(
      blocking,
      `classic blocking <script src> found on the viewer product page: ${blocking.join('\n')}`,
    ).toEqual([])
  })

  /**
   * Measured fresh against this fixture's own build, 2026-09-24 — never carried
   * forward from the plan's own citation, which was a live-production number for a
   * different (production-shaped) page. 4 `rel="preload"` (meshopt decoder, the HDR
   * environment map, 2 font subsets) + 3 `rel="modulepreload"` (rolldown-runtime,
   * react, preload-helper) = 7.
   */
  test('preload + modulepreload count matches the measured baseline', async ({ baseURL }) => {
    const ctx = await request.newContext()
    const html = await (await ctx.get(`${baseURL}/n001/wine`)).text()
    await ctx.dispose()

    const preloadCount = (html.match(/rel="preload"/g) ?? []).length
    const modulePreloadCount = (html.match(/rel="modulepreload"/g) ?? []).length

    expect(
      preloadCount,
      `preload count drifted (${preloadCount}) — re-measure before changing this number, ` +
        'do not just raise it',
    ).toBe(4)
    expect(
      modulePreloadCount,
      `modulepreload count drifted (${modulePreloadCount}) — re-measure before changing this ` +
        'number, do not just raise it',
    ).toBe(3)
  })
})

/**
 * PF-11 — fonts are split so a visitor downloads only the ranges they need.
 *
 * `unicode-range` decides which of the build's seven font files the browser fetches,
 * based on the characters that actually get LAID OUT on the page — not on
 * `Accept-Language` or `document.lang`, which is why this test needs no locale
 * fixture: a Latin-only product page should never pull the latin-ext or vietnamese
 * subsets, whatever the visitor's browser locale is. `scripts/preload.test.ts` already
 * pins the two Latin PRELOAD HINTS; this proves the split actually holds for every
 * font REQUEST the page makes, hinted or not.
 */
test.describe('PF-11 — fonts are split so a visitor downloads only the ranges they need', () => {
  test('only the Latin subset is ever requested for a Latin-text product page', async ({
    page,
  }) => {
    const fontRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (/\.woff2(\?|$)/.test(url)) fontRequests.push(url.split('/').pop() ?? url)
    })

    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // The browser only fetches a font once it has laid out text that needs it; give
    // one settle tick so a speculative fetch triggered by late layout is not missed.
    await page.waitForTimeout(500)

    expect(
      fontRequests.length,
      'no .woff2 request observed at all — did the page render?',
    ).toBeGreaterThan(0)
    const nonLatin = fontRequests.filter((f) => /latin-ext|vietnamese/.test(f))
    expect(
      nonLatin,
      `a non-Latin font subset was requested for a Latin-only page: ${nonLatin.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * Collects Long Task and Event Timing samples for whatever `act` does, under
 * whatever CPU throttle the caller already set on the page's own CDP session.
 *
 * `durationThreshold: 16` on the `event` observer matches the browser's own INP
 * measurement floor — entries shorter than one frame are not interaction delay in
 * any meaningful sense.
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
  // Long-task and event-timing entries can arrive a frame or two after the
  // interaction that caused them; give them room to land before reading the log.
  await page.waitForTimeout(500)

  return page.evaluate(
    () => (window as unknown as { __pf: { longTasks: number[]; events: number[] } }).__pf,
  )
}

/**
 * PF-04 (long tasks / Total Blocking Time) + PF-05 (an INP proxy).
 *
 * Two real, scripted interactions — colourway tab switch and the theme toggle
 * (behind the header's popover menu). NOT the original audit's full six: this
 * codebase has no accordion component to click, and a scripted camera drag is
 * excluded on purpose — `apps/viewer/CLAUDE.md`'s own measured finding is that
 * synthetic `PointerEvent`s do nothing to model-viewer (0 `camera-change` events on
 * a scripted pinch), so a "camera" interaction here would silently measure nothing
 * and read as a pass. Real touch input only exists in the iOS Simulator (PF-21's
 * own task), which this Playwright-only spec cannot reach.
 *
 * Ceilings are re-measured fresh against this fixture (not the original audit's own
 * numbers, which were for a different build): see the task report for the run that
 * produced them.
 */
test.describe('PF-04 + PF-05 — long tasks and an INP proxy across real interactions', () => {
  test('colourway tab switch and the theme toggle stay under the ceilings', async ({ page }) => {
    // The menu button (and the theme toggle behind it) only exists in the DOM's
    // visible sense below 720px — `packages/ui/src/notch.css`'s own
    // `@media (width < 720px)` rule; at desktop width the button is `display: none`.
    // A phone width is also representative here: a QR tag is scanned with a phone.
    await page.setViewportSize({ width: 375, height: 812 })
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const samples = await collectInteractionMetrics(page, async () => {
      await page.getByRole('tab').nth(1).click()
      await page.waitForTimeout(150)
      await page.locator('.notch__menu-btn').click()
      await page.locator('.theme-toggle').click()
    })

    const result = evaluateInteractionWalkthrough(samples, {
      tbtCeilingMs: 1500,
      inpCeilingMs: 600,
    })
    expect(
      result.ok,
      `${result.problems.join('; ')} (tbt=${result.tbt.toFixed(0)}ms, ` +
        `worstTask=${result.worstTask.toFixed(0)}ms, inpProxy=${result.inpProxy.toFixed(0)}ms)`,
    ).toBe(true)
  })
})
