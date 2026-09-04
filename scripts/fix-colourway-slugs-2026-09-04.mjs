#!/usr/bin/env node
/**
 * ONE-OFF, DATED, AND DELIBERATELY NOT GENERAL: correct six colourway slugs left holding a
 * palette word that no longer exists.
 *
 * WHY THIS IS ALLOWED, ONCE. The standing rule is that a colourway slug is NEVER changed,
 * because it is part of the URL printed on a physical QR tag and a printed tag cannot be
 * recalled. That rule protects tags. On 2026-09-04 these nine catalogue products were drafts
 * until minutes before this ran, so no tag for any of them can exist — which is the only
 * window in which the rule's reason does not apply. The owner was shown exactly that argument
 * and approved these six changes explicitly.
 *
 * WHAT WENT WRONG, so it is not repeated. The shrink robot imports colour names from the file
 * and derives each slug from the name it chose. It ran BEFORE ten plain words were renamed in
 * `colour-name.ts` (Pink -> Fuchsia, Grey -> Ash, …), so it wrote `grey`, `off-white`,
 * `yellow` and `light-grey`. `publish-garment.mjs` then correctly refused to rewrite an
 * existing slug, which left six colours displaying a new name at an old address — "Bone" at
 * `/off-white`, "Ash" at `/grey`, "Pebble" at `/light-grey`.
 *
 * ⚠️ THE ORDERING LESSON: rename the palette BEFORE the robot imports colours, not after.
 * The display name is editable forever; the slug is not.
 *
 * `publish-garment.mjs` is deliberately left unable to do this. Rewriting a slug should stay
 * hard, dated and argued for — not a flag someone can pass.
 *
 * Usage: CMS_API_KEY=… node scripts/fix-colourway-slugs-2026-09-04.mjs [--dry-run]
 */
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const dryRun = process.argv.includes('--dry-run')
const apiKey = process.env.CMS_API_KEY
if (!apiKey) throw new Error('CMS_API_KEY is required')
const auth = { Authorization: `users API-Key ${apiKey}` }

/** product slug -> [current slug, intended slug, the name now displayed] */
const FIXES = {
  'r-atw': [
    ['off-white', 'bone', 'Bone'],
    ['yellow', 'citron', 'Citron'],
  ],
  'r-atj': [['grey', 'ash', 'Ash']],
  'r-mm': [['grey', 'ash', 'Ash']],
  'r-aj': [['light-grey', 'pebble', 'Pebble / Optic White']],
  'r-asb': [['light-grey', 'pebble', 'Pebble / Khaki']],
}

let changed = 0
for (const [productSlug, fixes] of Object.entries(FIXES)) {
  const found = await fetch(
    `${CMS_ORIGIN}/api/products?where[slug][equals]=${productSlug}&depth=0&limit=1`,
    { headers: { ...auth, accept: 'application/json' } },
  ).then((r) => r.json())
  const product = found?.docs?.[0]
  if (!product) throw new Error(`no product "${productSlug}"`)

  const colourways = product.colourways.map((row) => {
    const fix = fixes.find((f) => f[0] === row.slug)
    if (!fix) return row
    // Refuse if the row is not the one described — a stale plan must not rename the wrong colour.
    if (row.displayName !== fix[2]) {
      throw new Error(
        `${productSlug}: expected "${fix[2]}" at /${fix[0]} but found "${row.displayName}" — refusing`,
      )
    }
    return { ...row, slug: fix[1] }
  })

  const after = colourways.map((c) => c.slug)
  const dupes = [...new Set(after.filter((s, i) => after.indexOf(s) !== i))]
  if (dupes.length)
    throw new Error(`${productSlug}: would duplicate ${dupes.join(', ')} — refusing`)

  const moved = colourways.filter((c, i) => c.slug !== product.colourways[i].slug)
  if (moved.length !== fixes.length) {
    throw new Error(
      `${productSlug}: expected ${fixes.length} change(s), would make ${moved.length} — refusing`,
    )
  }
  for (const c of moved) console.log(`  ${productSlug.padEnd(7)} "${c.displayName}" → /${c.slug}`)
  if (dryRun) continue

  const res = await fetch(`${CMS_ORIGIN}/api/products/${product.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ colourways }),
  })
  const out = await res.json()
  if (res.status >= 300) {
    console.error(
      `  ${productSlug}: PATCH failed ${res.status}: ${JSON.stringify(out).slice(0, 400)}`,
    )
    process.exit(1)
  }
  const doc = out.doc ?? out
  console.log(
    `  ${productSlug.padEnd(7)} ✅ order now: ${doc.colourways.map((c) => c.slug).join(',')}`,
  )
  changed += moved.length
}
console.log(dryRun ? '[fix] --dry-run: nothing written.' : `[fix] ${changed} slug(s) corrected.`)
