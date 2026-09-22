#!/usr/bin/env node
/**
 * Every maintained document is reachable from `docs/README.md` (audit FA-T-06, FA-T-12).
 *
 * WHY THIS EXISTS. `docs/README.md` opens by saying it was written because "13 of the 34
 * documents here were reachable from nothing", and then says a document nobody can find
 * is a document nobody maintains. Both true, and neither was enforced by anything: the
 * index was brought up to date by hand twice — once when it was written, once when the
 * 2026-09-06 audit found it missing 8 of 43 — and would have drifted a third time.
 *
 * ⚠️ THE HARD PART IS "MAINTAINED", NOT "REACHABLE". 72% of this repository's prose is
 * write-once RECORDS: audit runs, plans, specs, one investigation. Measured 2026-09-07 —
 * 62 files and 4.47 MB of records against 183 files and 1.43 MB of maintained
 * documentation. Indexing the records file by file would bury the eight documents
 * somebody actually needs under eighteen superseded plans, so they are deliberately
 * reachable through the audit or plan that owns them instead. `RECORD_TREES` is that
 * decision, written down where it can be checked rather than remembered.
 *
 * ⚠️ AND THAT MAKES THE EXCLUSION LIST THE DANGEROUS PART. A path added to RECORD_TREES
 * silently stops being checked, which is the same shape as a `Disallow` that also removes
 * a page from a sitemap: it looks like tidying and it is a hole. Keep it to whole trees
 * with a date in their name or an obvious one-shot purpose, and never add a directory
 * that holds anything a person is expected to keep true.
 *
 * Run: `node scripts/check-docs-index.mjs`. Exits 1 and names every unreachable document.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Write-once records. Each is about a state of the world on a date, and editing one to
 * keep it "current" destroys the only thing it is for.
 */
export const RECORD_TREES = ['docs/superpowers/plans/', 'docs/superpowers/specs/']

/** Single files that are records rather than trees. */
export const RECORD_FILES = [/^docs\/AUDIT-[\w.-]+\.md$/, /^NEXT-SESSION-PROMPT\.md$/]

/**
 * Trees addressed BY NAME by tooling rather than browsed by a person.
 *
 * ⚠️ THIS IS NOT AN EXEMPTION FOR BEING HARD TO INDEX. 129 of the 131 documents this
 * check first reported are here: skill and agent manifests that Claude Code loads by
 * path (`.claude/skills/<name>/SKILL.md`) or by frontmatter. Listing them in a
 * human-facing index would be a table of things no human opens, and it would push the
 * eight documents somebody actually needs off the first screen. They are not
 * unreachable; they are reached by a different mechanism.
 *
 * ⚠️ AND ONE OF THEM MATTERED ANYWAY, WHICH IS WHY THE REASON IS WRITTEN HERE. A
 * `/doctor` session on 2026-08-15 re-researched "should we adopt Tailwind?" from scratch
 * while `.agents/skills/pick-ui-library/SKILL.md` had already decided it. The lesson was
 * not "index the skills" — it was that a settled DECISION belongs in `docs/DECISION-*`,
 * where this check does cover it, and `docs/DECISION-UI-LIBRARIES.md` is where that one
 * now lives.
 */
export const TOOLING_TREES = ['.claude/', '.agents/', '.github/']

/**
 * Documents that are reachable by a route other than the index, named individually so
 * the reason is on the record rather than inferred from a pattern.
 */
export const REACHABLE_ELSEWHERE = new Map([
  ['README.md', 'the root README — the entry point that links docs/README.md'],
  ['docs/README.md', 'the index itself'],
  ['CLAUDE.md', 'loaded automatically into every session in this repository'],
  ['apps/cms/CLAUDE.md', 'loaded automatically on touching apps/cms/'],
  ['apps/viewer/CLAUDE.md', 'loaded automatically on touching apps/viewer/'],
  ['tools/asset-pipeline/CLAUDE.md', 'loaded automatically on touching tools/asset-pipeline/'],
  ['.github/CLAUDE.md', 'loaded automatically on touching .github/'],
  ['CONTRIBUTING.md', 'GitHub surfaces it on every pull request'],
  ['SECURITY.md', 'GitHub surfaces it under the Security tab'],
  ['CHANGELOG.md', 'ordered by release, not by topic'],
])

export function isRecord(path) {
  return (
    RECORD_TREES.some((tree) => path.startsWith(tree)) ||
    TOOLING_TREES.some((tree) => path.startsWith(tree)) ||
    RECORD_FILES.some((pattern) => pattern.test(path))
  )
}

/** Tracked markdown, so an untracked scratch file cannot fail the build. */
function trackedMarkdown() {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/**
 * Matched on the BASENAME, not the full path.
 *
 * The index links documents relative to `docs/`, so `docs/RUNBOOK.md` appears as
 * `RUNBOOK.md` and a full-path comparison would report every one of them as missing —
 * a check that fails on everything is as useless as one that fails on nothing.
 */
export function unreachable(paths, index) {
  return paths
    .filter((path) => !isRecord(path) && !REACHABLE_ELSEWHERE.has(path))
    .filter((path) => !index.includes(path.split('/').pop()))
}

function main() {
  const index = readFileSync(join(REPO, 'docs', 'README.md'), 'utf8')
  const paths = trackedMarkdown()
  const missing = unreachable(paths, index)

  /*
   * Three categories, not two. Folding the tooling manifests in with the records made the
   * one line this script prints say "198 records", which is wrong about both of them.
   */
  const records = paths.filter(
    (path) =>
      RECORD_TREES.some((tree) => path.startsWith(tree)) ||
      RECORD_FILES.some((pattern) => pattern.test(path)),
  ).length
  const tooling = paths.filter((path) => TOOLING_TREES.some((tree) => path.startsWith(tree))).length
  console.log(
    `docs index: ${paths.length} tracked documents — ${records} write-once records, ` +
      `${tooling} tooling manifests, ${paths.length - records - tooling} maintained.`,
  )

  if (missing.length > 0) {
    console.error(`\n✖ ${missing.length} maintained document(s) reachable from nothing:\n`)
    for (const path of missing) console.error(`   ${path}`)
    console.error(
      '\nAdd each to docs/README.md, or — if it is a write-once record — add its tree to\n' +
        'RECORD_TREES in this file, with the reason. Read the warning there first.\n',
    )
    process.exit(1)
  }

  console.log('✓ every maintained document is reachable from docs/README.md.')
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main()
