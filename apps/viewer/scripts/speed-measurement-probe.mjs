#!/usr/bin/env node
/**
 * PF-01, PF-02, PF-07, PF-08 — the 5-run live speed-measurement pass.
 *
 * ⚠️ LIVES HERE, NOT AT REPO-ROOT `scripts/`, DESPITE THE `*-probe.mjs` FAMILY
 * LIVING THERE. It needs a real browser with CDP throttling (`@playwright/test`),
 * which is a devDependency of `apps/viewer` and `apps/cms` — NOT of the repo root.
 * Node's bare-specifier resolution only climbs an importing file's own ancestor
 * directories, so a copy at `scripts/` could never resolve `@playwright/test`
 * without adding it as a new root dependency, which both apps already carry at the
 * same pinned version (`1.62.1`) — an unnecessary lockfile change for a module that
 * already has a home. `apps/viewer/scripts/preload.test.ts` and friends already show
 * this package hosts its own probe-shaped scripts.
 *
 * Webdriver-flagged (Playwright's default `navigator.webdriver === true`) — the
 * viewer's own telemetry is a no-op under that flag, so this is safe to point at the
 * live site, unlike a plain browser session, which would pollute real-visitor speed
 * data (Global Constraints).
 *
 * 4x CPU throttle + a "slow 4G"-shaped network profile, matching the original
 * PF-02 audit's own recorded method (4G + 4x CPU for LCP).
 *
 * ⚠️ EGRESS. Each run's `waitForFunction` on `model-viewer.loaded` means the live
 * GLB (1.9-8.2 MB) is actually downloaded, same as a real visitor. Cloudflare's edge
 * cache should serve every run after the first from cache (`cf-cache-status: HIT`),
 * so the real cost is one model-sized download, not five — this is logged and
 * enforced: a MISS on run 2 as well stops the probe rather than spending five full
 * downloads against the $5/month R2 egress budget (plan D-N12).
 *
 *   node apps/viewer/scripts/speed-measurement-probe.mjs
 */
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { DEFAULT_PRODUCT } from '../../../scripts/live-products.mjs'

export const VIEWER_URL = `https://viewer.wear-run.help/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`
export const RUNS = 5

/** Pure: median of a numeric array. Throws on empty input rather than returning NaN silently. */
export function median(values) {
  if (values.length === 0) throw new Error('median of an empty array')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Pure: median + spread for one metric's samples across the 5 runs. */
export function summarize(values) {
  if (values.length === 0) return { median: null, min: null, max: null, samples: [] }
  return {
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    samples: values,
  }
}

/**
 * Pure: judge a metric's median against a "good" ceiling (Google's public Core Web
 * Vitals thresholds, per SPEC §5.4's own citation of them — this file does not
 * invent a number).
 */
export function classify(name, summaryResult, thresholdMs) {
  return {
    name,
    ...summaryResult,
    withinTarget: summaryResult.median === null ? null : summaryResult.median <= thresholdMs,
    thresholdMs,
  }
}

/**
 * Pure: PF-08 — are the decoder/HDR requests already IN FLIGHT by the time the model
 * is requested, rather than waiting for the model-viewer chunk to ask for them (the
 * pre-LIVE-10 defect the preload hints in `index.html` fixed)? `requestStartedAt` is
 * a map of URL substring -> REQUEST-INITIATION timestamp (ms since navigation start),
 * built from a live network log.
 *
 * Deliberately NOT "starts within N ms of the model" — the decoder/HDR are preloaded
 * from the very top of `<head>`, so the healthy shape has them starting WELL BEFORE
 * the model (which cannot be requested until the product API round-trip resolves a
 * `glbUrl`). A close-to-simultaneous check would flag the correct behaviour as a
 * regression. What LIVE-10 actually guarantees, and what this checks, is the other
 * direction: neither ever starts AFTER the model, which is what "waiting for
 * model-viewer to ask for it" would look like.
 */
export function overlapsModelDownload(requestStartedAt, { toleranceMs = 500 } = {}) {
  const modelStart = requestStartedAt.model
  const decoderStart = requestStartedAt.decoder
  const hdrStart = requestStartedAt.hdr
  if (modelStart == null) return { ok: false, reason: 'no model request observed' }
  const problems = []
  for (const [label, start] of [
    ['decoder', decoderStart],
    ['HDR', hdrStart],
  ]) {
    if (start == null) {
      problems.push(`${label} never requested`)
      continue
    }
    if (start > modelStart + toleranceMs) {
      problems.push(
        `${label} started ${start - modelStart}ms AFTER the model request — it waited, ` +
          'rather than being already in flight from the preload hint',
      )
    }
  }
  return { ok: problems.length === 0, problems }
}

// "Slow 4G", matching the original PF-02 audit's own throttling profile.
const NETWORK_CONDITIONS = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
}
const CPU_THROTTLE_RATE = 4

