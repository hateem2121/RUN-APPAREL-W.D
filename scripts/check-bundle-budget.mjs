#!/usr/bin/env node
/**
 * Deterministic weight budget for the viewer's application shell.
 *
 * WHY THIS EXISTS ALONGSIDE LIGHTHOUSE. `lighthouserc.json` already carries byte
 * budgets, and they are good ones — but the job that enforces them is deliberately
 * NOT in ci.yml's `needs:` list, because it needs Chrome and "a Chrome flake must
 * never block a live release". The result is that the only automated statement about
 * how heavy this site is cannot fail a deploy. A regression lands, the check goes
 * amber on the PR, and nothing stops it.
 *
 * This closes that gap from the other side: no browser, no network, no rasteriser,
 * no scoring model. It reads the built files off disk and adds up bytes. There is
 * nothing in it that can flake, so it CAN gate the deploy, and it does.
 *
 * WHAT IT DOES NOT COVER — read this before trusting a green run. It measures the
 * SHELL: scripts, styles, fonts, wasm. A real garment is 8-40 MB of GLB that is
 * fetched from R2 at runtime and never appears in `dist/`. Nothing here says
 * anything about the weight of a production page. The budget that applies to real
 * models is enforced where they actually pass through — SIZE_WARNING_BYTES in the
 * shrink report and GLB_HARD_MAX_BYTES in the CMS upload guard, both in
 * packages/shared/src/media.ts. Do not let a green badge here be read as "the page
 * is light".
 *
 * WHY GZIP AND NOT RAW BYTES. Cloudflare compresses text on the wire, so raw bytes
 * overstate every text category by roughly 3-4x and a budget set against them would
 * be measuring something no visitor experiences. gzip at a fixed level is
 * deterministic — the same input gives the same number on every machine, which is
 * the property that makes this safe to gate on. Brotli would be closer to what the
 * edge actually serves, but its output has shifted between zlib versions; gzip has
 * not. This tracks regressions, it is not a promise about transfer size.
 *
 * Usage:
 *   node scripts/check-bundle-budget.mjs              # enforce (exit 1 over budget)
 *   node scripts/check-bundle-budget.mjs --report     # print measurements, exit 0
 */

import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = join(REPO_ROOT, 'apps', 'viewer', 'dist')
const REPORT_ONLY = process.argv.includes('--report')

/**
 * BUDGETS — gzipped bytes.
 *
 * Headroom is deliberately small, for the reason lighthouserc.json records: a first
 * draft of those budgets used 3.5x and 6x the real figures, which would have passed
 * through any regression short of a catastrophe and told nobody anything.
 *
 * MEASURED 2026-08-12 on the committed build (`--report`), gzip level 9:
 *
 *     script       542,205 B     budget 624,000   (+15%)
 *     wasm         307,717 B     budget 339,000   (+10%)
 *     font         275,187 B     budget 317,000   (+15%)
 *     stylesheet     5,018 B     budget   7,000   (+40%)
 *
 * The ratios are not uniform, and each one is an argument:
 *
 *   - CSS gets the loosest, same call lighthouserc.json makes — a genuine design
 *     change moves it most, and 40% of 5 KB is 2 KB, which cannot hide anything.
 *   - wasm gets the tightest. Both files are VENDORED binaries (basis_transcoder,
 *     draco_decoder) that change only when someone deliberately bumps a decoder.
 *     There is no legitimate slow drift here, so drift is the signal.
 *   - script carries the two biggest single items in the build —
 *     model-viewer (279 KB gz) and draco_decoder.js (104 KB gz). 15% is ~81 KB,
 *     which is smaller than any dependency anyone would add by accident and larger
 *     than ordinary churn.
 *
 * `script` deliberately includes the vendored decoders in `public/`, not just the
 * app's own chunks. They are shipped to the visitor, so they count. See CLAUDE.md:
 * the Meshopt decoder is not optional — no production model renders without it.
 */
const BUDGETS = {
  script: { bytes: 624_000, note: 'app chunks + vendored draco/basis decoder JS' },
  wasm: { bytes: 339_000, note: 'basis_transcoder + draco_decoder — vendored binaries' },
  font: { bytes: 317_000, note: 'self-hosted Archivo + Instrument Serif subsets' },
  stylesheet: { bytes: 7_000, note: 'CSS' },
}

const CATEGORY_BY_EXT = {
  '.js': 'script',
  '.mjs': 'script',
  '.css': 'stylesheet',
  '.woff2': 'font',
  '.woff': 'font',
  '.ttf': 'font',
  '.otf': 'font',
  '.wasm': 'wasm',
}

/** Everything else in dist, reported but never gated. */
const UNGATED = 'other'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

