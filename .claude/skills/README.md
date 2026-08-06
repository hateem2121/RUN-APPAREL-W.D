# Vendored agent skills

Third-party skills, **copied in and pinned to a commit** rather than installed.

## Why vendored instead of `npx skills add`

1. **Reviewable.** They arrive in a pull-request diff like any other change. A skill
   is injected into an agent's context and shapes what it does, so it deserves at
   least as much review as code.
2. **Pinned.** An installer re-resolves to whatever upstream is today. These are
   fixed at the SHAs below and move only when someone changes them here.
3. **Scoped to this project.** `npx impeccable install` and friends write into 15+
   agent directories (`.cursor`, `.codex`, `.gemini`, `.trae`, …). Nothing here
   needs that.
4. **It does not recreate the mess we just cleaned up.** On 2026-08-06 an audit
   found 57 user-level skills in `~/.claude/skills`, **all 57 disabled**, 432 MB on
   disk. Global installs accumulate and go stale silently; a vendored copy in the
   repo is visible to everyone and dies with the branch if it turns out to be
   useless.

## What is here

| Skill | Source | Licence |
|---|---|---|
| `performance-optimization` | `addyosmani/agent-skills` @ `f03b4a84b08b` | MIT |
| `observability-and-instrumentation` | `addyosmani/agent-skills` @ `f03b4a84b08b` | MIT |
| `emil-design-eng` | `emilkowalski/skills` @ `de33dbed0002` | MIT |
| `review-animations` | `emilkowalski/skills` @ `de33dbed0002` | MIT |

Fetched 2026-08-06. Both upstreams were active that week (82.2k ⭐ and 26.0k ⭐,
last pushed 2026-08-05).

## Why these four, and not the other 29

Most of what those two repos offer duplicates something already here:
`/code-review` and the `code-reviewer` agent, `/simplify`, `/commit`, and the
built-in planning and debugging skills. These four map to gaps that were actually
measured during the audit:

- **`performance-optimization`** — the viewer ships a **27 MB GLB to a phone over
  mobile data**, and the only performance gate is a Lighthouse assertion that
  *warns* at `minScore 0.5` and blocks nothing.
- **`observability-and-instrumentation`** — Sentry and a diagnostics digest exist,
  but no written practice for using them.
- **`emil-design-eng` / `review-animations`** — the viewer imports `motion` and
  `lenis` and has a hand-built token system; animation is real code here. Treat
  these as an **advisor, not a gate**: they encode one person's taste, and where
  they disagree with `docs/DESIGN.md`, DESIGN.md wins.

## Removed: `browser-testing-with-devtools`

Vendored 2026-08-06, **dropped the same day**. Its own frontmatter says it
*"requires the chrome-devtools MCP server to be configured"*, and this setup does
not have that server — it has the in-app Browser pane and Claude-in-Chrome. It was
kept for a few hours "for the method", with the mismatch written down.

That was the wrong call, and the reason is the same one the rest of this repo keeps
learning: **a skill is an instruction, not a document.** It is injected into the
agent's context and tells it to call tools by name. Naming tools that do not exist
does not degrade to "use the equivalent" — it spends context teaching a vocabulary
that cannot be spoken here, and the most likely outcome is an agent reporting that
it cannot verify something it had a perfectly good way to verify.

The method itself (check console, network and DOM before declaring a fix works) is
already the house style — see the verification workflow the Browser pane tools
carry, and `docs/QA-CHECKLIST.md`. Nothing was lost by removing the file.

If a `chrome-devtools` MCP server is ever configured here, re-vendor it at a fresh
SHA rather than resurrecting this note.

## Scanned before committing

Checked for network/exfil calls, credential access, and instruction-override
patterns. The only matches were the skills instructing the agent *not* to do those
things — e.g. `emil-design-eng` telling it not to invent design tokens, which is
the right default.

## Updating

Re-fetch at a new SHA and update the table in the same commit. Do not edit the
vendored files in place — a local edit that upstream does not have is
indistinguishable from drift.

**Review by 2026-11-06 (three months).** Not a rule about staleness — pinned files
do not rot — but about *relevance*: point 4 above describes 57 skills that nobody
ever decided to remove, and the only thing that stops this table becoming that is
a date on which someone has to justify each row again. Either bump the SHAs and
move this date, or delete the rows that no longer earn their place.
