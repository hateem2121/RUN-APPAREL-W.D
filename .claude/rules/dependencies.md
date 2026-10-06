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
- **🟡 `apps/shrink` must never reach `tools/asset-pipeline/src/validate.ts`, not even with
  `import type`.** That package typechecks `container/report.ts` under
  `"types": ["@cloudflare/workers-types"]` with no node types, and every workers-types release
  from `5.20260808.1` on fails `validate.ts`'s `readGlbGenerator` there with
  `Property 'readUInt32LE' does not exist on type 'NonSharedBuffer'` x3 plus one arity error.
  That HELD `@cloudflare/workers-types` at `5.20260804.1` in `apps/shrink` from 2026-08-12 to
  2026-10-03, while `apps/cms` and `apps/viewer` moved on. **RELEASED 2026-10-03** by fixing
  the cause: the report's shape, `SIZE_WARNING_BYTES` and `describeSoftArtwork` moved into
  the node-free `tools/asset-pipeline/src/glb-report.ts` (`validate.ts` re-exports the type and the constant; `describeSoftArtwork` stopped being
  re-exported on 2026-10-06, since nothing imported it there), and
  the report imports them from there. The written fix had named only the constant and the
  type, but `tsc --explainFiles` showed a type-only import pulls the whole file in too.
  `dependencyPolicy.test.ts` follows apps/shrink's imports and fails, naming the fix, if
  `validate.ts` is reached again; all three workspaces now share one version.
  🟡 **Bisect; do not revert the plausible one** — `@types/node` looked like the culprit
  and was not. History and every measurement: `docs/DEPENDENCY-HOLDS.md`.
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
- **🟡 `@google/model-viewer` 4.3.1 is PATCHED, and pnpm refuses an upgrade until you deal with
  it** (2026-10-02, visual audit VA-10). `pnpm-workspace.yaml` → `patchedDependencies` turns the
  library's nine `console.log` calls into comments; installing another version fails with
  `ERR_PNPM_UNUSED_PATCH`. What to do, and when to delete the patch: `docs/DEPENDENCY-HOLDS.md`.
  `apps/cms/src/modelViewerQuiet.test.ts` guards it.
