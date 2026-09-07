# docs/ — the full index

The [root README](../README.md) links the dozen documents you need for a *task*
("I want to deploy", "I want to upload a garment"). This file lists **everything**,
including the records the task table deliberately leaves out.

It exists because 13 of the 34 documents here were reachable from nothing *at the
time it was written*. A document nobody can find is a document nobody maintains — and
this repository keeps a lot of hard-won measurement in prose, so losing track of it is
expensive. The folder has grown a long way past 34 since; see **How much of this is a
record** below for what that growth actually is.

⚠️ **Point the root README's task table at THIS file rather than growing the table.**
The table answers "what do I do now"; this answers "what exists". Mixing the two is
how the table got to sixteen rows and still missed a third of the folder.

---

## How much of this is a record — audit FA-T-12

The audit of 2026-09-06 reported "6.45 MB of prose against 1.48 MB of source" and scored
it 5, as documentation outgrowing the thing it documents by more than four times.

⚠️ **The ratio is real and the comparison is not.** Measured 2026-09-07 over tracked
files:

| | files | size |
|---|---|---|
| **Records** — write-once, never maintained | 63 | **4.48 MB** |
| **Tooling manifests** — `.claude/`, `.agents/`, `.github/` | 135 | 0.63 MB |
| **Maintained documentation** — everything else | 47 | **0.80 MB** |
| Source (`.ts` `.tsx` `.mjs` `.js` `.css`) | | 4.27 MB |
| *of which tests* | | *1.77 MB* |

So the prose a person is expected to keep true is **0.80 MB against 4.27 MB of source**
— under a fifth, not four times over. The 4.48 MB is six audit runs, eighteen plans and
specs, and one investigation: each written on a date, about a state of the world on that
date, and correct to leave exactly as it is. Editing one to keep it "current" would
destroy the only thing it is for. The 0.63 MB of manifests is addressed by name by the
tooling and read by a person about never.

**Records live in:** `docs/AUDIT-*.md`, `docs/audit-2026-08-30/`,
`docs/audit-2026-08-30-pm/`, `docs/superpowers/plans/`, `docs/superpowers/specs/`,
`investigation/`, `PLAN-IN-PROGRESS.md` and `NEXT-SESSION-PROMPT.md`. Nothing in those
trees is indexed file-by-file below, deliberately — an eighteen-row table of superseded
plans would bury the eight documents somebody actually needs. They are reachable through
the audit or plan that owns them.

**Everything outside those paths is maintained**, is citation-checked by
`scripts/doc-citations.mjs`, and belongs in the tables below.

⚠️ **And that is now enforced.** `scripts/check-docs-index.mjs` fails if a maintained
document is reachable from nothing — which is the thing this file's own opening paragraph
says matters and which had been fixed by hand twice. The list of what counts as a record
lives in that script, with a warning about the one way it can be abused: a path added to
the exclusion list silently stops being checked.

---

## Do a thing

| I want to… | Read |
|---|---|
| Run this locally for the first time | [ONBOARDING.md](ONBOARDING.md) |
| Upload a garment and get it live | [FIRST-GARMENT-UPLOAD.md](FIRST-GARMENT-UPLOAD.md) |
| Set up Cloudflare from scratch | [CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) |
| Deploy, migrate, rotate a secret, fix something live | [RUNBOOK.md](RUNBOOK.md) |
| Deploy without a command line | [DEPLOY-BY-CLICKING.md](DEPLOY-BY-CLICKING.md) |
| Back up or restore the database | [BACKUP-RESTORE.md](BACKUP-RESTORE.md) |
| Check the site before announcing | [QA-CHECKLIST.md](QA-CHECKLIST.md) |
| Understand the raw-upload → shrink pipeline | [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md) |

## Decisions — settled, with the reasoning

Read these **before** re-researching a question. Each exists because the question
recurs and costs an afternoon each time it is answered from scratch.

| Decision | File |
|---|---|
| UI libraries — and why not Tailwind | [DECISION-UI-LIBRARIES.md](DECISION-UI-LIBRARIES.md) |
| Zaraz and Log Explorer — both declined | [DECISION-ZARAZ-AND-LOG-EXPLORER.md](DECISION-ZARAZ-AND-LOG-EXPLORER.md) |
| Why the 90-day backup artifact stays | [DECISION-BACKUP-RETENTION.md](DECISION-BACKUP-RETENTION.md) |
| Dependency versions held back on purpose | [DEPENDENCY-HOLDS.md](DEPENDENCY-HOLDS.md) |
| The viewer's locked design system | [DESIGN.md](DESIGN.md) |

