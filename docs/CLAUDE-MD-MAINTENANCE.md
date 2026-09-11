# Maintaining the CLAUDE.md files

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
**39,000** (`apps/cms/src/claudeMd.test.ts:199`), set deliberately low because a gate
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
⚠️ **Path-scoped rules are NOT yet trustworthy for anything load-bearing — measured
again 2026-08-20 and STILL not adopted.** A rule fires when Claude *reads* a matching
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
**The ten-second check and both branches are written at the top of that rule file.
Run it before adding anything there.** Until it passes, the nested CLAUDE.md pattern
(`.github/`, `tools/asset-pipeline/`, `apps/cms/`) is the only proven one here.
⚠️ **All on-demand loading carries one caveat**: only the project-root CLAUDE.md is
re-injected after `/compact` — nested files and path-scoped rules reload only when a
matching file is next read, so a trap that moved out of this file can be absent from a
compacted session until something touches its directory. That is the price paid for
the pipeline split above, and why each moved trap kept a one-line hook here.
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
