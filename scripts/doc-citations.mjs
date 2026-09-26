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

import { existsSync, realpathSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Top-level directories a citation may start with. `output/` is gitignored build output. */
export const ANCHORS = new Set([
  'apps',
  'packages',
  'tools',
  'scripts',
  'docs',
  // Added 2026-08-30. Until then every citation of `infra/apex-404/index.js` — in
  // CLAUDE.md, QA-CHECKLIST, RUNBOOK and the audit — was skipped entirely, so the
  // gate could not have caught a rename there. All four resolve today.
  'infra',
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
    'apps/viewer/.env.local',
    'gitignored LOCAL DEV POINTER, absent in a clean checkout by design — apps/viewer/CLAUDE.md cites it to warn that its VITE_API_BASE_URL override makes telemetry.test.ts fail locally while CI stays green. Added 2026-08-25 after this guard caught the citation in CI while a local `pnpm --filter @run-apparel/cms test` passed, because the file existed on the machine that wrote the line — the same asymmetry recorded for apps/viewer/dist below, and the same lesson: a citation to a machine-local file is only ever valid on the machine that has it. Exempt it here rather than "fix" it by creating the file.',
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
    'patches/@payloadcms__storage-r2@3.88.0.patch',
    'the version the patch carried immediately before the 2026-09-23 Payload 3.90.1 security bump, cited in RAW-UPLOAD-PIPELINE.md in the PAST TENSE. Unlike every earlier re-key, this one has no successor file: at 3.90.1 the installed R2ClientUploadHandler.js already computes its upload endpoint per call (verified directly against node_modules), so the patch this repo carried is gone, not renamed. patches/ no longer exists.',
  ],
  [
    'apps/viewer/dist',
    'gitignored BUILD OUTPUT, absent in a clean checkout by design — the root file cites it to say check-bundle-budget reads it and exits 1 unless `pnpm build` ran first, which is exactly why it is not committed. Added 2026-08-13 after this guard caught the citation in CI while a local `pnpm test` passed: dist existed on the machine that wrote the line. That asymmetry is the point — a citation to build output is only ever valid on a dirty tree, so it must be exempted here rather than "fixed" by building before the test.',
  ],
  [
    'apps/viewer/dist/_headers',
    'the GENERATED header file itself, written into that same gitignored dist/ (.gitignore:28) by apps/viewer/scripts/gen-headers.mjs during `pnpm build`. Cited by .claude/rules/viewer-headers.md and the 2026-08-20 design spec, both of which cite it precisely to say it is generated and therefore does not cleave to one source directory — which is the whole argument for that rule existing. ⚠️ EXEMPTING THE DIRECTORY DID NOT EXEMPT THIS: `apps/viewer/dist` above is a different key, so the entry two lines up did not cover it. Added 2026-08-20 after run 32347073451 failed `verify` on exactly the asymmetry that entry describes — `pnpm test:coverage` runs BEFORE `pnpm build`, so CI never has dist, while the machine that wrote the line did and every local gate passed. Add the FULL path, not the directory.',
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
  // ── Removed from the PUBLIC repository and from its history, 2026-09-10 ────────
  // The repository went public on 2026-09-09. These audit reports listed weak spots in
  // detail, so they were taken out of every commit and kept privately by the owner.
  // Maintained documents were reworded to cite the audit by date instead; only dated
  // RECORDS still name the file, and a record is right to name what existed that day.
  [
    'docs/AUDIT-BETA-WEBSITE-2026-09-06.md',
    'removed from the public repository and its history on 2026-09-10 (kept privately). Cited by the 2026-09-06 beta-website plan, a dated record of the work as planned that day.',
  ],
  [
    'docs/AUDIT-SITE-PAGES-2026-09-05.md',
    'removed from the public repository and its history on 2026-09-10 (kept privately). Cited by the 2026-09-06 beta-website plan and its design spec, both dated records.',
  ],
  // ── 2026-09-22 — six from the garment-pipeline plan's move into the record tree ──
  // `PLAN-IN-PROGRESS.md` became `docs/superpowers/plans/2026-08-26-garment-pipeline-defects.md`
  // (master-plan B1: all 110 steps ticked or migrated). The walk never used to see a
  // root-level file, so moving this one into docs/superpowers/plans/ was the first time its
  // citations were checked — and six failed. All six are KIND 2 by the comment above:
  // filenames the plan was WRITTEN TO CREATE (its `**Files:**` lists) and that were never
  // built, because Tasks 7 and 11–14 migrated to the owner's private master plan as item
  // C4. Verified with `git log --all --diff-filter=A` on each path: none ever existed in
  // any commit. If C4 later creates a file under one of these exact names, the entry below
  // becomes inert (the check skips citations that resolve first) and can be deleted with it.
  [
    'tools/asset-pipeline/src/decal-offset.ts',
    'NEVER existed — no git history at all. The output module Task 12 of the 2026-08-26 plan proposed; that task migrated unbuilt to master-plan item C4. The plan is a dated record of intent, not an index of the tree.',
  ],
  [
    'tools/asset-pipeline/src/decal-offset.test.ts',
    'NEVER existed — no git history. The test file for the module above, proposed and never created.',
  ],
  [
    'tools/asset-pipeline/src/weave.ts',
    'NEVER existed — no git history. The module Task 13 of the 2026-08-26 plan proposed; migrated unbuilt to master-plan item C4, and the design spec has since narrowed that unit to clamp-and-report rather than apply.',
  ],
  [
    'tools/asset-pipeline/src/weave.test.ts',
    'NEVER existed — no git history. The test file for the module above, proposed and never created.',
  ],
  [
    'tools/asset-pipeline/scripts/regress-catalogue.mjs',
    'NEVER existed — no git history. The 28-garment regression driver Task 14 of the 2026-08-26 plan proposed; the regression never ran, so its two owner decisions stay open in master-plan item C4.',
  ],
  [
    'docs/images/2026-08-26-texture-family-sweep.png',
    "NEVER existed under this name — no git history. Task 5 proposed this contact sheet and the sweep delivered a macro crop under a different name (docs/images/2026-08-26-xmilo-texture-sweep-macro.png), which the baseline document cites. The proposed name is the plan's record of intent.",
  ],
  [
    'docs/BUYER-EVIDENCE-YYYY-MM-DD.md',
    'a TEMPLATE filename, not a file — docs/BUYER-JOURNEY-PROTOCOL.md instructs the reader to create one evidence file per run date, substituting the date. Same shape as the apps/cms/.env entry above: prose that tells you to write the file cites it correctly before it exists, and it must never exist until a real session runs. Each created file gets its own index row when it lands.',
  ],
  [
    'scripts/ingest-from-archive.mjs',
    'existed; retired 2026-09-24 by owner decision and deleted with the R2 archive bucket it copied from. Cited in the PAST TENSE by apps/cms/CLAUDE.md, which says so in the same sentence.',
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
 * ⚠️ THE FENCE EXCLUSION IS LOAD-BEARING — DO NOT "FIX" IT. It looks like a hole: the
 * commands an operator runs during an incident live in fences, so a renamed script rots
 * there unwatched, which is this repo's most-repeated incident shape. Measured 2026-09-04
 * before touching it: fenced blocks across the tracked Markdown carry **537** repo-shaped
 * paths, and a naive resolver calls **30** of them missing. Nearly all are false: a fence
 * reads `cd tools/asset-pipeline && npx tsx scripts/poster-sheet.mjs`, so its paths are
 * relative to a working directory the resolver cannot know — three of the four checked by
 * hand resolve under `tools/asset-pipeline/`. The rest sit in dated session notes and
 * plans, where naming a since-deleted file is CORRECT.
 *
 * So scanning fences would add ~30 ALLOWED_ABSENT entries to suppress mostly-imaginary
 * breakage, and the one thing it would genuinely catch — a runbook command whose script
 * was renamed — is better caught by running the command. Cite the path in prose backticks
 * as well as showing it in the fence when you want it watched.
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
    // ⚠️ `.claude/worktrees/` holds OTHER BRANCHES' WORKING TREES, and walking them
    // makes this gate fail on work that is not in this branch at all. Found
    // 2026-09-04: a concurrent session in
    // `.claude/worktrees/cms-pages-audit-.../` added `packages/ui/`, its own
    // CLAUDE.md cited `packages/ui/src/tokens.css`, and this gate resolved that
    // path against THIS tree's root — where it does not exist — and failed a branch
    // that had never touched it. 245 of the repo's 517 markdown files were in
    // worktrees; the gate had been reading half its input from another branch and
    // passed only while the two trees happened to agree.
    //
    // Each worktree is checked by its own branch's CI run, where the paths resolve.
    if (entry.name === 'worktrees' && dir.endsWith('.claude')) continue
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
  // A path-scoped rule carries the same trap prose as a CLAUDE.md and must be read on
  // the same terms — added 2026-08-20 with the rule for the viewer's headers/CSP/edge
  // traps. Those traps still live in apps/viewer/CLAUDE.md (the rule points at them);
  // when they move, this line is what keeps their citations under the guard, which is
  // the failure the header above describes: splitting a memory file creates a second
  // copy of the truth, and the copy is the part that decays.
  //
  // Scoped to rules/ and NOT to all of .claude/ deliberately. That directory also holds
  // .claude/skills/README.md and .claude/agents/docs-drift.md, plus symlinks into
  // .agents/skills/, whose citations point at their own upstream repositories — so a
  // wider walk would demand a wave of exemptions for documents this repo does not own.
  const rulesDir = join(root, '.claude', 'rules')
  return all.filter((path) => {
    const name = path.slice(root.length + 1)
    if (path.endsWith('CLAUDE.md') || path.endsWith('audit-ci.jsonc')) return true
    if (path.startsWith(`${docsDir}/`)) return true
    if (path.startsWith(`${rulesDir}/`)) return true
    // PULL_REQUEST_TEMPLATE.md added 2026-08-30. It sat outside the walked set while
    // instructing every reviewer to run a list of commands and capture a URL — so its
    // citations could rot silently, and one had: it named the dead `n001` slug months
    // after that product started 404ing. A document that tells people what to run is
    // exactly the kind whose paths must resolve. ⚠️ It was listed as a bare
    // 'PULL_REQUEST_TEMPLATE.md' until 2026-09-24, and the file lives in .github/, so
    // this line matched nothing and the template was never checked: `name` is a
    // repo-relative PATH, not a file name.
    //
    // The root AGENTS.md added 2026-09-24: it is the signpost Antigravity (and any other
    // tool that does not read CLAUDE.md) follows to the CLAUDE.md files, so a path in it
    // that stopped resolving would send those tools nowhere, silently. Only the ROOT
    // file: the vendored skills under .claude/skills/ ship their own AGENTS.md, which
    // this repo does not own.
    return [
      'README.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
      'AGENTS.md',
    ].includes(name)
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

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  process.exit((await reportBrokenCitations(process.cwd())) ? 1 : 0)
}
