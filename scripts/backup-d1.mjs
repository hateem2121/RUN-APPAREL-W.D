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
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmsDir = join(root, 'apps', 'cms')
const DB = 'run-apparel-viewer-db'

/**
 * ⚠️ WRANGLER PRINTS A ONE-HOUR DOWNLOAD LINK TO THE WHOLE DUMP. NEVER LET IT REACH A LOG.
 *
 * `wrangler d1 export --remote` finishes with "You can also download your export
 * from the following URL manually. This link will be valid for one hour:" and a
 * presigned `r2.cloudflarestorage.com` URL. The URL IS the credential: anyone who
 * holds it can download the complete, unencrypted database — password hashes,
 * encrypted API keys, customer inquiries — for an hour, with no Cloudflare login.
 *
 * Until 2026-09-11 this script ran wrangler with `stdio: 'inherit'`. The day after
 * the repository went public, the first nightly-backup run printed that link into
 * an Actions log anyone can read, and the deploy's own pre-migration backup was
 * cancelled minutes before it would have printed a second. So wrangler's output is
 * now CAPTURED, and printed only after every presigned URL — and any stray
 * signature or credential fragment of one — has been replaced.
 *
 * `apps/cms/src/backupD1Redaction.test.ts` runs this script against a fake runner
 * that prints a real-shaped link, on a successful export and on a failed one.
 */
const HIDDEN = '<presigned download link hidden: logs can be public>'

export function redactPresignedUrls(text) {
  return String(text ?? '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) =>
      /X-Amz-|r2\.cloudflarestorage\.com/i.test(url) ? HIDDEN : url,
    )
    .replace(/X-Amz-(Signature|Credential|Security-Token)=[^\s&"'<>]+/gi, 'X-Amz-$1=<hidden>')
}

function main() {
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

  for (const [command, args] of ATTEMPTS) {
    // Captured, never inherited: see the warning on redactPresignedUrls above.
    const run = spawnSync(command, args, {
      cwd: cmsDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    })

    // Only a MISSING RUNNER is worth falling through on. A wrangler that ran and
    // failed (bad auth, wrong database, network) must surface as itself rather
    // than being retried under a different launcher and reported as the second
    // failure — that would hide the real reason behind a confusing one.
    if (run.error?.code === 'ENOENT') {
      console.warn(`[backup-d1] ${command} not found, trying the next runner…`)
      continue
    }

    process.stdout.write(redactPresignedUrls(run.stdout))
    process.stderr.write(redactPresignedUrls(run.stderr))
    if (run.error || run.status !== 0) {
      console.error(
        `[backup-d1] export FAILED via ${command} (exit ${run.status ?? run.error?.code})`,
      )
      process.exitCode = 1
      return
    }
    console.log('[backup-d1] done.')
    return
  }

  console.error('[backup-d1] neither pnpm nor npx could be started, so nothing was exported.')
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
