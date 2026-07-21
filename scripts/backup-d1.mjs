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
execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'export', DB, mode, '--output', out], {
  cwd: cmsDir,
  stdio: 'inherit',
})
console.log('[backup-d1] done.')
