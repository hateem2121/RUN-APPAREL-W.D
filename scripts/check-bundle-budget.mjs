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
 *   - decoder took the +10% that `wasm` used to have, and then gave it back. The
 *     old argument was sound — vendored binaries change only on a deliberate bump,
 *     so drift is the signal — but at +10% a CLEAN build sits at 91% and prints the
 *     "at or above 90%" warning on every single run. A warning that always fires is
 *     one people learn to scroll past, which costs more than the tightness buys.
 *     The tightness is less needed now anyway: the decoders have their own line in
 *     `--report`, so any change to them is visible without a threshold at all.
 *   - script carries the two biggest single items in the build —
 *     model-viewer (279 KB gz) and draco_decoder.js (104 KB gz). 15% is ~81 KB,
 *     which is smaller than any dependency anyone would add by accident and larger
 *     than ordinary churn.
 *
 * ⚠️ RE-CUT 2026-09-04, BECAUSE ONE SENTENCE HERE WAS FALSE AND IT WAS LOAD-BEARING.
 * It read: "`script` deliberately includes the vendored decoders in `public/`... They
 * are shipped to the visitor, so they count."
 *
 * That is true of `meshopt_decoder.js` and false of draco and basis. Production is
 * 100% meshopt (`packages/shared/src/shrink.ts`), the meshopt decoder is preloaded
 * from index.html, and index.html says of the other two in its own words: "draco and
 * ktx2 are not preloaded because nothing served uses them." No visitor has ever
 * fetched a byte of them.
 *
 * The consequence was not academic. Measured on the committed build:
 *
 *     app shell (incl. meshopt)     412,409 B gz   11 files
 *     draco + basis, never fetched  441,238 B gz    5 files
 *
 * More than half of what this gate measured was files nobody downloads — and it was
 * masking the shell twice over. The `wasm` category was 100% decoders and sat at 91%
 * of budget, reporting a headroom warning about a number no visitor experiences;
 * and 119 KB of decoder JS inside `script` left the real shell looking closer to its
 * ceiling than it is.
 *
 * ⚠️ THIS IS NOT THE "RAISE A BUDGET TO GO GREEN" MOVE CLAUDE.md FORBIDS, and the
 * difference matters. Nothing is exempted and nothing is loosened: the decoders keep
 * a gate of their own, cut tight to what they measure today, so a decoder bump still
 * has to be a deliberate act. What changed is that they stopped being counted as
 * part of the shell, because they are not part of it. Both budgets went DOWN.
 *
 * ⚠️ DO NOT DELETE THE DECODERS TO "FIX" THIS. apps/viewer/CLAUDE.md records the
 * draco decoder-location fix as UNVERIFIED and keeps the path open for a future
 * draco garment; KTX2/basis was refused for quality, not removed. Deleting them
 * turns a re-enable into a debugging session.
 *
 * MEASURED 2026-09-04 on the committed build (`--report`), gzip level 9:
 *
 *     script       412,409 B     budget 474,000   (+15%)
 *     decoder      441,238 B     budget 507,000   (+15%)
 *     wasm               0 B     budget  20,000   (tripwire — see below)
 *     font         275,187 B     budget 317,000   (+15%)
 *     stylesheet     6,047 B     budget   7,000   (+16%)
 *
 * `wasm` now matches ZERO files, and the budget is a deliberate tripwire rather than
 * a measurement: every .wasm in dist today is a decoder and is gated as one, so the
 * next real WebAssembly in the shell should fail this and force a decision. A
 * category that matches nothing with a 339,000 B ceiling would have waved through
 * a third of a megabyte in silence — the "gate measuring nothing" failure this repo
 * keeps paying for.
 *
 * ⚠️ CHANGED 2026-09-24 BY THE OWNER'S DECISION, FOR ONE COMPONENT. The website's menu bar
 * went onto the 3D viewer (owner decision 2026-09-17, "Same menu bars everywhere"); its
 * shared stylesheet, packages/ui/src/notch.css, is 1,759 B gzip on its own. Measured
 * (`--report`, three identical builds):
 *
 *     stylesheet     6,681 B  ->  7,578 B     budget 7,000 -> 7,897
 *
 * The limit rose by exactly the measured growth (+897 B), so the 319 B of headroom it had
 * before is unchanged. The old header's rules left page.css in the same change. Script
 * went 407.4 -> 407.7 KB gzip (the new header's own code, inside its budget); decoder,
 * wasm and font did not move.
 */
const BUDGETS = {
  script: { bytes: 474_000, note: 'app chunks + the meshopt decoder every model needs' },
  decoder: { bytes: 507_000, note: 'draco + basis — vendored, in dist, never fetched' },
  wasm: {
    bytes: 20_000,
    note: 'tripwire: no shell wasm today; decoders are gated separately',
    /*
     * ⚠️ THE ONLY CATEGORY EXEMPT FROM THE COLLAPSE FLOOR, and it needs saying why.
     *
     * The floor exists to catch a category that STOPPED being emitted — "check it is
     * still being emitted", as its own error says. This one is empty BY DESIGN as of
     * 2026-09-04: every .wasm in dist is a vendored decoder and is gated under
     * `decoder`, so zero here is the correct reading, not a build that broke.
     *
     * The CEILING still applies, and that is the whole point of keeping the category
     * rather than deleting it: the next real WebAssembly added to the shell trips
     * this at 20 KB and forces a deliberate measurement. Deleting the category would
     * let it through in silence.
     */
    expectEmpty: true,
  },
  font: { bytes: 317_000, note: 'self-hosted Archivo + Instrument Serif subsets' },
  stylesheet: { bytes: 7_897, note: 'CSS' },
}

/**
 * Files under these dist paths are vendored decoders that ship but are never
 * fetched. Path-based, not extension-based, because the split runs through both
 * `.js` and `.wasm`. `meshopt_decoder.js` is deliberately NOT here — it sits at the
 * dist root, it is preloaded, and every production model needs it.
 */
const DECODER_DIRS = ['draco/', 'basis/']

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
      `  Run the build first:  npx --yes pnpm@12.6.0 --filter @run-apparel/viewer build`,
  )
  process.exit(1)
}

