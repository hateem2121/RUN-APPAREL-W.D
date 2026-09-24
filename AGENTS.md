# AGENTS.md

This project's rules live in its `CLAUDE.md` files. They apply to
every AI coding tool, not only Claude Code, so read them even
though their name says "Claude".

This file only points at them. It does not copy them, because a
copy goes stale, and Antigravity cuts any rule file off at 24,000
bytes, which is smaller than the root `CLAUDE.md`.

Before you change anything:

1. Read `CLAUDE.md` at the repository root.
2. Then read the `CLAUDE.md` of the folder you are about to change:

| When you work in        | Also read                        |
| :---------------------- | :------------------------------- |
| `apps/cms/`             | `apps/cms/CLAUDE.md`             |
| `apps/viewer/`          | `apps/viewer/CLAUDE.md`          |
| `tools/asset-pipeline/` | `tools/asset-pipeline/CLAUDE.md` |
| `.github/`              | `.github/CLAUDE.md`              |

Where those files describe a Claude Code feature (hooks, skills,
subagents, `/compact`), the rule still applies to you. Only the
mechanism is Claude's.
