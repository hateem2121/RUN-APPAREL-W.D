#!/usr/bin/env node
/**
 * Create the printed catalogue's 67 garments as CMS products.
 *
 * WHY THIS EXISTS. The catalogue at https://wear-run.help/catalogue is 67
 * products; the CMS held ONE (`rxps`). Every garment needs a product row before
 * anything else can happen to it — a CLO file has nothing to attach to, a QR tag
 * has nothing to point at, and a buyer has no page to land on. Doing that by
 * hand is 67 forms of ten fields each.
 *
 * WHY IT GOES THROUGH THE REST API AND NOT D1. Every product write has to pass
 * `Products.beforeChange` — which derives `variantsVerified`, runs
 * `assertPublishable`, and writes an Events row when a live product loses its
 * colour mapping. A direct D1 INSERT skips all of it and would also skip the
 * `beforeValidate` hooks that uppercase a product code and derive a slug. On D1
 * specifically, hand-written SQL against a parent table is the most hazardous
 * operation in this repo (see CLAUDE.md). The API is the supported door.
 *
 * SAFE TO RE-RUN. Every row is looked up by `productCode` first and skipped if
 * it exists, so a partial run — a dropped connection at row 40 — is repaired by
 * running the same command again. Nothing here updates a product that is already
 * present, EXCEPT the one row carrying `existingProductId` (see below).
 *
 * ⚠️ IT NEVER SENDS A `slug` FOR AN EXISTING PRODUCT. `rxps` is already printed
 * on physical QR tags, and `apps/cms/src/fields/colourways.ts` and Products.ts
 * both record the rule: a slug may be suggested, never corrected. That row is
 * PATCHed with its code and description only.
 *
 * ⚠️ IT CREATES NO COLOURWAYS, DELIBERATELY. See the `$comment` block in
 * scripts/catalogue-products.json. The CLO file is what names a colour; guessing
 * 335 tag URLs here would be unrecoverable.
 *
 * Everything lands as `status: draft`. That is not a limitation being worked
 * around — `collectPublishProblems` correctly refuses to publish a product with
 * no colours and no model, so a draft is the only honest state until a CLO
 * export has been through the pipeline.
 *
 * Usage:
 *   node scripts/import-catalogue-products.mjs                # dry run, all 67
 *   node scripts/import-catalogue-products.mjs --limit 3      # dry run, first 3
 *   node scripts/import-catalogue-products.mjs --limit 3 --apply
 *   node scripts/import-catalogue-products.mjs --apply        # the rest
 *
 * Env:
 *   CMS_API_KEY   required for --apply. A Payload API key on a user with the
 *                 editor or admin role: `Authorization: users API-Key <key>`,
 *                 the same form apps/shrink/src/cms.ts already uses.
 *   CMS_API_BASE  override the CMS origin (default https://cms.wear-run.help).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  createCmsClient,
  defaultCmsBase,
  exitIfBaseUnsafe,
  explainPayloadError as explain,
  resolveCmsKey,
} from './cms-client.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, 'catalogue-products.json')

const API_BASE = defaultCmsBase()
const API_KEY = resolveCmsKey()

// Rows from catalogue-products.json AND the API key above both travel in every
// request below. The address is operator-supplied, so an http:// value would put
// the catalogue and the credential on the wire in cleartext with nothing to say so
// (CodeQL js/file-access-to-http, two instances). scripts/cms-client.mjs repeats the check
// beside the `fetch` itself (2026-10-25) and allows http:// only to localhost, where nothing
// leaves the machine.
exitIfBaseUnsafe(API_BASE)

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const client = createCmsClient({ base: API_BASE, key: API_KEY, apply: APPLY })
const limitAt = args.indexOf('--limit')
const LIMIT = limitAt === -1 ? Number.POSITIVE_INFINITY : Number(args[limitAt + 1])

if (Number.isNaN(LIMIT) || LIMIT <= 0) {
  console.error('--limit needs a positive number, e.g. --limit 3')
  process.exit(2)
}

/**
 * The five `category` values Products.ts accepts. Duplicated here on purpose:
 * this script runs against a DEPLOYED worker, whose config may be older than the
 * checked-out source, so importing the collection would prove the wrong thing.
 * A mismatch surfaces as a validation error from the API either way — this just
 * catches it before spending a request.
 */
const CATEGORIES = new Set([
  'Sportswear',
  'Teamwear & Uniforms',
  'Casual Wear',
  'Outerwear',
  'Sports Accessories',
])
const PRODUCT_CODE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Refuse the whole run on a bad row rather than half-importing a catalogue. */
function validate(products) {
  const problems = []
  const seen = { productCode: new Map(), slug: new Map() }
  for (const p of products) {
    const at = `page ${p.sourcePage} (${p.productCode})`
    if (!PRODUCT_CODE.test(p.productCode)) problems.push(`${at}: invalid productCode`)
    if (!SLUG.test(p.slug)) problems.push(`${at}: invalid slug "${p.slug}"`)
    if (!CATEGORIES.has(p.category)) problems.push(`${at}: unknown category "${p.category}"`)
    if (!p.productName?.trim()) problems.push(`${at}: no productName`)
    for (const key of ['productCode', 'slug']) {
      const prior = seen[key].get(p[key])
      if (prior) problems.push(`${at}: ${key} "${p[key]}" already used on page ${prior}`)
      seen[key].set(p[key], p.sourcePage)
    }
  }
  return problems
}

