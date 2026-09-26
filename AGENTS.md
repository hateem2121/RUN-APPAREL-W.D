# AGENTS.md

The rules for AI coding tools working in this repository. Claude Code reads `CLAUDE.md`
directly and skips this file whenever a `CLAUDE.md` exists; Antigravity and other tools
read this one.

The main rules are the root `CLAUDE.md`, included below with Antigravity's
`@[label](path)` include, so there is one copy and it cannot drift. The expanded file is
about 12 KB, inside Antigravity's 24,000-byte limit for a rule file (the root stays under
200 lines, which keeps it there).

@[The root CLAUDE.md](CLAUDE.md)

Where those rules name a Claude Code feature (hooks, skills, path rules in
`.claude/rules/`, `/compact`, the Read tool), the rule still applies to you. Only the
mechanism is Claude's: read the named file yourself when you work in its area.

Before you change anything in these folders, also read their own rules:

| When you work in        | Also read                        |
| :---------------------- | :------------------------------- |
| `apps/cms/`             | `apps/cms/CLAUDE.md`             |
| `apps/viewer/`          | `apps/viewer/CLAUDE.md`          |
| `tools/asset-pipeline/` | `tools/asset-pipeline/CLAUDE.md` |
| `.github/`              | `.github/CLAUDE.md`              |