## Reference

| Topic | File |
|---|---|
| Why anything is built the way it is | [HARDENING-LOG.md](HARDENING-LOG.md) |
| Damaged printed artwork — the open issue | [OPEN-ISSUE-ARTWORK.md](OPEN-ISSUE-ARTWORK.md) |
| The CSP violation and Bot Fight Mode | [VIEWER-CSP-BOT-FIGHT-MODE.md](VIEWER-CSP-BOT-FIGHT-MODE.md) |
| Measured baseline for the whole garment catalogue | [GARMENT-CATALOGUE-BASELINE.md](GARMENT-CATALOGUE-BASELINE.md) |
| How the AI agent tooling is wired | [AI-TOOLING.md](AI-TOOLING.md) |
| Maintaining the CLAUDE.md files (size limits, what goes where) | [CLAUDE-MD-MAINTENANCE.md](CLAUDE-MD-MAINTENANCE.md) |

## Audits and scorecards

Point-in-time assessments. **Read the date first** — an audit is a measurement of
one day, and several of their findings have since been fixed, refuted or reversed.

| Date | File |
|---|---|
| 2026-08-30 — Cloudflare + GitHub, 211 findings | [AUDIT-2026-08-30-CLOUDFLARE-AND-GITHUB.md](AUDIT-2026-08-30-CLOUDFLARE-AND-GITHUB.md) |
| 2026-08-17 | [AUDIT-2026-08-17.md](AUDIT-2026-08-17.md) |
| 2026-08-14 | [AUDIT-2026-08-14.md](AUDIT-2026-08-14.md) |
| 2026-08-13 — scorecard | [SCORECARD-2026-08-13.md](SCORECARD-2026-08-13.md) |
| 2026-08-08 — scorecard | [SCORECARD-2026-08-08.md](SCORECARD-2026-08-08.md) |

## Session logs

Narrative records of expensive debugging, kept because re-deriving them costs days.
Newest first.

| Date | What it covers |
|---|---|
| [2026-08-28](SESSION-2026-08-28.md) | CLO export settings and the catalogue census |
| [2026-08-27](SESSION-2026-08-27.md) | The garment flicker, and what it actually was |
| [2026-08-06](SESSION-2026-08-06.md) | The cached 404 — HEAD said 200 while GET said 404 |
| [2026-08-05](SESSION-2026-08-05.md) | Artwork damage: found, rendered, fixed |
| [2026-08-04](SESSION-2026-08-04.md) | Pipeline tuning |
| [2026-08-03](SESSION-2026-08-03.md) | Every published colour name was wrong |
| [2026-07-31](SESSION-2026-07-31.md) | Why fixtures that cannot fail keep letting bugs through |
| [2026-07-29](SESSION-2026-07-29.md) | The first real garment; five bugs; a data-loss incident |
| [2026-07-28](SESSION-2026-07-28.md) | Texture-aware decimation; CI token scope |
| [2026-07-27](SESSION-2026-07-27.md) | Why raw uploads never worked |

## Audit working files

The two Cloudflare + GitHub audits each keep their evidence beside the report, so a
claim can be checked rather than believed. **These are working material, not
guidance** — read the report, and come here only to verify something in it.

| What | Where |
|---|---|
| The 2026-08-30 **PM** report — 358 checks, 21 lanes, the one being remediated | [AUDIT-2026-08-30-PM-CLOUDFLARE-AND-GITHUB.md](AUDIT-2026-08-30-PM-CLOUDFLARE-AND-GITHUB.md) |
| That report split into readable sections (`01-the-short-version` … `16-appendix`) | [audit-2026-08-30-pm/sections/](audit-2026-08-30-pm/sections/) |
| **The remediation tracker — every finding, its status and its evidence** | [audit-2026-08-30-pm/WORKLIST.md](audit-2026-08-30-pm/WORKLIST.md) |
| Instruments that reported clean while measuring nothing (D1–D7) | [audit-2026-08-30-pm/INSTRUMENT-DEFECTS.md](audit-2026-08-30-pm/INSTRUMENT-DEFECTS.md) |
| Live Cloudflare changes made during remediation, with rollback JSON | [audit-2026-08-30-pm/CLOUDFLARE-LIVE-CHANGES.md](audit-2026-08-30-pm/CLOUDFLARE-LIVE-CHANGES.md) |
| Where to pick the work back up | [audit-2026-08-30-pm/RESUME.md](audit-2026-08-30-pm/RESUME.md) |
| The earlier 2026-08-30 **AM** audit and its evidence | [AUDIT-2026-08-30-CLOUDFLARE-AND-GITHUB.md](AUDIT-2026-08-30-CLOUDFLARE-AND-GITHUB.md) · [audit-2026-08-30/EVIDENCE-firsthand.md](audit-2026-08-30/EVIDENCE-firsthand.md) · [audit-2026-08-30/APPENDIX-generated.md](audit-2026-08-30/APPENDIX-generated.md) · [audit-2026-08-30/CLOUDFLARE-LIVE-CHANGES.md](audit-2026-08-30/CLOUDFLARE-LIVE-CHANGES.md) |

