#!/usr/bin/env node
/**
 * Correct the written copy on three garments whose stored text does not describe the
 * garment their 3D file actually shows. One-off, owner-approved 2026-09-07.
 *
 * WHY EACH ONE, because none of these is a wording preference:
 *
 * - **R-AU THE AGGRESSOR UNIFORM** carried "The men’s counterpart to the Aggressor
 *   jersey…", which is a description of R-AJM — a different product that has been live
 *   since 2026-09-04. The text was COPIED rather than moved when R-AJM was created, so
 *   the two pages read as duplicates. Rendering the 2026-09-07 export settles what R-AU
 *   is: a two-piece kit, jersey over a padded trouser, which the catalogue's own page 12
 *   also shows. The stored feature list already said "EVA foam pad", which only the
 *   trouser has — the evidence was there before the picture was.
 *
 * - **R-ECT ENDURA CROP TOP** is described as a top alone. The export is
 *   `ENDURA CROP TOP + Shorts.glb` and renders a top AND shorts, so a page describing
 *   only the top would caption half the garment on screen. Owner chose the whole outfit
 *   on this product rather than splitting it across R-WRS.
 *
 * - **R-ET ENDURANCE TRACKSUIT** is described as "a full-zip jacket and stand collar".
 *   The export renders a PULLOVER HOODIE with contrast raglan sleeves, and the
 *   catalogue's own photograph on page 56 shows the hoodie too — so the catalogue is
 *   internally inconsistent, its text disagreeing with its picture. Owner chose to match
 *   the garment, which is what a customer sees.
 *
 * ⚠️ A 200 FROM PAYLOAD MEANS "ACCEPTED", NOT "STORED". On 2026-09-04
 * `apply-customisation-copy.mjs` printed `✓ written` eleven times and stored ten of
 * eleven intros nowhere, because `customisationIntroHtml` is computed at read time and
 * Payload silently drops an unknown key. Both fields written here were checked against
 * `apps/cms/src/collections/Products.ts` (real columns, lines 320 and 678) and against
 * `apps/cms/src/endpoints/publicViewer.ts` (neither is projected) — and every write is
 * READ BACK and compared below regardless.
 *
 * Neither field is in `GATED_FIELDS` (`status`, `variantMode`, `glbAsset`, `colourways`),
 * so this cannot trip the publish gate. All three products are drafts when it runs.
 *
 * Usage:
 *   CMS_API_KEY=… node scripts/fix-garment-copy-2026-09-07.mjs [--dry-run]
 */
const CMS_ORIGIN = process.env.CMS_ORIGIN ?? 'https://cms.wear-run.help'
const apiKey = process.env.CMS_API_KEY
if (!apiKey) throw new Error('CMS_API_KEY is required')
const auth = { Authorization: `users API-Key ${apiKey}` }
const dryRun = process.argv.includes('--dry-run')