// `explain` (the API's own error shape, flattened to one line) is the client's
// `explainPayloadError`. Payload's outer message is "The following field is invalid" with no
// field named; the useful part is the innermost `field`/`message` pair — exactly the
// unhelpful shape Products.ts's own APIError comment complains about.

/** The payload for one product. `catalogueUrl` and `retiredMessage` are omitted
 *  on purpose so their defaultValue functions inherit from the
 *  `catalogue-defaults` global rather than freezing a copy per product. */
const toPayload = (p) => ({
  productName: p.productName,
  productCode: p.productCode,
  slug: p.slug,
  category: p.category,
  sortOrder: p.sortOrder,
  status: 'draft',
  variantMode: 'single-glb-variants',
  shortDescription: p.shortDescription,
  fabricComposition: p.fabricComposition,
  gsm: p.gsm,
  ...(p.garmentFit ? { garmentFit: p.garmentFit } : {}),
  performanceFeatures: (p.performanceFeatures ?? []).map((feature) => ({ feature })),
})

/** A refusal reads `status explanation`, as it always did; a write the read-back disagrees with says so. */
const failureText = (res) =>
  res.stage === 'write' ? `${res.status} ${res.detail}` : `written but NOT stored: ${res.error}`

async function main() {
  const all = JSON.parse(readFileSync(DATA, 'utf8')).products
  const problems = validate(all)
  if (problems.length > 0) {
    console.error(`Dataset is invalid — nothing was sent:\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }

  const products = all.slice(0, LIMIT === Number.POSITIVE_INFINITY ? undefined : LIMIT)
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} — ${products.length} of ${all.length} products → ${API_BASE}`,
  )
  if (!APPLY) console.log('Nothing will be written. Re-run with --apply to create.\n')
  else if (!API_KEY) {
    console.error('CMS_API_KEY is not set. Export it before using --apply.')
    process.exit(2)
  }

  const tally = { created: 0, updated: 0, skipped: 0, failed: 0 }

  for (const p of products) {
    const label = `${String(p.sortOrder).padStart(2, ' ')}. ${p.productCode.padEnd(7)} ${p.productName.slice(0, 34).padEnd(34)}`

    if (!APPLY) {
      console.log(`${label} would ${p.existingProductId ? 'UPDATE' : 'create'}`)
      continue
    }

    // An existing row is identified by productCode, which is `unique: true`. The
    // one product that predates this import is matched by its stored code
    // (RXPS), not the code we are about to give it (R-XPS) — otherwise the
    // lookup misses and the create collides on the unique index.
    const lookup = p.existingProductId
      ? `/api/products/${p.existingProductId}?depth=0`
      : `/api/products?where[productCode][equals]=${encodeURIComponent(p.productCode)}&depth=0&limit=1`
    const found = await client.get(lookup)

    if (p.existingProductId) {
      if (!found.ok) {
        console.log(
          `${label} FAILED  cannot read id ${p.existingProductId}: ${explain(found.json)}`,
        )
        tally.failed++
        continue
      }
      // Code, description and list position. `slug` is deliberately absent:
      // `rxps` is on printed QR tags and nothing automated may rewrite one.
      //
      // `sortOrder` was NOT sent here until 2026-08-17, and its absence left a
      // real collision: the pre-existing product kept its own `sortOrder: 1`
      // while the import gave page 2's garment the same 1, so the order of those
      // two in every list was undefined. Safe to write — it is a display field,
      // in no URL and on no tag — and sending it is what makes a re-run of this
      // script actually converge on the dataset rather than leave that drift.
      //
      // `fabricComposition` and `gsm` stay ABSENT on purpose. The live row's
      // values are owner-approved (and recorded as category-typical rather than
      // measured), so the dataset's own guesses must not overwrite them. That is
      // why the read-back diff still reports gsm differing for this one row, and
      // why that difference is correct.
      //
      // The client reads the row back (`depth=0`) and compares the three fields sent; before
      // 2026-10-25 this PATCH, and the create below, were trusted on their status alone.
      const res = await client.patchDoc('products', p.existingProductId, {
        productCode: p.productCode,
        shortDescription: p.shortDescription,
        sortOrder: p.sortOrder,
      })
      if (res.ok) {
        console.log(`${label} UPDATED (slug "${found.json.slug}" untouched)`)
        tally.updated++
      } else {
        console.log(`${label} FAILED  ${failureText(res)}`)
        tally.failed++
      }
      continue
    }

    if (found.ok && (found.json.docs?.length ?? 0) > 0) {
      console.log(`${label} skipped (already exists)`)
      tally.skipped++
      continue
    }

    const res = await client.createDoc('products', { json: toPayload(p) })
    if (res.ok) {
      console.log(`${label} created  /${p.slug}`)
      tally.created++
    } else {
      console.log(`${label} FAILED  ${failureText(res)}`)
      tally.failed++
    }
  }

  console.log(
    `\ncreated ${tally.created} · updated ${tally.updated} · skipped ${tally.skipped} · failed ${tally.failed}`,
  )
  if (tally.failed > 0) {
    console.error('\nSome rows failed. Fix the cause and re-run — created rows are skipped.')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
