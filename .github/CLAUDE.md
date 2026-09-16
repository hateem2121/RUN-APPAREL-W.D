# CLAUDE.md — .github

Loads when you touch `.github/`. Every workflow change is gated by
`apps/cms/src/workflowHardening.test.ts` — fifteen rules, nine with their own
negative control (counted 2026-09-11), so a failure names the file and line. Run it before pushing a
workflow edit:

```bash
npx --yes pnpm@10.34.5 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts
```

## Traps

- **The `secrets` job runs the MIT gitleaks BINARY, not `gitleaks/gitleaks-action`.
  Do not "restore" the Action.** Two reasons, both measured 2026-08-18. LICENCE: it
  is free for personal accounts and **paid for organisations**, and this repo moved
  into the RUN-APPAREL org that day — `[RUN-APPAREL] is an organization. License key
  is required.` No `GITLEAKS_LICENSE` secret exists on the REPO — but one was created
  at the ORG level on 2026-08-18, visible to all three repositories including the two
  PUBLIC ones, and no workflow in any of them references it. It is a leftover from the
  Action this trap replaced. Verified 2026-08-30 by code search across all three repos:
  the only hit is this sentence. COVERAGE, which
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
- **`main` is guarded by ruleset `22763709` — read 2026-09-11: no deletion or
  force-push, a PR with 0 approvals, `code_scanning`, NO bypass actors, and five
  required checks.** The rules below carry its history. It first existed as org ruleset
  `21016174` (APPLIED 2026-08-19, while the repo sat in the RUN-APPAREL org on GitHub
  ENTERPRISE), alongside `production` restricted to protected branches and
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
  ⚠️ **History.** The org and its ruleset were deleted on 2026-09-02, leaving `main`
  unguarded while the repo was private on Free (the rulesets API answered 403 *"Upgrade
  to GitHub Pro"*). The repo went public on 2026-09-09 and was RE-CREATED CLEAN on
  2026-09-10 as `hateem2121/RUN-APPAREL-W.D`, with audit material and supplier codes
  scrubbed from every commit. Rulesets are free on a public repository, and `22763709`
  was recreated there from this record the same day.
  **By owner decision (2026-09-03) the repo STAYS on Free.** Two consequences were
  recorded here for a PRIVATE repo, and going public changed both.
  `actions/dependency-review-action` is gated `github.event.repository.private == false`,
  so it RUNS now. And the old storage rule (trim `r2-backup-*`, never `d1-backup-*`) is
  superseded: since 2026-09-10 both backup artifacts are age-ENCRYPTED before upload,
  because a public repository's artifacts are downloadable by any signed-in account —
  `apps/cms/src/publicRepoGuards.test.ts` fails on a plaintext one. The repository's own
  retention setting also CAPS every `retention-days` (measured 2026-09-10: an artifact
  asking for 90 days was given the repository's 30; the setting was put back to 90 the
  same day).
  ⚠️ **THE REQUIRED-CHECKS LIST IS A SECOND COPY OF `deploy.needs`. IT IS NOT
  UNREADABLE — that claim was false and cost a session (L8-07).** It is repository
  config under the ordinary `repo` scope, and one command prints it:
  ```bash
  gh api repos/hateem2121/RUN-APPAREL-W.D/rulesets \
    --jq '.[].id'   # then: gh api repos/hateem2121/RUN-APPAREL-W.D/rulesets/<id> \
    --jq '[.rules[]|select(.type=="required_status_checks").parameters.required_status_checks[].context]'
  ```
  It still cannot be a CI GATE — `GITHUB_TOKEN` has no `administration` permission —
  but "no test can read it" and "no test can read it FROM CI" are different claims,
  and the first one talked people out of running the command at all. It was four checks until 2026-08-20, five until
  2026-08-31, six until the org died on 2026-09-02, five on the re-created repo, and
  **six** again since 2026-09-11 — the Actions jobs `verify`, `e2e`, `audit`, `secrets`
  and `artwork`, all bound to integration 15368, plus **`Socket Security: Pull Request
  Alerts`** (integration 156372, added for L8-05 so a malicious-dependency finding can
  stop a merge). ⚠️ **Socket had to be REINSTALLED on 2026-09-11** — it had been an org
  install and vanished with the org — and was required again only after it posted on
  PR HEAD commits. Require *Pull Request Alerts*, never *Project Report*: a merge
  commit shows only one of the two, and reading that instead nearly produced a
  "correction" requiring a name Socket never posts. ⚠️ **A red
  `github-advanced-security` check is NOT ours**: it was GitHub's *AI findings* preview
  (no workflow file; it posts as app 15368). It failed every PR with
  `CAPIError: 400 The requested model is not supported`, and was switched OFF on
  2026-09-11 under Settings → Advanced Security. It was never required. `e2e` was added when it was split
  out of `verify`, where it had been gating by living inside a job that gates. `needs:`
  stops the DEPLOY; this list stops the MERGE. Split or rename a gating job and you
  must edit BOTH, or a red gate silently stops blocking. The deploy-gating rule in
  `apps/cms/src/workflowHardening.test.ts` covers the `needs:` half only.
  ⚠️ ORDER MATTERS HERE TOO, the same way it does for `production` below: add a check
  to this list only AFTER a workflow exists on `main` that produces it, or every PR
  blocks forever waiting on a check that never runs.
  ⚠️ At one filled seat, any rule requiring an approving review would deadlock every
  merge — nobody can approve their own PR. Hence
  `required_approving_review_count: 0`, with the status checks as the gate and NO
  bypass actors (read 2026-09-11), so a direct push to `main` is refused and everything
  goes through a PR.
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
  **Five more since:** a parse guard for a key nested under a key
  that already has a value, every workflow `heartbeat.yml` watches must exist and parse,
  `DEPLOY_MESSAGE` may not contain a space, and the vulnerability audit retries only on
  the network signature and within its job's timeout. Fifteen rules; nine have their own
  negative control, and a failure names the file and line. ⚠️ A `permissions:` block **REPLACES** the defaults rather than adding to
  them — omitting `contents: read` breaks `actions/checkout` with a **404** on
  what was then a private repo, which is how uptime.yml died silently for 23 hours. The
  injection rule was not theoretical: `uptime.yml` was pasting a dispatch input
  into shell in a job holding `GH_TOKEN`, found 2026-08-12.
  ⚠️ A `run:` step that goes through `pnpm --filter <pkg> exec …` executes with its cwd
  in THAT package, so a repo-relative path the shell just globbed does not exist there:
  nightly-backup's R2 copy failed every night from 2026-09-01 with `The file
  "backups/d1/….sql" does not exist` while the export, the replay and the artifact
  upload all passed. Anchor such paths on `$GITHUB_WORKSPACE`.
- **Anything CI fetches from a `wear-run.help` host can 403 from a runner.**
  Free-plan Bot Fight Mode intermittently blocks datacenter traffic — it forced the
  `cms.wear-run.help` API cutover to be rolled back within the hour, and it later
  failed a deploy through a new post-deploy check that treated the 403 as "no
  model". Treat such a 403 as *inconclusive*, never as a failed assertion. And use
  `HEAD`: a `GET` on the model is **1.9-8.2 MB** per garment (measured 2026-09-05;
  it was ~27 MB before the 2026-09-03 re-exports), which the 15-minute uptime job
  still turns into gigabytes of R2 egress against a $5/month cap.
- **A red `secrets` job can mean gitleaks never DOWNLOADED.** Run 33264929752,
  2026-08-29: the release CDN answered **504**, `curl | tar` died on the truncated
  stream, and the PR showed `secrets: fail` on a branch with no secret in it. A failed
  FETCH and a failed SCAN must never look the same — same class as the 403 note above.
  Both copies now `--retry 5 --retry-delay 3 --retry-all-errors` and download to a FILE
  before extracting: a retry resuming mid-stream would splice two responses into `tar`.
  ⚠️ **Read the count, not the colour.** A healthy run says `435 commits scanned.
  scanned ~6684770 bytes`; the two documented green-but-empty failures said "1 commits
  scanned ... ~60 bytes" and "0 commits scanned".
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
  wall-clock down. The image pull is 36-40s with a 60s tail (seven pulls).
  ✅ **AND `deploy-shrink.yml` FOLLOWED ON 2026-08-30 — NO WORKFLOW IN THIS REPO
  RUNS `apt` ANY MORE.** It was the last one, and it had kept BOTH apt paths
  (`playwright install --with-deps` on a cache miss, `install-deps` on a hit) at a
  **20-minute** ceiling while ci.yml had already been raised to 30 *and* then moved
  to the container — so the file most exposed to the mirror outage was the one with
  the least headroom. It now uses the same `mcr.microsoft.com/playwright:v1.62.1-noble`
  image and installs no browser at all.
  ⚠️ **KEEP THIS TRAP ANYWAY.** Everything above is the reasoning, not the residue:
  it is why raising a ceiling is the wrong fix, why a retry races an orphan holding
  the dpkg lock, and why the wait loop's budget must stay strictly below the step's
  own `timeout-minutes`. The next person tempted to add an `apt-get` to a workflow
  needs all of it. **This is also the second half of the "two workflows duplicate the
  same gates" rule at the top of this file** — the container fix sat in ci.yml for ten
  days before anyone checked the other copy, exactly as gitleaks did for three months.

- **AN UNPARSEABLE WORKFLOW IS NOT A FAILED CHECK — CI GOES GREEN.** Found 2026-08-30
  in PR #50. Scoping two secrets out of a job-level `env:` deleted the `env:` key and
  left `GH_TOKEN` orphaned under `timeout-minutes: 10`. A key cannot nest under a
  scalar, so GitHub could not parse the file and produced a run named after the **file
  path** with **no jobs** and `conclusion: failure` — which is NOT a pull-request check.
  All twelve checks passed. It was visible only in the Actions tab, on
  `diagnostics-digest.yml`, the one workflow that reads the Events table, which had
  already been silently dead once before for a comparable reason (a `permissions:`
  block missing `contents: read`).
  A parse guard in `apps/cms/src/workflowHardening.test.ts` now catches it: a key
  may not be indented deeper than a preceding key that already has a value. Biome does
  not lint YAML.
  ⚠️ After ANY workflow edit, look for a run named after the path:
  `gh run list --limit 5 --json name,conclusion`

- **GitHub's scheduled runs are 19–90 minutes LATE — measured, n=11, EVERY ONE.**
  2026-08-26 across `heartbeat.yml`'s last 11 `schedule` runs: 19, 33, 34, 36, 46, 50,
  53, 60, 84, 88 and 90 minutes after the `cron:`. Never on time, never early. So a
  `cron:` here is a queue position, not a deadline, and anything that treats it as one
  manufactures false alarms: the Sentry cron monitor was created with the default
  1-minute `checkin_margin` and logged `missed` on EVERY cycle from that day forward
  while the workflow itself was healthy throughout — `00:44 missed` then `02:13 ok`,
  `06:44 missed` then ok. A watchdog that is wrong every cycle is worse than no
  watchdog: it is the state `uptime.yml` sat in for 23 hours in 8301e60, and it trains
  you to ignore the one alert that matters. Re-measure before assuming it improved:
  `gh run list --workflow=<file>.yml --json createdAt,event`
  ⚠️ **RE-MEASURED 2026-08-30 AND IT IS WORSE — AND THE DELAY IS THE WRONG NUMBER.**
  Over 39 scheduled runs (08-19 → 08-30): worst single delay **331 min**, and **three
  runs were DROPPED ENTIRELY**. A margin sized on lateness assumes every run happens.
  The quantity that matters is the **GAP between consecutive check-ins** — worst
  observed **818 min (13.6 h)** against a 6-hour cron, median 364.
  So `heartbeat.yml` now tells Sentry to expect a check-in every **12** hours while the
  `cron:` stays at 6, and `apps/cms/src/heartbeatMonitor.test.ts` asserts Sentry is
  never told to expect one SOONER than the cron can deliver — it used to demand the two
  be identical, which is the wrong invariant. Re-measure the GAP, not the delay:
  `gh run list --workflow=heartbeat.yml --limit 40 --json createdAt,event`

- **The Sentry cron monitor's config lives in `heartbeat.yml`, NOT in the dashboard.**
  The check-in POSTs a `monitor_config` body and Sentry upserts it, so the schedule and
  the margin sit beside the `cron:` they have to agree with, and a hand-edit in Sentry's
  UI is corrected on the next ping instead of silently outliving the repo.
  `apps/cms/src/heartbeatMonitor.test.ts` fails if the two ever disagree, with a
  negative control proving it can. The check-in URL is `vars.SENTRY_CRON_URL` and is
  NOT a secret — it is the same public ingest key already shipped to every browser in
  `VITE_SENTRY_DSN`.

- **A code-scanning dismissal REQUEST is not a dismissal — someone must APPROVE it.**
  Two requests sat `status: pending` from 2026-08-19 to 2026-08-31 with a good
  justification, and both alerts stayed `open` the whole time. Delegated dismissal
  splits the two, and only the filing half had been done. The same account that
  raised them can approve them:
  `gh api -X PATCH /repos/O/R/dismissal-requests/code-scanning/<n> -f status=approve -f message=…`
  (`approve`/`deny`, and `message` is required — a 422 names the legal values).
  ⚠️ **Alerts carry TWO severities and the ruleset has TWO thresholds.**
  `rule.severity` is warning/error and is judged by `alerts_threshold`;
  `rule.security_severity_level` is low…critical and is judged by
  `security_alerts_threshold`. A "medium" alert can be a `warning`, and neither
  number alone tells you whether a merge is blocked.
- **Read a check's NAME off a PR head commit, never a merge commit.** A merge commit
  carries fewer check runs: `Socket Security: Project Report` appears on both, and
  `Socket Security: Pull Request Alerts` — the one worth requiring — only on the head.
  Reading the merge commit produced a confident "the audit has the wrong name"
  correction that would have blocked every PR forever on a check Socket never posts.
  Confirm across several PR HEADs before adding a name to the required-checks list.
  ⚠️ **Reading a red PR run (2026-09-03, PR #60 — three reds, none of them code).**
  `gh pr checks` reports a job CANCELLED by a second push as `fail`; read conclusions
  from `gh run view <id> --json jobs`. The runner is 2–3× slower than the Mac: a
  real-chain test over ~2 s here trips vitest's 5 s default there (pipeline.test.ts got
  its 60_000), and a bound measured after `load` on software WebGL (placeholder-webgl's
  800 ms) needs seconds. A fresh advisory can land between two runs of the same
  commit; the fix is the override floor + `pnpm install --no-frozen-lockfile`
  (audit-ci.jsonc records why), and CI's "Vulnerable advisories are:" list is the one
  to read — `pnpm audit`'s table ignores the allow-list.
  ⚠️ **CodeQL parses ANY file named `action.yml`, wherever it sits** — including under
  `docs/`, including a directory literally named `fake`. A committed fixture that
  contains the defect on purpose raises a real alert. Default setup has no
  path-exclusion config, so RENAME the fixture (`action.yml.fixture`) rather than
  dismissing an alert that will simply come back.

- **CI's WebKit REPORTS A STALE COMPUTED STYLE, and no write beats it.** 2026-09-05,
  `.page`'s bottom reserve, read on one element in one pass:
  `attr "padding-bottom: 107px !important;"  prio "important"  pad "73px"` — an
  important INLINE declaration losing the cascade, always to the PREVIOUS value. Seven
  mechanisms reported that same stale number: a custom property, a bare `var()`, an
  inline style, a forced `offsetHeight` reflow, `!important`, a rAF-deferred write out
  of the ResizeObserver, and a pure-CSS rem floor that cannot be stale for any reason of
  ours. The engine never recomputes after Playwright's `addStyleTag` changes
  `html { font-size }`; macOS WebKit, Chromium and Firefox all do, and a real visitor's
  text-size setting is a different path entirely. **Confirm a test's SETUP took effect
  before asserting on it** — six CI rounds went into fixing a page that was never
  broken. The specs now `test.skip()` WITH THE MEASURED NUMBERS when the precondition
  demonstrably did not apply; asserting on a page whose setup never landed is measuring
  the harness.

- **`gh run rerun --failed` CANCELS ITSELF ON THIS WORKFLOW, and reports `cancelled`
  rather than an error.** Measured 2026-09-07. `ci.yml` sets
  `concurrency: cancel-in-progress: true`, and a re-run of a job is placed in the SAME
  concurrency group as the run it belongs to — so it queues, starts, collides with its own
  parent and is cancelled. Nothing else had pushed; the branch was quiet.
  The trap is what that looks like: the run's conclusion FLIPS from `failure` to
  `cancelled`, so the evidence of the original failure is gone from `gh run list` and the
  obvious reading is "somebody pushed over it". **There is no way to re-run one job here.**
  To decide whether a failing test is flaky or real, push an empty or trivial commit and
  read the fresh run — and confirm nothing is in flight first, because a push during a run
  cancels that one too (the trap the root `CLAUDE.md` records).

- **`DEPLOY_ENABLED=false` pauses EIGHT workflows, not just deploys:** `ci`'s deploy,
  `deploy-shrink`, `nightly-backup`, `uptime`, `heartbeat`, `diagnostics-digest`,
  `perf-watch` and `lighthouse-live` (the eighth, added 2026-09-16). Off means no backups
  and no monitoring — measured 2026-09-10, after the
  switch had been off since the public re-creation. Re-count with
  `grep -l 'vars.DEPLOY_ENABLED' .github/workflows/*.yml`.

- **ON A PUBLIC REPO EVERY ACTIONS LOG IS PUBLIC, and `wrangler d1 export` prints a
  one-hour download link to the WHOLE database.** 2026-09-11, the first nightly-backup
  run here: its log carried a presigned R2 URL to the unencrypted dump (password hashes,
  API keys, customer inquiries), readable by anyone who opened the run. The deploy's
  pre-migration backup was cancelled before it could print a second. `scripts/backup-d1.mjs`
  now captures wrangler's output and prints it through `redactPresignedUrls`, and
  `apps/cms/src/backupD1Redaction.test.ts` runs it against a fake runner that prints a
  real-shaped link. Before any step runs a CLI against production, ask what it PRINTS.
