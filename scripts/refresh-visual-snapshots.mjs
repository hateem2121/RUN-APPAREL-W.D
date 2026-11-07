#!/usr/bin/env node
/**
 * Refresh the website's reference pictures from a failed CI run — no Docker.
 *
 *   node scripts/refresh-visual-snapshots.mjs <run-id>
 *
 * WHY (2026-11-07). `apps/cms/e2e/visual.spec.ts` compares pages with pictures that must be
 * made in CI's own Linux image (fonts render differently on a Mac). Of 10 failed PR runs
 * sampled between 25 Oct and 7 Nov, 7 were this test after a page changed ON PURPOSE, and each
 * then cost a second CI round plus the 4-step Docker procedure in docs/RUNBOOK.md. When the
 * test fails, Playwright has ALREADY taken the new page in that exact image and saved it as
 * `<name>-actual.png`; ci.yml's `e2e-shard` keeps those as `visual-actual-*` artifacts.
 * This copies them over `apps/cms/e2e/visual.spec.ts-snapshots/<name>-chromium-linux.png`.
 *
 * ⚠️ LOOK AT EVERY PICTURE BEFORE COMMITTING (RUNBOOK): a picture of a broken page passes
 * forever. The script only copies; it lists each file it replaced so you can open them.
 *
 * Exit codes: 0 copied at least one picture; 1 the run kept none (it passed, it is older
 * than the artifacts' 14 days, or it predates this step); 2 bad arguments or `gh` failed.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPOSITORY = 'hateem2121/RUN-APPAREL-W.D'
export const SNAPSHOT_DIR = 'apps/cms/e2e/visual.spec.ts-snapshots'
/** The suffix Playwright appends for the `chromium` project on Linux. */
export const PLATFORM_SUFFIX = '-chromium-linux'

/**
 * `home-1440-actual.png` → `home-1440-chromium-linux.png`; anything else → null.
 * @param {string} file
 */
export function snapshotNameFor(file) {
  const m = /^(.+)-actual\.png$/.exec(basename(file))
  return m ? `${m[1]}${PLATFORM_SUFFIX}.png` : null
}

/**
 * One picture per snapshot. A retried test leaves one `-actual.png` per attempt; the newest
 * file wins, so the picture is the last attempt's.
 * @param {{path: string, mtimeMs: number}[]} files
 * @returns {Map<string, string>} snapshot name → source path
 */
export function pickPictures(files) {
  const best = new Map()
  for (const f of files) {
    const name = snapshotNameFor(f.path)
    if (!name) continue
    const prev = best.get(name)
    if (!prev || f.mtimeMs > prev.mtimeMs) best.set(name, f)
  }
  return new Map([...best].map(([name, f]) => [name, f.path]))
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [{ path: p, mtimeMs: statSync(p).mtimeMs }]
  })
}

function main(argv) {
  const runId = argv[0]
  if (!runId || !/^\d+$/.test(runId)) {
    console.error('usage: node scripts/refresh-visual-snapshots.mjs <run-id>   (the failed CI run)')
    return 2
  }
  if (!existsSync(SNAPSHOT_DIR)) {
    console.error(`run this from the repository root: ${SNAPSHOT_DIR} not found`)
    return 2
  }
  const dest = mkdtempSync(join(tmpdir(), 'visual-actual-'))
  try {
    execFileSync(
      'gh',
      ['run', 'download', runId, '-R', REPOSITORY, '-p', 'visual-actual-*', '-D', dest],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    )
  } catch (err) {
    const msg = String(err.stderr ?? err.message)
    if (/no valid artifacts|no artifact/i.test(msg)) {
      console.error(
        `run ${runId} kept no new pictures (it passed, expired after 14 days, or predates 2026-11-07)`,
      )
      return 1
    }
    console.error(`gh run download failed: ${msg.trim()}`)
    return 2
  }
  const pictures = pickPictures(walk(dest))
  if (pictures.size === 0) {
    console.error(`run ${runId} kept no "-actual.png" pictures`)
    return 1
  }
  for (const [name, src] of [...pictures].sort()) {
    const target = join(SNAPSHOT_DIR, name)
    const isNew = !existsSync(target)
    copyFileSync(src, target)
    console.log(`${isNew ? 'added   ' : 'replaced'} ${target}`)
  }
  console.log(`\n${pictures.size} picture(s). OPEN EACH ONE before committing (docs/RUNBOOK.md).`)
  return 0
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2))
}
