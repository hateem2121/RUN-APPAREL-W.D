import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
 * Top-level directories a citation may start with. Anchoring on these is what keeps
 * the extractor free of false positives: it means `alphaMode: BLEND`, `TEXCOORD_0`,
 * `/api/public/viewer/n001/wine` and `media.wear-run.help` are never mistaken for
 * paths. `output/` is deliberately absent — it is gitignored build output.
 */
const ANCHORS = new Set([
  'apps',
  'packages',
  'tools',
  'scripts',
  'docs',
  'raw',
  '.claude',
  '.github',
  'patches',
])

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

/** Inline-backtick spans, with fenced code blocks removed first so command examples are not scanned. */
function citedPaths(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, '')
  const paths = new Set<string>()
  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]
    if (!token) continue
    // A citation contains a separator, no whitespace, and none of the characters
    // that mark it as prose, a glob, a placeholder or a URL.
    if (!token.includes('/')) continue
    if (/[\s*<>()?=,]/.test(token)) continue
    if (token.startsWith('/') || token.startsWith('~') || token.startsWith('#')) continue
    if (token.includes('node_modules')) continue
    const clean = token.replace(/\/+$/, '')
    const [anchor] = clean.split('/')
    if (!anchor || !ANCHORS.has(anchor)) continue
    paths.add(clean)
  }
  return [...paths]
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
        if (existsSync(join(REPO_ROOT, cited))) continue
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
        if (!existsSync(targetPath)) {
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
