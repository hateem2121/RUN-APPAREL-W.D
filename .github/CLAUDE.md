# CLAUDE.md — .github

Loads when you touch `.github/`. Every workflow change is gated by
`apps/cms/src/workflowHardening.test.ts` — eight assertions, each with a verified
negative control, so a failure names the file and line. Run it before pushing a
workflow edit:

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts
```

## Traps

- **The `secrets` job runs the MIT gitleaks BINARY, not `gitleaks/gitleaks-action`.
  Do not "restore" the Action.** Two reasons, both measured 2026-08-18. LICENCE: it
  is free for personal accounts and **paid for organisations**, and this repo moved
  into the RUN-APPAREL org that day — `[RUN-APPAREL] is an organization. License key
  is required.` No `GITLEAKS_LICENSE` secret exists on the repo. COVERAGE, which
  matters more: run 32140573361 invoked it with `--log-opts=-1` and reported *"1
  commits scanned. scanned ~60 bytes ... no leaks found"* — sixty bytes, under a
  checkout that sets `fetch-depth: 0` precisely because "a secret is usually in an
  older commit". A green gate that scanned almost nothing, the same defect class as
  the citation command that exited 0 having checked nothing. There is no
  `--log-opts` now, so the full history is scanned every run against `.gitleaks.toml`.
- **`playwright install-deps` is bounded at 8 minutes and NON-FATAL on purpose — it
  is preparation, not a gate.** Measured normal cost 24 seconds, recorded in
  `.github/workflows/ci.yml` beside the step. On 2026-08-18 a degraded Azure Ubuntu
  mirror — the log repeats `Ign: http://azure.archive.ubuntu.com/ubuntu noble
  InRelease` before falling back to the far slower `archive.ubuntu.com` — made it
  consume entire job budgets three times with nothing in the repo changed: `artwork`
  cancelled at 20m20s twice, then `verify` at 30m21s. **Raising a ceiling is the
  wrong fix**: `artwork` was raised 20→30, went green, and `verify` died at 30
  instead, because both jobs share one external dependency and lifting one ceiling
  only moves which job absorbs the outage. `e2e` and the artwork eval are the gates.
  A failed install emits a named `::warning::` so a browser that cannot **launch** is
  not debugged as a flaky test — that warning fired four minutes before the
  `browserType.launch` failure it predicted.
- **The org is on GitHub ENTERPRISE, which invalidates a closed decision stated in
  `.github/workflows/ci.yml`.** That file declines required reviewers on the
  `production` environment because they "need GitHub Pro (~$4/month)" against a
  $5/month budget, and instructs the reader "Do not list it as pending work". The
  cost premise is now false. **APPLIED 2026-08-19**: ruleset `21016174` on `main`
  (blocks deletion and force-push, requires a PR, and requires `verify`, `audit`,
  `secrets`, `artwork` — the same four the deploy already needs), `production`
  restricted to protected branches, and `sha_pinning_required: true`, which the repo
  already satisfied so it cost nothing.
  ⚠️ At one filled seat, any rule requiring an approving review would deadlock every
  merge — nobody can approve their own PR. Hence
  `required_approving_review_count: 0`, with the status checks as the gate and an
  `OrganizationAdmin` bypass actor, verified by a direct push to `main`.
  ⚠️ ORDER MATTERS: setting `production` to protected-branches-only *before* `main`
  is protected blocks every deploy. Create the ruleset first.