const totals = {}
const files = {}

for (const file of walk(DIST)) {
  const ext = extname(file).toLowerCase()
  const rel = relative(DIST, file)
  const category = DECODER_DIRS.some((dir) => rel.startsWith(dir))
    ? 'decoder'
    : (CATEGORY_BY_EXT[ext] ?? UNGATED)
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

/**
 * FLOOR — L10-05, 2026-08-31. A gated category below this fraction of its budget
 * FAILS, exactly as one over budget does.
 *
 * WHY A CEILING ALONE IS HALF A GATE. Every budget here answers "did the shell get
 * heavier". None of them noticed a category getting LIGHTER, and the way a category
 * gets lighter without anyone deciding to is by DISAPPEARING — a decoder that stops
 * being copied, a font subset that stops being emitted, a chunk that fails to build.
 * Each of those ships a viewer that is smaller and broken, and each would have read
 * as a comfortable pass here. The repo has already paid for exactly this shape:
 * `apps/viewer/scripts/copy-decoders.mjs` writes `public/draco/` at build time, and
 * a missing decoder is what stopped every production model rendering in July.
 *
 * ⚠️ THIS IS NOT A RULE AGAINST GETTING SMALLER. If you genuinely halve a category —
 * a better font subset, a decoder dropped on purpose — LOWER THE BUDGET in the same
 * change. The floor is measured against the budget, so re-baselining is the
 * intended way past it, and it keeps the number meaning something either way.
 *
 * 0.5 is chosen against the live figures, not picked round: the four categories sit
 * at 72–91% of budget today, so the nearest is 22 points clear of tripping it.
 */
const FLOOR_AT = 0.5

const failures = []
const warnings = []
const collapses = []

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
    } else if (BUDGETS[category]?.expectEmpty && t.count === 0) {
      // Empty on purpose — see the note on this budget. The ceiling above still
      // applies, so anything landing here still has to be argued for.
      verdict = `${fmt(budget)}  (empty by design — tripwire only)`
    } else if (t.gz < budget * FLOOR_AT) {
      verdict = `${fmt(budget)}  COLLAPSED to ${pct}% — under the ${FLOOR_AT * 100}% floor`
      collapses.push({ category, actual: t.gz, budget, count: t.count })
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

if (collapses.length) {
  console.error(
    `\n\u2717 ${collapses.length} gated category collapsed below ${FLOOR_AT * 100}% of budget.\n`,
  )
  for (const c of collapses) {
    console.error(
      `::error::${c.category} is ${fmt(c.actual)} gzip against a ${fmt(c.budget)} budget ` +
        `(${((c.actual / c.budget) * 100).toFixed(0)}%, ${c.count} file(s)). A category does not ` +
        `halve by accident — check it is still being emitted. If the drop is deliberate, lower the budget.`,
    )
  }
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
