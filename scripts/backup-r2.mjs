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
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmsDir = join(root, 'apps', 'cms')
const DB = 'run-apparel-viewer-db'
const BUCKET = 'run-apparel-viewer-media'

/**
 * The apex PDFs, in the bucket the separate `run-apparel` site also uses.
 *
 * Keys are listed explicitly rather than enumerated, for two reasons: `wrangler r2`
 * has no object-list command, and `run-assets` is SHARED — enumerating it, if that
 * were possible, would drag in the other application's objects. These two are what
 * infra/apex-404/index.js serves.
 *
 * ⚠️ "RUN PRODUCT CATALOUGE.pdf" is spelled as the object really is, typo included.
 * Correcting it here silently backs up nothing.
 */
const APEX_BUCKET = 'run-assets'
const APEX_KEYS = ['RUN PRODUCT CATALOUGE.pdf', 'Company Profile.pdf']

const mode = process.argv.includes('--local') ? '--local' : '--remote'
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

// 1. Enumerate object keys from the media table.
const raw = wrangler([
  'd1',
  'execute',
  DB,
  mode,
  '--json',
  '--command',
  'SELECT filename FROM media WHERE filename IS NOT NULL',
])
const jsonStart = raw.search(/[[{]/)
const parsed = JSON.parse(jsonStart >= 0 ? raw.slice(jsonStart) : raw)
const results = Array.isArray(parsed) ? (parsed[0]?.results ?? []) : (parsed.results ?? [])
const filenames = results.map((r) => r.filename).filter(Boolean)

console.log(`[backup-r2] ${filenames.length} media objects to back up (${mode}) → ${outDir}`)

let ok = 0
let fail = 0

/** Copy one object into `outDir`, keeping a per-bucket subfolder so keys cannot collide. */
const save = (bucket, key, subdir) => {
  const dest = join(outDir, subdir, key)
  mkdirSync(dirname(dest), { recursive: true })
  try {
    wrangler(['r2', 'object', 'get', `${bucket}/${key}`, '--file', dest, mode], { stdio: 'pipe' })
    ok += 1
  } catch {
    fail += 1
    console.warn(`[backup-r2]  ! failed to fetch: ${bucket}/${key}`)
  }
}

for (const name of filenames) save(BUCKET, name, 'media')

console.log(`[backup-r2] ${APEX_KEYS.length} apex PDFs to back up from ${APEX_BUCKET}`)
for (const key of APEX_KEYS) save(APEX_BUCKET, key, 'apex')

console.log(`[backup-r2] done: ${ok} saved, ${fail} failed.`)
if (fail > 0) process.exitCode = 1
