#!/usr/bin/env node
/**
 * R2 media backup — mirrors every uploaded media object (GLBs + posters) to a
 * timestamped folder under backups/r2/. Object keys are enumerated from the
 * CMS `media` table (each media doc maps to one R2 object), so no S3 SDK and
 * no extra dependency is required — only the wrangler already in apps/cms.
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

const mode = process.argv.includes('--local') ? '--local' : '--remote'
const stampArg = process.argv.find((a) => a.startsWith('--stamp='))?.split('=')[1]
const stamp = stampArg ?? new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

const outDir = join(root, 'backups', 'r2', stamp)
mkdirSync(outDir, { recursive: true })

const wrangler = (args, opts = {}) =>
  execFileSync('pnpm', ['exec', 'wrangler', ...args], { cwd: cmsDir, encoding: 'utf8', ...opts })

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
for (const name of filenames) {
  try {
    wrangler(['r2', 'object', 'get', `${BUCKET}/${name}`, '--file', join(outDir, name), mode], {
      stdio: 'pipe',
    })
    ok += 1
  } catch {
    fail += 1
    console.warn(`[backup-r2]  ! failed to fetch: ${name}`)
  }
}
console.log(`[backup-r2] done: ${ok} saved, ${fail} failed.`)
if (fail > 0) process.exitCode = 1
