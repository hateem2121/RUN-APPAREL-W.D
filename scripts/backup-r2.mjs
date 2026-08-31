#!/usr/bin/env node
/**
 * R2 backup — mirrors every uploaded media object (GLBs + posters) AND the two
 * customer-facing PDFs to a timestamped folder under backups/r2/. Media keys are
 * enumerated from the CMS `media` table (each media doc maps to one R2 object), so
 * no S3 SDK and no extra dependency is required — only the wrangler already in
 * apps/cms.
 *
 * ⚠️ THE PDFs WERE BACKED UP BY NOTHING UNTIL 2026-08-30. This script mirrored ONE
 * bucket, and the catalogue and company profile had just moved out of Google Drive
 * into a DIFFERENT one (`run-assets`) — so the site's two most public documents,
 * 71 MB of them, existed in exactly one place with no copy anywhere. They are also
 * invisible to the media-table enumeration above by construction: they are not CMS
 * media docs, they are objects the apex Worker reads directly.
 *
 * Usage:
 *   node scripts/backup-r2.mjs           # --remote (production R2)
 *   node scripts/backup-r2.mjs --local    # local miniflare R2 (dev/test)
 *
 * Requires Cloudflare auth for --remote. Restore: docs/BACKUP-RESTORE.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FILES as APEX_FILES } from '../infra/apex-404/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmsDir = join(root, 'apps', 'cms')
const DB = 'run-apparel-viewer-db'
const BUCKET = 'run-apparel-viewer-media'

/**
 * The apex PDFs, in the bucket the separate `run-apparel` site also uses.
 *
 * Keys are DERIVED FROM THE WORKER, not enumerated and not retyped. `wrangler r2`
 * has no object-list command, and `run-assets` is SHARED — enumerating it, if that
 * were possible, would drag in the other application's objects. So the list has to
 * be explicit; the question is only whether it is explicit ONCE.
 *
 * Until 2026-08-31 it was twice: this file carried its own literal copy of the two
 * keys (L17-14). Nothing compared them, and only R2 can say whether either is
 * right — so a rename would have left this job naming a key that no longer exists
 * and reporting success having saved a 404. It now reads them from
 * infra/apex-404/index.js, which is the file that must be correct anyway or the
 * live download breaks first and loudly.
 *
 * ⚠️ The spelling "CATALOUGE" is the object's REAL name. Correcting it breaks the
 * download and the backup together. The comment in the Worker says so too.
 */
const APEX_BUCKET = 'run-assets'
// DERIVED, not retyped — L17-14, 2026-08-31. These are the exact R2 keys the apex
// Worker serves, read from the Worker itself so the two can never drift. The
// previous hardcoded copy would have gone on naming an old key after a rename,
// and this job would have reported success while saving a 404.
const APEX_KEYS = Object.values(APEX_FILES).map((f) => f.key)

const mode = process.argv.includes('--local') ? '--local' : '--remote'

/**
 * `--apex-only` copies the two customer PDFs and nothing else.
 *
 * WHY THIS EXISTS. The full mirror runs weekly because the media half is ~156 MB
 * and the models change rarely. The PDFs sit in `run-assets`, a bucket the separate
 * `run-apparel` site can also write to and delete from, so their exposure is not the
 * same as the media bucket's — a deletion there is somebody else's ordinary Tuesday.
 * At 71 MB they are cheap enough to take nightly, and this flag is what lets the
 * schedule treat the two halves differently instead of choosing one cadence for both.
 *
 * It deliberately also skips the D1 query below: enumerating the media table is the
 * slow part and it has nothing to say about the apex bucket.
 */
const APEX_ONLY = process.argv.includes('--apex-only')
const stampArg = process.argv.find((a) => a.startsWith('--stamp='))?.split('=')[1]
const stamp = stampArg ?? new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

const outDir = join(root, 'backups', 'r2', stamp)
mkdirSync(outDir, { recursive: true })

/**
 * Run wrangler however this machine can — see the longer note in backup-d1.mjs.
 * `pnpm exec` is right in CI; locally pnpm may only exist behind `npx`, and a
 * backup tool that only works on the robot's machine is not a backup tool.
 * Falls through on a MISSING RUNNER only, so a wrangler that ran and failed
 * still surfaces its own error rather than the launcher's.
 */
const wrangler = (args, opts = {}) => {
  const runners = [
    ['pnpm', ['exec', 'wrangler', ...args]],
    ['npx', ['--yes', 'wrangler', ...args]],
  ]
  let lastError
  for (const [command, argv] of runners) {
    try {
      return execFileSync(command, argv, { cwd: cmsDir, encoding: 'utf8', ...opts })
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      lastError = error
    }
  }
  throw lastError
}

// 1. Enumerate object keys from the media table. Skipped entirely under --apex-only.
const filenames = APEX_ONLY
  ? []
  : (() => {
      const raw = wrangler([
        'd1',
        'execute',
        DB,
        mode,
        '--json',
        '--command',
        // `filesize` as well as `filename`, so each written file can be CHECKED rather
        // than assumed. See `save()` below.
        'SELECT filename, filesize FROM media WHERE filename IS NOT NULL',
      ])
      const jsonStart = raw.search(/[[{]/)
      const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw)
      const results = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.results ?? [])
      return results
        .filter((r) => r.filename)
        .map((r) => ({
          name: r.filename,
          size: typeof r.filesize === 'number' ? r.filesize : null,
        }))
    })()

