import { expect, request, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { calibratedThrottleRate, cpuBenchmarkInPage, isReferenceClass } from '@run-apparel/shared'
import {
  evaluateInteractionWalkthrough,
  evaluateRepeatedWalkthroughs,
} from '../scripts/interaction-metrics.mjs'

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
   *
   * Re-measured 2026-09-25 after RO-08: 2 `rel="preload"` (the 2 font subsets) + the same
   * 3 = 5. The meshopt decoder and the HDR map left index.html on purpose: on slow 3G they
   * shared the first seconds with the one blocking stylesheet and held first paint back
   * (5.2 s against 4.4 s on this harness). `src/lib/preload3d.ts` adds both from the app
   * after its first render, and `scripts/preload.test.ts` pins that they are not here.
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
    ).toBe(2)
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
 * TWO CHECKS, since 2026-10-23, because one walkthrough could not be judged on CI.
 * Measured on CI that day (193 past runs, then a probe on six machines with a planted
 * 300 ms freeze on the tab's click): the FIRST walkthrough on a fresh page read
 * 230-616 ms clean and 545-697 ms frozen, so no ceiling separated them — the old 550 ms
 * failed clean code on 25 of 193 runs AND would have passed a 545 ms freeze. That first
 * walkthrough's cost is mostly drawing a colourway for the first time, which is software
 * 3D in the GPU process here, and the CPU throttle never reaches it: a later switch to a
 * colourway not yet drawn read 232-683 ms clean on the same machines. Switches between
 * colourways ALREADY drawn read 23-159 ms clean and 279-418 ms frozen.
 *   1. The first walkthrough, against a loose guard: it catches a gross regression in
 *      drawing (the September load race read 2,656 ms), not a 300 ms freeze.
 *   2. Every colourway drawn once, then FIVE walkthroughs between drawn colourways,
 *      judged by their MEDIAN: 30-159 ms clean and 314-418 ms frozen across twelve CI
 *      pages. A freeze slows every walkthrough and moves the median; one slow moment on
 *      a shared machine slows one, which the median ignores. The median of several runs
 *      is what Lighthouse's own variability guide recommends over a single run
 *      (GoogleChrome/lighthouse docs/variability.md, read 2026-10-23).
 */
const PF04_TABS_TO_WARM = [2, 3, 4, 0]
const PF04_MEASURED_TABS = [1, 2, 3, 4, 0]

// Each limit sits between the worst clean and the best frozen reading on its tier, measured
// 2026-10-23 with a planted 300 ms freeze in ColourwayTabs' onClick (Mac) or on the tab's
// click (CI probe, six machines, twelve pages):
//   reference (this Mac, six runs each):
//     first walkthrough  clean tbt 137-151 / inp 144-152   frozen tbt 403-414 / inp 440-456
//     warm median        clean tbt 0       / inp 64-72     frozen tbt 263-264 / inp 328
//     The first-walkthrough limit stays the 300/300 this Mac has always had, so the Mac
//     check is no weaker than before; both checks catch the freeze here.
//   slower (CI's runner; the probe, then this test itself on four machines x three runs
//   each way, with the freeze in onClick):
//     first walkthrough  clean tbt 230-616 over 193 old runs, 339-803 in the proof
//     warm median        clean tbt 30-159 / inp 120-232   frozen tbt 273-418 / inp 336-400
//     The warm limits sit near the middle of each gap (215: 56 ms above the worst clean
//     median, 58 below the best frozen one). The first walkthrough here guards only
//     against a gross regression (1,200; the September load race read 2,656).
const PF04_CEILINGS = {
  reference: { firstWalk: { tbt: 300, inp: 300 }, warmMedian: { tbt: 150, inp: 200 } },
  slower: { firstWalk: { tbt: 1200, inp: 1200 }, warmMedian: { tbt: 215, inp: 290 } },
}

async function closeOpenPopovers(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[popover]')) {
      if (el.matches(':popover-open')) el.hidePopover()
    }
  })
  // Let the close, and anything the last interaction scheduled, finish OUTSIDE the
  // next measured window.
  await page.waitForTimeout(700)
}

