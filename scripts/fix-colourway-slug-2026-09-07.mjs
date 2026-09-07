#!/usr/bin/env node
/**
 * ONE-OFF, DATED, AND DELIBERATELY NOT GENERAL: move ONE colourway off a web address that
 * names the wrong colour.
 *
 * WHY THIS IS ALLOWED, ONCE — the same argument as
 * `scripts/fix-colourway-slugs-2026-09-04.mjs`, and no wider. The standing rule is that a
 * colourway slug is NEVER changed, because it is part of the URL printed on a physical QR
 * tag and a printed tag cannot be recalled. That rule protects tags. R-ECT has been a draft
 * since it was imported on 2026-08-17 and has never been published, so no tag for it can
 * exist — the only window in which the rule's reason does not apply. The owner was shown the
 * rendered garment beside the proposed name and chose this change explicitly on 2026-09-07.
 *
 * WHAT IS WRONG. R-ECT's `Colorway 4` fabric factor is `#D2E0B8`, a pale yellow-green. The
 * palette's nearest entry by CIEDE2000 is `Beige` at ΔE 8.8, inside the confidence threshold,
 * so the robot named it "Beige" and derived `/beige` — no low-confidence blank to catch it.
 * `Sage` is ΔE 12.9, further away in Lab space and still the right merchandiser word: the
 * garment renders as pale sage green, which is what a customer sees. This is the 2026-08-03
 * failure in miniature — a colour named from arithmetic rather than from the picture — and
 * the reason it is worth a dated script is that `publish-garment.mjs` correctly REFUSES to
 * rewrite a slug, so it cannot be fixed on the way through.
 *
 * ⚠️ NOT A PRECEDENT FOR RENAMING SLUGS. `publish-garment.mjs` is deliberately left unable to
 * do this. Rewriting a slug should stay hard, dated and argued for — never a flag someone can
 * pass. And the ordering lesson from 2026-09-04 still stands: get the naming right BEFORE the
 * robot imports colours, because the display name is editable forever and the slug is not.
 *
 * ⚠️ A PATCH TO AN ARRAY FIELD REPLACES THE WHOLE ARRAY, so every row is sent back with its
 * `id` and in its original order. Row order decides the default colourway; a partial send is
 * silent data loss.
 *
 * Usage: CMS_API_KEY=… node scripts/fix-colourway-slug-2026-09-07.mjs [--dry-run]
 */
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const dryRun = process.argv.includes('--dry-run')
const apiKey = process.env.CMS_API_KEY
if (!apiKey) throw new Error('CMS_API_KEY is required')
const auth = { Authorization: `users API-Key ${apiKey}` }

/** product slug -> [[variantId, current slug, expected displayName, intended slug]] */
const FIXES = {
  'r-ect': [['Colorway 4', 'beige', 'Beige', 'sage']],
}

let changed = 0
for (const [productSlug, fixes] of Object.entries(FIXES)) {
  const found = await fetch(
    `${CMS_ORIGIN}/api/products?where[slug][equals]=${productSlug}&depth=0&limit=1`,
    { headers: { ...auth, accept: 'application/json' } },
  ).then((r) => r.json())
  const product = found?.docs?.[0]
  if (!product) throw new Error(`no product "${productSlug}"`)

  // Refuse outright on a published product: the no-tag argument above is the ONLY
  // justification for this script, and it evaporates the moment the page is live.
  if (product.status === 'published') {
    throw new Error(
      `${productSlug} is PUBLISHED — a QR tag may exist, so its slug must not change. Refusing.`,
    )
  }

  const colourways = product.colourways.map((row) => {
    const fix = fixes.find((f) => f[0] === row.variantId)
    if (!fix) return row
    const [, fromSlug, expectedName, toSlug] = fix
    // Refuse if the row is not the one described — a stale plan must not rename the
    // wrong colour, which on this field is unrecoverable once a tag is printed.
    if (row.slug !== fromSlug) {
      throw new Error(`${productSlug}/${row.variantId}: expected /${fromSlug}, found /${row.slug}`)
    }
    if (row.displayName !== expectedName) {
      throw new Error(
        `${productSlug}/${row.variantId}: expected "${expectedName}", found "${row.displayName}"`,
      )
    }
    return { ...row, slug: toSlug }
  })

  const after = colourways.map((c) => c.slug)
  const dupes = [...new Set(after.filter((s, i) => after.indexOf(s) !== i))]
  if (dupes.length) throw new Error(`${productSlug}: would duplicate ${dupes.join(', ')}`)

  const moved = colourways.filter((c, i) => c.slug !== product.colourways[i].slug)
  if (moved.length !== fixes.length) {
    throw new Error(
      `${productSlug}: expected ${fixes.length} change(s), would make ${moved.length}`,
    )
  }
  // Order must be untouched: the first row is the default colourway.
  const orderBefore = product.colourways.map((c) => c.variantId).join(',')
  const orderAfter = colourways.map((c) => c.variantId).join(',')
  if (orderBefore !== orderAfter) throw new Error(`${productSlug}: row order would change`)

  for (const c of moved) console.log(`  ${productSlug} "${c.displayName}" → /${c.slug}`)
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

  // READ BACK — a 200 means "accepted", not "stored".
  const stored = await fetch(`${CMS_ORIGIN}/api/products/${product.id}?depth=0`, {
    headers: { ...auth, accept: 'application/json' },
  }).then((r) => r.json())
  const slugs = stored.colourways.map((c) => c.slug)
  const ok = fixes.every(([variantId, , , toSlug]) =>
    stored.colourways.some((c) => c.variantId === variantId && c.slug === toSlug),
  )
  console.log(`  ${productSlug} stored order: ${slugs.join(', ')}  ${ok ? '✓' : '✗ NOT STORED'}`)
  if (!ok) process.exit(1)
  changed += moved.length
}
console.log(
  dryRun
    ? '[fix] --dry-run: nothing written.'
    : `[fix] ${changed} slug(s) corrected and read back.`,
)