if (!existsSync(DIST)) {
  console.error(
    `✗ ${relative(REPO_ROOT, DIST)} does not exist.\n` +
      `  Run the build first:  npx --yes pnpm@10.33.0 --filter @run-apparel/viewer build`,
  )
  process.exit(1)
}

const totals = {}
const files = {}

for (const file of walk(DIST)) {
  const ext = extname(file).toLowerCase()
  const category = CATEGORY_BY_EXT[ext] ?? UNGATED
  const raw = readFileSync(file)
  // Text compresses; wasm and images barely do. gzip everything anyway so the
  // number means the same thing in every row.
  const gz = gzipSync(raw, { level: 9 }).length

  totals[category] ??= { raw: 0, gz: 0, count: 0 }
  totals[category].raw += raw.length
  totals[category].gz += gz
  totals[category].count += 1

  files[category] ??= []
  files[category].push({ path: relative(DIST, file), raw: raw.length, gz })
}

console.log(`\nBundle weight — ${relative(REPO_ROOT, DIST)}\n`)
console.log(
  `  ${'category'.padEnd(12)} ${'files'.padStart(5)} ${'raw'.padStart(11)} ${'gzip'.padStart(11)}   budget (gzip)`,
)
console.log(
  `  ${'-'.repeat(12)} ${'-'.repeat(5)} ${'-'.repeat(11)} ${'-'.repeat(11)}   ${'-'.repeat(20)}`,
)

/**
 * N4, 2026-08-18. wasm measured 300.5 KB against a 331.1 KB budget — 91%, with
 * 30.6 KB of gzip headroom, the Meshopt and DRACO decoders dominating. This script
 * failed at 100% and was silent at 99%, so the first signal of a weight problem
 * was a red deploy.
 *
 * A slope, not a second cliff: it NEVER changes the exit code. The failure path
 * was re-verified by temporarily lowering a budget below the measured size and
 * confirming exit 1 before restoring it.
 */
const WARN_AT = 0.9

const failures = []
const warnings = []

for (const category of [...Object.keys(BUDGETS), UNGATED]) {
  const t = totals[category] ?? { raw: 0, gz: 0, count: 0 }
  const budget = BUDGETS[category]?.bytes ?? 0

  let verdict = 'not gated'
  if (budget > 0) {
    const pct = ((t.gz / budget) * 100).toFixed(0)
    verdict = `${fmt(budget)}  (${pct}% used)`
    if (t.gz > budget) {
      verdict = `${fmt(budget)}  OVER by ${fmt(t.gz - budget)}`
      failures.push({ category, actual: t.gz, budget })
    } else if (t.gz >= budget * WARN_AT) {
      verdict = `${fmt(budget)}  (${pct}% used — ${fmt(budget - t.gz)} left)`
      warnings.push({ category, actual: t.gz, budget })
    }
  }

  console.log(
    `  ${category.padEnd(12)} ${String(t.count).padStart(5)} ${fmt(t.raw).padStart(11)} ${fmt(t.gz).padStart(11)}   ${verdict}`,
  )
}

if (REPORT_ONLY) {
  console.log('\nLargest files per gated category:\n')
  for (const category of Object.keys(BUDGETS)) {
    const list = (files[category] ?? []).sort((a, b) => b.gz - a.gz).slice(0, 5)
    if (!list.length) continue
    console.log(`  ${category}`)
    for (const f of list) console.log(`    ${fmt(f.gz).padStart(10)}  ${f.path}`)
  }
  console.log('\n--report: measurements only, no budget enforced.')
  process.exit(0)
}

const unset = Object.entries(BUDGETS).filter(([, b]) => b.bytes <= 0)
if (unset.length) {
  console.error(
    `\n✗ ${unset.length} budget(s) are still 0: ${unset.map(([k]) => k).join(', ')}.\n` +
      `  A budget of 0 is not "no budget", it is an unfinished one. Run with --report\n` +
      `  and set them from the measurement.`,
  )
  process.exit(1)
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} category over budget.\n`)
  console.error(
    `  This is a real regression in what every visitor downloads, not a flake —\n` +
      `  nothing in this check varies between machines.\n\n` +
      `  Find it:  node scripts/check-bundle-budget.mjs --report\n\n` +
      `  Raise the budget ONLY with the measurement that justifies the new weight.\n` +
      `  "It went over" is not a justification; neither is "it is only a bit more".`,
  )
  process.exit(1)
}

if (warnings.length) {
  console.warn(
    `\n⚠ ${warnings.length} category at or above ${Math.round(WARN_AT * 100)}% of budget:\n` +
      warnings.map((w) => `    ${w.category}: ${fmt(w.actual)} of ${fmt(w.budget)}`).join('\n') +
      `\n\n  Not a failure, and not a licence to raise the budget. Raise one ONLY with\n` +
      `  the measurement that justifies the new weight.\n`,
  )
}

console.log('\n✓ every gated category within budget.\n')
