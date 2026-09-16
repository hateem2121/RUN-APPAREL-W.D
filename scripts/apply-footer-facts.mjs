#!/usr/bin/env node
/**
 * Store the footer facts the owner supplied on 2026-09-16 in the CMS.
 *
 * Three of the site footer's four blocks — Capacity, Standards and Elsewhere — render
 * nothing at all while their fields are blank, which is the code being right rather than
 * broken (`SiteFooter.tsx`: a blank claim renders no block and never an example). They have
 * been blank since the footer was built on 2026-09-05. This fills them.
 *
 * ⚠️ CLAUDE NEVER SEES THE KEY, BY THE OWNER'S CHOICE (2026-09-15, "You run 2 short
 * commands"). The owner creates a key in the CMS, exports it in their own terminal, runs
 * this, and switches the key off afterwards.
 *
 * ⚠️ EVERY WRITE IS READ BACK (`?depth=0`). A 200 from Payload means the request was
 * accepted, not that the field was stored — apps/cms/CLAUDE.md, "A PATCH naming a projected
 * field returns 200 and stores nothing". That trap cost eleven silent no-ops on 2026-09-04.
 *
 * ⚠️ `certifications` AND `socialLinks` ARE ARRAYS, AND A WRITE REPLACES THE WHOLE ARRAY.
 * Both are empty today, so nothing is lost; --apply still prints what is there first, so a
 * surprise is visible before it is overwritten rather than after.
 *
 * ⚠️ THE DRY RUN CANNOT SHOW CURRENT VALUES. Unlike products, a global is not public, so
 * reading it needs the key. The dry run therefore validates locally and prints exactly what
 * would be sent; --apply reads before, writes, and reads back.
 *
 * Usage:
 *   node scripts/apply-footer-facts.mjs                    # dry run, no key needed
 *   CMS_API_KEY=… node scripts/apply-footer-facts.mjs --apply
 */

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
const API_KEY = process.env.CMS_API_KEY || ''
const APPLY = process.argv.includes('--apply')
const GLOBAL = '/api/globals/site-settings'

/**
 * The owner's words, 2026-09-16, mapped onto the field names in `globals/SiteSettings.ts`.
 *
 * ⚠️ `hoursFirstDay` / `hoursLastDay` are the STORED select codes, not the numbers the
 * footer renders. `projectHours()` maps 'mon' through DAY_INDEX to 0-6 for `formatHours`,
 * so a test fixture showing `firstDay: 1` is the projected shape; writing a number here
 * would be refused by the select.
 *
 * ⚠️ `certifications` DELIBERATELY DOES NOT LIST BARE STANDARD NAMES. RUN APPAREL holds no
 * certification in its own name — `lib/companyFacts.ts` CERTIFICATION says so and is live —
 * so each entry carries whose standard it is. The block is headed "Standards" for the same
 * reason. The owner ruled this on 2026-09-16 after asking three times for the bare names.
 */
export const FOOTER_FACTS = {
  capacity: {
    moq: '50 pieces per style',
    leadTime: '2–4 weeks from order confirmation',
    hoursFirstDay: 'mon',
    hoursLastDay: 'sat',
    hoursOpen: '08:00',
    hoursClose: '17:00',
  },
  worksCoordinates: '32.41° N · 74.46° E',
  certifications: [
    { name: 'Parent: SEDEX-registered, SMETA-audited' },
    { name: 'Suppliers: OEKO-TEX, GOTS, GRS' },
  ],
  socialLinks: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel-pvt-ltd' },
    { label: 'Instagram', url: 'https://www.instagram.com/run_apparel_' },
  ],
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const HTTPS = /^https:\/\/\S+$/

/**
 * Re-state the CMS's own field rules so a bad value fails HERE, on a dry run, instead of on
 * the owner's machine as a Payload validation error they did not write and cannot read.
 * Kept in step with `globals/SiteSettings.ts` by `apps/cms/src/footerFacts.test.ts`.
 *
 * @param {typeof FOOTER_FACTS} [facts]
 * @returns {string[]} one line per violation; empty means every value is storable
 */
