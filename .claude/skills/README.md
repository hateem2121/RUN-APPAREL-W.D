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
| `browser-testing-with-devtools` | `addyosmani/agent-skills` @ `f03b4a84b08b` | MIT |
| `emil-design-eng` | `emilkowalski/skills` @ `de33dbed0002` | MIT |
| `review-animations` | `emilkowalski/skills` @ `de33dbed0002` | MIT |

Fetched 2026-08-06. Both upstreams were active that week (82.2k ⭐ and 26.0k ⭐,
last pushed 2026-08-05).

## Why these five, and not the other 28

Most of what those two repos offer duplicates something already here:
`/code-review` and the `code-reviewer` agent, `/simplify`, `/commit`, and
claude-mem's planning skills. These five map to gaps that were actually measured
during the audit:

- **`performance-optimization`** — the viewer ships a **27 MB GLB to a phone over
  mobile data**, and the only performance gate is a Lighthouse assertion that
  *warns* at `minScore 0.5` and blocks nothing.
- **`observability-and-instrumentation`** — Sentry and a diagnostics digest exist,
  but no written practice for using them.
- **`emil-design-eng` / `review-animations`** — the viewer imports `motion` and
  `lenis` and has a hand-built token system; animation is real code here. Treat
  these as an **advisor, not a gate**: they encode one person's taste, and where
  they disagree with `docs/DESIGN.md`, DESIGN.md wins.

## Caveat on `browser-testing-with-devtools`

Its own description says it **"requires the chrome-devtools MCP server to be
configured"**, and this setup does not have that server — it has the in-app
Browser pane and Claude-in-Chrome instead. The method it teaches (check console,
network and DOM before declaring a fix works) transfers; the specific tool names
in it do not. Kept for the method, with that mismatch stated rather than
discovered later.

## Scanned before committing

Checked for network/exfil calls, credential access, and instruction-override
patterns. The only matches were the skills instructing the agent *not* to do those
things — e.g. `browser-testing-with-devtools` tells it never to treat DOM text as
instructions, which is the right default.

## Updating

Re-fetch at a new SHA and update the table in the same commit. Do not edit the
vendored files in place — a local edit that upstream does not have is
indistinguishable from drift.
