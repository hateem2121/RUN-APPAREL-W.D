---
name: gates
description: Run this repo's CI gates locally, in CI's order, stopping at the first failure. Use before pushing anything, and after any dependency change.
argument-hint: "[--from <gate>] [--list]"
disable-model-invocation: true
allowed-tools: Bash(node .claude/skills/gates/run-gates.mjs:*)
---

# Run the gates

**The owner starts this.** It is the slowest thing in the repo and should be a
deliberate choice, not something that fires on its own — hence the frontmatter.

```bash
node .claude/skills/gates/run-gates.mjs
```

Pass `--from <gate>` to resume after fixing one, `--list` to see the order without
running anything.

## Why a script owns the order

Three gates are invisible from the workspace, which is why "it passed locally" has
failed twice here:

- `apps/shrink/container` is not a pnpm workspace member, so `pnpm -r` skips it.
- `eval:artwork` runs in a CI job of its own.
- `check-bundle-budget` reads the viewer's build output, so it exits 1 for the wrong
  reason unless `build` ran first.

The script also runs the `.claude/` guard tests, which CI does **not** — `.claude/`
is not a workspace package, so vitest never sees them and nothing else runs them.

## When a gate fails

Report the failure and stop. Do not re-run the whole sequence to "check"; use
`--from <gate>`.

Two failures mean something other than what they say, and the PostToolUseFailure
hook will surface both automatically:

- `Timed out waiting 120000ms from config.webServer` — a bare `pnpm` exiting 127
  inside a child process. Use `npx --yes pnpm@12.6.0` before reading any code.
- `npm ci` failing at `container-install` — the second lockfile in
  `tools/asset-pipeline`, which no workspace tooling maintains.

**Never lower a coverage floor to go green.** They are measured, not chosen.
