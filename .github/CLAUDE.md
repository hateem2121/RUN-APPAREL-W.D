# CLAUDE.md — .github

Loads when you touch `.github/`. Every workflow change is gated by
`apps/cms/src/workflowHardening.test.ts` — ten assertions, each with a verified
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
  ⚠️ **THE FIX WAS APPLIED TO `ci.yml` ONLY, AND `deploy-shrink.yml` KEPT THE
  ACTION FOR THREE MONTHS.** Found 2026-08-25. That file has its own `secrets` job
  — correctly, since a scan in another workflow cannot appear in this deploy's
  `needs:` — and it still called the wrapper. Run 32506101672 (2026-08-21) reported
  **success** while logging `[RUN-APPAREL] is an organization. License key is
  required.` then `0 commits scanned.` and `no leaks found`. **Zero**, under the same
  `fetch-depth: 0` checkout — worse than the ci.yml case that prompted the original
  fix, which at least managed 1 commit and ~60 bytes. Unlicensed, the Action degrades
  to a commit range resolving to nothing rather than failing loudly, so the gate
  blocking the shrink deploy was inert and green. Both files now run the binary.
  **Generalises past gitleaks: this repo has TWO workflows that deliberately
  duplicate the same gates, so a fix to one is only half a fix. Grep the other.**
- **`playwright install-deps` is bounded at 8 minutes and NON-FATAL on purpose — it
  is preparation, not a gate.** ⚠️ **`ci.yml` NO LONGER CONTAINS THIS STEP AT ALL.**
  `artwork` and `e2e` both run in `mcr.microsoft.com/playwright:v1.62.1-noble` as of
  2026-08-20, which ships the browsers and their system libraries, so the only apt path
  left in this repo is `.github/workflows/deploy-shrink.yml`. Everything below is that
  file's remaining risk, and the history that produced the container decision.
  Measured normal cost 24 seconds. On 2026-08-18 a degraded Azure Ubuntu
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
  (blocks deletion and force-push, requires a PR, and requires the same status checks
  the deploy needs), `production` restricted to protected branches, and
  `sha_pinning_required: true`, which the repo already satisfied so it cost nothing.
  ⚠️ **A 40-hex SHA CAN STILL BE THE WRONG OBJECT, and the hardening test cannot
  see it.** Found 2026-08-25 while pinning `aquasecurity/trivy-action`. For an
  ANNOTATED tag, `gh api /repos/O/R/git/ref/tags/vX` returns the **tag object's**
  SHA (`"type": "tag"`), not the commit's. Actions resolves `uses: repo@<sha>` only
  against a COMMIT, so the tag-object SHA fails at runtime with the action simply
  not found. `apps/cms/src/workflowHardening.test.ts` passed the whole time: it
  asserts the 40-hex FORMAT and a version comment, both of which a tag object
  satisfies. It cannot assert more without a network call, and a unit test that
  reaches the network is a worse trade — so this is a doc rule, deliberately.
  Dereference before pinning, and verify:
  ```bash
  gh api /repos/OWNER/REPO/commits/vX.Y.Z --jq .sha        # always the commit
  gh api /repos/OWNER/REPO/git/commits/<sha> --jq .sha      # 404 => not a commit
  ```
  All six pins in this repo were re-verified as commits on 2026-08-25.
  ⚠️ **THE REQUIRED-CHECKS LIST IS A SECOND COPY OF `deploy.needs`, AND IT IS ORG
  CONFIG NO TEST HERE CAN READ.** It was four checks until 2026-08-20 and is five now
  (`verify`, `e2e`, `audit`, `secrets`, `artwork`) — `e2e` was added when it was split
  out of `verify`, where it had been gating by living inside a job that gates. `needs:`
  stops the DEPLOY; this list stops the MERGE. Split or rename a gating job and you
  must edit BOTH, or a red gate silently stops blocking. The tenth rule in
  `apps/cms/src/workflowHardening.test.ts` covers the `needs:` half only.
  ⚠️ ORDER MATTERS HERE TOO, the same way it does for `production` below: add a check
  to this list only AFTER a workflow exists on `main` that produces it, or every PR
  blocks forever waiting on a check that never runs.
  ⚠️ At one filled seat, any rule requiring an approving review would deadlock every
  merge — nobody can approve their own PR. Hence
  `required_approving_review_count: 0`, with the status checks as the gate and an
  `OrganizationAdmin` bypass actor, verified by a direct push to `main`.
  ⚠️ ORDER MATTERS: setting `production` to protected-branches-only *before* `main`
  is protected blocks every deploy. Create the ruleset first.
