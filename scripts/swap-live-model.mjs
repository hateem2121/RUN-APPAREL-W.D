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
import { readFileSync } from 'node:fs'
import { createCmsClient, defaultCmsBase, resolveCmsKey } from './cms-client.mjs'
import { swapProblems } from './live-garment-writes-lib.mjs'

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

// $CMS_API_KEY, else the macOS Keychain (service run-apparel-cms-api-key, account cms).
const KEY = resolveCmsKey({ keychain: true })
if (!KEY) throw new Error('no CMS key: set CMS_API_KEY or add it to the Keychain (see the header)')
// The address is CMS_API_BASE (this script's old name, CMS_ORIGIN, still works). Writes are on
// unless --dry-run, as this script has always behaved; every write is read back by the client.
const client = createCmsClient({ base: defaultCmsBase(), key: KEY, apply: !dryRun })
const readProduct = async () => {
  const found = await client.productBySlug(slug)
  if (!found.ok) throw new Error(`GET product "${slug}" → ${found.status}`)
  return found.doc
}

const { report } = JSON.parse(readFileSync(reportPath, 'utf8'))
const fileColours = report.variantsInFileOrder ?? report.variants ?? []
const product = await readProduct()
if (!product) throw new Error(`no product with slug "${slug}"`)
const media = await client.getJson(`/api/media/${mediaId}?depth=0`)
// A plain GET, never HEAD: on this domain they hit different edge cache entries.
const served = await client.fetchServed(media.url)
const servedBytes = served.ok ? served.byteLength : 0

const problems = swapProblems({ product, mediaId, media, servedBytes, fileColours })
console.log(
  `[swap] ${product.productName} (#${product.id}, ${product.status}): glb ${product.glbAsset} -> ${mediaId} ` +
    `(${media.filename}, ${servedBytes} bytes, GET ${served.status} ${served.cache})`,
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
// Each PATCH is read back by the client (`depth=0`) and compared with the check beside it.
const colours = await client.patchDoc(
  'products',
  product.id,
  {
    fileColours,
    ...(report.variantColours?.length ? { fileColourDetails: report.variantColours } : {}),
  },
  {
    verify: (stored) =>
      JSON.stringify(stored?.fileColours) === JSON.stringify(fileColours)
        ? []
        : [`fileColours did not store: read ${JSON.stringify(stored?.fileColours)}`],
  },
)
if (!colours.ok) throw new Error(colours.error)

const swapped = await client.patchDoc(
  'products',
  product.id,
  { glbAsset: mediaId },
  {
    verify: (stored) =>
      String(stored?.glbAsset) === String(mediaId)
        ? []
        : [`glbAsset did not store: read ${stored?.glbAsset}`],
  },
)
if (!swapped.ok) throw new Error(swapped.error)
const back = swapped.stored
const order = (rows) => rows.map((r) => `${r.variantId}=${r.slug}`).join(',')
if (order(back.colourways) !== order(product.colourways))
  throw new Error(`colour rows changed: ${order(product.colourways)} -> ${order(back.colourways)}`)
console.log(
  `[swap] ✅ glb ${oldGlb} -> ${back.glbAsset}; colour rows unchanged; variantsVerified ${back.variantsVerified}`,
)
console.log(
  `[swap]    rollback: PATCH /api/products/${product.id} {"glbAsset": ${oldGlb}} (Media #${oldGlb} is kept)`,
)
