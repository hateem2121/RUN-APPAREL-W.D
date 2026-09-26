---
name: doc-refresh
description: Re-check the human documents against the current code and flag drift — broken citations, stale quoted settings, unreachable docs, out-of-date versions, commands that no longer run. Optionally deep-checks the files named. Reports; edits only with the owner's yes.
argument-hint: "[file.md ...]"
disable-model-invocation: true
allowed-tools: Bash(node scripts/doc-citations.mjs) Bash(node scripts/quoted-settings.mjs) Bash(node scripts/check-docs-index.mjs) Bash(node .claude/skills/audit-memory/audit-memory.mjs:*)
---

# /doc-refresh

Documents here rot in a known way: a path moves, a setting changes, a version is bumped,
and the sentence that described it keeps reading correctly (`docs/CLAUDE-MD-MAINTENANCE.md`
has the history). This skill finds that drift.

## 1. The mechanical checks

```bash
node scripts/doc-citations.mjs        # every cited path still exists
node scripts/quoted-settings.mjs      # every quoted `key: value` is still in its file
node scripts/check-docs-index.mjs     # every maintained doc is reachable from docs/README.md
node .claude/skills/audit-memory/audit-memory.mjs --drift-only   # pinned versions
```

## 2. The claims a script cannot check

For each file in `$ARGUMENTS` (or, with no argument, `README.md`, `CONTRIBUTING.md`,
`SECURITY.md` and every file `docs/README.md` lists under "Do a thing"):

- **Commands.** Does every command in a code block still exist? Check `package.json`
  scripts and the named files; do not run anything that deploys, writes to production or
  costs money.
- **Numbers and versions.** Compare each against the file it came from
  (`package.json`, `.github/workflows/ci.yml`, `wrangler.jsonc`).
- **Dated statements.** "Since 2026-…" and "measured on …" are records, not claims to
  re-verify; everything else is a claim about now.
- **Brand facts.** RUN APPAREL is supplier-level certified: no page may state or imply a
  direct brand certification.

Mark anything you cannot verify `<!-- TODO: verify -->` in your proposal. Never invent a
fact to fill a gap.

## 3. Report

A table: document, line, what it says, what is true, evidence. Ask the owner before
editing; for a fix, keep the document's reading level (`/5th-grade-check` it after).
