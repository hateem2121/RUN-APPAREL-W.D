---
name: audit-memory
description: Monthly health check of every AI instruction file and the private memory index — sizes against their limits, unscoped rules, contradictions, version drift and stale notes. Reports; changes nothing without the owner's yes.
disable-model-invocation: true
allowed-tools: Bash(node .claude/skills/audit-memory/audit-memory.mjs:*) Bash(node scripts/doc-citations.mjs) Bash(node scripts/quoted-settings.mjs)
---

# /audit-memory

The owner runs this monthly (decided 2026-09-26). It keeps the instruction files small
and true, because a long or self-contradicting file is followed less reliably — two rules
that disagree make Claude pick one arbitrarily (Anthropic's memory docs).

## 1. Measure

```bash
node .claude/skills/audit-memory/audit-memory.mjs
node scripts/doc-citations.mjs
node scripts/quoted-settings.mjs
npx --yes pnpm@10.34.5 --filter @run-apparel/cms exec vitest run src/claudeMd.test.ts
```

The first prints sizes against each limit, rules without `paths:`, pinned-version drift,
any line asking Claude to show its reasoning (Opus 5.5 can refuse those), and private
notes that name a repo path that no longer exists. The other three are the repo's own
gates for citations, quoted settings and trap counts.

## 2. Look for contradictions

A script cannot tell that two sentences disagree. Read the root `CLAUDE.md`, then each
nested `CLAUDE.md` and `.claude/rules/` file, and the private `MEMORY.md` index, and list
every pair that states different facts about the same thing (a number, a version, a
"never" against an "always"). For each one, run the command or read the file that settles
it — the code wins over any note.

## 3. Find what has gone stale

- A private note that names a missing path: is the note history (fine, say so) or advice
  someone could still follow (needs a fix)?
- A rule that no session needed since the last audit: `.claude/instructions-loaded.log`
  records which files loaded, when and why.
- The root file growing: anything added since last month that only one folder needs
  belongs in that folder's rule or `CLAUDE.md`.

## 4. Report

One table: file, finding, evidence, proposed fix. Then ask the owner which fixes to make.
**Change nothing before that answer.** Private notes are the owner's: suggest, never
delete.
