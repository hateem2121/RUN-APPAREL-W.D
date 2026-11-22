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
 *   node scripts/check-cms-worker-size.mjs --site     # the SITE-ONLY Worker, after its own build
 *
 * `--site` measures the site-only Worker (apps/cms/wrangler.site.jsonc, the admin split of
 * 22 Nov 2026) against its own, lower budget. It needs `SITE_ONLY=1 opennextjs-cloudflare build`
 * to have run LAST: both Workers are bundled from the same `.open-next` folder, one after the
 * other, so this measures whichever build is there. scripts/check-site-only-build.mjs reads the
 * built route list first and fails if the folder holds the whole app.
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

/**
 * The site-only Worker's budget: 18,000 KiB. The split exists because a smaller Worker starts
 * sooner, so its ceiling is a measured size, not a share of Cloudflare's limit. Measured: this
 * build uploaded 16,182 KiB on 22 Nov 2026 (main at 1d2ae39d; the whole app 22,035 KiB the same
 * minute), and the only site-only size whose cold start has been timed is 18,262 KiB (21 Nov, a
 * throwaway copy: median 487 ms against 640 ms for 22,035 KiB). Past this figure the Worker is
 * bigger than the one that was timed, and the gain is no longer a measured one. Raise it only
 * with a new cold-start measurement at the new size, never to make a red run green.
 */
export const SITE_ONLY_WORKER_BUDGET_KIB = 18_000

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
export function judgeWorkerSize(bytes, budgetKiB = CMS_WORKER_BUDGET_KIB, name = 'CMS Worker') {
  const share = Math.round((bytes / 1024 / CLOUDFLARE_LIMIT_KIB) * 100)
  if (bytes <= budgetKiB * 1024) {
    return {
      ok: true,
      message: `${name} ${kib(bytes)} KiB, ${share}% of Cloudflare's 64 MiB limit (budget ${kib(budgetKiB * 1024)} KiB).`,
    }
  }
  if (name !== 'CMS Worker') {
    return {
      ok: false,
      message:
        `${name} ${kib(bytes)} KiB is over its ${kib(budgetKiB * 1024)} KiB budget. It is the ` +
        'smaller copy of the site, built without the admin and the CMS API so that it starts ' +
        'sooner. Check first that the build was made with SITE_ONLY=1 ' +
        '(node scripts/check-site-only-build.mjs); otherwise find what grew with the esbuild ' +
        'metafile (wrangler deploy --dry-run --metafile --config wrangler.site.jsonc).',
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
  const args = process.argv.slice(2)
  const site = args.includes('--site')
  let outdir = args.find((arg) => !arg.startsWith('--'))
  const config = site ? ['--config', 'wrangler.site.jsonc'] : []
  if (!outdir) {
    outdir = mkdtempSync(join(tmpdir(), 'cms-worker-'))
    // wrangler's own entry, run by this Node: no pnpm on PATH needed (the root CLAUDE.md's
    // pnpm note: a script that shells out to a bare `pnpm` has failed far from the cause).
    const wrangler = join(cms, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
    const run = spawnSync(
      process.execPath,
      [wrangler, 'deploy', '--dry-run', '--outdir', outdir, ...config],
      {
        cwd: cms,
        encoding: 'utf8',
      },
    )
    if (run.status !== 0) {
      console.error(run.stdout, run.stderr)
      console.error('::error::wrangler dry run failed, so the Worker was not measured.')
      process.exit(1)
    }
  }
  const verdict = site
    ? judgeWorkerSize(uploadedBytes(outdir), SITE_ONLY_WORKER_BUDGET_KIB, 'Site-only Worker')
    : judgeWorkerSize(uploadedBytes(outdir))
  if (!verdict.ok) {
    console.error(`::error::${verdict.message}`)
    process.exit(1)
  }
  console.log(`✓ ${verdict.message}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
