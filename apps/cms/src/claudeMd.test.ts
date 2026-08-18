import { spawnSync } from 'node:child_process'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_ABSENT,
  citedPaths,
  documentsToCheck,
  resolves,
} from '../../../scripts/doc-citations.mjs'

/**
 * Guard the repo's CLAUDE.md files against the two ways they have actually rotted.
 *
 * WHY. These files are the only documentation an AI session reads before changing
 * anything, and both failure modes are silent — a wrong line reads exactly like a
 * right one, and the reader has no reason to check.
 *
 * 1. A CITED PATH THAT RESOLVES TO NOTHING. Found 2026-08-12 in three places at
 *    once, all the same shape: the root file cited `scripts/sweep-size-vs-artwork.mjs`
 *    and the viewer file cited `scripts/csp.mjs` / `scripts/csp.test.ts`, while the
 *    real files live under `tools/asset-pipeline/scripts/` and `apps/viewer/scripts/`.
 *    A repo-root `scripts/` also exists, so each bad path pointed at a real directory
 *    that does not contain them — which is why eyeballing it never caught it. This is
 *    the same trap the root file already records twice about `--keep` and
 *    `eval:artwork:real -- raw/x.glb`: a relative path is only unambiguous next to a
 *    statement of what it is relative to.
 *
 * 2. AN INDEX THAT STOPPED COUNTING. The root file indexes the subdirectory files
 *    ("Seven more traps live in apps/viewer/CLAUDE.md"). Traps were added to the
 *    viewer file on 2026-08-12 without updating that number, so the root advertised
 *    seven of ten — and what it omitted included `_headers` NOT reaching a
 *    Worker-built response, the half that had just shipped a CSP-less refusal to
 *    production. Splitting a memory file creates a second copy of the truth, and the
 *    copy is the part that decays.
 *
 * Both are checked against the FILES THEMSELVES rather than by grepping for expected
 * strings, for the reason mediaReferences.test.ts states: asserting that a string
 * exists only proves the string exists.
 *
 * WHY IT LIVES IN apps/cms. It is a repo-wide check and belongs to no app. It is here
 * because this is the workspace that both runs vitest and carries node types —
 * `packages/shared` deliberately has NEITHER `@types/node` nor a `types` field, so
 * node globals cannot leak into code the Workers import, and adding them to host this
 * file would trade a real safety property for a docs test. apps/cms already hosts the
 * repo's other cross-file guard (mediaReferences.test.ts), which likewise reaches
 * outside this app.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

async function findClaudeMdFiles(dir: string, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await findClaudeMdFiles(path, found)
      continue
    }
    if (entry.name === 'CLAUDE.md') found.push(path)
  }
  return found
}

/**
 * Every document a human or an agent is expected to FOLLOW.
 *
 * DELEGATES to documentsToCheck() in the shared module as of 2026-08-18, so this
 * test and `node scripts/doc-citations.mjs` can never disagree about what is
 * covered. They previously could, and did.
 *
 * This function used to read `docs/` ONE LEVEL DEEP, with the stated reason that a
 * glob "would quietly start covering a file added for a different purpose". That
 * was a fair call when written and became wrong the day docs/superpowers/ and
 * docs/reviews/ appeared: three documents holding EIGHT unresolvable citations sat
 * in those directories, unread by anything, until the walk was widened. The
 * trade-off the old comment worried about is real, and the answer to it is
 * ALLOWED_ABSENT with a reason — not a narrower walk.
 */
async function proseFiles(): Promise<string[]> {
  return documentsToCheck(REPO_ROOT)
}

/** Bullets under the `## Traps` heading — the thing the root file's index claims a count of. */
function countTrapBullets(markdown: string): number {
  const start = markdown.search(/^## Traps/m)
  if (start === -1) return 0
  const rest = markdown.slice(start)
  const end = rest.slice(1).search(/^## /m)
  const section = end === -1 ? rest : rest.slice(0, end + 1)
  return [...section.matchAll(/^- \*\*/gm)].length
}

const NUMBER_WORDS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
])

