import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { citedPaths, resolves } from '../../../scripts/doc-citations.mjs'

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

/**
 * Citations that are correct despite not existing. Keep this list tiny and always
 * give the reason — an exemption without one is indistinguishable from a bug someone
 * silenced.
 */
const ALLOWED_ABSENT = new Map([
  [
    'raw/cycling-all-colours.glb',
    'the canonical raw N001 export: gitignored, and the R2 copy expires on a 14-day lifecycle rule. tools/asset-pipeline/CLAUDE.md documents that it may already be gone.',
  ],
  [
    'apps/cms/src/fields/importColours.test.ts',
    'cited deliberately in the past tense — the root file records that the test lived here until 2026-08-11 (16b548a) and says so in the same sentence.',
  ],
  [
    'docs/ADR.md',
    'cited in the PAST TENSE by docs/AI-TOOLING.md, which records that a hand-written ADR digest was added on 2026-08-01 and contradicted CLAUDE.md the same day — that is why the ADR store seeds from CLAUDE.md instead. The file was removed; the account of why is the point.',
  ],
  [
    '.github/workflows/artwork-real.yml',
    'cited in the past tense by docs/RUNBOOK.md and docs/SESSION-2026-08-06.md, both of which say it was DELETED on 2026-08-07 because the R2 copy it pulled expires after 14 days and the surviving copy is on a laptop no runner can reach.',
  ],
  [
    'patches/@payloadcms__storage-r2@3.86.0.patch',
    'the version the patch carried when docs/SESSION-2026-07-27.md was written. It moved to 3.88.0 with Payload; the session log is a record of that day, not an index.',
  ],
  [
    'apps/viewer/dist',
    'gitignored BUILD OUTPUT, absent in a clean checkout by design — the root file cites it to say check-bundle-budget reads it and exits 1 unless `pnpm build` ran first, which is exactly why it is not committed. Added 2026-08-13 after this guard caught the citation in CI while a local `pnpm test` passed: dist existed on the machine that wrote the line. That asymmetry is the point — a citation to build output is only ever valid on a dirty tree, so it must be exempted here rather than "fixed" by building before the test.',
  ],
  [
    'apps/cms/.env',
    'gitignored local secret (.gitignore:13), and README.md:299 does not merely mention it — it tells you to CREATE it ("For local CMS runs, put a `PAYLOAD_SECRET` in `apps/cms/.env`"). A citation to a file the prose instructs the reader to write is correct on every machine and absent on every clean checkout, so it can only ever be exempted here. Same widening as apps/viewer/dist: 1723c3c taught this guard to read README and docs/, and it caught three gitignored citations at once.',
  ],
  [
    '.claude/settings.local.json',
    'gitignored per-machine agent config (.gitignore:66). docs/AI-TOOLING.md:335 says permissions "belong in" it and labels it "per machine, not committed" in the very code block beneath — the document states the reason for its own absence. Third of the three from 1723c3c. It outlived apps/viewer/dist by a few hours only because the machine that ran `pnpm test` had the file, which is the same asymmetry that entry records and the reason CI is the authority on this guard, not a local run.',
  ],
])

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
 * Every Markdown file a human or an agent is expected to FOLLOW.
 *
 * The CLAUDE.md files are found by walk; these are named, because the set is small
 * and a glob over `docs/` would quietly start covering a file added for a different
 * purpose. Session logs are included deliberately — see the note on the assertion.
 */
async function proseFiles(): Promise<string[]> {
  const docs = (await readdir(join(REPO_ROOT, 'docs')))
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(REPO_ROOT, 'docs', name))
  return [
    join(REPO_ROOT, 'README.md'),
    join(REPO_ROOT, 'CONTRIBUTING.md'),
    join(REPO_ROOT, 'SECURITY.md'),
    ...docs,
  ]
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
