#!/usr/bin/env node
/**
 * Point a LIVE garment at its re-processed model — the deliberate half of a republish.
 *
 * WHY A SCRIPT. The robot, and `scripts/process-local.mjs`, refuse to change a published
 * product: "swapping the model under a published page is your decision, not the robot's"
 * (`.claude/rules/cms-scripted-writes.md`). The owner made that decision for the 2026-09-27
 * rollout ("re-process all 16"), so this does the swap — and only under the conditions in
 * `swapProblems` (scripts/live-garment-writes-lib.mjs), where it cannot change what a buyer's
 * colour tabs point at.
 *
 * ORDER, as the plan requires: `fileColours` / `fileColourDetails` first, then `glbAsset`,
 * each READ BACK (a PATCH naming an unknown field answers 200 and stores nothing —
 * apps/cms/CLAUDE.md). `colourways` is never sent. The old Media doc is kept, so the rollback
 * is one PATCH back to the number this prints. Nothing is deleted.
 *
 * Usage:
 *   node scripts/swap-live-model.mjs <slug> --media <new media id> --report <process-local report .json> [--dry-run]
 *
 * The CMS key comes from $CMS_API_KEY or the macOS Keychain (service run-apparel-cms-api-key,
 * account cms). It is never printed.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { swapProblems } from './live-garment-writes-lib.mjs'

const CMS = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const slug = args.find(
  (a, i) => !a.startsWith('--') && !['--media', '--report'].includes(args[i - 1]),
)
const mediaId = Number(option('--media'))
const reportPath = option('--report')
const dryRun = args.includes('--dry-run')
if (!slug || !Number.isInteger(mediaId) || !reportPath) {
  console.error('usage: swap-live-model.mjs <slug> --media <id> --report <report.json> [--dry-run]')
  process.exit(2)
}

const KEY =
  process.env.CMS_API_KEY ??
  execFileSync(
    'security',
    ['find-generic-password', '-s', 'run-apparel-cms-api-key', '-a', 'cms', '-w'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  ).trim()
async function cms(path, init = {}) {
  const res = await fetch(`${CMS}${path}`, {
    ...init,
    headers: {
      Authorization: `users API-Key ${KEY}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok)
    throw new Error(
      `${init.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 400)}`,
    )
  return body
}
const readProduct = async () =>
  (await cms(`/api/products?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&limit=1`))
    .docs[0]

const { report } = JSON.parse(readFileSync(reportPath, 'utf8'))
const fileColours = report.variantsInFileOrder ?? report.variants ?? []
const product = await readProduct()
if (!product) throw new Error(`no product with slug "${slug}"`)
const media = await cms(`/api/media/${mediaId}?depth=0`)
// A plain GET, never HEAD: on this domain they hit different edge cache entries.
const served = await fetch(media.url)
const servedBytes = served.ok ? (await served.arrayBuffer()).byteLength : 0

const problems = swapProblems({ product, mediaId, media, servedBytes, fileColours })
console.log(
  `[swap] ${product.productName} (#${product.id}, ${product.status}): glb ${product.glbAsset} -> ${mediaId} ` +
    `(${media.filename}, ${servedBytes} bytes, GET ${served.status} ${served.headers.get('cf-cache-status')})`,
)
if (problems.length) {
  console.error(`[swap] REFUSED:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
if (dryRun) {
  console.log('[swap] --dry-run: nothing written.')
  process.exit(0)
}

const oldGlb = product.glbAsset
await cms(`/api/products/${product.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    fileColours,
    ...(report.variantColours?.length ? { fileColourDetails: report.variantColours } : {}),
  }),
})
let back = await readProduct()
if (JSON.stringify(back.fileColours) !== JSON.stringify(fileColours))
  throw new Error(`fileColours did not store: read ${JSON.stringify(back.fileColours)}`)

await cms(`/api/products/${product.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ glbAsset: mediaId }),
})
back = await readProduct()
if (String(back.glbAsset) !== String(mediaId))
  throw new Error(`glbAsset did not store: read ${back.glbAsset}`)
const order = (rows) => rows.map((r) => `${r.variantId}=${r.slug}`).join(',')
if (order(back.colourways) !== order(product.colourways))
  throw new Error(`colour rows changed: ${order(product.colourways)} -> ${order(back.colourways)}`)
console.log(
  `[swap] ✅ glb ${oldGlb} -> ${back.glbAsset}; colour rows unchanged; variantsVerified ${back.variantsVerified}`,
)
console.log(
  `[swap]    rollback: PATCH /api/products/${product.id} {"glbAsset": ${oldGlb}} (Media #${oldGlb} is kept)`,
)
