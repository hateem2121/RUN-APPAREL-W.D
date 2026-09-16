#!/usr/bin/env node
/**
 * Store American spelling in the CMS text that still carries British forms, as the owner
 * decided on 2026-09-04 (docs/CUSTOMISATION-COPY-2026-09-04.md:511).
 *
 * SCOPE, and why it stops there:
 *   - every live product's `retiredMessage` and `shortDescription` — plain text fields;
 *   - the `catalogue-defaults` global's `retiredMessage`, which a NEW product starts with
 *     (Products.ts reads it before falling back to DEFAULT_RETIRED_MESSAGE).
 * Customisation steps are NOT written here. docs/CUSTOMISATION-COPY-2026-09-04.md is their
 * single source of truth, so they are fixed in that file and written by
 * `scripts/apply-customisation-copy.mjs --only <slug> --apply`.
 *
 * ⚠️ EVERY WRITE IS READ BACK (`?depth=0`). A 200 from Payload means the request was
 * accepted, not that the field was stored — apps/cms/CLAUDE.md, "A PATCH naming a projected
 * field returns 200 and stores nothing".
 *
 * ⚠️ THE DRY RUN READS THE PUBLIC PAYLOAD, which can be up to 60 s old (the content cache).
 * --apply re-reads the stored document and refuses to write a field whose stored value is
 * not the one the dry run showed.
 *
 * Usage:
 *   node scripts/apply-american-spelling.mjs              # dry run, no key needed
 *   CMS_API_KEY=… node scripts/apply-american-spelling.mjs --apply
 */
import { findBritishSpellings, toAmerican } from './copy-rules.mjs'
import { LIVE_PRODUCTS } from './live-products.mjs'

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const API_KEY = process.env.CMS_API_KEY || ''
const APPLY = process.argv.includes('--apply')
const FIELDS = ['retiredMessage', 'shortDescription']

// The key travels in every request, so a non-https origin is refused — the same guard as
// scripts/apply-customisation-copy.mjs.
if (!API_BASE.startsWith('https://')) {
  console.error(`CMS_API_BASE must be https:// — got "${API_BASE}"`)
  process.exit(2)
}
if (APPLY && !API_KEY) {
  console.error('CMS_API_KEY is not set. Export it before using --apply.')
  process.exit(2)
}

async function api(method, pathname, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `users API-Key ${API_KEY}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text.slice(0, 300) }
  }
  return { ok: response.ok, status: response.status, json }
}

function explain(json) {
  const outer = json?.errors?.[0]
  const inner = outer?.data?.errors?.[0]
  if (inner) return `${inner.field}: ${inner.message}`
  return outer?.message || json?.raw || JSON.stringify(json).slice(0, 200)
}

/** @returns {Promise<'unchanged' | 'planned' | 'written' | 'failed'>} */
async function fixProduct(slug) {
  const live = await fetch(`${API_BASE}/api/public/viewer/${slug}`, {
    headers: { accept: 'application/json' },
  })
  if (!live.ok) {
    console.error(`✗ ${slug}: public payload answered ${live.status}`)
    return 'failed'
  }
  const shown = (await live.json()).product ?? {}
  const patch = {}
  for (const field of FIELDS) {
    const before = String(shown[field] ?? '')
    const after = toAmerican(before)
    if (after === before) continue
    patch[field] = after
    console.log(
      `── ${slug} ${field} (${findBritishSpellings(before).join(', ')})\n   before: ${before}\n   after : ${after}`,
    )
  }
  if (Object.keys(patch).length === 0) return 'unchanged'
  if (!APPLY) return 'planned'

  const found = await api(
    'GET',
    `/api/products?where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=0`,
  )
  const doc = found.json?.docs?.[0]
  if (!found.ok || !doc) {
    console.error(`   ✗ could not read the stored product: ${explain(found.json)}`)
    return 'failed'
  }
  for (const field of Object.keys(patch)) {
    if (String(doc[field] ?? '') !== String(shown[field] ?? '')) {
      console.error(
        `   ✗ ${field} changed in the CMS since it was read — nothing written; run the dry run again`,
      )
      return 'failed'
    }
  }
  const saved = await api('PATCH', `/api/products/${doc.id}`, patch)
  if (!saved.ok) {
    console.error(`   ✗ ${saved.status}: ${explain(saved.json)}`)
    return 'failed'
  }
  const stored = await api('GET', `/api/products/${doc.id}?depth=0`)
  const lost = Object.keys(patch).filter(
    (field) => String(stored.json?.[field] ?? '') !== patch[field],
  )
  if (lost.length > 0) {
    console.error(`   ✗ written but NOT stored: ${lost.join(', ')}`)
    return 'failed'
  }
  console.log('   ✓ written and read back')
  return 'written'
}

/** @returns {Promise<'unchanged' | 'planned' | 'written' | 'failed'>} */
async function fixGlobal() {
  if (!APPLY) {
    console.log(
      '── catalogue-defaults retiredMessage: read and fixed only with --apply (reading it needs the key)',
    )
    return 'planned'
  }
  const read = await api('GET', '/api/globals/catalogue-defaults?depth=0')
  if (!read.ok) {
    console.error(`✗ catalogue-defaults: ${read.status} ${explain(read.json)}`)
    return 'failed'
  }
  const before = String(read.json?.retiredMessage ?? '')
  const after = toAmerican(before)
  if (after === before) return 'unchanged'
  console.log(`── catalogue-defaults retiredMessage\n   before: ${before}\n   after : ${after}`)
  const saved = await api('POST', '/api/globals/catalogue-defaults', { retiredMessage: after })
  if (!saved.ok) {
    console.error(`   ✗ ${saved.status}: ${explain(saved.json)}`)
    return 'failed'
  }
  const stored = await api('GET', '/api/globals/catalogue-defaults?depth=0')
  if (String(stored.json?.retiredMessage ?? '') !== after) {
    console.error('   ✗ written but NOT stored')
    return 'failed'
  }
  console.log('   ✓ written and read back')
  return 'written'
}

console.log(APPLY ? `APPLYING to ${API_BASE}\n` : 'Dry run — nothing will be written.\n')
const outcomes = []
for (const { slug } of LIVE_PRODUCTS) outcomes.push(await fixProduct(slug))
outcomes.push(await fixGlobal())
const count = (name) => outcomes.filter((outcome) => outcome === name).length
console.log(
  `\n${count('planned')} planned, ${count('written')} written, ${count('unchanged')} unchanged, ${count('failed')} failed.`,
)
if (count('failed') > 0) process.exit(1)
