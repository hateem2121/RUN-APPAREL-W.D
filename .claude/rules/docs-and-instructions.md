---
paths:
  - "**/CLAUDE.md"
  - "AGENTS.md"
  - "README.md"
  - "CONTRIBUTING.md"
  - "SECURITY.md"
  - "docs/**"
  - ".claude/rules/**"
  - ".claude/agents/**"
  - ".claude/skills/**/SKILL.md"
---

# Editing documents and instruction files

The citation rules below moved from the root `CLAUDE.md` on 2026-09-26, word for word.
The sizing and loading rules are summarised from `docs/CLAUDE-MD-MAINTENANCE.md`, which
has the evidence — read it before moving prose between instruction files.

## Sizes and the trap index (gated by `apps/cms/src/claudeMd.test.ts`)

- The root `CLAUDE.md` stays **under 200 lines** (Anthropic's target). Every
  `CLAUDE.md` stays under **39,000 characters** — counted as characters, not bytes;
  `wc -c` and `wc -m` both count bytes on this Mac.
- The root indexes each nested `CLAUDE.md` that has a `## Traps` section with exactly
  one sentence of the form **"**Thirteen more traps live in `apps/cms/CLAUDE.md`**"**,
  and the number must equal that file's trap bullets. Add a trap → update the number
  in the same commit.
- A rule file with `paths:` loads only when the Read tool opens a matching file. A new
  rule does not fire in the session that created it.

## Every document is citation-checked

Every document is citation-checked, not just CLAUDE.md — README, CONTRIBUTING,
SECURITY and all of `docs/`. A genuinely-gone path goes in `ALLOWED_ABSENT`
🟡 **with the reason**; `file.ts:42` and extension-less citations resolve fine.
🟡 **A quoted setting must still be in the file its sentence names** (since
2026-09-24, `scripts/quoted-settings.mjs`): four notes kept quoting a `ci.yml` value
for three weeks after it changed, while every path they cited still resolved.
🟡 **Never cite a gitignored GENERATED directory; a citation of one broke CI.**
`public/draco/` is written at build time by `apps/viewer/scripts/copy-decoders.mjs`,
so it exists locally from an earlier build and passes for you while a clean checkout
fails. Cite the generator.
🟡 To reproduce CI's checkout, move `public/draco/` aside for the run — a local
pass with it present proves nothing, and that is what failed here twice. Note the
gate is blind to URL-shaped references: it skips anything starting with `/`, so
`/og/n001/wine.jpg` in RUNBOOK rotted unwatched through a slug rename.
🟡 **`node scripts/doc-citations.mjs` is the fast local check**: it prints each
unresolved citation and exits **1**. `apps/cms/src/claudeMd.test.ts` is the CI gate
and the authority, because only the test enforces the recursive walk and the
negative control.
🟡 **Line ranges resolve too**: the `clean =` step in `scripts/doc-citations.mjs`
strips `:42`, `:42:7` and `:42-80` alike, and checks the path, never the line. Prefer
a single line — the harness renders it as a clickable link — but a range is not a
silent failure.

A hook (`.claude/hooks/check-doc-citations.mjs`) re-runs the citation check after every
Markdown edit, so a break shows up on the edit that caused it.
