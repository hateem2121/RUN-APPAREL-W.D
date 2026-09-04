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

const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const args = process.argv.slice(2)
const slug = args.find((a) => !a.startsWith('--'))
const dirIndex = args.indexOf('--dir')
const dir = dirIndex >= 0 ? args[dirIndex + 1] : 'output/posters-2026-09-03b'
const dryRun = args.includes('--dry-run')

if (!slug) {
  console.error('usage: upload-posters.mjs <product-slug> --dir <dir> [--dry-run]')
  process.exit(2)
}
const apiKey = process.env.CMS_API_KEY
if (!apiKey) throw new Error('CMS_API_KEY is required')
const auth = { Authorization: `users API-Key ${apiKey}` }

const found = await fetch(
  `${CMS_ORIGIN}/api/products?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&limit=1`,
  { headers: { ...auth, accept: 'application/json' } },
).then((r) => r.json())
const product = found?.docs?.[0]
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
  const form = new FormData()
  form.append('_payload', JSON.stringify({ alt: p.alt }))
  form.append('file', new File([readFileSync(p.file)], basename(p.file), { type: 'image/webp' }))
  const res = await fetch(`${CMS_ORIGIN}/api/media`, { method: 'POST', headers: auth, body: form })
  const body = await res.json()
  if (res.status >= 300) {
    console.error(`[posters] upload failed for ${p.row.slug} (${res.status}):`)
    console.error(JSON.stringify(body, null, 2).slice(0, 800))
    process.exit(1)
  }
  p.mediaId = (body.doc ?? body).id
  console.log(`  uploaded ${p.row.slug} -> media ${p.mediaId}`)
}

// Write the array back with ONLY posterPreview changed. Order and every other field
// are carried through untouched — see the header.
const colourways = product.colourways.map((row) => {
  const p = plan.find((x) => x.row.id === row.id)
  return { ...row, posterPreview: p.mediaId, altText: p.alt }
})
const res = await fetch(`${CMS_ORIGIN}/api/products/${product.id}`, {
  method: 'PATCH',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ colourways }),
})
const body = await res.json()
if (res.status >= 300) {
  console.error(`[posters] product PATCH failed (${res.status}):`)
  console.error(JSON.stringify(body, null, 2).slice(0, 900))
  process.exit(1)
}
const after = (body.doc ?? body).colourways
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
