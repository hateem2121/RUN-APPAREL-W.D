#!/usr/bin/env node
/**
 * MO-19 + SC-10 — frame smoothness of the live site's entrance and of a three-screen
 * scroll, under a 4x CPU throttle. An HONEST PROXY for what a free CI runner cannot
 * measure: CI's runner is 3.4-5.6x slower than the Mac on a CPU benchmark (measured
 * 2026-09-25, packages/shared/src/cpuCalibration.ts), so a frame budget judged there
 * would be judging the runner. This runs on the Mac, against the live site, as a
 * scheduled robot — how it is scheduled (and stopped) is in the private plan notes, and
 * installing it waits for the owner's okay.
 *
 * Measured 2026-09-25, and built around what was measured rather than the audit's numbers:
 *
 * - Headless Chromium here paints at 120 Hz (median frame 8.3ms), not 60, so the audit's
 *   "no frame over 17ms" is two frames here, not one. Every limit below is RELATIVE to the
 *   run's own median frame, so a 60 Hz machine is judged by its own clock.
 * - The ENTRANCE responds to CPU load (worst frame 17 / 49 / 383ms at 1x / 4x / 20x,
 *   sampled from navigation), so it is a real instrument. Sampled from the `load` event,
 *   as here, five runs at 4x read p95 9.8-10.2ms, dropped 0-1.1%.
 * - The SCROLL barely responds to CPU load (p95 ~10ms even at 20x): Chromium scrolls on
 *   the compositor thread, which page scripts cannot block. So a scroll regression is
 *   something that makes scrolling wait on the page — a heavy scroll handler, a
 *   scroll-linked layout — and that is exactly what `--self-test` injects. Five runs at 4x
 *   read p95 10.0-10.2ms, dropped 0%.
 *
 * `--self-test` is the negative control, runnable any time: it injects a busy scroll
 * handler and a burst of long tasks after load, and PASSES only if the probe then reports
 * BOTH phases as failing. A probe that stays green there measures nothing.
 *
 *   node apps/cms/scripts/frame-smoothness-probe.mjs [--url=https://wear-run.help/]
 *     [--runs=3] [--report=<file>] [--self-test]
 *
 * Exit: 0 all within limits (or, with --self-test, the injected jank was caught);
 * 1 a phase over its limit (or the self-test caught nothing); 2 the probe itself broke.
 */
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

export const DEFAULT_URL = 'https://wear-run.help/'
export const CPU_THROTTLE_RATE = 4

/**
 * Limits, relative to the run's own median frame (its refresh interval). A frame counts
 * as DROPPED when it took more than 1.5 refresh intervals — at least one vsync missed.
 * Measured headroom: p95 was 1.18-1.23x the median, dropped 0-1.1%.
 */
export const LIMITS = Object.freeze({ p95OverMedian: 2, droppedPct: 5 })

/**
 * Pure: summarise rAF-to-rAF intervals.
 *
 * @param {number[]} intervals frame-to-frame times in ms
 */
export function frameStats(intervals) {
  if (intervals.length < 10) {
    throw new Error(`only ${intervals.length} frames sampled — too few to judge`)
  }
  const sorted = [...intervals].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  const median = at(0.5)
  const dropped = intervals.filter((x) => x > 1.5 * median).length
  return {
    frames: intervals.length,
    median,
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    droppedPct: (100 * dropped) / intervals.length,
  }
}

/**
 * Pure: judge one phase's stats against LIMITS.
 *
 * @param {ReturnType<typeof frameStats>} stats
 * @param {{ p95OverMedian: number, droppedPct: number }} [limits]
 */
