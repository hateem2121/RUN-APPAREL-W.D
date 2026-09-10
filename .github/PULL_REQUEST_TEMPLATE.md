## What this changes

<!-- One or two sentences. What moved, and why. -->

## Why

<!-- The problem or incident that motivated it. If a number changed, say what
     measurement justifies the new value — "it passed" is not a justification
     for a threshold. -->

## Gates run locally

`pnpm` below means `npx --yes pnpm@10.34.5` — bare `pnpm` exits 127 here.

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:coverage` ← NOT `pnpm test`: vitest only evaluates the coverage
      floors when coverage is on, so the bare runner enforces none of them
- [ ] `bash scripts/test-alert-shell.sh`
- [ ] `pnpm --filter @run-apparel/viewer test:e2e` ← its OWN required check since
      2026-08-20, and the slowest gate in CI (~7 min there, ~45 s locally)
- [ ] `pnpm seed:assets && pnpm build` ← the one that catches dependency breaks
- [ ] `node scripts/check-bundle-budget.mjs`
- [ ] `pnpm eval:artwork`
- [ ] `cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit`
      ← not a workspace member; `pnpm -r` skips it

## Risk checklist

Tick only what applies. Each line is here because it has already gone wrong.

- [ ] **Touches a migration** — I ran `apps/cms/src/migrationReplay/replay.test.ts`,
      and I added nothing but migrations to `apps/cms/src/migrations/`.
- [ ] **Touches the asset pipeline** — I started from the raw CLO export, not from
      pipeline output, and I looked at a rendered crop rather than the file size.
- [ ] **Changes a decimation or artwork threshold** — I attached the rendered
      before/after that justifies the new number.
- [ ] **Touches `_headers`, CSP or the viewer Worker** — I checked both halves:
      asset-served *and* Worker-built responses.
- [ ] **Changes a dependency** — I ran `pnpm build`, not just typecheck and tests,
      and I checked whether `tools/asset-pipeline/package-lock.json` (npm's second
      lockfile, read only by the Docker build) needs regenerating.
- [ ] **Adds a Media relationship** — I updated *both* `isMediaReferenced` and
      `REFERENCE_PATHS` in `scripts/find-orphan-media.mjs`. One of them deletes files.
- [ ] **Changes a workflow** — permissions are still least-privilege and every
      `uses:` is still SHA-pinned (`workflowHardening.test.ts` will tell me).

## Deploy impact

- [ ] This merges to `main` and therefore **deploys to production**. I have taken
      a D1 backup and captured `GET /api/public/viewer/rxps/wine`.
      See `.claude/skills/deploy-preflight/`.
- [ ] No deploy impact (docs, tests, or tooling only).

## Evidence

<!-- Paste the output that proves it works: the failing-then-passing test, the
     measured numbers, the screenshot. "Should be fine" is not evidence. -->