⚠️ **`audit-2026-08-30-pm/sections/13-do-not-change.md` is the one to read before
"tidying" anything.** It lists 153 things that were checked and found CORRECT,
several of which look wrong and are deliberate.

## Plans and specs

Written before the work, kept after it. A plan says what was intended; the matching
spec says how it was designed. They are **historical records** — where a plan and the
code disagree, the code is right and the plan simply landed differently.

| What | Where |
|---|---|
| Every implementation plan (CMS UX redesign, audit remediations, CI sizing, viewer layout, garment-pipeline defects) | [superpowers/plans/](superpowers/plans/) |
| The design spec behind each of those plans | [superpowers/specs/](superpowers/specs/) |
| A post-merge review kept as a worked example | [reviews/2026-08-12-post-merge-8927062.md](reviews/2026-08-12-post-merge-8927062.md) |
| **In-progress** plans live at the repository ROOT, not here — see the README | [../README.md](../README.md) |

## Not in this folder

| What | Where |
|---|---|
| Traps that have cost sessions — **read first** | [../CLAUDE.md](../CLAUDE.md) |
| How to contribute, and the full gate list | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Reporting a security problem (**not** an issue) | [../SECURITY.md](../SECURITY.md) |
| Processing a GLB by hand | [../tools/asset-pipeline/README.md](../tools/asset-pipeline/README.md) |
| Per-area traps | `apps/*/CLAUDE.md`, `.github/CLAUDE.md`, `tools/asset-pipeline/CLAUDE.md` |

## Added since this index was last swept

⚠️ **A document that is reachable from nothing is a document nobody maintains**, which is
the reason this file exists at all. The audit found ten here (FA-T-06) — every one written
after the last sweep, which is exactly how the previous thirteen went missing. Adding a
document and not adding its row is the failure this section is named for.

| Document | What it is |
|---|---|
| [AUDIT-BETA-WEBSITE-2026-09-06.md](AUDIT-BETA-WEBSITE-2026-09-06.md) | The full-site audit: 236 scored checks across both surfaces, with the four false findings it caught in itself |
| [AUDIT-PRODUCT-PAGES-2026-09-04.md](AUDIT-PRODUCT-PAGES-2026-09-04.md) | Product-page audit — and the three first-draft findings its own controls killed |
| [AUDIT-PRODUCT-PAGES-2026-09-05.md](AUDIT-PRODUCT-PAGES-2026-09-05.md) | Product-page audit, second pass |
| [AUDIT-SITE-PAGES-2026-09-05.md](AUDIT-SITE-PAGES-2026-09-05.md) | The marketing pages, before the beta-website work |
| [CUSTOMISATION-COPY-2026-09-04.md](CUSTOMISATION-COPY-2026-09-04.md) | The owner’s American-spelling decision, and the copy it governs |
| [DECISION-AR-SCOPE.md](DECISION-AR-SCOPE.md) | Why there is no AR mode |
| [DECISION-OFFLINE-SCOPE.md](DECISION-OFFLINE-SCOPE.md) | How far offline support goes, and why it stops there |
| [DECISIONS-BETA-WEBSITE.md](DECISIONS-BETA-WEBSITE.md) | The fourteen decisions taken before the beta launch — read this before "fixing" anything that looks odd |
| [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | The things only the owner can do, and what is already done |
| [PIPELINE-INVESTIGATION-2026-09-01.md](PIPELINE-INVESTIGATION-2026-09-01.md) | The pipeline investigation of 2026-09-01 |
