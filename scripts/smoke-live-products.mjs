#!/usr/bin/env node
/**
 * Run the payload smoke test against EVERY live product, not just the first one.
 *
 * WHY. Until 2026-08-30 every automated check resolved to `rxps`:
 * smoke-viewer-payload.mjs, smoke-viewer-preview.mjs, perf-probe.mjs (both targets)
 * and uptime.yml's VIEWER_URL. The second live product — `r-xmp`, the X-MILO PRO BIB
 * — was verified by NOTHING. It could have lost its model and every gate would have
 * stayed green, which is precisely the six-day failure smoke-viewer-payload.mjs was
 * written to end.
 *
 * WHY A RUNNER RATHER THAN A LOOP INSIDE THAT SCRIPT. It is a top-to-bottom script
 * with module-level state and `process.exit` calls; wrapping it in a loop would mean
 * restructuring 270 lines of carefully-annotated checks to fix a coverage gap. Each
 * product gets its own process instead, which also means one product's crash cannot
 * take the other's result with it.
 *
 * ⚠️ COST IS NOT A REASON TO SKIP A PRODUCT HERE. It looks like it should be —
 * `SMOKE_BROWSER_GET=1` fetches the model the way a browser does, and the models are
 * 27.0 MB and 22.7 MB. But smoke-viewer-payload.mjs cancels the response body
 * (`res.body?.cancel()`) as soon as the status line arrives, so a "bare GET" costs a
 * few buffered KB, not 27 MB. Do NOT "optimise" this by adding a Range header: that
 * script's own comment forbids it, because a ranged request may land on a DIFFERENT
 * edge cache entry, and the cached-404 divergence between GET and HEAD is the exact
 * bug check 4 exists to catch.
 *
 * Usage:
 *   node scripts/smoke-live-products.mjs [apiBase]
 *
 * Env: everything smoke-viewer-payload.mjs reads (SMOKE_BROWSER_GET, …) is inherited.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { LIVE_PRODUCTS } from './live-products.mjs'

const SMOKE = join(import.meta.dirname, 'smoke-viewer-payload.mjs')
const apiBase = process.argv[2] ?? process.env.VITE_API_BASE_URL ?? 'https://cms.wear-run.help'

const failed = []

for (const { slug, colourway } of LIVE_PRODUCTS) {
  console.log(`\n=== ${slug}/${colourway} ===`)
  const result = spawnSync(process.execPath, [SMOKE, apiBase, slug, colourway], {
    stdio: 'inherit',
  })
  if (result.status !== 0) failed.push(`${slug}/${colourway}`)
}

if (failed.length > 0) {
  console.error(`\n::error::payload smoke failed for: ${failed.join(', ')}`)
  process.exit(1)
}

console.log(`\nOK    all ${LIVE_PRODUCTS.length} live products serve a real, fetchable model.`)
