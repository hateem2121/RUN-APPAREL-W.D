#!/usr/bin/env node
/**
 * The CMS Worker's size, measured before it can ship.
 *
 * WHY THIS EXISTS (2026-10-07, a live incident). Cloudflare refuses a Worker over 64 MiB
 * uncompressed (developers.cloudflare.com/workers/platform/limits, read 2026-10-07), and long
 * before that limit a big one goes wrong quietly. The pages PR took the CMS Worker to
 * 64,905 KiB, 99% of the limit. It deployed, and one request at a time it served, but a
 * fresh copy of it failed to load: a burst of 16+ requests got Error 1101 on wear-run.com
 * for everything past the ~10 the warm copies took, and no Worker recorded an error. Nothing
 * had measured the Worker before: CI built Next, never the Worker, so it grew 52,301 ->
 * 64,905 KiB in one merge unseen. The cause was `experimental.inlineCss`, which writes the
 * whole stylesheet into every route's client-reference-manifest four times (next.config.mjs
 * has the measurements).
 *
 * WHAT IT MEASURES. Exactly what `wrangler deploy` uploads: it runs wrangler's own dry run
 * into a folder and adds up every module there, leaving out the source map and the README,
 * which wrangler does not upload. The sum matches wrangler's "Total Upload" line (64,905 KiB
 * both ways on 2026-10-07). It needs `opennextjs-cloudflare build` to have run first.
 *
 * Usage:
 *   node scripts/check-cms-worker-size.mjs            # dry-run, then judge
 *   node scripts/check-cms-worker-size.mjs <outdir>   # judge a dry run already written
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cloudflare's uncompressed limit, on every plan. */
export const CLOUDFLARE_LIMIT_KIB = 64 * 1024

/**
 * 80% of the limit (52,428 KiB). The Worker that failed was at 99%; the one before it, at 80%
 * (52,301 KiB), served the same bursts. The fixed Worker measured 42,994 KiB, so this leaves
 * about 9 MB for growth and fails long before the limit. Raise it only with a measurement
 * that a Worker this size loads under a burst, never to make a red run green.
 */
export const CMS_WORKER_BUDGET_KIB = Math.floor(CLOUDFLARE_LIMIT_KIB * 0.8)

const NOT_UPLOADED = /(\.map|README\.md)$/

/** Every byte wrangler would upload from a dry-run folder. */
export function uploadedBytes(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += uploadedBytes(path)
    else if (!NOT_UPLOADED.test(entry.name)) total += statSync(path).size
  }
  return total
}

const kib = (bytes) => Math.round(bytes / 1024).toLocaleString('en-GB')

/** The verdict, with a message that names the likely cause. */
export function judgeWorkerSize(bytes, budgetKiB = CMS_WORKER_BUDGET_KIB) {
  const share = Math.round((bytes / 1024 / CLOUDFLARE_LIMIT_KIB) * 100)
  if (bytes <= budgetKiB * 1024) {
    return {
      ok: true,
      message: `CMS Worker ${kib(bytes)} KiB, ${share}% of Cloudflare's 64 MiB limit (budget ${kib(budgetKiB * 1024)} KiB).`,
    }
  }
  return {
    ok: false,
    message:
      `CMS Worker ${kib(bytes)} KiB is over its ${kib(budgetKiB * 1024)} KiB budget (${share}% of ` +
      "Cloudflare's 64 MiB limit). Near the limit, fresh copies of the Worker fail to load and " +
      'visitors get Error 1101 under load (2026-10-07). Look first at .next/server/app/**/' +
      'page_client-reference-manifest.js: if each is hundreds of KB, inlineCss is back on in ' +
      'next.config.mjs. Otherwise find what grew with the esbuild metafile ' +
      '(wrangler deploy --dry-run --metafile).',
  }
}

function main() {
  const cms = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'apps', 'cms')
  let outdir = process.argv[2]
  if (!outdir) {
    outdir = mkdtempSync(join(tmpdir(), 'cms-worker-'))
    // wrangler's own entry, run by this Node: no pnpm on PATH needed (the root CLAUDE.md's
    // pnpm note: a script that shells out to a bare `pnpm` has failed far from the cause).
    const wrangler = join(cms, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
    const run = spawnSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--outdir', outdir], {
      cwd: cms,
      encoding: 'utf8',
    })
    if (run.status !== 0) {
      console.error(run.stdout, run.stderr)
      console.error('::error::wrangler dry run failed, so the CMS Worker was not measured.')
      process.exit(1)
    }
  }
  const verdict = judgeWorkerSize(uploadedBytes(outdir))
  if (!verdict.ok) {
    console.error(`::error::${verdict.message}`)
    process.exit(1)
  }
  console.log(`✓ ${verdict.message}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
