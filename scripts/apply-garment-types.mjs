#!/usr/bin/env node
/**
 * The garment type of each live product, for the page title search engines show, and one
 * spelling fix. Owner-approved 2026-09-30 (the list, "women's" on the three tennis dresses,
 * "Neoprene Wetsuit" for R-SNP, and RAGNAL -> RAGLAN on R-SRS).
 *
 * WHY. Every live product name is a brand name ("MINECUT MOTION", "TIGER TAIL PROFLEX"), so
 * no page title said what the garment IS. `garmentType` (apps/cms/src/collections/Products.ts)
 * holds the plain type and `garmentPageTitle` (packages/shared/src/pageTitle.ts) puts it in
 * the title. Each type below was read off that garment's own live description; none adds a
 * claim the description does not make. Checked by apps/cms/src/garmentTypes.test.ts.
 *
 * ⚠️ RUN IT ONLY AFTER THE DEPLOY THAT ADDS THE FIELD. Payload drops a key it does not know
 * and still answers 200 (apps/cms/CLAUDE.md, "a PATCH naming a projected field"), so before
 * that deploy every write here would be accepted and stored nowhere. That is why each write
 * is READ BACK (`?depth=0`) and counted as written only when the stored value matches.
 *
 * ⚠️ IT NEVER OVERWRITES. A type is written only into an EMPTY field; one the owner has
 * typed or changed in the CMS is left alone and reported. `slug` is never sent: it is
 * printed on physical QR tags.
 *
 * ⚠️ THE SPELLING FIX SENDS THE WHOLE COLOUR LIST BACK. A PATCH to an array field replaces
 * the array, and row order decides the default colour (.claude/rules/cms-scripted-writes.md).
 * So the rows go back with their ids, in the order they came, with ONLY `altText` changed,
 * and the script refuses to send unless the before and after lists have the same ids and
 * slugs in the same order. It then reads the product back and checks that again.
 *
 * Usage:
 *   node scripts/apply-garment-types.mjs              # dry run: reads the public API only
 *   CMS_API_KEY=… node scripts/apply-garment-types.mjs --apply
 */
import { realpathSync } from 'node:fs'

/** slug -> the approved garment type. */
export const GARMENT_TYPES = {
  'r-afp': "Men's Training Pullover",
  'r-aj': "Women's American Football Jersey",
  'r-ajm': "Men's American Football Jersey",
  'r-alj': "Men's Longline Softshell Jacket",
  'r-asb': 'High-Support Sports Bra',
  'r-atj': "Men's Leather Utility Jacket",
  'r-atw': 'Sublimated Windbreaker Jacket',
  'r-au': "Men's American Football Uniform",
  'r-bcd': 'Tennis Bra and Skirt Set',
  'r-cat': "Women's Compression Yoga Tights",
  'r-cch': "Women's Crop Hoodie",
  'r-csp': "Men's Half-Zip Fleece Pullover",
  'r-css': 'Polo-Collar Soccer Jersey',
  'r-cvn': 'V-Neck Soccer Jersey',
  'r-ect': "Women's Crop Top and Shorts Set",
  'r-et': "Men's Tracksuit",
  'r-fft': 'Training Bib (Scrimmage Vest)',
  'r-gtd': "Women's Tennis Dress",
  'r-hfj': "Men's Long-Sleeve Training Jersey",
  'r-ifs': 'Sweatshirt',
  'r-kmj': "Men's Softshell Jacket",
  'r-mm': "Women's Tennis Dress",
  'r-mrp': 'Tennis and Pickleball Shirt',
  'r-mss': "Men's Softshell Commuter Suit",
  'r-mxt': "Men's Full-Zip Training Top",
  'r-pps': "Men's Sherpa Fleece Jacket",
  'r-prs': 'Quarter-Zip Running Shirt',
  'r-snp': 'Neoprene Wetsuit',
  'r-srs': 'Raglan Soccer Tee',
  'r-taz': "Men's Half-Zip Polo Shirt",
  'r-ttp': "Women's Tennis Dress",
  'r-vcj': "Men's Softshell Tech Jacket",
  'r-vpj': 'Soccer Jersey',
  'r-wct': 'Cropped Training Top',
  'r-wsa': "Women's Tennis Dress",
  'r-wzu': "Women's Zip-Up Sports Vest",
  'r-xmp': "Men's Cycling Bib Shorts",
  'r-xmt': "Men's Sleeveless Training Vest",
  'r-zt': "Women's Yoga Tights",
  rxps: "Women's Cycling Skinsuit",
}