console.log(
  APEX_ONLY
    ? `[backup-r2] apex-only run (${mode}) → ${outDir}`
    : `[backup-r2] ${filenames.length} media objects to back up (${mode}) → ${outDir}`,
)

let ok = 0
let fail = 0
let unverified = 0
let mismatched = 0

/**
 * Copy one object into `outDir`, keeping a per-bucket subfolder so keys cannot collide.
 *
 * ⚠️ THE WRITE IS MEASURED, NOT ASSUMED. Until 2026-08-31 this counted a save as
 * successful whenever `wrangler` exited 0 — so a truncated download was indistinguishable
 * from a complete one, and the backup reported the same "N saved, 0 failed" either way.
 * `expectedSize` comes from the `media` table row the enumeration already fetched; when
 * it is present the written file must match it exactly.
 *
 * A null `expectedSize` is reported, not silently accepted: the apex PDFs have no CMS row,
 * and a media row can legitimately lack a filesize. Those are counted as `unverified` and
 * printed, because "we could not check this one" and "this one is fine" must not look the
 * same in the log — that distinction is the entire point of this change.
 *
 * Audit 2026-08-30 PM, finding L2-03.
 */
const save = (bucket, key, subdir, expectedSize = null) => {
  const dest = join(outDir, subdir, key)
  mkdirSync(dirname(dest), { recursive: true })
  try {
    wrangler(['r2', 'object', 'get', `${bucket}/${key}`, '--file', dest, mode], { stdio: 'pipe' })
  } catch {
    fail += 1
    console.warn(`[backup-r2]  ! failed to fetch: ${bucket}/${key}`)
    return
  }

  let written
  try {
    written = statSync(dest).size
  } catch {
    fail += 1
    console.warn(`[backup-r2]  ! wrangler exited 0 but wrote no file: ${bucket}/${key}`)
    return
  }

  if (written === 0) {
    fail += 1
    console.warn(`[backup-r2]  ! wrote ZERO bytes: ${bucket}/${key}`)
    return
  }

  if (expectedSize === null) {
    unverified += 1
    ok += 1
    return
  }

  if (written !== expectedSize) {
    // ⚠️ A WARNING, NOT A FAILURE, AND THE DISTINCTION IS MEASURED RATHER THAN ASSUMED.
    //
    // Three objects disagree with their CMS row TODAY, and have since 2026-07-27 when
    // the posters were rewritten in place without the row being updated — audit finding
    // L2-04. Exact figures, reproduced by this script on 2026-08-31:
    //
    //   n001-navy-poster.webp     R2 11,298  row 11,314
    //   n001-black-poster.webp    R2 11,114  row 11,048
    //   n001-crimson-poster.webp  R2 12,074  row 12,080
    //
    // Note two of the three are LARGER on disk than the row claims, which a truncated
    // download cannot produce. So this is a stale record, not a damaged copy, and R2 is
    // the truth — the file that was fetched is the file that is served.
    //
    // Failing here would paint the nightly backup red every night for a historical data
    // drift, and a job that is always red stops being read. The truncation case this
    // check exists for is caught by the zero-byte and missing-file branches above, plus
    // the `ok < expectedSaves` total below.
    mismatched += 1
    ok += 1
    console.warn(
      `[backup-r2]  ~ size differs from the CMS row: ${bucket}/${key} — R2 ${written} B, ` +
        `row ${expectedSize} B. The FILE IS SAVED; the record is what disagrees.`,
    )
    return
  }
  ok += 1
}

for (const { name, size } of filenames) save(BUCKET, name, 'media', size)

console.log(`[backup-r2] ${APEX_KEYS.length} apex PDFs to back up from ${APEX_BUCKET}`)
for (const key of APEX_KEYS) save(APEX_BUCKET, key, 'apex')

const expectedSaves = filenames.length + APEX_KEYS.length
console.log(
  `[backup-r2] done: ${ok} saved, ${fail} failed` +
    (unverified > 0 ? `, ${unverified} saved but size-unverified` : '') +
    (mismatched > 0 ? `, ${mismatched} saved with a STALE CMS size record` : '') +
    '.',
)

/**
 * ⚠️ A RUN THAT COPIED NOTHING USED TO EXIT GREEN, and that is the failure mode a backup
 * cannot have. `fail` only counts objects it TRIED and could not fetch — so an empty
 * enumeration (a D1 error swallowed into an empty result set, a renamed table, a token
 * that can read the database but not the bucket) produced "0 saved, 0 failed" and a
 * zero exit. Audit 2026-08-30 PM, finding L20-11.
 */
if (!APEX_ONLY && filenames.length === 0) {
  console.error(
    '[backup-r2] ERROR: the media table returned ZERO rows. That is a broken enumeration, ' +
      'not an empty bucket — this project has 26 media objects. Nothing was backed up.',
  )
  process.exitCode = 1
} else if (ok < expectedSaves) {
  console.error(
    `[backup-r2] ERROR: ${ok} of ${expectedSaves} objects were saved. A partial mirror is ` +
      'not a backup; the missing objects are named above.',
  )
  process.exitCode = 1
} else if (fail > 0) {
  process.exitCode = 1
}
