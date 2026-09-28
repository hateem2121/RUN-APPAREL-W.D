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
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { renderRows } from './live-garment-writes-lib.mjs'

const CMS = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const args = process.argv.slice(2)
const slug = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--dir')
const dir = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : undefined
const dryRun = args.includes('--dry-run')
if (!slug || !dir) {
  console.error('usage: attach-renders.mjs <slug> --dir <dir> [--dry-run]')
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
const auth = { Authorization: `users API-Key ${KEY}` }
async function cms(path, init = {}) {
  const res = await fetch(`${CMS}${path}`, { ...init, headers: { ...auth, ...init.headers } })
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
  const form = new FormData()
  form.append(
    '_payload',
    JSON.stringify({ alt: `Studio render: ${product.productName} in ${p.row.displayName}` }),
  )
  form.append('file', new File([readFileSync(p.file)], basename(p.file), { type: 'image/webp' }))
  const created = await cms('/api/media', { method: 'POST', body: form })
  const media = created.doc ?? created
  // A plain GET, never HEAD (root CLAUDE.md): fetch it the way the button will.
  const served = await fetch(media.url)
  const bytes = served.ok ? (await served.arrayBuffer()).byteLength : 0
  if (bytes !== readFileSync(p.file).length)
    throw new Error(`${media.url} served ${served.status} / ${bytes} bytes`)
  bySlug[p.row.slug] = media.id
  console.log(`  uploaded ${p.row.slug} -> media ${media.id} (GET ${served.status})`)
}

const fresh = await readProduct()
const rows = renderRows(fresh.colourways, bySlug)
if ('error' in rows) throw new Error(rows.error)
await cms(`/api/products/${fresh.id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ colourways: rows }),
})
const back = await readProduct()
const order = (list) => list.map((r) => `${r.id}:${r.slug}`).join(',')
if (order(back.colourways) !== order(fresh.colourways))
  throw new Error(`ORDER OR IDS CHANGED: ${order(fresh.colourways)} -> ${order(back.colourways)}`)
for (const row of back.colourways) {
  const want =
    bySlug[row.slug] ?? fresh.colourways.find((r) => r.id === row.id)?.renderImage ?? null
  if (String(row.renderImage ?? null) !== String(want))
    throw new Error(`${row.slug}: renderImage read back ${row.renderImage}, wanted ${want}`)
}
console.log(`[renders] ✅ ${Object.keys(bySlug).length} attached; order and ids unchanged`)