test.describe('PF-04 + PF-05 — long tasks and an INP proxy across real interactions', () => {
  test('colourway tab switch and the theme toggle stay under the ceilings', async ({
    page,
    browserName,
  }) => {
    // CDP (the throttle and the long-task/event-timing plumbing it enables) is a
    // Chromium-only protocol; WebKit and Firefox have no equivalent session here.
    test.skip(browserName !== 'chromium', 'CDP is only available in Chromium')
    // Eleven walkthroughs with a settle after each: ~20 s on top of the model's load.
    test.setTimeout(120_000)
    // The menu button (and the theme toggle behind it) only exists in the DOM's
    // visible sense below 720px — `packages/ui/src/notch.css`'s own
    // `@media (width < 720px)` rule; at desktop width the button is `display: none`.
    // A phone width is also representative here: a QR tag is scanned with a phone.
    await page.setViewportSize({ width: 375, height: 812 })
    // Score this host UNTHROTTLED, then throttle it to imitate the reference host at 4x
    // (see calibratedThrottleRate): a flat 4x read ~2.2x higher on CI than on the Mac.
    await page.goto('about:blank')
    const scores: number[] = []
    for (let i = 0; i < 5; i++) scores.push(await page.evaluate(cpuBenchmarkInPage))
    const score = scores.sort((a, b) => a - b)[2] as number
    const rate = calibratedThrottleRate(score)
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate })

    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // WAIT FOR THE GARMENT BEFORE INTERACTING — measured 2026-09-25. Interacting as soon as
    // the <h1> shows raced the model's own load: an 786-903ms long task (the GLB decode)
    // landed in the measurement window on a host-speed-dependent share, so this Mac read
    // tbt ~1,000ms and CI's slower runner 2,656/2,676ms, and the number measured the RACE,
    // not the interactions. Same runs with WebGL off: tbt 0 — the clicks alone cost
    // nothing. Headless Chromium DOES have WebGL here (ANGLE → SwiftShader, on this Mac
    // too), so the model loads; if it ever stops loading, fail loudly rather than
    // measure an empty stage and call it fast.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                document.querySelector('model-viewer') as
                  | (HTMLElement & { loaded?: boolean })
                  | null
              )?.loaded === true,
          ),
        {
          message:
            'the 3D model never loaded — this test measures interactions on a loaded garment',
          timeout: 60_000,
        },
      )
      .toBe(true)
    // The walk below visits every colourway; the fixture serves five, as production does.
    await expect(page.getByRole('tab')).toHaveCount(5)

    const walkthrough = (tab: number) =>
      collectInteractionMetrics(page, async () => {
        await page.getByRole('tab').nth(tab).click()
        await page.waitForTimeout(150)
        await page.locator('.notch__menu-btn').click()
        await page.locator('.theme-toggle').click()
      })

    // TWO TIERS, by the machine's own score (packages/shared/src/cpuCalibration.ts):
    //   reference-class (this Mac, score ~580) and slower (CI's runner, scores ~160-410).
    //   Ceilings measured on each, 2026-10-23 (numbers beside PF04_CEILINGS).
    const referenceClass = isReferenceClass(score)
    const ceilings = referenceClass ? PF04_CEILINGS.reference : PF04_CEILINGS.slower
    const tier = referenceClass ? 'reference-class' : 'slower'

    // 1. The first walkthrough on a fresh page, against the loose guard.
    const first = evaluateInteractionWalkthrough(await walkthrough(1), {
      tbtCeilingMs: ceilings.firstWalk.tbt,
      inpCeilingMs: ceilings.firstWalk.inp,
    })
    await closeOpenPopovers(page)

    // 2. Draw every other colourway once, unmeasured, then five walkthroughs between
    //    colourways already drawn, judged by their median.
    for (const tab of PF04_TABS_TO_WARM) {
      await page.getByRole('tab').nth(tab).click()
      await page.waitForTimeout(700)
    }
    const walks = []
    for (const tab of PF04_MEASURED_TABS) {
      walks.push(await walkthrough(tab))
      await closeOpenPopovers(page)
    }
    const warm = evaluateRepeatedWalkthroughs(walks, {
      tbtCeilingMs: ceilings.warmMedian.tbt,
      inpCeilingMs: ceilings.warmMedian.inp,
    })

    // Printed on a pass too, so CI's own numbers are readable in the job log.
    console.log(
      `PF-04/05 measured: first walkthrough tbt=${first.tbt.toFixed(0)}ms inpProxy=${first.inpProxy.toFixed(0)}ms ` +
        `(guard ${ceilings.firstWalk.tbt}/${ceilings.firstWalk.inp}ms); warm median tbt=${warm.tbt.toFixed(0)}ms ` +
        `inpProxy=${warm.inpProxy.toFixed(0)}ms (ceiling ${ceilings.warmMedian.tbt}/${ceilings.warmMedian.inp}ms; each walk tbt ` +
        `${warm.perWalk.map((w) => w.tbt.toFixed(0)).join('/')}) — host benchmark ${score}, ` +
        `throttle ${rate.toFixed(2)}x, ${tier} tier`,
    )
    // Soft, so a run always reports BOTH verdicts: the warm median below is the one a
    // 300 ms freeze must fail on CI, where this guard is loose.
    expect
      .soft(
        first.ok,
        `first walkthrough: ${first.problems.join('; ')} (tbt=${first.tbt.toFixed(0)}ms, ` +
          `worstTask=${first.worstTask.toFixed(0)}ms, inpProxy=${first.inpProxy.toFixed(0)}ms)`,
      )
      .toBe(true)
    expect(
      warm.ok,
      `five warm walkthroughs: ${warm.problems.join('; ')} (each walk tbt ` +
        `${warm.perWalk.map((w) => w.tbt.toFixed(0)).join('/')}, inpProxy ` +
        `${warm.perWalk.map((w) => w.inpProxy.toFixed(0)).join('/')})`,
    ).toBe(true)
  })
})

