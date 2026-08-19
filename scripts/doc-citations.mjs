/**
 * Extract file-path citations from Markdown prose, and decide whether they resolve.
 *
 * WHY THIS IS A SHARED MODULE. `claudeMd.test.ts` grew this extractor to guard the
 * CLAUDE.md files after three broken citations were found at once on 2026-08-12. The
 * same rot is in the rest of the documentation — README's index, the RUNBOOK someone
 * opens during an outage — and a second copy of the extractor would be a second thing
 * to fix when the rules change. One implementation, two callers.
 *
 * The anchor list is what keeps this free of false positives: without it,
 * `alphaMode: BLEND`, `TEXCOORD_0`, `/api/public/viewer/n001/wine` and
 * `media.wear-run.help` all look like paths.
 */

import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Top-level directories a citation may start with. `output/` is gitignored build output. */
export const ANCHORS = new Set([
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
 *
 * MOVED HERE 2026-08-18 from claudeMd.test.ts. The CLI entry point below would
 * otherwise have needed its own copy, which is precisely the failure this module's
 * own header warns about in its first paragraph: "a second copy of the extractor
 * would be a second thing to fix when the rules change". The test imports it now.
 */
export const ALLOWED_ABSENT = new Map([
  [
    '.claude/rules',
    'the upstream path-scoped-rules directory, cited by CLAUDE.md and docs/RUNBOOK.md as a mechanism this repo deliberately does NOT use: as of 2026-08-19 a rule fires only when Claude READS a matching file, so creating a file never triggers it (anthropics/claude-code#63142), and the documented paths: key is reported to fail where an undocumented globs: works (#17204). Both documents say in the same sentence that the directory is absent. Delete this entry if the repo ever adopts one.',
  ],
  [
    '.claude/instructions-loaded.log',
    'written by .claude/hooks/log-instructions-loaded.mjs on its first run and gitignored — a per-machine measurement of which memory files loaded, not shared state. docs/RUNBOOK.md cites it as the file to read, which is correct before it exists.',
  ],
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
  // ── The eight below were invisible until 2026-08-18 ──────────────────────────
  // The gate read `docs/` ONE LEVEL DEEP, so docs/reviews/ and
  // docs/superpowers/plans/ had never been checked at all. Widening the walk
  // surfaced these immediately. They split into two kinds, and the distinction is
  // worth keeping because only one of them is a "stale citation".
  //
  // KIND 1 — really existed, deleted by a real commit. Ordinary past tense.
  [
    'apps/viewer/worker/renderGuard.ts',
    'existed; deleted by a57b66d ("remove the automatic garment photography and the /render route"), added by a8c552e. Cited by docs/reviews/2026-08-12-post-merge-8927062.md, which is a dated record of the code AS IT WAS THAT DAY.',
  ],
  [
    'apps/shrink/src/posters.ts',
    'existed; deleted by a57b66d, added by 26ed54b ("photograph every colour in one browser session per garment"). Cited by the 2026-08-12 review and the 2026-08-10 plan, both dated records. Poster capture was dropped over Browser Rendering billing.',
  ],
  [
    'apps/viewer/src/RenderPage.tsx',
    'existed; deleted by a57b66d with the poster-capture job. CLAUDE.md records the deletion explicitly, including that the viewer coverage floor was deliberately NOT raised to match the number the deletion happened to produce.',
  ],
  //
  // KIND 2 — NEVER EXISTED, verified by `git log --diff-filter=A`. These are
  // filenames a PLAN PROPOSED and the implementation did not use. Not stale: the
  // plan is a record of intent, and the divergence between intent and what shipped
  // is the information. Nothing in this repo could see this before today.
  [
    'apps/shrink/src/importPlan.ts',
    'NEVER existed — no git history at all. A filename proposed by docs/superpowers/plans/2026-08-10-cms-ux-redesign.md that the implementation did not use. The plan is a dated record of intent, not an index of the tree.',
  ],
  [
    'apps/viewer/src/render',
    'NEVER existed — no git history. A directory proposed by the 2026-08-10 plan. Same reason as apps/shrink/src/importPlan.ts.',
  ],
  [
    'apps/viewer/src/components/stageState.ts',
    'NEVER existed — no git history. Proposed by docs/superpowers/plans/2026-08-14-viewer-audit-remediation.md; the state extraction shipped under a different shape. Same reason as apps/shrink/src/importPlan.ts.',
  ],
  [
    'apps/viewer/src/components/stageState.test.ts',
    'NEVER existed — no git history. The test file for the module above, proposed and never created under that name.',
  ],
  [
    '.claude/settings.local.json',
    'gitignored per-machine agent config (.gitignore:66). docs/AI-TOOLING.md:335 says permissions "belong in" it and labels it "per machine, not committed" in the very code block beneath — the document states the reason for its own absence. Third of the three from 1723c3c. It outlived apps/viewer/dist by a few hours only because the machine that ran `pnpm test` had the file, which is the same asymmetry that entry records and the reason CI is the authority on this guard, not a local run.',
  ],
])

/**
 * Extensions tried when a citation has none.
 *
 * `docs/CLOUDFLARE-SETUP.md` cites `apps/cms/src/migrations/20260720_185735_initial`,
 * which is the migration's NAME — Payload writes it as a `.ts` and a `.json` pair, and
 * naming one of them would be picking a half arbitrarily. Extension-less citation of a
 * real thing is correct here, so the resolver accommodates it rather than the document
 * accommodating the resolver.
 */
const TRY_EXTENSIONS = ['', '.ts', '.tsx', '.mjs', '.js', '.json', '.md']

/**
 * Inline-backtick spans that look like repository paths, with fenced code blocks
 * removed first so command examples are not scanned.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function citedPaths(markdown) {
  const prose = markdown.replace(/```[\s\S]*?```/g, '')
  const paths = new Set()

  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]
    if (!token) continue
    if (!token.includes('/')) continue
    if (/[\s*<>()?=,]/.test(token)) continue
    if (token.startsWith('/') || token.startsWith('~') || token.startsWith('#')) continue
    if (token.includes('node_modules')) continue

    // Strip a trailing `:42`, `:42:7` or `:42-80` line reference. This repo cites
    // `file.ts:219` and `tokens.css:2` routinely — the harness even renders them as
    // clickable links — so treating the line number as part of the filename reported
    // four false positives the first time this ran over docs/.
    //
    // The RANGE alternative was added 2026-08-18. The original expression had no
    // branch for the hyphen, so `file.ts:53-80` kept the range as part of the
    // filename and could never resolve — and all SEVEN failures the 2026-08-17
    // audit hit were ranges, in a document its own verification step had already
    // declared clean.
    const clean = token.replace(/:\d+(?:[:-]\d+)?$/, '').replace(/\/+$/, '')

    const [anchor] = clean.split('/')
    if (!anchor || !ANCHORS.has(anchor)) continue
    paths.add(clean)
  }
  return [...paths]
}

/**
 * Does this citation point at something that exists?
 *
 * @param {string} root
 * @param {string} cited
 * @returns {boolean}
 */
export function resolves(root, cited) {
  return TRY_EXTENSIONS.some((extension) => existsSync(join(root, cited + extension)))
}

/**
 * Every document this gate covers, found by walk.
 *
 * ADDED 2026-08-18 for the command-line entry point below. Three things it covers
 * that the previous callers did not:
 *
 *  1. `docs/` RECURSIVELY. `claudeMd.test.ts` read `docs/` one level deep, so
 *     anything in a subdirectory was invisible to the gate. That was a defensible
 *     choice — its comment says a glob "would quietly start covering a file added
 *     for a different purpose" — which silently became wrong the day
 *     `docs/superpowers/` appeared. Found by checking whether the gate read a
 *     document rather than by trusting that a green suite meant it had.
 *  2. `audit-ci.jsonc`. M1 of the 2026-08-17 audit was a citation to a line that
 *     does not exist inside a SECURITY CONTROL's own justification, and it rotted
 *     unseen because the gate scanned only Markdown.
 *  3. Any `CLAUDE.md`, anywhere.
 *
 * @param {string} dir
 * @param {string[]} found
 * @returns {Promise<string[]>}
 */
export async function walkDocuments(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDocuments(path, found)
      continue
    }
    if (entry.name === 'CLAUDE.md' || entry.name === 'audit-ci.jsonc' || entry.name.endsWith('.md'))
      found.push(path)
  }
  return found
}