- **Editing a workflow? `apps/cms/src/workflowHardening.test.ts` gates it.** Since
  2026-08-13 every workflow must declare a top-level `permissions:` block that
  includes `contents`; every `uses:` must be a 40-hex SHA with a `# vX.Y.Z`
  comment (Dependabot maintains both); every `actions/checkout` must set
  `persist-credentials: false`; no `run:` block may interpolate
  `${{ github.event.* }}` or `${{ github.head_ref }}` — carry it in `env:` and
  test `"$VAR"`; and every `pnpm <script>` a workflow invokes must exist. **Three
  more since 2026-08-13:** every job declares `timeout-minutes` (all 12 had none,
  so a hang ran to the 6-hour default — ci.yml records a step measured at 49s that
  ran 30+ minutes), no `pull_request_target`, and no `${{ secrets.* }}` inside a
  `run:` block. **Two more on 2026-08-20**, with the first container job: a Playwright
  `container: image:` tag must equal the declared `@playwright/test` version, and every
  job must appear in `deploy.needs` unless it is on a written non-gating allow-list.
  All ten have verified negative controls, so a failure names the file and line. ⚠️ A `permissions:` block **REPLACES** the defaults rather than adding to
  them — omitting `contents: read` breaks `actions/checkout` with a **404** on
  this private repo, which is how uptime.yml died silently for 23 hours. The
  injection rule was not theoretical: `uptime.yml` was pasting a dispatch input
  into shell in a job holding `GH_TOKEN`, found 2026-08-12.
- **Anything CI fetches from a `wear-run.help` host can 403 from a runner.**
  Free-plan Bot Fight Mode intermittently blocks datacenter traffic — it forced the
  `cms.wear-run.help` API cutover to be rolled back within the hour, and it later
  failed a deploy through a new post-deploy check that treated the 403 as "no
  model". Treat such a 403 as *inconclusive*, never as a failed assertion. And use
  `HEAD`: a `GET` on the model is 27 MB per run, which the 15-minute uptime job
  turns into gigabytes of R2 egress against a $5/month cap.
- **`timeout-minutes` kills the STEP'S SHELL, not the `apt-get` that step started.**
  The child survives as an ORPHAN, keeps installing, and keeps holding
  `/var/lib/dpkg/lock-frontend` — so the bound does not stop apt, it only stops
  WAITING for apt, and the next step then runs against a half-unpacked system. On run
  32248711203 (`main`, b5621aa) `libevent-2.1-7t64` had been downloaded and not yet
  unpacked when e2e began: all 23 viewer-webkit tests died on
  `libevent-2.1.so.7: cannot open shared object file` while all 119 chromium/firefox
  tests passed. That reads as a WebKit regression and is not one.
  ⚠️ **RETRYING IS THE WRONG FIX AND WAS TRIED FIRST** (run 32290202909): a second
  `install-deps` RACES the orphan, loses the lock immediately and exits 100 in five
  seconds — `dpkg frontend lock was locked by another process with pid 4625`. Five
  seconds reads like "nothing left to do" and is the opposite. Wait for the orphan; it
  is the thing doing the real work.
  ⚠️ **WAITING LONGER IS ALSO WRONG** (run 32294473409): at a 10-minute wait apt STILL
  had not finished — 18+ minutes across both steps — and the `ldd` check then named
  THIRTY-THREE missing libraries, i.e. essentially the whole WebKit stack rather than
  one straggler. Waiting does not rescue a mirror that degraded; it only costs the job
  its headroom, taking `verify` to ~26 minutes against 30 and close to a `cancelled`
  conclusion, which reads as a failed gate and is not one. The wait loop's budget must
  stay STRICTLY BELOW the step's own `timeout-minutes` (18×10s = 3m inside a 4m step),
  or the step is killed before `dpkg --configure -a` and the final install can run —
  which is why 32294473409 ended on a lock error instead of finishing.
  ✅ **ALL OF `ci.yml` stopped depending on apt on 2026-08-20** — `artwork` first, then
  `e2e` when it was split out of `verify`, both running in
  `mcr.microsoft.com/playwright:v1.62.1-noble`. Measured: `artwork` 142s against a
  107s baseline (+35s per run), and `e2e` 417s while `verify` fell 470s -> 159s by
  shedding it, so the RUN's long pole went 470s -> 417s — billed minutes up,
  wall-clock down. The image pull is 36-40s with a 60s tail (seven pulls). ⚠️ `.github/workflows/deploy-shrink.yml` STILL shells out to `apt`, so
  everything above is live for that file and this trap must not be deleted.
