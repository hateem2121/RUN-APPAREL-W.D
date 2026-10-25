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
import { createCmsClient, defaultCmsBase, resolveCmsKey } from './cms-client.mjs'
import { isGatedProduct } from './live-products.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const doPublish = args.includes('--publish')

if (!slug) {
  console.error('usage: publish-garment.mjs <slug> [--publish] [--dry-run]')
  process.exit(2)
}
const apiKey = resolveCmsKey()
if (!apiKey) throw new Error('CMS_API_KEY is required')
// The address is CMS_API_BASE (this script's old name, CMS_ORIGIN, still works). Writes are on
// unless --dry-run, as this script has always behaved; the dry run exits below before the
// write, and the client would refuse one anyway. Every write is read back by the client.
const client = createCmsClient({ base: defaultCmsBase(), key: apiKey, apply: !dryRun })

const names = JSON.parse(readFileSync(join(here, 'colourway-names.json'), 'utf8'))
const planned = names.products[slug]
if (!planned) throw new Error(`no colour plan for "${slug}" in scripts/colourway-names.json`)

const found = await client.productBySlug(slug)
if (!found.ok) throw new Error(`could not read product "${slug}" (${found.status})`)
const product = found.doc
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
// ⚠️ REFUSE TO PUBLISH A GARMENT NOTHING WILL WATCH.
//
// scripts/live-products.mjs is what every post-deploy gate iterates —
// smoke-live-products.mjs (is the model fetchable the way a QR scan fetches it?),
// perf-probe.mjs, and the check-live skill. On 2026-09-04 nine garments were published
// in one session and that list still named two, so nine live products were verified by
// nothing for as long as it took someone to notice. That is the same failure the list
// was written for in the first place; it just arrived from the catalogue growing rather
// than from a rename.
//
// A warning here would be ignored — this whole session was a tour of protections that
// existed and did nothing. So it is a refusal, and it costs the caller one line of code
// in the same change that publishes the garment. It cannot fire on a recovery: this
// script already refuses a product that is published, so the only thing it can stop is a
// genuinely new one, which is exactly when the row has to exist.
if (doPublish && !isGatedProduct(slug)) {
  const first = colourways[0]
  console.error(`[publish] REFUSED: "${slug}" is not in scripts/live-products.mjs, so no`)
  console.error('          post-deploy gate would check it. Add this row, then re-run:')
  console.error(
    `\n  { slug: '${slug}', colourway: '${first?.slug ?? '<first-colourway>'}', productCode: '${product.productCode}' },\n`,
  )
  process.exit(1)
}

if (dryRun) {
  console.log('[publish] --dry-run: nothing written.')
  process.exit(0)
}

const body = { colourways: colourways.map(({ _keptSlug, ...row }) => row) }
if (doPublish) body.status = 'published'
// Before 2026-10-25 this PATCH was trusted on its status alone. The client now reads the
// product back (`depth=0`) and runs this comparison: every colour row keeps its id, slug, name
// and switched-on flag in the order sent, and a publish really changed the status.
const res = await client.patchDoc('products', product.id, body, {
  verify: (stored) => {
    const problems = []
    const rows = stored?.colourways ?? []
    if (rows.length !== body.colourways.length) {
      problems.push(`expected ${body.colourways.length} colour rows, ${rows.length} stored`)
    }
    for (const [index, sent] of body.colourways.entries()) {
      const row = rows[index]
      for (const field of ['id', 'slug', 'displayName', 'active']) {
        if (row?.[field] !== sent[field]) {
          problems.push(
            `row ${index + 1} ${field}: sent ${JSON.stringify(sent[field])}, stored ${JSON.stringify(row?.[field])}`,
          )
        }
      }
    }
    if (body.status && stored?.status !== body.status) {
      problems.push(`status: sent "${body.status}", stored "${stored?.status}"`)
    }
    return problems
  },
})
if (res.stage === 'write') {
  console.error(`[publish] PATCH failed (${res.status}) — the publish gate says:`)
  console.error(JSON.stringify(res.json, null, 2).slice(0, 1200))
  process.exit(1)
}
if (!res.ok) {
  console.error(`[publish] the PATCH was accepted but did not read back as sent: ${res.error}`)
  process.exit(1)
}
const doc = res.stored
console.log(`[publish] ✅ status "${doc.status}"`)
const order = doc.colourways.map((c) => c.slug).join(',')
const before = product.colourways.map((c) => c.slug || '(blank)').join(',')
console.log(`[publish]    rows before: ${before}`)
console.log(`[publish]    rows after : ${order}`)
if (doc.status === 'published')
  console.log(
    `[publish]    live at https://wear-run.com/products/${slug}/${doc.colourways[0].slug}`,
  )