async function runOnce(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', NETWORK_CONDITIONS)
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })

  const navStart = Date.now()
  const requestStartedAt = {}
  let modelCacheStatus = null
  // `request`, not `response` — PF-08 asks when each fetch STARTED (was it already
  // in flight by the time the model was asked for, not waiting on model-viewer's own
  // chunk to request it), which `request` fires on. `response` fires once headers
  // come back, which for a throttled multi-second GLB download lands long after the
  // request actually started and would misreport a fetch that started early as
  // "late".
  page.on('request', (req) => {
    const url = req.url()
    const t = Date.now() - navStart
    if (/\.glb(\?|$)/.test(url) && requestStartedAt.model == null) requestStartedAt.model = t
    if (/meshopt_decoder\.js/.test(url)) requestStartedAt.decoder = t
    if (/studio-soft\.hdr/.test(url)) requestStartedAt.hdr = t
  })
  page.on('response', (res) => {
    if (/\.glb(\?|$)/.test(res.url()))
      modelCacheStatus = res.headers()['cf-cache-status'] ?? '(none)'
  })

  await page.goto(VIEWER_URL, { waitUntil: 'commit' })

  const ttfb = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    return nav ? nav.responseStart - nav.requestStart : null
  })

  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let value = 0
        try {
          const po = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) value = entry.startTime
          })
          po.observe({ type: 'largest-contentful-paint', buffered: true })
        } catch {
          // engine without the entry type — resolves 0 below, caller treats as absent.
        }
        setTimeout(() => resolve(value), 3000)
      }),
  )

  const garmentReady = await page
    // Options are the THIRD argument; the second is the page function's own `arg`. Passed
    // second, `{ timeout: 45000 }` was ignored and the 30s default applied, so a garment
    // ready at 31-45s under this throttle read as never ready (found in review 2026-09-25).
    .waitForFunction(() => Boolean(document.querySelector('model-viewer')?.loaded), undefined, {
      timeout: 45000,
    })
    .then(() => Date.now() - navStart)
    .catch(() => null)

  await context.close()

  return {
    ttfb,
    lcp: lcp || null,
    garmentReady,
    overlap: overlapsModelDownload(requestStartedAt),
    modelCacheStatus,
  }
}

async function main() {
  const browser = await chromium.launch()
  const results = []
  try {
    for (let i = 0; i < RUNS; i++) {
      const r = await runOnce(browser)
      console.log(
        `run ${i + 1}: TTFB=${r.ttfb}ms LCP=${r.lcp}ms garment-ready=${r.garmentReady}ms ` +
          `overlap-ok=${r.overlap.ok} cf-cache-status=${r.modelCacheStatus}`,
      )
      if (!r.overlap.ok) console.log(`  overlap problems: ${r.overlap.problems?.join('; ')}`)
      // D-N12: a MISS is expected only on run 1. A MISS on run 2 as well means real
      // egress on every subsequent run — stop rather than spend three more downloads.
      if (i === 1 && r.modelCacheStatus && r.modelCacheStatus !== 'HIT') {
        console.error(
          `::error::model request MISS on run 2 as well (cf-cache-status=${r.modelCacheStatus}) ` +
            '— stopping after 2 runs to protect the $5/month R2 egress budget.',
        )
        results.push(r)
        break
      }
      results.push(r)
    }
  } finally {
    await browser.close()
  }

  const summary = {
    ttfb: classify('TTFB', summarize(results.map((r) => r.ttfb).filter((v) => v != null)), 800),
    lcp: classify('LCP', summarize(results.map((r) => r.lcp).filter((v) => v != null)), 2500),
    garmentReady: summarize(results.map((r) => r.garmentReady).filter((v) => v != null)),
  }
  console.log(JSON.stringify(summary, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `speed-measurement-probe: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(2)
  })
}
