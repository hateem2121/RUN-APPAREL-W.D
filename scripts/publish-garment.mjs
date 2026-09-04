#!/usr/bin/env node
/**
 * Name a draft garment's colours, switch them on, and publish it.
 *
 * WHY A SCRIPT, AND WHY IT READS A COMMITTED FILE. The shrink robot attaches the model and
 * imports the colours it found, but deliberately leaves every row `active: false` and leaves
 * a LOW-CONFIDENCE name BLANK — because a confident wrong name is exactly how "Navy" came to
 * be printed on a maroon garment (2026-08-03). Filling those in is a judgement, so the
 * proposal lives in `scripts/colourway-names.json` where it can be read and corrected before
 * anything is written, rather than being typed into 180 admin fields or invented here.
 *
 * ⚠️ `slug` IS IRREVERSIBLE. It becomes part of the URL printed on that garment's QR tag. This
 * script therefore REFUSES to change a slug that is already set — it only fills a blank one.
 * A slug is set once, here, and never again.
 *
 * ⚠️ It also refuses a PUBLISHED product outright. The two live garments already have their
 * names, and `colourways` is in the CMS's GATED_FIELDS, so writing it re-runs the publish gate
 * on a page customers are looking at. Changing a live product's colours is a deliberate act,
 * not something a batch script should be able to do by being pointed at the wrong slug.
 *
 * Row ORDER is never touched: the first switched-on row is the default colourway, so a reorder
 * repoints printed tags at a different colour.
 *
 * Usage:
 *   CMS_API_KEY=… node scripts/publish-garment.mjs <slug>                # name + activate, stay draft
 *   CMS_API_KEY=… node scripts/publish-garment.mjs <slug> --publish      # …and publish
 *   CMS_API_KEY=… node scripts/publish-garment.mjs <slug> --dry-run
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const doPublish = args.includes('--publish')

if (!slug) {
  console.error('usage: publish-garment.mjs <slug> [--publish] [--dry-run]')
  process.exit(2)
}
const apiKey = process.env.CMS_API_KEY
if (!apiKey) throw new Error('CMS_API_KEY is required')
const auth = { Authorization: `users API-Key ${apiKey}` }

const names = JSON.parse(readFileSync(join(here, 'colourway-names.json'), 'utf8'))
const planned = names.products[slug]
if (!planned) throw new Error(`no colour plan for "${slug}" in scripts/colourway-names.json`)

const found = await fetch(
  `${CMS_ORIGIN}/api/products?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&limit=1`,
  { headers: { ...auth, accept: 'application/json' } },
).then((r) => r.json())
const product = found?.docs?.[0]
if (!product) throw new Error(`no product with slug "${slug}"`)
if (product.status === 'published') {
  console.error(
    `[publish] REFUSED: ${product.productName} is already published. Its colours are set and ` +
      'customers are looking at it — change a live product deliberately, not through this script.',
  )
  process.exit(1)
}
if (!product.glbAsset) {
  console.error(`[publish] REFUSED: ${product.productName} has no finished 3D file yet.`)
  process.exit(1)
}
console.log(
  `[publish] ${product.productName} (#${product.id}, ${product.status}, glb ${product.glbAsset})`,
)

const colourways = product.colourways.map((row) => {
  const p = planned.colours.find((c) => c.variantId === row.variantId)
  if (!p) throw new Error(`no plan for variant "${row.variantId}" — refusing a partial write`)
  const hadSlug = typeof row.slug === 'string' && row.slug.trim() !== ''
  return {
    ...row,
    // Only ever FILL a blank slug. Never rewrite one — it may be on a printed tag.
    slug: hadSlug ? row.slug : p.slug,
    displayName: p.displayName,
    altText: row.altText || `${product.productName} in ${p.displayName}`,
    active: true,
    _keptSlug: hadSlug,
  }
})
const slugs = colourways.map((c) => c.slug)
const dupes = [...new Set(slugs.filter((s, i) => slugs.indexOf(s) !== i))]
if (dupes.length)
  throw new Error(`duplicate web-address words within this product: ${dupes.join(', ')} — refusing`)
if (slugs.some((s) => !s))
  throw new Error('a colour would be left with no web-address word — refusing')

for (const c of colourways) {
  const note = c._keptSlug ? '(slug already set, kept)' : '(slug set now — permanent)'
  console.log(`  ${String(c.variantId).padEnd(17)} "${c.displayName}"  /${c.slug}  ${note}`)
}
if (dryRun) {
  console.log('[publish] --dry-run: nothing written.')
  process.exit(0)
}

const body = { colourways: colourways.map(({ _keptSlug, ...row }) => row) }
if (doPublish) body.status = 'published'
const res = await fetch(`${CMS_ORIGIN}/api/products/${product.id}`, {
  method: 'PATCH',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const out = await res.json()
if (res.status >= 300) {
  console.error(`[publish] PATCH failed (${res.status}) — the publish gate says:`)
  console.error(JSON.stringify(out, null, 2).slice(0, 1200))
  process.exit(1)
}
const doc = out.doc ?? out
console.log(`[publish] ✅ status "${doc.status}"`)
const order = doc.colourways.map((c) => c.slug).join(',')
const before = product.colourways.map((c) => c.slug || '(blank)').join(',')
console.log(`[publish]    rows before: ${before}`)
console.log(`[publish]    rows after : ${order}`)
if (doc.status === 'published')
  console.log(`[publish]    live at https://viewer.wear-run.help/${slug}/${doc.colourways[0].slug}`)
