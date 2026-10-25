#!/usr/bin/env node
/**
 * Replace a product's colourway posters, one file per switched-on colour.
 *
 * WHY A SCRIPT. The poster is what a buyer looks at for the seconds the model is
 * downloading (`apps/viewer/src/lib/placeholder.ts` blurs it 24 -> 2 px by bytes) and it
 * is the picture a shared link unfurls with. On 2026-09-04 the live skinsuit's `black`
 * poster was a plain black T-SHIRT SILHOUETTE — the hand-drawn placeholder from before
 * the garment existed — and all five carried the dead slug `N001` in their captions.
 * Four of five were real renders, so nothing looked broken enough to notice.
 *
 * WHAT IT MUST NOT DO, because `colourways` is an inline array and a PATCH REPLACES it:
 *   - reorder rows. The first switched-on row is the default colourway, so a reorder
 *     repoints every printed QR tag at a different colour.
 *   - alter `slug`. It is printed on physical tags and cannot be recalled.
 *   - alter `displayName`, `variantId`, `hexSwatch`, `active` or the row `id`.
 * Only `posterPreview` moves. Every other field is written back byte-identical, and the
 * script refuses outright if a colour has no matching file rather than leaving a row
 * pointing at nothing.
 *
 * Alt text is `"<product name> in <colour name>"`, which is the shape the publish gate
 * checks: `collectPublishProblems` refuses a poster whose description names a DIFFERENT
 * product (apps/cms/src/collections/publishGating.ts), a check that exists because that
 * shipped live and survived a rename.
 *
 * Usage:
 *   CMS_API_KEY=… node scripts/upload-posters.mjs <product-slug> --dir output/posters-2026-09-03b
 *   …                                             <product-slug> --dir … --dry-run
 */
import { readFileSync, existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createCmsClient, defaultCmsBase, resolveCmsKey } from './cms-client.mjs'

const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const dirIndex = args.indexOf('--dir')
const dir = dirIndex >= 0 ? args[dirIndex + 1] : 'output/posters-2026-09-03b'
const dryRun = args.includes('--dry-run')

if (!slug) {
  console.error('usage: upload-posters.mjs <product-slug> --dir <dir> [--dry-run]')
  process.exit(2)
}
const apiKey = resolveCmsKey()
if (!apiKey) throw new Error('CMS_API_KEY is required')
// The address is CMS_API_BASE (this script's old name, CMS_ORIGIN, still works). Writes are on
// unless --dry-run, as this script has always behaved; the dry run exits below before any
// upload, and the client would refuse one anyway. Every write is read back by the client.
const client = createCmsClient({ base: defaultCmsBase(), key: apiKey, apply: !dryRun })

const found = await client.productBySlug(slug)
if (!found.ok) throw new Error(`could not read product "${slug}" (${found.status})`)
const product = found.doc
if (!product) throw new Error(`no product with slug "${slug}"`)
console.log(`[posters] ${product.productName} (#${product.id}, ${product.status})`)

// Resolve every file BEFORE uploading anything: a half-done swap is worse than none.
const plan = product.colourways.map((row) => {
  const file = resolve(join(dir, `${slug}-${row.slug}-poster.webp`))
  if (!existsSync(file)) throw new Error(`no poster for "${row.slug}" at ${file}`)
  return { row, file, alt: `${product.productName} in ${row.displayName}` }
})
for (const p of plan) {
  const kb = (readFileSync(p.file).length / 1024).toFixed(0)
  console.log(
    `  ${p.row.slug.padEnd(10)} ${basename(p.file)}  ${kb} KB  poster ${p.row.posterPreview} -> ?`,
  )
}
if (dryRun) {
  console.log('[posters] --dry-run: nothing uploaded.')
  process.exit(0)
}

for (const p of plan) {
  // The client uploads, then fetches the file back with a plain GET (never HEAD) and compares
  // its size and the stored alt text — before 2026-10-25 an upload was trusted on its status.
  const bytes = readFileSync(p.file)
  const uploaded = await client.uploadMedia({
    filename: basename(p.file),
    bytes,
    type: 'image/webp',
    fields: { alt: p.alt },
    verifyDoc: (stored) =>
      stored?.alt === p.alt ? [] : [`alt: sent "${p.alt}", stored "${stored?.alt}"`],
    expectServed: { byteLength: bytes.length },
  })
  if (uploaded.stage === 'write') {
    console.error(`[posters] upload failed for ${p.row.slug} (${uploaded.status}):`)
    console.error(JSON.stringify(uploaded.json, null, 2).slice(0, 800))
    process.exit(1)
  }
  if (!uploaded.ok) {
    console.error(`[posters] uploaded ${p.row.slug}, but it did not read back: ${uploaded.error}`)
    process.exit(1)
  }
  p.mediaId = uploaded.doc.id
  console.log(`  uploaded ${p.row.slug} -> media ${p.mediaId}`)
}

// Write the array back with ONLY posterPreview changed. Order and every other field
// are carried through untouched — see the header.
const colourways = product.colourways.map((row) => {
  const p = plan.find((x) => x.row.id === row.id)
  return { ...row, posterPreview: p.mediaId, altText: p.alt }
})
const sentOrder = colourways.map((r) => r.slug).join(',')
const patched = await client.patchDoc(
  'products',
  product.id,
  { colourways },
  {
    verify: (stored) => {
      const rows = stored?.colourways ?? []
      const problems = []
      if (rows.length !== colourways.length) {
        problems.push(`expected ${colourways.length} colour rows, ${rows.length} stored`)
      }
      for (const [index, sent] of colourways.entries()) {
        const row = rows[index]
        for (const field of ['id', 'slug', 'posterPreview', 'altText']) {
          if (row?.[field] !== sent[field]) {
            problems.push(
              `row ${index + 1} ${field}: sent ${JSON.stringify(sent[field])}, stored ${JSON.stringify(row?.[field])}`,
            )
          }
        }
      }
      if (rows.map((r) => r.slug).join(',') !== sentOrder) problems.push('the row order changed')
      return problems
    },
  },
)
if (patched.stage === 'write') {
  console.error(`[posters] product PATCH failed (${patched.status}):`)
  console.error(JSON.stringify(patched.json, null, 2).slice(0, 900))
  process.exit(1)
}
if (!patched.ok) {
  console.error(`[posters] the product PATCH did not read back as sent: ${patched.error}`)
  process.exit(1)
}
const after = patched.stored.colourways
console.log('[posters] ✅ repointed:')
for (const row of after)
  console.log(`  ${row.slug.padEnd(10)} poster ${row.posterPreview}  "${row.altText}"`)
const order = after.map((r) => r.slug).join(',')
const before = product.colourways.map((r) => r.slug).join(',')
console.log(
  order === before
    ? '[posters] row order unchanged ✅'
    : `[posters] ⚠️ ORDER CHANGED: ${before} -> ${order}`,
)