export function judgeFrames(stats, limits = LIMITS) {
  const problems = []
  if (stats.p95 > limits.p95OverMedian * stats.median) {
    problems.push(
      `p95 frame ${stats.p95.toFixed(1)}ms is over ${limits.p95OverMedian}x the ${stats.median.toFixed(1)}ms median`,
    )
  }
  if (stats.droppedPct > limits.droppedPct) {
    problems.push(`${stats.droppedPct.toFixed(1)}% of frames dropped (limit ${limits.droppedPct}%)`)
  }
  return { ok: problems.length === 0, problems }
}

/** Pure: the median run of several, by p95 — one noisy run neither passes nor fails a phase. */
export function medianRun(runs) {
  const sorted = [...runs].sort((a, b) => a.p95 - b.p95)
  return sorted[Math.floor(sorted.length / 2)]
}

// In-page: record every rAF-to-rAF interval from now on. Self-contained (serialised).
function startSampler() {
  const w = /** @type {any} */ (window)
  w.__frames = []
  let last = performance.now()
  const tick = (t) => {
    w.__frames.push(t - last)
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// In-page, --self-test only: the two regressions this probe exists to catch.
function injectJank() {
  const busy = (ms) => {
    const t = performance.now()
    while (performance.now() - t < ms) {}
  }
  addEventListener('scroll', () => busy(30), { passive: true })
  addEventListener('load', () => {
    for (let i = 0; i < 10; i++) setTimeout(() => busy(40), 100 + i * 120)
  })
}

async function runOnce(browser, url, selfTest) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })
    if (selfTest) await page.addInitScript(injectJank)
    const res = await page.goto(url, { waitUntil: 'load' })
    if (!res || res.status() === 403 || res.status() === 429) {
      throw new Error(`${url} answered ${res?.status()} — refused (Bot Fight Mode?), inconclusive`)
    }

    // MO-19: the entrance, from the load event for 1.5s.
    await page.evaluate(startSampler)
    await page.waitForTimeout(1500)
    const entrance = frameStats(await page.evaluate(() => window.__frames.slice(1)))

    // SC-10: three screens of trusted wheel scrolling (24 ticks of 100px at 800px tall).
    await page.evaluate(startSampler)
    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 100)
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(300)
    const scrolledPx = await page.evaluate(() => Math.round(window.scrollY))
    if (scrolledPx < 2000) throw new Error(`scrolled only ${scrolledPx}px — not three screens`)
    const scroll = frameStats(await page.evaluate(() => window.__frames.slice(1)))
    return { entrance, scroll }
  } finally {
    await context.close()
  }
}

async function main() {
  const arg = (name, fallback) =>
    process.argv
      .find((a) => a.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? fallback
  const url = arg('url', DEFAULT_URL)
  const runs = Number(arg('runs', '3'))
  const reportPath = arg('report', null)
  const selfTest = process.argv.includes('--self-test')

  const browser = await chromium.launch()
  const results = []
  try {
    for (let i = 0; i < runs; i++) results.push(await runOnce(browser, url, selfTest))
  } finally {
    await browser.close()
  }
  const entrance = medianRun(results.map((r) => r.entrance))
  const scroll = medianRun(results.map((r) => r.scroll))
  const verdict = { entrance: judgeFrames(entrance), scroll: judgeFrames(scroll) }
  const report = {
    at: new Date().toISOString(),
    url,
    runs,
    selfTest,
    throttle: CPU_THROTTLE_RATE,
    entrance: { ...entrance, ...verdict.entrance },
    scroll: { ...scroll, ...verdict.scroll },
  }
  console.log(JSON.stringify(report, null, 2))
  if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  if (selfTest) {
    const caught = !verdict.entrance.ok && !verdict.scroll.ok
    console.log(
      caught
        ? 'SELF-TEST OK: the injected jank failed both phases, so the probe can see a defect.'
        : 'SELF-TEST FAILED: injected jank passed a phase — this probe measures nothing there.',
    )
    process.exit(caught ? 0 : 1)
  }
  process.exit(verdict.entrance.ok && verdict.scroll.ok ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `frame-smoothness-probe: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(2)
  })
}
