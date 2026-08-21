import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
  // The TENS, added 2026-08-21 — the day apps/viewer/CLAUDE.md crossed 29 traps and
  // the root file's "Thirty-one more traps live in …" parsed as NaN. parseNumberWord
  // already handled compounds ("twenty-three") correctly; it simply had no value for
  // any tens word above twenty, so the FIRST count to reach thirty was guaranteed to
  // fail no matter who wrote it. It failed loudly, which is the good outcome — but it
  // failed on a correct sentence, so the fix belongs here and not in the prose.
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
])

/**
 * Number words, including the hyphenated compounds ("twenty-three").
 *
 * The compound half is why this exists. Until 2026-08-19 the claim regex captured
 * `(\w+)` and `\w` excludes `-`, so "**Twenty-three more traps live in
 * `apps/viewer/CLAUDE.md`**" matched NOTHING and the viewer's count went unchecked —
 * while `claimsChecked > 0` still passed on the cms claim beside it, so the gap
 * reported as green. The count was right by luck (23 = 23) the day it was found.
 * That is the SECOND time this counter has silently skipped a claim: on 2026-08-17 it
 * was a missing word ("Two more live in", without "traps"). Both failures share a
 * shape — the guard did not fail, it stopped looking — which is why the negative
 * control below asserts the parser matches the real claims, not merely that it runs.
 */
function parseNumberWord(word: string): number {
  const direct = NUMBER_WORDS.get(word.toLowerCase())
  if (direct !== undefined) return direct
  const [tens, units] = word.toLowerCase().split('-')
  const tensValue = tens ? NUMBER_WORDS.get(tens) : undefined
  const unitsValue = units ? NUMBER_WORDS.get(units) : undefined
  if (tensValue !== undefined && unitsValue !== undefined && tensValue % 10 === 0)
    return tensValue + unitsValue
  return Number(word)
}

/** The shape of a cross-reference claim. `[\w-]+` so hyphenated compounds are seen. */
const TRAP_CLAIM = /\*\*([\w-]+) more traps live in `([^`]+)`\*\*/g

/**
 * Deliberately looser than TRAP_CLAIM: any sentence claiming a trap count in a named
 * file, however it is punctuated. The strict regex must find exactly as many claims as
 * this one does — that equality is the negative control. Both silent skips this counter
 * has had were cases where the strict shape stopped matching while the prose still made
 * the claim, so counting the CLAIMS separately from the MATCHES is what catches it.
 */
const TRAP_CLAIM_LOOSE = /more traps live in `([^`]+)`/g

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
    let claimsPresent = 0

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      claimsPresent += [...source.matchAll(TRAP_CLAIM_LOOSE)].length
      for (const match of source.matchAll(TRAP_CLAIM)) {
        const claimedWord = match[1]
        const target = match[2]
        if (!claimedWord || !target) continue
        claimsChecked++
        const claimed = parseNumberWord(claimedWord)
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
      claimsChecked,
      'A cross-reference states a trap count that the strict regex did not match, so its\n' +
        'number was never checked. Do not "fix" this by rewording the prose until it\n' +
        'matches — widen TRAP_CLAIM. A guard that stops looking reports green.',
    ).toBe(claimsPresent)
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

  it('covers .claude/rules/ — a rule file holds trap prose no other guard reads', async () => {
    // Path-scoped rules became load-bearing on 2026-08-20, when the viewer's seven
    // headers/CSP/edge traps moved into one because they span apps/viewer/worker/ AND
    // apps/viewer/scripts/ and a nested CLAUDE.md keys on ONE directory. That move
    // carried 176 lines of citation-dense prose out from under this guard, which is
    // exactly the "the copy is the part that decays" failure the header describes.
    //
    // Scoped to rules/ and NOT to all of .claude/: that directory also holds
    // .claude/skills/README.md and .claude/agents/docs-drift.md, plus symlinks into
    // .agents/skills/, whose citations point at their own upstream repositories.
    // Widening to the whole directory would demand a wave of exemptions to go green.
    const decoy = join(REPO_ROOT, '.claude', 'rules', 'CITATION-COVERAGE-CONTROL.md')
    await mkdir(dirname(decoy), { recursive: true })
    await writeFile(decoy, 'A citation to `apps/cms/src/does-not-exist.ts` here.\n')
    try {
      const run = spawnSync(process.execPath, [script], { cwd: REPO_ROOT, encoding: 'utf8' })
      const output = run.stdout + run.stderr
      expect(run.status, 'a broken citation inside .claude/rules/ must fail the gate').toBe(1)
      expect(output).toContain('CITATION-COVERAGE-CONTROL.md')
    } finally {
      await rm(decoy, { force: true })
    }
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
