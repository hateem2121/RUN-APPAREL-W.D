---
paths:
  - "apps/viewer/worker/**"
  - "apps/viewer/scripts/**"
  - "apps/viewer/public/**"
---

# Viewer headers, CSP and the edge

⚠️ **THIS RULE IS UNDER TEST AND CARRIES NO TRAPS YET. Do not add any until the
check below passes.** The viewer's headers/CSP/edge traps are still where they have
always been, in `apps/viewer/CLAUDE.md`. Read them there.

## Why a rule and not a nested CLAUDE.md

The seven headers/CSP/edge traps do not cleave along directory lines. `_headers` is
*generated* — it exists only at `apps/viewer/dist/_headers`, written by
`apps/viewer/scripts/gen-headers.mjs` — while the half that answers for it lives in
`apps/viewer/worker/securityHeaders.ts`. A nested CLAUDE.md keys on ONE directory,
so whichever directory it sat in, it would stay silent while you edited the other
half. A `paths:` glob is the only mechanism here that covers both.

That is why `apps/viewer/CLAUDE.md` is 450 lines against a documented ~200-line
target: its largest cluster cannot be split by directory.

## What was measured, 2026-08-20 — and why the traps did NOT move

The root `CLAUDE.md` requires measuring before adopting this mechanism. Measured:

- This file was created mid-session, then `apps/viewer/worker/securityHeaders.ts`
  and `apps/viewer/scripts/gen-headers.mjs` were both opened with the Read tool.
- `.claude/instructions-loaded.log` recorded **`nested_traversal apps/viewer/CLAUDE.md`**
  — so the `InstructionsLoaded` hook works and the Read tool is the right trigger —
  and **no `path_glob_match` at all**.

⚠️ **That is an AMBIGUOUS negative, and the ambiguity is the finding.** It shows a
rule created mid-session does not fire in that session. It does **not** show that a
rule present at session start fails. The upstream docs say rules "load into context
every session or when matching files are opened", which is consistent with a
startup registry this file was not yet in.

**The check, for the next session in this repo** — ten seconds, no setup:

1. Open `apps/viewer/worker/securityHeaders.ts` with the **Read tool** (not `cat`;
   a shell command does not trigger the hook).
2. `grep path_glob_match .claude/instructions-loaded.log`

**If it fires:** move the seven traps here verbatim from `apps/viewer/CLAUDE.md`
— the block beginning "The CSP violation on every page load is Bot Fight Mode" and
ending "A build-time CSP cannot cover an edge-injected script" — leave a hook line
behind, and change the root file's count from twenty-three to sixteen.
`apps/cms/src/claudeMd.test.ts` verifies that count.

**If it does not fire:** delete this file and the `.claude/rules` line in
`documentsToCheck` at `scripts/doc-citations.mjs`, and record in the root
`CLAUDE.md` that the mechanism was measured twice and does not work here. Do not
fall back to a nested CLAUDE.md under one of the two directories — that is the
coverage loss this rule exists to avoid, and half these traps govern
`apps/viewer/scripts/`.

⚠️ Whatever the outcome: like a nested CLAUDE.md, a rule is **not re-injected after
`/compact`**. It reloads only when a matching file is next read.
