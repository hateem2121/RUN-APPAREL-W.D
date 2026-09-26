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
 *   node scripts/apply-footer-facts.mjs --apply    # asks for the key, hidden
 *
 * ⚠️ DO NOT PUT THE KEY ON THE COMMAND LINE. This block used to read
 * `CMS_API_KEY=… node …`, and on 2026-09-16 that shape failed twice: a command block is
 * something you run, not something you edit first, so the placeholder went through as the
 * key both times. It also writes the key into the shell history in plain text, where it
 * outlives the minute it was needed for. `CMS_API_KEY` still works when it is already
 * exported, for CI; it is no longer what anyone is handed.
 */

import { realpathSync } from 'node:fs'

const API_BASE = (process.env.CMS_API_BASE || 'https://cms.wear-run.help').replace(/\/+$/, '')
/** `let`, not `const`: the prompt in main() assigns the key when the variable is unset. */
let API_KEY = process.env.CMS_API_KEY || ''
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
    console.log('To write them:  node scripts/apply-footer-facts.mjs --apply')
    return
  }

  /*
   * ⚠️ THE KEY IS ASKED FOR, NOT PUT ON THE COMMAND LINE, AND THAT IS A FIX FOR TWO FAULTS.
   *
   * The written instruction used to be `CMS_API_KEY=… node scripts/apply-footer-facts.mjs`.
   * On 2026-09-16 the owner ran it twice with the placeholder still in place — first
   * `paste-your-key-here`, then `your-real-key` — because a command block is something you
   * run, not something you edit first. That is an instruction-design fault, not a user
   * error, and no amount of pattern-matching the placeholder fixes the shape of it.
   *
   * The second fault is worse and was never mentioned: `CMS_API_KEY=<secret> node …` writes
   * the key into the shell history in plain text, where it outlives the minute it was
   * needed for. Asking for it leaves the command free of secrets.
   *
   * The environment variable still wins when it is set, so CI and any existing habit keep
   * working; it simply stops being what the owner is handed.
   */
  let key = API_KEY

  if (!key) {
    /*
     * Hidden entry. `readline/promises` is the repo's existing prompt (see
     * `find-orphan-media.mjs`), but it ECHOES — correct for a `[y/N]`, wrong for a secret —
     * and muting it means reaching for `_writeToOutput`, which is private. Raw mode is
     * documented, so the characters are assembled here instead. Iterated per character
     * because a paste arrives as one chunk that may carry its own newline.
     */
    const readHidden = (promptText) =>
      new Promise((resolve, reject) => {
        const input = process.stdin
        process.stdout.write(promptText)
        input.setRawMode(true)
        input.resume()
        input.setEncoding('utf8')
        let typed = ''
        const finish = (done) => {
          input.setRawMode(false)
          input.pause()
          input.off('data', onData)
          process.stdout.write('\n')
          done()
        }
        const onData = (chunk) => {
          for (const ch of chunk) {
            if (ch === '\r' || ch === '\n' || ch === '') return finish(() => resolve(typed))
            if (ch === '') return finish(() => reject(new Error('cancelled')))
            if (ch === '' || ch === '\b') typed = typed.slice(0, -1)
            else typed += ch
          }
        }
        input.on('data', onData)
      })

    if (!process.stdin.isTTY) {
      console.error('\nNo key, and this is not an interactive terminal.')
      console.error('Run it in your own Terminal so it can ask, or set CMS_API_KEY.')
      process.exit(2)
    }
    console.log('\nThe key is needed to read and change Settings. It is not shown as you type,')
    console.log('and it is not stored anywhere — not in this command, not in your history.\n')
    key = (await readHidden('CMS API key (admin user): ')).trim()
    if (!key) {
      console.error('Nothing entered.')
      process.exit(2)
    }
  }

  /*
   * Backstop for the environment-variable route only. Narrow on purpose: whitespace, or
   * wording that appears in instructions and cannot occur in an opaque token. Still no
   * length or character-set floor — guessing a key's format risks rejecting a valid key
   * and stranding whoever is running it.
   */
  /*
   * ⚠️ NO BARE ENGLISH WORDS HERE. A first pass at this listed `your`, `here` and `example`
   * on their own, which contradicts the paragraph above it: that is a format assumption by
   * the back door, and a real key containing `here` would strand whoever is running it with
   * no way round. Every pattern below needs BOTH halves of a placeholder, or a character a
   * token cannot contain.
   */
  if (/\s/.test(key) || /paste|placeholder|your[-\w]*key|real[-_]?key|[<>]/i.test(key)) {
    console.error('\nThat looks like instruction text rather than a key:')
    console.error(`  ${key}`)
    console.error('Run without CMS_API_KEY set and the script will ask for it instead.')
    process.exit(2)
  }
  API_KEY = key

  const before = await api('GET', `${GLOBAL}?depth=0`)
  if (!before.ok) {
    console.error(`\nCould not read Settings (${before.status}): ${explain(before.json)}`)
    /*
     * ⚠️ A REFUSAL HERE IS THE KEY, NOT THE ROLE, and the message Payload sends says the
     * opposite. `SiteSettings.access.read` is `isAuthenticated` — ANY signed-in user
     * passes, editor included — so being refused means the key was not recognised as a
     * user at all. Only `update` is admin-only, and that gate is further down.
     */
    if (before.status === 401 || before.status === 403) {
      console.error('  Reading Settings needs only a recognised key, so this is the key itself.')
      console.error(
        '  In the CMS: Generate new API key, then SAVE. Generating alone stores nothing.',
      )
    }
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
    /*
     * ⚠️ THIS GATE IS STRICTER THAN THE READ ABOVE, AND THE ASYMMETRY IS THE TRAP.
     * `SiteSettings.access` is `read: isAuthenticated` but `update: isAdmin`, so an
     * editor's key passes the read and is refused only here — the same message, a
     * different cause. Worse, the owner's previous CMS script wrote to
     * `catalogue-defaults`, whose update is `isAdminOrEditor`, so prior experience
     * teaches the wrong lesson about which key works.
     */
    if (saved.status === 401 || saved.status === 403) {
      console.error('  Reading Settings worked, so the key is real — its user is not an admin.')
      console.error('  Changing Settings needs the admin role. Issue the key on an admin user.')
    }
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

// Only when run, never when imported: apps/cms/src/footerFacts.test.ts and
// scripts/footer-facts-probe.mjs import FOOTER_FACTS, and an unguarded main() started a
// dry run against the live CMS inside each of them.
if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`apply-footer-facts: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