/** Keyed by slug, resolved to an id at runtime — never hardcode the id. */
const COPY = {
  'r-au': {
    shortDescription:
      'A men’s two-piece American football uniform: a contoured jersey over a padded ' +
      'trouser. The jersey pairs a contrasting chevron yoke with distressed brushstroke ' +
      'numbering, a player-name panel and a ribbed V-neck trim, while the trouser carries ' +
      'EVA foam padding at hip, thigh and knee above a RUN-branded elastic waistband. ' +
      'Built in a double mesh interlock with silicone printing, so the graphics hold their ' +
      'edge through contact.',
    // Existing four are accurate; the fifth makes the two-piece visible in the list too.
    performanceFeatures: [
      'Double mesh interlock',
      'EVA foam pad',
      'Silicone printing',
      'Contrasting ribbed V-neck trim',
      'Padded trouser with RUN elastic waistband',
    ],
  },
  'r-ect': {
    shortDescription:
      'A women’s two-piece training set: a cropped full-sleeve top with matching shorts. ' +
      'The premium ultra-soft single jersey offers breathable coverage that contours to ' +
      'the body, making it a natural pairing for studio sessions or the walk home ' +
      'afterwards. Thumb holes keep the sleeves in place through a full session, and a ' +
      'printed logo band finishes the hem of the top and the waist of the shorts.',
    performanceFeatures: [
      'Single jersey knit',
      'Thumb holes',
      'Breathable contoured coverage',
      'Screen printing',
      'Matching high-waist shorts',
    ],
  },
  'r-et': {
    shortDescription:
      'A men’s tech tracksuit pairing a pullover hood with a tapered pant. Contrast raglan ' +
      'sleeves and an oversized tonal logo across the chest give it shape, while ribbed ' +
      'cuffs and an elasticated waist keep it easy to move in and out of. Quick-dry ' +
      'moisture management and wrinkle-resistant fabric make it a complete training set ' +
      'for team travel, warm-ups and athletic lifestyle.',
    // Four bullets replaced: the garment has no front zip, no stand collar, no visible
    // hand-pocket zips and no ankle zips. Only the fabric claim survives unchanged.
    performanceFeatures: [
      'Pullover hood with drawcord',
      'Contrast raglan sleeves',
      'Tapered pant with ribbed cuffs',
      'Elasticated waist',
      'Wrinkle-resistant fabric',
    ],
  },
}

let failures = 0
for (const [slug, copy] of Object.entries(COPY)) {
  const found = await fetch(
    `${CMS_ORIGIN}/api/products?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&limit=1`,
    { headers: { ...auth, accept: 'application/json' } },
  ).then((r) => r.json())
  const product = found?.docs?.[0]
  if (!product) throw new Error(`no product with slug "${slug}"`)

  console.log(
    `\n[copy] #${product.id} ${product.productCode} ${product.productName} [${product.status}]`,
  )
  console.log(`[copy]   was: ${product.shortDescription.slice(0, 90)}…`)
  console.log(`[copy]   now: ${copy.shortDescription.slice(0, 90)}…`)
  console.log(
    `[copy]   features: ${copy.performanceFeatures.length} (was ${product.performanceFeatures.length})`,
  )

  if (dryRun) {
    console.log('[copy]   --dry-run: nothing written.')
    continue
  }

  const res = await fetch(`${CMS_ORIGIN}/api/products/${product.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shortDescription: copy.shortDescription,
      performanceFeatures: copy.performanceFeatures.map((feature) => ({ feature })),
    }),
  })
  const out = await res.json()
  if (res.status >= 300) {
    console.error(`[copy]   ✗ PATCH ${res.status}: ${JSON.stringify(out).slice(0, 500)}`)
    failures++
    continue
  }

  // READ BACK. The status code above proves only that Payload accepted the keys.
  const after = await fetch(`${CMS_ORIGIN}/api/products/${product.id}?depth=0`, {
    headers: { ...auth, accept: 'application/json' },
  }).then((r) => r.json())
  const gotDesc = after.shortDescription === copy.shortDescription
  const gotFeatures =
    JSON.stringify(after.performanceFeatures.map((f) => f.feature)) ===
    JSON.stringify(copy.performanceFeatures)
  console.log(`[copy]   description stored: ${gotDesc ? '✓' : '✗ MISMATCH'}`)
  console.log(
    `[copy]   features stored:    ${gotFeatures ? '✓' : `✗ MISMATCH — ${after.performanceFeatures.map((f) => f.feature).join(' · ')}`}`,
  )
  if (!gotDesc || !gotFeatures) failures++
}

// ⚠️ A DRY RUN MUST NOT CLAIM VERIFICATION. The first version of this line printed
// "all three verified by read-back" after --dry-run, which had read nothing back and
// written nothing — the same shape as the 200-means-stored trap this script exists to
// avoid, in the reporting instead of the write.
console.log(
  dryRun
    ? '\n[copy] --dry-run complete: nothing written, nothing verified.'
    : failures === 0
      ? '\n[copy] ✅ all three verified by read-back'
      : `\n[copy] ✗ ${failures} failed`,
)
process.exit(failures === 0 ? 0 : 1)
