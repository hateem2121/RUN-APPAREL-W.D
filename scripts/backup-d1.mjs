#!/usr/bin/env node
/**
 * D1 backup — exports the entire CMS database (all content, colourways, media
 * rows, settings, users, events) to a timestamped .sql file under backups/d1/.
 *
 * Usage:
 *   node scripts/backup-d1.mjs            # --remote (production D1)
 *   node scripts/backup-d1.mjs --local    # local miniflare D1 (dev/test)
 *   node scripts/backup-d1.mjs --stamp=2026-07-21   # override the filename stamp
 *
 * Dependency-free: uses the wrangler already installed in apps/cms. Requires
 * Cloudflare auth for --remote (wrangler login, or CLOUDFLARE_API_TOKEN).
 * Restore procedure: docs/BACKUP-RESTORE.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmsDir = join(root, 'apps', 'cms')
const DB = 'run-apparel-viewer-db'

const mode = process.argv.includes('--local') ? '--local' : '--remote'
const stampArg = process.argv.find((a) => a.startsWith('--stamp='))?.split('=')[1]
const stamp = stampArg ?? new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

const outDir = join(root, 'backups', 'd1')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `${DB}-${stamp}.sql`)

console.log(`[backup-d1] exporting ${DB} (${mode}) → ${out}`)

/**
 * Run wrangler however this machine can.
 *
 * `pnpm exec` is right in CI, where pnpm/action-setup puts pnpm on PATH. It is
 * NOT safe to assume locally: on a machine where pnpm is only ever invoked via
 * `npx pnpm`, this died with `spawnSync pnpm ENOENT` — and it died in the one
 * situation the script exists for, a human taking an emergency backup by hand
 * before touching production. A backup tool that only works on the robot's
 * machine is not a backup tool.
 */
const ATTEMPTS = [
  ['pnpm', ['exec', 'wrangler', 'd1', 'export', DB, mode, '--output', out]],
  ['npx', ['--yes', 'wrangler', 'd1', 'export', DB, mode, '--output', out]],
]

let lastError
for (const [command, args] of ATTEMPTS) {
  try {
    execFileSync(command, args, { cwd: cmsDir, stdio: 'inherit' })
    console.log('[backup-d1] done.')
    process.exit(0)
  } catch (error) {
    // Only a MISSING RUNNER is worth falling through on. A wrangler that ran and
    // failed (bad auth, wrong database, network) must surface as itself rather
    // than being retried under a different launcher and reported as the second
    // failure — that would hide the real reason behind a confusing one.
    if (error?.code !== 'ENOENT') throw error
    lastError = error
    console.warn(`[backup-d1] ${command} not found, trying the next runner…`)
  }
}
throw lastError