export function problems(facts = FOOTER_FACTS) {
  const found = []
  const cap = facts.capacity
  const long = (label, value, max) => {
    if ([...String(value)].length > max) found.push(`${label} is over ${max} characters`)
  }
  long('capacity.moq', cap.moq, 48)
  long('capacity.leadTime', cap.leadTime, 48)
  long('worksCoordinates', facts.worksCoordinates, 40)
  if (!DAYS.includes(cap.hoursFirstDay))
    found.push(`hoursFirstDay "${cap.hoursFirstDay}" is not a day code`)
  if (!DAYS.includes(cap.hoursLastDay))
    found.push(`hoursLastDay "${cap.hoursLastDay}" is not a day code`)
  if (!CLOCK.test(cap.hoursOpen)) found.push(`hoursOpen "${cap.hoursOpen}" is not 24-hour HH:MM`)
  if (!CLOCK.test(cap.hoursClose)) found.push(`hoursClose "${cap.hoursClose}" is not 24-hour HH:MM`)
  for (const row of facts.certifications) {
    if (!row.name) found.push('a certification row has no name')
    long(`certification "${row.name}"`, row.name, 48)
    // The heading above these is "Standards", not "Certified", and the company holds none
    // in its own name. An unqualified standard name under that block is the false claim
    // the whole shape exists to prevent.
    if (!/^(Parent|Suppliers|Group|Facility):/.test(String(row.name))) {
      found.push(`certification "${row.name}" does not say whose standard it is`)
    }
  }
  for (const row of facts.socialLinks) {
    if (!row.label) found.push('a social link has no label')
    long(`social label "${row.label}"`, row.label, 24)
    if (!HTTPS.test(String(row.url))) found.push(`social url "${row.url}" must start with https://`)
  }
  return found
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

/** Payload's useful error is nested; the outer one is "The following field is invalid". */
function explain(json) {
  const outer = json?.errors?.[0]
  const inner = outer?.data?.errors?.[0]
  if (inner) return `${inner.field}: ${inner.message}`
  return outer?.message || json?.raw || JSON.stringify(json).slice(0, 200)
}

const show = (label, value) => console.log(`  ${label.padEnd(24)} ${JSON.stringify(value)}`)

async function main() {
  if (!API_BASE.startsWith('https://')) {
    console.error(
      `CMS_API_BASE must be https:// — the key travels in every request. Got "${API_BASE}"`,
    )
    process.exit(2)
  }
  const bad = problems()
  if (bad.length > 0) {
    console.error('These values would be refused by the CMS:')
    for (const line of bad) console.error(`  - ${line}`)
    process.exit(2)
  }
  console.log('Values check out against the CMS field rules. This is what goes in:\n')
  show('capacity.moq', FOOTER_FACTS.capacity.moq)
  show('capacity.leadTime', FOOTER_FACTS.capacity.leadTime)
  show(
    'hours',
    `${FOOTER_FACTS.capacity.hoursFirstDay}–${FOOTER_FACTS.capacity.hoursLastDay} ${FOOTER_FACTS.capacity.hoursOpen}–${FOOTER_FACTS.capacity.hoursClose}`,
  )
  show('worksCoordinates', FOOTER_FACTS.worksCoordinates)
  show(
    'certifications',
    FOOTER_FACTS.certifications.map((r) => r.name),
  )
  show(
    'socialLinks',
    FOOTER_FACTS.socialLinks.map((r) => `${r.label} ${r.url}`),
  )

  if (!APPLY) {
    console.log(
      '\nDry run. A global is not public, so the current values cannot be read without a key.',
    )
    console.log('To write them:  CMS_API_KEY=… node scripts/apply-footer-facts.mjs --apply')
    return
  }
  if (!API_KEY) {
    console.error('\nCMS_API_KEY is not set. Export it before using --apply.')
    process.exit(2)
  }

  const before = await api('GET', `${GLOBAL}?depth=0`)
  if (!before.ok) {
    console.error(`\nCould not read the global (${before.status}): ${explain(before.json)}`)
    process.exit(1)
  }
  console.log('\nBefore:')
  show('capacity', before.json?.capacity ?? null)
  show('worksCoordinates', before.json?.worksCoordinates ?? null)
  show(
    'certifications',
    (before.json?.certifications ?? []).map((r) => r?.name),
  )
  show(
    'socialLinks',
    (before.json?.socialLinks ?? []).map((r) => r?.label),
  )

  const saved = await api('POST', GLOBAL, FOOTER_FACTS)
  if (!saved.ok) {
    console.error(`\nRefused (${saved.status}): ${explain(saved.json)}`)
    process.exit(1)
  }

  // A 200 is not storage. Read it back and compare what actually landed.
  const stored = await api('GET', `${GLOBAL}?depth=0`)
  if (!stored.ok) {
    console.error(`\nWrote, but could not read back (${stored.status}): ${explain(stored.json)}`)
    process.exit(1)
  }
  const got = stored.json ?? {}
  const mismatches = []
  for (const [key, value] of Object.entries(FOOTER_FACTS.capacity)) {
    if (got?.capacity?.[key] !== value)
      mismatches.push(`capacity.${key}: stored ${JSON.stringify(got?.capacity?.[key])}`)
  }
  if (got.worksCoordinates !== FOOTER_FACTS.worksCoordinates) {
    mismatches.push(`worksCoordinates: stored ${JSON.stringify(got.worksCoordinates)}`)
  }
  const names = (rows) => (rows ?? []).map((r) => r?.name ?? r?.label)
  if (names(got.certifications).join('|') !== names(FOOTER_FACTS.certifications).join('|')) {
    mismatches.push(`certifications: stored ${JSON.stringify(names(got.certifications))}`)
  }
  if (names(got.socialLinks).join('|') !== names(FOOTER_FACTS.socialLinks).join('|')) {
    mismatches.push(`socialLinks: stored ${JSON.stringify(names(got.socialLinks))}`)
  }

  if (mismatches.length > 0) {
    console.error('\nThe CMS accepted the write but stored something else:')
    for (const line of mismatches) console.error(`  - ${line}`)
    process.exit(1)
  }
  console.log('\nWritten and read back — every field matches. The footer blocks will appear.')
  console.log('The public site caches content for up to 60 seconds, so give it a minute.')
}

main().catch((error) => {
  console.error(`apply-footer-facts: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
