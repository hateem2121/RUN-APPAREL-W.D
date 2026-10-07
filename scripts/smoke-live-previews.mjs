#!/usr/bin/env node
/**
 * Run the link-preview smoke test against EVERY live product, not just the first one.
 *
 * WHY. `smoke-viewer-preview.mjs` reads `DEFAULT_PRODUCT` when given no arguments, so
 * the post-deploy link-preview gate has always checked exactly one garment. On
 * 2026-09-04 nine more went live carrying 45 new preview cards, and those cards were
 * verified once, by hand, in the session that made them — the same "verified by nothing
 * from tomorrow onwards" shape that `scripts/live-products.mjs` exists to prevent, one
 * layer up.
 *
 * A link preview is not cosmetic here: a customer meets this product by scanning a tag
 * and sharing the page. A broken `og:image` is a blank card in WhatsApp, which is what
 * the recipient sees instead of the garment.
 *
 * ⚠️ COST WAS MEASURED, AND MY FIRST MEASUREMENT WAS OF MY OWN HARNESS. A hand sweep of
 * eleven previews appeared to take over eight minutes, which would have been a real
 * argument against gating them. It was Node holding keep-alive sockets open after the
 * work finished. Measured properly on 2026-09-04: crawler HTML 0.68 s cold and 0.03 s
 * warm, a preview card 38 KB in 0.04 s — eleven products cost seconds, not minutes.
 * State the measurement, and make sure it is a measurement OF THE THING.
 *
 * WHY A RUNNER RATHER THAN A LOOP INSIDE THAT SCRIPT. Identical to
 * `smoke-live-products.mjs`: the smoke script is top-to-bottom with module-level state
 * and `process.exit` calls, and one product's crash must not take the other's result
 * with it. Same shape on purpose — two runners that read alike are cheaper to trust than
 * one clever one.
 *
 * Usage:
 *   node scripts/smoke-live-previews.mjs [viewerBase]
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { LIVE_PRODUCTS } from './live-products.mjs'

const SMOKE = join(import.meta.dirname, 'smoke-viewer-preview.mjs')
// The garment folder on the website since the domain move of 2026-09-28.
const viewerBase = process.argv[2] ?? 'https://wear-run.com/products'

/*
 * ⚠️ FOUR AT A TIME, THE FIRST ONE ALONE (2026-10-07). One at a time this took 14 min 21 s
 * for 37 garments (about 23 s each) and the deploy job's 20-minute limit cancelled it on the
 * 38th, which skipped every post-deploy check after it. Raising the limit is the wrong fix
 * (.github/CLAUDE.md, the apt trap: it only moves which job absorbs the delay). Four at once
 * stays inside what the site serves in parallel (8 simultaneous requests measured clean on
 * 2026-10-07).
 *
 * The first product runs ALONE, before the rest: its run carries the site-wide checks,
 * including a timing read of LIVE_PRODUCTS[1] that must be cold (smoke-viewer-preview.mjs,
 * check 9). Started in parallel, that product's own run could warm it first.
 */
const PARALLEL = 4

/** Run one product's smoke; print its output as one block, never interleaved. */
function smoke({ slug, colourway }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SMOKE, viewerBase, slug, colourway])
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('close', (code) => {
      console.log(`\n=== ${slug}/${colourway} ===\n${output.trimEnd()}`)
      resolve(code === 0 ? null : `${slug}/${colourway}`)
    })
  })
}

const [first, ...rest] = LIVE_PRODUCTS
const results = first ? [await smoke(first)] : []
const queue = [...rest]
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) results.push(await smoke(next))
  }),
)
const failed = results.filter(Boolean)

if (failed.length > 0) {
  console.error(`\n::error::link-preview smoke failed for: ${failed.join(', ')}`)
  process.exit(1)
}

console.log(`\nOK    all ${LIVE_PRODUCTS.length} live products serve their own link preview.`)