/** The one name the owner asked to correct: a misspelling of "raglan". */
export const NAME_FIX = { slug: 'r-srs', wrong: 'RAGNAL', right: 'RAGLAN' }

/**
 * What to do with one product's garment type.
 *
 * @param {unknown} stored the value in the CMS now
 * @param {string} approved
 * @returns {'write' | 'already' | 'owner-edited'}
 */
export function plannedType(stored, approved) {
  const current = typeof stored === 'string' ? stored.trim() : ''
  if (current === approved) return 'already'
  return current === '' ? 'write' : 'owner-edited'
}

/** `text` with the misspelling corrected, in whatever letter case it was written. */
export function fixSpelling(text, fix = NAME_FIX) {
  if (typeof text !== 'string') return text
  const lower = { from: fix.wrong.toLowerCase(), to: fix.right.toLowerCase() }
  const title = {
    from: fix.wrong[0] + lower.from.slice(1),
    to: fix.right[0] + lower.to.slice(1),
  }
  return text
    .replaceAll(fix.wrong, fix.right)
    .replaceAll(title.from, title.to)
    .replaceAll(lower.from, lower.to)
}

/**
 * The colour rows to send back for the spelling fix, or the reason not to send them.
 *
 * Only `altText` may differ. Same number of rows, same ids, same slugs, same order: if any
 * of that does not hold the answer is a refusal, because a wrong send here is silent data
 * loss on rows whose slugs are printed on QR tags.
 *
 * @param {Array<Record<string, unknown>>} rows the product's `colourways` at depth 0
 * @returns {{ rows: Array<Record<string, unknown>>, changed: number } | { refuse: string }}
 */
export function fixedColourRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { refuse: 'the product has no colour rows' }
  if (rows.some((row) => !row || typeof row !== 'object' || !row.id || !row.slug)) {
    return { refuse: 'a colour row has no id or no slug, so it cannot be sent back safely' }
  }
  let changed = 0
  const next = rows.map((row) => {
    const altText = fixSpelling(row.altText)
    if (altText !== row.altText) changed++
    return { ...row, altText }
  })
  const same = (pick) => next.every((row, index) => row[pick] === rows[index][pick])
  if (next.length !== rows.length || !same('id') || !same('slug')) {
    return { refuse: 'the rows to send do not match the stored rows one for one' }
  }
  return { rows: next, changed }
}

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const API_KEY = process.env.CMS_API_KEY || ''
const APPLY = process.argv.includes('--apply')

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

/** Payload's useful message is the inner one; the outer says only "field is invalid". */
const why = (result) =>
  result.json?.errors?.[0]?.data?.errors?.map((e) => `${e.path}: ${e.message}`).join('; ') ||
  result.json?.errors?.[0]?.message ||
  `status ${result.status}`

async function findProduct(slug) {
  const found = await api(
    'GET',
    `/api/products?where%5Bslug%5D%5Bequals%5D=${encodeURIComponent(slug)}&limit=1&depth=0`,
  )
  return found.ok ? (found.json?.docs?.[0] ?? null) : null
}

async function applyTypes(tally) {
  for (const [slug, approved] of Object.entries(GARMENT_TYPES)) {
    let stored
    let id
    if (APPLY) {
      const doc = await findProduct(slug)
      if (!doc) {
        console.error(`✗ ${slug}: could not read the stored product`)
        tally.failed++
        continue
      }
      stored = doc.garmentType
      id = doc.id
    } else {
      const live = await fetch(`${API_BASE}/api/public/viewer/${slug}`, {
        headers: { accept: 'application/json' },
      })
      if (!live.ok) {
        console.error(`✗ ${slug}: the public API answered ${live.status}`)
        tally.failed++
        continue
      }
      stored = (await live.json()).product?.garmentType
    }
    const plan = plannedType(stored, approved)
    if (plan === 'already') {
      tally.already++
      console.log(`= ${slug}: already "${approved}"`)
      continue
    }
    if (plan === 'owner-edited') {
      tally.ownerEdited++
      console.log(`! ${slug}: the CMS holds "${stored}", not the list's "${approved}" — left alone`)
      continue
    }
    tally.toWrite++
    console.log(`+ ${slug}: ${approved}`)
    if (!APPLY) continue
    const saved = await api('PATCH', `/api/products/${id}`, { garmentType: approved })
    const back = await api('GET', `/api/products/${id}?depth=0`)
    if (!saved.ok || back.json?.garmentType !== approved) {
      console.error(
        `   ✗ not stored (${why(saved)}). If every row says this, the deploy that adds ` +
          'the field has not happened yet.',
      )
      tally.failed++
      continue
    }
    console.log('   ✓ written and read back')
    tally.written++
  }
}