describe('CLAUDE.md', () => {
  it('cites no path that does not exist', async () => {
    const files = await findClaudeMdFiles(REPO_ROOT)
    expect(files.length, 'expected to find the CLAUDE.md files at all').toBeGreaterThan(0)

    const broken: string[] = []
    for (const file of files) {
      for (const cited of citedPaths(await readFile(file, 'utf8'))) {
        if (ALLOWED_ABSENT.has(cited)) continue
        if (resolves(REPO_ROOT, cited)) continue
        broken.push(`${file.slice(REPO_ROOT.length + 1)} cites "${cited}"`)
      }
    }

    expect(
      broken,
      'A CLAUDE.md cites a path that does not exist. Fix the citation (a bare "scripts/x" is\n' +
        'almost always a package path needing its prefix — apps/viewer/scripts/, tools/asset-pipeline/scripts/).\n' +
        'If the path is absent on purpose, add it to ALLOWED_ABSENT in this file WITH the reason.',
    ).toEqual([])
  })

  /**
   * The same check, widened to every document a person is expected to FOLLOW.
   *
   * WHY IT IS WORTH MORE THAN THE CLAUDE.md ONE. README's index is the first thing a
   * new developer reads and `docs/RUNBOOK.md` is what someone opens during an outage;
   * a citation that resolves to nothing wastes the time of a person who has none. It
   * found four broken citations on its first run — three of them the exact
   * bare-`scripts/` shape the root CLAUDE.md already records twice
   * (`scripts/csp.mjs` → `apps/viewer/scripts/csp.mjs`, `scripts/bisect-artwork.mjs`
   * and `scripts/sweep-size-vs-artwork.mjs` → `tools/asset-pipeline/scripts/…`), each
   * pointing at a real repo-root `scripts/` directory that does not contain them.
   * That is why eyeballing never caught them.
   *
   * SESSION LOGS ARE INCLUDED, not exempted. They are historical, but "historical"
   * excuses a stale VERSION, not a path that was always wrong — the three above were
   * in session logs and were simply incorrect. Genuine past-tense citations go in
   * ALLOWED_ABSENT with the reason, which keeps the distinction explicit instead of
   * granting a whole directory an amnesty.
   */
  it('no document a human follows cites a path that does not exist', async () => {
    const files = await proseFiles()
    expect(files.length, 'expected to find the prose documents').toBeGreaterThan(10)

    const broken: string[] = []
    for (const file of files) {
      for (const cited of citedPaths(await readFile(file, 'utf8'))) {
        if (ALLOWED_ABSENT.has(cited)) continue
        if (resolves(REPO_ROOT, cited)) continue
        broken.push(`${file.slice(REPO_ROOT.length + 1)} cites "${cited}"`)
      }
    }

    expect(
      broken,
      'A document cites a path that does not exist. A bare "scripts/x" is almost always a\n' +
        'package path missing its prefix (apps/viewer/scripts/, tools/asset-pipeline/scripts/).\n' +
        'If the path is genuinely gone and the mention is past tense, add it to\n' +
        'ALLOWED_ABSENT above WITH the reason.',
    ).toEqual([])
  })

  it('states the right number of traps in every cross-reference to another CLAUDE.md', async () => {
    const files = await findClaudeMdFiles(REPO_ROOT)
    const wrong: string[] = []
    let claimsChecked = 0

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/\*\*(\w+) more traps live in `([^`]+)`\*\*/g)) {
        const claimedWord = match[1]
        const target = match[2]
        if (!claimedWord || !target) continue
        claimsChecked++
        const claimed = NUMBER_WORDS.get(claimedWord.toLowerCase()) ?? Number(claimedWord)
        const targetPath = join(REPO_ROOT, target)
        if (!resolves(REPO_ROOT, target)) {
          wrong.push(`${target} does not exist`)
          continue
        }
        const actual = countTrapBullets(await readFile(targetPath, 'utf8'))
        if (claimed !== actual)
          wrong.push(`claims ${claimedWord} (${claimed}) traps in ${target}, which has ${actual}`)
      }
    }

    expect(
      claimsChecked,
      'the root file indexes the subdirectory files; that claim should be found here',
    ).toBeGreaterThan(0)
    expect(
      wrong,
      "A CLAUDE.md's trap count is out of date. Update the number AND the list of topics beside\n" +
        'it — the count going stale means a trap was added that the root file never advertised.',
    ).toEqual([])
  })
})

describe('the citation extractor', () => {
  it('strips a single line reference', () => {
    expect(citedPaths('see `apps/cms/src/endpoints/events.ts:53`')).toEqual([
      'apps/cms/src/endpoints/events.ts',
    ])
  })

  it('strips a line:column reference', () => {
    expect(citedPaths('see `apps/cms/src/endpoints/events.ts:53:7`')).toEqual([
      'apps/cms/src/endpoints/events.ts',
    ])
  })

  it('strips a line RANGE — the seven failures of 2026-08-17 were all ranges', () => {
    // The original expression had no branch for the hyphen, so the range stayed
    // part of the filename and could never resolve. The audit that found this had
    // already declared the offending document clean, using the command below.
    expect(citedPaths('see `apps/cms/src/endpoints/events.ts:53-80`')).toEqual([
      'apps/cms/src/endpoints/events.ts',
    ])
  })
})

describe('the doc-citations command', () => {
  const script = join(REPO_ROOT, 'scripts', 'doc-citations.mjs')

  it('reads documents and says how many, rather than passing in silence', () => {
    // Until 2026-08-18 this produced 0 bytes of output and exit 0, having read
    // nothing, while CLAUDE.md named it as the citation gate. Silence WAS the bug.
    const run = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8' })
    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/\d+ citations checked across \d+ documents/)
  })

  it('covers docs/ recursively — three subdirectory documents were never read', async () => {
    const covered = await documentsToCheck(REPO_ROOT)
    expect(
      covered.some((path) => path.includes(`${join('docs', 'superpowers')}`)),
      'docs/ was walked one level deep until 2026-08-18, so plans and reviews were invisible',
    ).toBe(true)
    expect(covered.some((path) => path.endsWith('audit-ci.jsonc'))).toBe(true)
  })

  it('NEGATIVE CONTROL: exits 1 and names both the citation and the file', async () => {
    // A gate that has never been observed to fail is indistinguishable from the
    // no-op this replaced.
    const decoy = join(REPO_ROOT, 'docs', 'DOC-CITATIONS-NEGATIVE-CONTROL.md')
    await writeFile(decoy, 'A citation to `apps/cms/src/does-not-exist.ts` here.\n')
    try {
      const run = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8' })
      const output = run.stdout + run.stderr
      expect(run.status).toBe(1)
      expect(output).toContain('apps/cms/src/does-not-exist.ts')
      expect(output).toContain('DOC-CITATIONS-NEGATIVE-CONTROL.md')
    } finally {
      await rm(decoy, { force: true })
    }
  })
})
