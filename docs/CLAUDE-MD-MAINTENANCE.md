# Maintaining the CLAUDE.md files

**In plain words:** How the AI instruction files are kept short, split up and loaded.

How the instruction files in this repo are sized, split and loaded. Extracted from
the root `CLAUDE.md` on 2026-08-26 because it is 5 KB that every session paid for and
only a session **editing a CLAUDE.md** needs. The root file was 42,646 characters at
the time — over the 40,000 at which Claude Code warns, and past which Anthropic's own
guidance says adherence to every rule in a file starts dropping. Removing this brought
it to 37,938.

Read this before moving prose between CLAUDE.md files, adding a path-scoped rule, or
"tidying" any of them.

Moved there 2026-08-10 when this file came within 326 chars of the size at which
Claude Code warns a memory file is too large — **a threshold it later crossed
anyway, so put new viewer, pipeline or CMS detail in the sub-file, not here.**

**The mechanics, re-measured against the docs on 2026-08-19, because two plausible
fixes do not work.** The warning fires at **40,000 characters** and the documented
target is **under 200 lines**. This file was over both on 2026-08-19 at 44,993
characters; moving the pipeline traps out brought it to ~36,000, so it is now under
the warning and still over the line target.

⚠️ **THIS SAID "treat 40,000 as the hard gate" UNTIL 2026-09-04, AND THAT NUMBER IS
1,000 TOO HIGH.** 40,000 is Claude Code's *warning*; the gate that fails CI is
**39,000** (`apps/cms/src/claudeMd.test.ts:222`), set deliberately low because a gate
firing at the ceiling fires after the harm. The argument for it was written only in
that test file, which a session editing a CLAUDE.md has no reason to open — so every
document a session actually reads stated a budget it did not have. Budget against
**39,000**, and treat the line count as the direction of travel. Measured 2026-09-04:
the root, viewer and pipeline files sat **17, 45 and 131 characters** below the gate,
i.e. under one sentence each, against the 1,184–2,127 characters/day growth the test
file records. When it fails, DEMOTE a section to `docs/` — never raise the limit. Size is not cosmetic: the docs state CLAUDE.md
is delivered as a user message after the system prompt with no guarantee of strict
compliance, and that longer files "reduce adherence" — so an oversized file makes its
own traps *less* likely to be followed. ⚠️ **`@path` imports do NOT help**: the docs
are explicit that imported files "load at launch", so an import moves bytes between
files and saves no context. What *does* work is on-demand loading: the sub-file split
above, and path-scoped rules (a `paths:` frontmatter block in a rules file under
`.claude/rules/`), which load only when Claude reads a matching file.
⚠️ **Path-scoped rules fire for a rule present at session start (measured 2026-09-05),
and since 2026-09-26 they hold traps** — nine rules took the root file's cross-cutting
traps (table at the end). The history below is how the mechanism was proven first. A rule fires when Claude *reads* a matching
file, so **creating** a new file never triggers it (anthropics/claude-code#63142).
Four upstream fixes have since shipped (symlink matching v2.1.198, an invalid pattern
no longer breaking Read v2.1.207, `--setting-sources` respected v2.1.211, the
brace-expansion startup crash v2.1.217) and the documented key **is** `paths:` — the
2026-08-19 note's worry about an undocumented `globs:` (#17204) is not what the docs
say. So the mechanism was tried: `.claude/rules/` now holds ONE rule, deliberately
**empty of traps**, as the artifact under test. Creating it mid-session and then
reading two files matching its globs produced `nested_traversal` for
`apps/viewer/CLAUDE.md` and **no `path_glob_match` at all**. That negative is
AMBIGUOUS — it shows a rule created mid-session does not fire in that session, not
that a rule present at session start fails — which is exactly why no prose moved.
✅ **The follow-up check passed on 2026-09-05.** `.claude/instructions-loaded.log` then
held **7** `path_glob_match` lines for the rule across four dates (2026-08-30, 09-03,
09-04 and twice on 09-05); the last came from a session that opened
`apps/viewer/worker/securityHeaders.ts` with the Read tool while editing
`apps/viewer/scripts/csp.mjs` — the two-directory case the rule exists for, which a
nested CLAUDE.md cannot cover. So a rule present at session start fires, and one created
mid-session does not fire in that session. The viewer's headers/CSP/edge traps have not
moved into it yet; the rule points at them in `apps/viewer/CLAUDE.md`, and moving them
means updating the root file's trap count in the same commit.
⚠️ **All on-demand loading carries one caveat**: only the project-root CLAUDE.md is
re-injected after `/compact` — nested files and path-scoped rules reload only when a
matching file is next read, so a trap that moved out of this file can be absent from a
compacted session until something touches its directory. That is the price paid for
the pipeline split above, and why each moved trap kept a one-line hook here until
2026-09-26, when the root switched to one index line per nested file.
⚠️ **AND A BASH-FIRST SESSION NEVER TRIGGERS IT AT ALL — MEASURED 2026-08-26 with the
hook below, which is what it was installed for.** `nested_traversal` fires on the
Read TOOL; `cat`, `sed` and a python heredoc do not count.
`.claude/instructions-loaded.log` is the evidence: **34 `nested_traversal` events, the most
recent 2026-09-04T04:04 — and that one WAS a Bash-first session**, so the flat "never
triggers" above is too strong. ⚠️ The sharper finding, and the one that costs you: it
fires PER DIRECTORY and unreliably. That same 2026-09-04 session wrote CMS scripts and
product data all day, edited `apps/cms/src/`, and `apps/cms/CLAUDE.md` NEVER loaded — its
five traps were satisfied by luck, not knowledge. Treat a `nested_traversal` you did not
see in the log as absent — and a session that EDITED THREE FILES
under `apps/viewer/` on 2026-08-26 logged `session_start` only. Auto mode and
bypass-permissions mode BOTH instruct Bash-first file access, so in those modes the
30 viewer, 19 pipeline and 8 CI traps moved out of this file are ALL absent, and the
claim above that the nested pattern "is the only proven one here" holds only for a
Read-tool session. Not hypothetical: that session re-derived `apps/viewer/CLAUDE.md`'s
`.env.local` trap from scratch, stash-to-baseline bisect included, which that file
records as having already cost someone the same bisect. **Working through Bash? `cat`
the sub-file for the directory you are in before you start**, and check with
`tail .claude/instructions-loaded.log`.
**Two tools worth knowing, both newer than this section's first draft:**
`/doctor` now proposes trims for a checked-in CLAUDE.md (v2.1.206+) — it cuts what
Claude can re-derive from the codebase, directory layouts and dependency lists, and
*keeps* pitfalls and rationale, which is this file's entire content model. And the
**`InstructionsLoaded` hook** logs which instruction files loaded, when, and why —
the way to verify the on-demand claims above instead of asserting them. This repo
wires one at `.claude/hooks/log-instructions-loaded.mjs`; see `docs/RUNBOOK.md`.
Free win nobody here uses yet: block-level `<!-- HTML comments -->` are stripped
before injection, so pure provenance can stay legible to humans at zero context cost.

**A quoted setting must still be in the file its sentence names (since 2026-09-24).**
A backticked `key: value` in an instruction file must appear in a file named by the same
paragraph or list item. That file can be given as `ci.yml`, as a path, or as a folder. If
the paragraph names no file, the quote must appear in some tracked file.

The instruction files checked are every CLAUDE.md, the root AGENTS.md, CONTRIBUTING.md,
README.md, the agents and rules, our own skills, and the hook messages.

`node scripts/quoted-settings.mjs` is the fast local check, and
`apps/cms/src/claudeMd.test.ts` gates it in CI.

It exists because `ci.yml` stopped cancelling runs on `main` on 2026-08-31, and four notes
kept quoting `cancel-in-progress: true` for three weeks. One of them was a hook message.
Every path they cited still resolved, so the citation gate stayed green. "Somewhere in the
repo" would have passed them too, because three other workflows still set it.

A quote that is true on purpose without a file goes in `ALLOWED_QUOTES` with its reason.
That covers error messages, measured headers and rejected settings. The check proves the
text only, not the reading: a sentence can still misread a setting it quotes correctly.

## Where the root file's rules went (2026-09-26)

The root `CLAUDE.md` was rebuilt on 2026-09-26: **550 lines and 37,375 characters became
188 lines and about 10,950**. No rule was dropped. Each one either stayed in the root in
a shorter form, or moved word for word to the place that loads when it applies. The old
file is kept at `docs/archive/agent-memory/2026-09-26-root-CLAUDE.md`.

| Old section or trap | Where it is now |
|---|---|
| What this is, the layout, the path a garment takes | Root, shorter; the layout now names `packages/ui` and `infra/apex-404` |
| 🔴 Public repository | Root |
| The gates, in CI's order; the three invisible gates | Root |
| `e2e` gates the deploy; Playwright browsers not installed | `.claude/rules/tests-and-fixtures.md` (root keeps the command) |
| Use `npx --yes pnpm@12.6.0` | Root ("The pnpm note"); `guard-bare-pnpm.mjs` enforces it |
| The CMS dev server dirties the tree; `admin.hidden` gates routes | `apps/cms/CLAUDE.md` traps (11 → 13) |
| Coverage floors are measured | `.claude/rules/tests-and-fixtures.md` |
| Module boundaries are lint-enforced | Root, one bullet |
| Every document is citation-checked | `.claude/rules/docs-and-instructions.md` |
| What `pnpm test` also checks | `.claude/rules/dependencies.md` |
| `node:sqlite` is built in | `.claude/rules/d1-migrations.md` |
| The one pattern that keeps causing incidents; negative controls | Root, short; full text in `.claude/rules/tests-and-fixtures.md` |
| 🔴 Never run the pipeline on its own output | Root; `guard-pipeline-input.mjs` enforces it |
| `PRAGMA foreign_keys=OFF` is a no-op on D1 | `.claude/rules/d1-migrations.md` |
| `apps/shrink/container` is not a workspace member; `npm ci`; uid 1000; the digest pin | `.claude/rules/shrink-container.md` (Dependabot sentence corrected) |
| Run `pnpm build` before pushing a dependency change; the `workers-types` hold; the 24h cooldown | `.claude/rules/dependencies.md` |
| `fileColours` is not in `GATED_FIELDS`; colour names read from the file | `.claude/rules/products-and-colours.md`; root keeps the QR-slug and row-order rules |
| Read `cf-cache-status` off the GET | Root, short; full incident in `.claude/rules/deploy-and-live-checks.md` |
| Cloudflare API writes with inline JSON | Root, short; `.claude/rules/deploy-and-live-checks.md` |
| The one-line teasers for `.github/`, viewer and pipeline traps | Dropped from the root; the traps themselves are unchanged in their own files, and the root indexes each file in one line |
| A CLO 7.0 export is one GLB per colourway | `.claude/rules/shrink-container.md` and `tools/asset-pipeline/CLAUDE.md` |
| A settled decision can be invisible (`.agents/`) | Root, short; the count is corrected to two skills |
| Before you change the pipeline | Root keeps "judge by the rendered print"; the procedure is in `tools/asset-pipeline/CLAUDE.md` |
| Before you delete anything in the CMS | `.claude/rules/cms-media-deletion.md` |
| Git identity; repairing commits | Root, short; full text in `.claude/rules/deploy-and-live-checks.md` |
| D1 backup and the `rxps/wine` capture | Root; `.claude/skills/deploy-preflight/` |
| The `rxps` rename and the second rename | Root, short; `.claude/rules/deploy-and-live-checks.md` |
| Do not push twice; reading a cancelled run | Root, short; `.claude/rules/deploy-and-live-checks.md` |
| The apex site and the private PDF links | Root keeps the two 🔴 lines; `.claude/rules/apex-and-private-pdfs.md` |
| Style: comments explain why | Root |