async function applyNameFix(tally) {
  const { slug, wrong, right } = NAME_FIX
  console.log(`\nSpelling fix on ${slug}: ${wrong} -> ${right}`)
  if (!APPLY) {
    const live = await fetch(`${API_BASE}/api/public/viewer/${slug}`, {
      headers: { accept: 'application/json' },
    })
    const name = live.ok ? ((await live.json()).product?.productName ?? '') : ''
    console.log(
      name.includes(wrong)
        ? `+ name "${name}" -> "${fixSpelling(name)}", and the same word in each colour's picture description`
        : `= name is "${name}": nothing to fix`,
    )
    return
  }

  const doc = await findProduct(slug)
  if (!doc) {
    console.error(`✗ ${slug}: could not read the stored product`)
    tally.failed++
    return
  }
  const name = String(doc.productName ?? '')
  const plan = fixedColourRows(doc.colourways)
  if ('refuse' in plan) {
    console.error(`✗ ${slug}: not sent — ${plan.refuse}`)
    tally.failed++
    return
  }
  if (!name.includes(wrong) && plan.changed === 0) {
    console.log('= the name and the colour descriptions are already correct')
  } else {
    const order = (rows) => rows.map((row) => `${row.id}:${row.slug}`).join(' ')
    console.log(`   rows before: ${order(doc.colourways)}`)
    console.log(`   rows to send: ${order(plan.rows)}`)
    const saved = await api('PATCH', `/api/products/${doc.id}`, {
      productName: fixSpelling(name),
      colourways: plan.rows,
    })
    const back = await api('GET', `/api/products/${doc.id}?depth=0`)
    const after = back.json?.colourways ?? []
    const intact =
      saved.ok &&
      back.json?.productName === fixSpelling(name) &&
      order(after) === order(doc.colourways) &&
      after.every((row) => !String(row.altText ?? '').includes(wrong))
    console.log(`   rows after:  ${order(after)}`)
    if (!intact) {
      console.error(`   ✗ the product did not read back as sent (${why(saved)})`)
      tally.failed++
      return
    }
    console.log(`   ✓ name and ${plan.changed} colour description(s) written and read back`)
    tally.written++
  }

  // The pictures carry their own description (`alt` on the media document), used when a
  // link to the page is shared. One small PATCH each; no array involved.
  const mediaIds = new Set()
  for (const row of doc.colourways) {
    for (const field of ['posterPreview', 'renderImage']) {
      const value = row[field]
      const id = value && typeof value === 'object' ? value.id : value
      if (id) mediaIds.add(id)
    }
  }
  for (const mediaId of mediaIds) {
    const media = await api('GET', `/api/media/${mediaId}?depth=0`)
    const alt = media.json?.alt
    if (!media.ok || typeof alt !== 'string' || !alt.includes(wrong)) continue
    const saved = await api('PATCH', `/api/media/${mediaId}`, { alt: fixSpelling(alt) })
    const back = await api('GET', `/api/media/${mediaId}?depth=0`)
    if (!saved.ok || back.json?.alt !== fixSpelling(alt)) {
      console.error(`   ✗ picture ${mediaId}: description not stored (${why(saved)})`)
      tally.failed++
      continue
    }
    console.log(`   ✓ picture ${mediaId}: "${fixSpelling(alt)}"`)
    tally.written++
  }
}

async function main() {
  if (!API_BASE.startsWith('https://')) {
    console.error(`CMS_API_BASE must be https:// — got "${API_BASE}"`)
    process.exit(2)
  }
  if (APPLY && !API_KEY) {
    console.error('CMS_API_KEY is not set. Export it before using --apply.')
    process.exit(2)
  }
  console.log(APPLY ? `APPLYING to ${API_BASE}\n` : 'Dry run — nothing will be written.\n')
  const tally = { toWrite: 0, written: 0, already: 0, ownerEdited: 0, failed: 0 }
  await applyTypes(tally)
  await applyNameFix(tally)
  console.log(
    `\n${tally.toWrite} type(s) to write, ${tally.written} write(s) stored, ` +
      `${tally.already} already set, ${tally.ownerEdited} left alone, ${tally.failed} failed.`,
  )
  if (tally.failed > 0) process.exit(1)
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`apply-garment-types: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
