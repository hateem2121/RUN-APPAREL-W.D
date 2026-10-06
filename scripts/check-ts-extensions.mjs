#!/usr/bin/env node
/**
 * FI-22 — no extensionless relative import may live in `packages/shared/src`.
 *
 * WHY THIS EXISTS. Four root scripts (`scripts/link-crawl-probe.mjs`,
 * `scripts/process-local.mjs`, `scripts/process-local-lib.mjs`,
 * `scripts/public-security-probe.mjs`) import shared `.ts` modules under PLAIN
 * Node. Node's TypeScript type-stripping resolves an explicit `.ts` specifier
 * fine but REFUSES an extensionless one (`ERR_MODULE_NOT_FOUND`) — so a single
 * extensionless `from './x'` anywhere in a shared module's import graph breaks
 * those scripts at load time, while every bundler-side consumer and every vitest
 * run still passes. That is exactly how `link-crawl-probe` went red on
 * 2026-10-05: `defaults.ts` imported `'./siteFooter'`, vitest resolved it, the
 * crawl did not, and nothing between them could see the difference.
 *
 * The convention this guards: every relative import inside
 * `packages/shared/src` (value AND type, including `export … from`) ends in
 * `.ts`, enabled by `allowImportingTsExtensions` in tsconfig.base.json. Type-only
 * imports are erased before Node sees them, so they would be harmless — they are
 * included anyway, so the rule stays one sentence and the guard stays one regex.
 *
 * Plain JS with no imports beyond node: builtins, same rule as
 * `contrast-rules.mjs` — root scripts run under bare `node` in CI, and a checker
 * that needs a loader to check loaders would have missed the very bug it guards.
 *
 * Usage:
 *   node scripts/check-ts-extensions.mjs            # exits 1 on any finding
 *   node scripts/check-ts-extensions.mjs --report   # always exits 0
 */

import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHARED_SRC = join(fileURLToPath(import.meta.url), '..', '..', 'packages', 'shared', 'src')

/**
 * Pure: the relative-import specifiers in one source string that do not end in
 * `.ts`. Catches `from './x'`, `from "../x"`, `export * from './x'` and dynamic
 * `import('./x')`. Test files are skipped by the caller, not here.
 *
 * @param {string} source
 * @returns {string[]} offending specifiers, in file order, with their quote style preserved
 */
export function unextendedSpecifiers(source) {
  /** @type {string[]} */
  const problems = []
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    const specifier = match[1]
    if (!specifier.endsWith('.ts')) problems.push(specifier)
  }
  return problems
}

/**
 * Pure: every problem across the given files. Separated from the filesystem so
 * the test can feed fixtures and the real tree through the same code.
 *
 * @param {{ name: string, source: string }[]} files
 * @returns {string[]} "<file>: <specifier>" lines, empty when clean
 */
export function sharedImportProblems(files) {
  /** @type {string[]} */
  const found = []
  for (const file of files) {
    for (const specifier of unextendedSpecifiers(file.source)) {
      found.push(`${file.name}: '${specifier}' needs the .ts extension (plain-Node import rule)`)
    }
  }
  return found.sort()
}

function main() {
  const report = process.argv.includes('--report')
  const names = readdirSync(SHARED_SRC).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  )
  const files = names.map((name) => ({
    name,
    source: readFileSync(join(SHARED_SRC, name), 'utf8'),
  }))
  const problems = sharedImportProblems(files)
  if (problems.length === 0) {
    console.log(
      `check-ts-extensions: ${names.length} shared modules clean — every relative import carries .ts`,
    )
    return
  }
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(
    `check-ts-extensions: ${problems.length} extensionless relative import(s) in packages/shared/src. ` +
      'Plain-Node scripts cannot resolve them (ERR_MODULE_NOT_FOUND — the 2026-10-05 link-crawl outage). Add .ts. `--report` exits 0.',
  )
  if (!report) process.exit(1)
}

const isMain = process.argv[1] && import.meta.filename === realpathSync(process.argv[1])
if (isMain) main()