/**
 * PF-18 — JS heap after the 3D model has loaded. HARD TO AUTOMATE, an HONEST PROXY.
 *
 * CDP's `Performance.getMetrics` `JSHeapUsedSize` is the closest instrument
 * available without a real device lab. It measures THIS MACHINE's V8 heap under
 * THIS ONE SCRIPT's load — not a real visitor's phone under real memory pressure
 * over a longer session with other tabs open. The assertion's own failure message
 * says so, per root CLAUDE.md's honesty-labelling rule, so a failure here is never
 * mistaken for a field measurement.
 */
// Measured fresh against this fixture, chromium (2026-09-24): 8.9-9.0MB — roughly
// double the original audit's "4-5MB, small" note (a different build), still small.
// 30MB gives real headroom without being loose enough to miss an actual leak.
const PF18_CEILING_MB = 30

test.describe('PF-18 — JS heap after the 3D model has loaded (hard to automate; a proxy)', () => {
  test('JSHeapUsedSize stays under the measured ceiling', async ({ page, browserName }) => {
    // Performance.getMetrics is CDP, Chromium-only.
    test.skip(browserName !== 'chromium', 'CDP is only available in Chromium')
    const client = await page.context().newCDPSession(page)
    // Performance.getMetrics reports every value as 0 until the domain is enabled —
    // measured directly: the first version of this test always read 0.0MB and
    // "passed" a ceiling of any size, which is the exact shape of a measurement that
    // proves nothing root CLAUDE.md warns about.
    await client.send('Performance.enable')
    await page.goto('/n001/wine')
    // Options are the THIRD argument; the second is the page function's own `arg`, so
    // `{ timeout }` there is silently ignored (found in review 2026-09-25).
    await page.waitForFunction(
      () => Boolean(document.querySelector('model-viewer')?.loaded),
      undefined,
      { timeout: 30000 },
    )
    // Let any post-load allocation (materials, textures) settle before reading.
    await page.waitForTimeout(1000)

    const { metrics } = await client.send('Performance.getMetrics')
    const heapBytes = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0
    const heapMb = heapBytes / (1024 * 1024)

    // Measured fresh against this fixture (2026-09-24), not the original audit's own
    // "4-5MB, small" note — re-measured, not trusted, per the task report.
    expect(
      heapMb,
      `JS heap ${heapMb.toFixed(1)}MB exceeds the ${PF18_CEILING_MB}MB ceiling. This measures ` +
        "THIS MACHINE's heap under THIS ONE SCRIPT's load, not a real visitor's device under " +
        'real memory pressure over a longer session — it is a proxy, not a field measurement.',
    ).toBeLessThan(PF18_CEILING_MB)
  })
})
