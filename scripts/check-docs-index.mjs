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
 *
 * ⚠️ THE OTHER DIRECTION, added 2026-11-08. The 2026-11-08 truth audit found the index
 * still linking `PIPELINE-INVESTIGATION-2026-09-01.md` five weeks after that file was
 * deleted (2026-10-23): this check only asked "is every tracked doc in the index?", and
 * a row for a deleted file can never fail that — the file was already gone from
 * `git ls-files`, so nothing asked about it ever again. The index is therefore now
 * checked in reverse too: every relative link in `docs/README.md` must resolve to a
 * file that exists. URL-shaped targets are skipped, the same exemption
 * `scripts/doc-citations.mjs` gives them.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Write-once records. Each is about a state of the world on a date, and editing one to
 * keep it "current" destroys the only thing it is for.
 */
export const RECORD_TREES = [
  'docs/superpowers/plans/',
  'docs/superpowers/specs/',
  // Dated records: the session logs and the instruction-file snapshots from before the
  // 2026-09-26 rebuild lived here. All three trees were emptied on 2026-10-23 (owner
  // decision: finished records are deleted; each stays readable at commit bd384f3c).
  // The entries stay so a future dated record placed here is still classed correctly.
  'docs/archive/',
]

/** Single files that are records rather than trees. */
export const RECORD_FILES = [/^docs\/AUDIT-[\w.-]+\.md$/]

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
  [
    'AGENTS.md',
    'loaded automatically by Antigravity and other coding tools that read no CLAUDE.md',
  ],
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

/**
 * The other direction (2026-11-08): every relative link inside the index must point at
 * a file that exists. A row for a deleted file is invisible to `unreachable()` above —
 * the file is gone from `git ls-files`, so the one-direction check never asks about it.
 *
 * URL-shaped targets (any scheme, e.g. the archive links to commit bd384f3c), targets
 * starting with `/` and pure `#anchors` are skipped — the same exemptions
 * `scripts/doc-citations.mjs` gives them, because none of those is a repo path.
 */
export function danglingLinks(index, baseDir) {
  const dangling = []
  const seen = new Set()
  for (const match of index.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1]
    if (seen.has(target)) continue
    seen.add(target)
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.startsWith('#')) {
      continue
    }
    const resolved = resolve(baseDir, target)
    if (!existsSync(resolved)) dangling.push({ target, resolved })
  }
  return dangling
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

  const dangling = danglingLinks(index, join(REPO, 'docs'))
  if (dangling.length > 0) {
    console.error(`\n✖ ${dangling.length} link(s) in docs/README.md point at nothing:\n`)
    for (const { target, resolved } of dangling) {
      console.error(`   ${target}  →  ${relative(REPO, resolved) || resolved}`)
    }
    console.error(
      '\nFix the link, or point it at the archived commit the way the deleted records\n' +
        'do (the bd384f3c rows in docs/README.md are the pattern).\n',
    )
    process.exit(1)
  }

  console.log(
    '✓ every maintained document is reachable from docs/README.md, and every link in it resolves.',
  )
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) main()
