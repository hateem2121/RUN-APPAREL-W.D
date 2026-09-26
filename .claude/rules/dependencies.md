---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "pnpm-lock.yaml"
---

# Changing a dependency

Moved from the root `CLAUDE.md` on 2026-09-26, word for word except where marked.
`docs/DEPENDENCY-HOLDS.md` holds the history behind each hold.

- **Run `pnpm build`, not just typecheck and tests, before pushing a dependency
  change.** `apps/cms` was pinned to TypeScript 6 until 2026-08-12 — Next.js 16.2.12
  refused TS 7 outright; RESOLVED by 16.3.0. The lesson is not about TypeScript:
  `tsc --noEmit` passed on 7 the whole time it was broken, so `pnpm typecheck` was
  green and **only `pnpm build` failed.**
- **`@cloudflare/workers-types` is HELD at `5.20260804.1` — for `apps/shrink` ONLY,
  since 2026-08-29.** Every release from `5.20260808.1` on fails that package's typecheck
  with `Property 'readUInt32LE' does not exist on type 'NonSharedBuffer'` x3 plus one
  arity error — **all four in one 15-line function**, `readGlbGenerator`
  (`tools/asset-pipeline/src/validate.ts:45`). Re-measured on `5.20260925.1` (2026-09-26): still
  broken, so the hold stands where it applies.
  **It applies nowhere else.** `apps/cms` and `apps/viewer` run `5.20260925.1` (raised 2026-09-26) and
  typecheck clean; the hold had frozen 24 days of updates across both for a fault
  neither has. It surfaces only in `apps/shrink` because that package sets
  `"types": ["@cloudflare/workers-types"]` with no node types, and its tsconfig reaches
  `validate.ts` transitively — `container/report.ts` imports `SIZE_WARNING_BYTES` from it
  as a **value**. `tools/asset-pipeline` checks the same file and passes, because it sets
  `"types": ["node"]`. `@types/node` looks like the culprit and is not.
  🟡 **Bisect; do not revert the plausible one.** The split is deliberate and pinned by
  `dependencyPolicy.test.ts`, which asserts the hold in `apps/shrink` AND asserts it has
  not widened again. wrangler 4.140.0 wants `^5.20260923.1`; `apps/cms` and `apps/viewer`
  were raised to `5.20260925.1` on 2026-09-26 and satisfy it, so only `apps/shrink` still
  shows the unmet-peer warning — and that one is the real hold. **Do not "fix" shrink's by raising workers-types**, which
  trades it for the real break.
  Releasing it does not need Cloudflare: move `SIZE_WARNING_BYTES` and `GlbReport` into a
  node-free module and `readGlbGenerator` stops being reachable. History and the re-test:
  `docs/DEPENDENCY-HOLDS.md`.
- **🟡 The 24h cooldown blocks a bump SILENTLY, and `--latest` is the wrong tool.**
  `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`. A too-fresh version is not
  an error — `pnpm update -r <pkg> --latest` **exits 0 and leaves the old version
  in place**, which reads as "the bump did nothing". Measured 2026-08-12: asked for
  wrangler `--latest`, got 4.120.1 back, no warning.
  To release one deliberately: **one-off `--config.minimumReleaseAge=0` on the
  command line, and pin the exact version** — never add an application dep to
  `minimumReleaseAgeExclude`, which is for build-toolchain binaries (lightningcss,
  esbuild) only. **Pin, because `--latest` reaches past what you audited:** with the
  cooldown off it jumped to wrangler 4.122.0 — published 1.1h earlier, unaudited,
  and raising the workers-types peer floor (above).
  **Run a supply-chain audit in place of the wait**, as b90ba70 did for Payload: npm
  bulk advisory API, publisher is GitHub Actions OIDC rather than a personal token,
  **signed provenance attestation present**, **no install script**, and an unchanged
  dependency list. Provenance + no-install-script is the actual threat the cooldown
  absorbs, so that substitution is real rather than a formality.
- **`pnpm test` also checks** the npm lockfile sync (the second lockfile —
  `.claude/rules/shrink-container.md`), the SBOM licence
  policy, that no two workspaces declare different versions of a shared dependency,
  and that `docs/RUNBOOK.md`'s rollback commands name the real Workers and the
  installed wrangler. That last one found the runbook pinned `wrangler@4.114.0`
  while the repo ran 4.122.0. *(2026-09-26: "(above)" became the rule file's name.)*
- `tools/asset-pipeline` has its own npm lockfile that only Docker reads; bumping that
  package means regenerating it — the procedure is in `tools/asset-pipeline/CLAUDE.md`.
  *(Added 2026-09-26 as a signpost; not moved text.)*
