#!/usr/bin/env node
/**
 * Attach the CLO studio render to each colour — the picture behind the viewer's HD IMAGE
 * button (`renderImage`, apps/cms/src/fields/colourways.ts, 2026-09-27).
 *
 * WHY A SCRIPT, and what it must not do: `colourways` is an inline array and a PATCH
 * REPLACES it (`.claude/rules/cms-scripted-writes.md`), the first switched-on row is the
 * default colour, and each `slug` is printed on a QR tag. So only `renderImage` moves;
 * `renderRows` (scripts/live-garment-writes-lib.mjs) carries every other field and the order
 * through untouched and refuses a render named for a colour the product does not have.
 * Works on a draft or a live garment alike — the render is optional and not publish-gated.
 *
 * Files are `<dir>/<product slug>-<colour slug>-render.webp`; the filename becomes the R2
 * key, as the posters' do. Every upload is fetched back with a plain GET, and the product is
 * read back after the PATCH. A colour with no file keeps no render (the button stays hidden).
 *
 * Usage:
 *   node scripts/attach-renders.mjs <slug> --dir <renders dir> [--dry-run]
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createCmsClient, defaultCmsBase, resolveCmsKey } from './cms-client.mjs'
import { renderRows } from './live-garment-writes-lib.mjs'

const args = process.argv.slice(2)
const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir')
const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : undefined
const dryRun = args.includes('--dry-run')
if (!slug || !dir) {
  console.error('usage: attach-renders.mjs <slug> --dir <dir> [--dry-run]')
  process.exit(2)
}
// $CMS_API_KEY, else the macOS Keychain (service run-apparel-cms-api-key, account cms).
const KEY = resolveCmsKey({ keychain: true })
if (!KEY) throw new Error('no CMS key: set CMS_API_KEY or add it to the Keychain (see the header)')
// Writes are on unless --dry-run, as this script has always behaved; the dry run exits below
// before any write, and the client would refuse one anyway.
const client = createCmsClient({ base: defaultCmsBase(), key: KEY, apply: !dryRun })
const readProduct = async () => {
  const found = await client.productBySlug(slug)
  if (!found.ok) throw new Error(`GET product "${slug}" → ${found.status}`)
  return found.doc
}

const product = await readProduct()
if (!product) throw new Error(`no product with slug "${slug}"`)
const plan = product.colourways
  .map((row) => ({ row, file: join(dir, `${slug}-${row.slug}-render.webp`) }))
  .filter((p) => existsSync(p.file))
console.log(
  `[renders] ${product.productName} (#${product.id}, ${product.status}): ${plan.length} of ${product.colourways.length} colours have a render`,
)
for (const p of plan)
  console.log(
    `  ${String(p.row.slug).padEnd(12)} ${basename(p.file)}  ${(readFileSync(p.file).length / 1024).toFixed(0)} KB`,
  )
// Validate the whole write BEFORE uploading anything: a half-done attach is worse than none.
const dryRows = renderRows(product.colourways, Object.fromEntries(plan.map((p) => [p.row.slug, 0])))
if ('error' in dryRows) throw new Error(dryRows.error)
if (dryRun || plan.length === 0) {
  console.log(`[renders] ${dryRun ? '--dry-run' : 'nothing to attach'}: nothing written.`)
  process.exit(0)
}

const bySlug = {}
for (const p of plan) {
  const bytes = readFileSync(p.file)
  // The client uploads, and fetches the file back with a plain GET, never HEAD (root
  // CLAUDE.md): the way the button will, and compares its size to the file on disk.
  const uploaded = await client.uploadMedia({
    filename: basename(p.file),
    bytes,
    type: 'image/webp',
    fields: { alt: `Studio render: ${product.productName} in ${p.row.displayName}` },
    expectServed: { byteLength: bytes.length },
  })
  if (!uploaded.ok) {
    throw new Error(
      uploaded.stage === 'verify' && uploaded.served
        ? `${uploaded.doc?.url} served ${uploaded.served.status} / ${uploaded.served.ok ? uploaded.served.byteLength : 0} bytes`
        : uploaded.error,
    )
  }
  const media = uploaded.doc
  bySlug[p.row.slug] = media.id
  console.log(`  uploaded ${p.row.slug} -> media ${media.id} (GET ${uploaded.served?.status})`)
}

const fresh = await readProduct()
const rows = renderRows(fresh.colourways, bySlug)
if ('error' in rows) throw new Error(rows.error)
const order = (list) => list.map((r) => `${r.id}:${r.slug}`).join(',')
// The client sends the rows, reads the product back (`depth=0`) and runs this: the order and
// ids must be what was read, and every row's renderImage what it should now be.
const patched = await client.patchDoc(
  'products',
  fresh.id,
  { colourways: rows },
  {
    verify: (stored) => {
      const problems = []
      const back = stored?.colourways ?? []
      if (order(back) !== order(fresh.colourways)) {
        problems.push(`ORDER OR IDS CHANGED: ${order(fresh.colourways)} -> ${order(back)}`)
        return problems
      }
      for (const row of back) {
        const want =
          bySlug[row.slug] ?? fresh.colourways.find((r) => r.id === row.id)?.renderImage ?? null
        if (String(row.renderImage ?? null) !== String(want)) {
          problems.push(`${row.slug}: renderImage read back ${row.renderImage}, wanted ${want}`)
        }
      }
      return problems
    },
  },
)
if (!patched.ok) throw new Error(patched.error)
console.log(`[renders] ✅ ${Object.keys(bySlug).length} attached; order and ids unchanged`)