/**
 * Which documents the CLI checks, relative to `root`.
 *
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function documentsToCheck(root) {
  const all = await walkDocuments(root)
  const docsDir = join(root, 'docs')
  return all.filter((path) => {
    const name = path.slice(root.length + 1)
    if (path.endsWith('CLAUDE.md') || path.endsWith('audit-ci.jsonc')) return true
    if (path.startsWith(`${docsDir}/`)) return true
    return ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'].includes(name)
  })
}

/**
 * Report every unresolved citation and exit non-zero.
 *
 * WHY THIS EXISTS. Until 2026-08-18 running this file as a command printed nothing
 * and exited 0, having read no document — while CLAUDE.md named it as the mechanism
 * by which every document is citation-checked. The 2026-08-17 audit ran it twice as
 * its verification step, recorded itself as citation-clean, and `pnpm test` then
 * failed that same document with SEVEN broken citations.
 *
 * An entry point that cannot fail is indistinguishable from no entry point at all,
 * so this one has a negative control in apps/cms/src/claudeMd.test.ts.
 *
 * @param {string} root
 * @returns {Promise<number>} count of unresolved citations
 */
export async function reportBrokenCitations(root) {
  const documents = await documentsToCheck(root)
  let broken = 0
  let checked = 0

  for (const document of documents) {
    const text = await readFile(document, 'utf8')
    for (const cited of citedPaths(text)) {
      checked++
      if (resolves(root, cited)) continue
      if (ALLOWED_ABSENT.has(cited)) continue
      broken++
      console.error(`✗ ${document.slice(root.length + 1)}  cites  ${cited}  — does not resolve`)
    }
  }

  console.log(
    `\n${broken ? '✗' : '✓'} ${checked} citations checked across ${documents.length} documents; ${broken} unresolved.\n`,
  )
  return broken
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit((await reportBrokenCitations(process.cwd())) ? 1 : 0)
}
