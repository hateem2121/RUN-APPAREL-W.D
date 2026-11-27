# CLAUDE.md — .github

🔴 = stops here, do not proceed. 🟡 = read before acting. 🟢 = context.

Loads when you touch `.github/`. Every workflow change is gated by
`apps/cms/src/workflowHardening.test.ts` — eighteen rules, twelve with their own
negative control (counted 2026-09-29), so a failure names the file and line. Run it before pushing a
workflow edit:

```bash
npx --yes pnpm@12.15.0 --filter @run-apparel/cms exec vitest run src/workflowHardening.test.ts
```

## Traps

- **🟡 The `secrets` job runs the MIT gitleaks binary, not `gitleaks/gitleaks-action`.
  Do not "restore" the Action.** Two reasons, both measured 2026-08-18. Licence: the
  Action is **paid for organisations**, and the repo sat in the RUN-APPAREL org until
  2026-09-02 (`[RUN-APPAREL] is an organization. License key is required.`). Coverage,
  which still holds and matters more: run 32140573361 invoked it with `--log-opts=-1` and reported *"1
  commits scanned. scanned ~60 bytes ... no leaks found"* — sixty bytes, under a
  checkout that sets `fetch-depth: 0` precisely because "a secret is usually in an
  older commit". A green gate that scanned almost nothing, the same defect class as
  the citation command that exited 0 having checked nothing. There is no
  `--log-opts` now, so the full history is scanned every run against `.gitleaks.toml`.
  🟡 **The fix was applied to `ci.yml` only, and `deploy-shrink.yml` kept the
  action for three months.** Found 2026-08-25. That file has its own `secrets` job
  — correctly, since a scan in another workflow cannot appear in this deploy's
  `needs:` — and it still called the wrapper. Run 32506101672 (2026-08-21) reported
  **success** while logging `[RUN-APPAREL] is an organization. License key is
  required.` then `0 commits scanned.` and `no leaks found`. **Zero**, under the same
  `fetch-depth: 0` checkout — worse than the ci.yml case that prompted the original
  fix, which at least managed 1 commit and ~60 bytes. Unlicensed, the Action degrades
  to a commit range resolving to nothing rather than failing loudly, so the gate
  blocking the shrink deploy was inert and green. Both files now run the binary.
  **Generalises past gitleaks: this repo had two workflows that deliberately
  duplicated the same gates, so a fix to one was only half a fix.** 🟢 Resolved
  2026-09-29: the shrink deploy moved into ci.yml as the `deploy-shrink` job, which
  `needs:` ci.yml's own `verify`, `artwork`, `audit` and `secrets`, and
  `deploy-shrink.yml` was deleted. If a second copy of a gate ever appears again, the
  lesson holds: grep the other.
- **🟢 No workflow runs `apt` or `playwright install-deps`: the browser jobs run in the
  `mcr.microsoft.com/playwright` image** (its tag must equal `@playwright/test`'s version;
  `workflowHardening.test.ts` enforces it), which ships the browsers and their system
  libraries. Do not add an `apt-get` or an `install-deps` step to a workflow: on 2026-08-18 a
  degraded Ubuntu mirror made a normally 24-second install consume whole job budgets, and
  raising one job's ceiling only moved which job absorbed the outage. The runs and timings are
  in `docs/HARDENING-LOG.md` ("CI history moved out of `.github/CLAUDE.md`").
- **🟡 `main` is guarded by ruleset `22763709` — read 2026-09-11: no deletion or
  force-push, a PR with 0 approvals, `code_scanning`, no bypass actors, and six
  required checks (listed below).** 🟡 **A PR no longer has to be up to date with `main`
  before it merges (owner, 2026-11-27).** The ruleset's strict status-check policy was on from
  2026-10-25, because two PRs that each pass alone can clash together (#252 made knip blocking
  while #256 added a script). It cost a second CI run whenever another PR landed first (#497 and
  #501 that day), and a merge queue, the tool for this, is for organization-owned repositories
  only (GitHub's page, read that day; this one is a user's). So a behind PR merges untested
  against the newest `main`: `main` then runs the browser tests itself, because
  `scripts/ci-already-tested.mjs` finds the files differ, and a clash shows there, before the
  deploy. To put it back, set the ruleset's `strict_required_status_checks_policy` to true
  again. On 2026-10-25 GitHub
  accepted a PATCH turning on secret-scanning validity checks and generic patterns, answered
  200 and stored `disabled` for both: not on this plan. The rules below carry its history. It first existed as org ruleset
  `21016174` (applied 2026-08-19, while the repo sat in the RUN-APPAREL org on GitHub
  Enterprise), alongside `production` restricted to protected branches and
  `sha_pinning_required: true`, which the repo already satisfied so it cost nothing.
  🟡 **A 40-hex SHA can still be the wrong object, and the hardening test cannot
  see it.** Found 2026-08-25 while pinning `aquasecurity/trivy-action`. For an
  annotated tag, `gh api /repos/O/R/git/ref/tags/vX` returns the **tag object's**
  SHA (`"type": "tag"`), not the commit's. Actions resolves `uses: repo@<sha>` only
  against a commit, so the tag-object SHA fails at runtime with the action simply
  not found. `apps/cms/src/workflowHardening.test.ts` passed the whole time: it
  asserts the 40-hex format and a version comment, both of which a tag object
  satisfies. It cannot assert more without a network call, and a unit test that
  reaches the network is a worse trade — so this is a doc rule, deliberately.
  🟢 **Since 2026-09-29 a CI step makes network calls of this kind:** `verify` runs
  zizmor with the job's token, whose online audits check pinned SHAs against each
  action's own repository (`impostor-commit`; `ref-version-mismatch` compares the
  `# vX.Y.Z` comment with the commit). Whether they name a tag-object SHA was not
  proven when it was added (the API was unreachable from that session), so keep
  dereferencing by hand. Reviewed zizmor exceptions live in `.github/zizmor.yml`.
  Dereference before pinning, and verify:
  ```bash
  gh api /repos/OWNER/REPO/commits/vX.Y.Z --jq .sha        # always the commit
  gh api /repos/OWNER/REPO/git/commits/<sha> --jq .sha      # 404 => not a commit
  ```
  🟢 All six pins in this repo were re-verified as commits on 2026-08-25.
  🟡 **Why exact commits matter, measured: on 2026-03-19 attackers force-pushed 76 of
  77 `aquasecurity/trivy-action` tags to credential-stealing commits (CVE-2026-33634).**
  Our pin `ed142fd…` is v0.36.0, released 2026-04-22 after the clean-up, signed and
  verified (checked 2026-10-01). 🟡 **Since 2026-11-04 the action does not install Trivy:** its
  installer downloads from `get.trivy.dev`, which stopped resolving on 3 Nov (NXDOMAIN; curl exit 6
  read as a failed audit), so `ci.yml` and `security-scans.yml` install it from the GitHub release
  with pinned SHA-256s and pass `skip-setup-trivy: 'true'`. Bump `TRIVY_VERSION` and both hashes in
  both files; `apps/cms/src/toolVersions.test.ts` fails if they differ. Never Trivy v0.69.4, the
  malicious release. 🟡 `security-scans.yml` (2026-10-01) publishes Scorecard, which
  forbids workflow/job-level `env` or `defaults`, containers, write permissions at the
  workflow level, and any action in its job beyond checkout, upload-artifact,
  upload-sarif, scorecard-action and harden-runner — break one and the publish fails.
  🟢 **History.** The org and its ruleset were deleted on 2026-09-02, leaving `main`
  unguarded while the repo was private on Free (the rulesets API answered 403 *"Upgrade
  to GitHub Pro"*). The repo went public on 2026-09-09 and was re-created clean on
  2026-09-10 as `hateem2121/RUN-APPAREL-W.D`, with audit material and supplier codes
  scrubbed from every commit. Rulesets are free on a public repository, and `22763709`
  was recreated there from this record the same day.
  🟡 **By owner decision (2026-09-03) the repo stays on Free.** Two consequences were
  recorded here for a private repo, and going public changed both.
  `actions/dependency-review-action` is gated `github.event.repository.private == false`,
  so it runs now. And the old storage rule (trim `r2-backup-*`, never `d1-backup-*`) is
  superseded: since 2026-09-10 both backup artifacts are age-encrypted before upload,
  because a public repository's artifacts are downloadable by any signed-in account —
  `apps/cms/src/publicRepoGuards.test.ts` fails on a plaintext one. The repository's own
  retention setting also caps every `retention-days` (measured 2026-09-10: an artifact
  asking for 90 days was given the repository's 30; the setting was put back to 90 the
  same day).
  🟡 **The required-checks list is a second copy of `deploy.needs`, and one command
  prints it** — it is repository config under the ordinary `repo` scope:
  ```bash
  gh api repos/hateem2121/RUN-APPAREL-W.D/rulesets \
    --jq '.[].id'   # then: gh api repos/hateem2121/RUN-APPAREL-W.D/rulesets/<id> \
    --jq '[.rules[]|select(.type=="required_status_checks").parameters.required_status_checks[].context]'
  ```
  Since the repo went public it is readable without any token (an anonymous `GET` of
  `rulesets/22763709` returned all six on 2026-09-24), and
  `.github/workflows/required-checks.yml` now compares it with `deploy.needs` on `main`,
  daily and after every `ci.yml` change (`scripts/check-required-checks.mjs`; it never
  gates a pull request, for the order reason below). It holds
  🟡 **six** checks (read 2026-09-24) — the Actions jobs `verify`, `e2e`, `audit`, `secrets`
  and `artwork`, all bound to integration 15368, plus **`Socket Security: Pull Request
  Alerts`** (integration 156372, added for L8-05 so a malicious-dependency finding can
  stop a merge). 🟡 **Socket had to be reinstalled on 2026-09-11** — it had been an org
  install and vanished with the org — and was required again only after it posted on
  PR head commits. Require *Pull Request Alerts*, never *Project Report*: a merge
  commit shows only one of the two, and reading that instead nearly produced a
  "correction" requiring a name Socket never posts. 🟡 **A red
  `github-advanced-security` check is not ours**: it was GitHub's *AI findings* preview
  (no workflow file; it posts as app 15368). It failed every PR with
  `CAPIError: 400 The requested model is not supported`, and was switched off on
  2026-09-11 under Settings → Advanced Security. It was never required. `e2e` was added when it was split
  out of `verify`, where it had been gating by living inside a job that gates. `needs:`
  stops the deploy; this list stops the merge. Split or rename a gating job and you
  must edit both, or a red gate silently stops blocking. The deploy-gating rule in
  `apps/cms/src/workflowHardening.test.ts` covers the `needs:` half only (and since
  2026-09-29 follows `needs:` through other jobs). 🟡 **Splitting a gate without editing
  either list is how `e2e` was sharded on 2026-09-29:** the tests run as the matrix job
  `e2e-shard`, and a small job keeping the id `e2e` merges their reports and fails unless
  `needs.e2e-shard.result == 'success'`. That last step is load-bearing — without it a
  failed shard makes `e2e` skipped, and a skipped required check counts as passed.
  🟡 Order matters here too, the same way it does for `production` below: add a check
  to this list only after a workflow exists on `main` that produces it, or every PR
  blocks forever waiting on a check that never runs.
  🟡 At one filled seat, any rule requiring an approving review would deadlock every
  merge — nobody can approve their own PR. Hence
  `required_approving_review_count: 0`, with the status checks as the gate and no
  bypass actors (read 2026-09-11), so a direct push to `main` is refused and everything
  goes through a PR.
  🟡 Order matters: setting `production` to protected-branches-only *before* `main`
  is protected blocks every deploy. Create the ruleset first.
  🟡 **Since 2026-11-07 (owner's yes) the `production` environment lets only `main` use its
  six secrets** — a custom deployment-branch policy naming `main`. It had no branch rule from
  the re-creation on 2026-09-10 until then: the org-era restriction above was never rebuilt, so
  a job on any branch (the weekly robot's, or one dispatched by hand) could read the Cloudflare
  keys by declaring the environment. Proved both ways: `r2-budget.yml` dispatched on `main` read
  R2 (run 42344834070), and on a throwaway branch was refused before any step ran (run
  42344944030, *"Branch … is not allowed to deploy to production due to environment
  protection rules"*). Every job that declares `production` runs on `main` (push or
  schedule), so a new one on another branch fails the same way — that is the rule working.
  Read it: `gh api repos/hateem2121/RUN-APPAREL-W.D/environments/production/deployment-branch-policies`.
  Undo: Settings → Environments → production → Deployment branches → No restriction.
- **Editing a workflow? `apps/cms/src/workflowHardening.test.ts` gates it — eighteen
  rules, twelve with their own negative control.** Every workflow declares a top-level
  `permissions:` block that includes `contents`; every `uses:` names a full version tag the
  lockfile records (since 2026-11-07, below), or a 40-hex SHA with a `# vX.Y.Z` comment; every `actions/checkout` sets
  `persist-credentials: false`; no `run:` block interpolates `${{ github.event.* }}`,
  `${{ github.head_ref }}` or `${{ secrets.* }}` — carry it in `env:` and test
  `"$VAR"`; every `pnpm <script>` a workflow invokes exists; every job declares
  `timeout-minutes` (without it a hang runs to the 6-hour default — ci.yml records a
  step measured at 49s that ran 30+ minutes); no `pull_request_target`; every
  `runs-on` names a fixed image, never a `*-latest` label GitHub moves on its own
  schedule (`ubuntu-26.04` since 2026-09-29; actionlint 1.7.12 needed it listed in
  `.github/actionlint.yaml`, and `verify`'s first step fails by name if the image
  lacks a tool a workflow relies on); a Playwright
  `container: image:` tag equals the declared `@playwright/test` version and carries a
  `@sha256:` digest (since 2026-09-29); every job that can host it starts with the
  Harden-Runner network guard (it cannot run in a `container:` job), in watch mode
  everywhere — 🟡 **block mode on ci.yml's `deploy` was tried on 2026-10-25 and backed out the
  same day:** on a `westus2` runner the agent opens its firewall for one address per allowed
  host and drops the rest, so checkout failed in 26 s with `github.com:443` allowed (git
  dialled 20.29.134.23, the agent had recorded 140.82.116.4) and the job then hung until
  cancelled (step-security/harden-runner#708). 🟡 **#708 was closed on 2026-11-06** ("create a new
  issue if you still face this problem after using v2.22.4"), so since 2026-11-07 (owner) the
  `deploy` job runs in block mode on v2.22.4 with the 28-host allow-list; the step's comment says how
  to back it out if a deploy fails on a blocked connection. Since 2026-11-13 (owner: "Low-risk two first")
  `r2-budget` and `diagnostics-digest` block too, each with exactly the hosts Harden-Runner recorded on two
  scheduled runs; `nightly-backup` and `deploy-shrink` wait for two clean weeks. Every other job stays in watch mode; the
  tools `verify` downloads by version are watched by `tool-versions.yml` weekly,
  because Dependabot cannot see an `env:` pin — 🟡 and **since 2026-11-07 (owner) every workflow runs
  from GitHub's workflow lockfile**, `.github/workflows/actions.lock` (generally available since
  2026-10-28; GitHub calls it the strongest protection, superseding SHA pins; it also locks the
  actions our actions use, and each source repository's ids). `gh actions-lock` v0.4.1 writes each
  `uses:` as a full tag (`actions/checkout@v7.0.1`) and the commit into the lock; Dependabot updates
  both in one PR. 🟡 Since 2026-11-08 `verify` also runs `gh actions-lock --verify` against GitHub and
  judges its JSON with `scripts/check-actions-lock.mjs`: a timeout once exited 0 having checked
  nothing, so GitHub not answering fails as "not checked", never as a pass. 🟢 Since 2026-11-08 `actions-changelog.yml` opens one issue a week
  when GitHub's Actions changelog has entries no earlier issue carries
  (`scripts/check-actions-changelog.mjs`); close it with what each entry means here. 🟡 The price, accepted: Scorecard's Pinned-Dependencies does not read the lockfile
  and measured 2 against 9 with SHA pins. The repository still requires SHA pinning, which GitHub
  counts as met for a workflow on the lockfile. Change an action and re-run `gh actions-lock`, or GitHub
  refuses the run outright (a mismatched commit: HTTP 422 at dispatch; a wrong repository id:
  "repository identity has changed" at Set up job — both measured); every job is
  in `deploy.needs` unless it is on the written non-gating allow-list; no key nests
  under a key that already has a value; every workflow `heartbeat.yml` watches exists
  and parses; `DEPLOY_MESSAGE` has no space; the vulnerability audit retries only on
  the network signature, within its job's timeout; and 🟡 a job that reads a secret in
  its `env:` or a step's `env:`/`with:` declares `environment: production` — every
  secret lives only there, so a job without it gets an empty string and still goes
  green. A failure names the file and line. 🟡 A `permissions:` block **replaces** the defaults rather than adding to
  them — omitting `contents: read` breaks `actions/checkout` with a **404** on
  what was then a private repo, which is how uptime.yml died silently for 23 hours. The
  injection rule was not theoretical: `uptime.yml` was pasting a dispatch input
  into shell in a job holding `GH_TOKEN`, found 2026-08-12.
  🟡 A `run:` step that goes through `pnpm --filter <pkg> exec …` executes with its cwd
  in that package, so a repo-relative path the shell just globbed does not exist there:
  nightly-backup's R2 copy failed every night from 2026-09-01 with `The file
  "backups/d1/….sql" does not exist` while the export, the replay and the artifact
  upload all passed. Anchor such paths on `$GITHUB_WORKSPACE`.
- **🟡 Anything CI fetches from a `wear-run.help` host can 403 from a runner.**
  Free-plan Bot Fight Mode intermittently blocks datacenter traffic — it forced the
  `cms.wear-run.help` API cutover to be rolled back within the hour, and it later
  failed a deploy through a new post-deploy check that treated the 403 as "no
  model". Treat such a 403 as *inconclusive*, never as a failed assertion. And use
  `HEAD`: a `GET` on the model is **1.9-8.2 MB** per garment (measured 2026-09-05;
  it was ~27 MB before the 2026-09-03 re-exports), pointless weight on a job that ran every 15 minutes then (every 6 hours since 2026-09-29).
  (It is not an R2 bill: R2 egress is free, re-read on its pricing page 2026-09-25.)
- **🟡 A red `secrets` job can mean gitleaks never downloaded.** Run 33264929752,
  2026-08-29: the release CDN answered **504**, `curl | tar` died on the truncated
  stream, and the PR showed `secrets: fail` on a branch with no secret in it. A failed
  fetch and a failed scan must never look the same — same class as the 403 note above.
  🟡 **It took out a whole nightly backup on 2026-11-08:** every github.com release download
  answered 504 for ~an hour, so `age` never installed and the D1 export behind it was skipped.
  The nightly backup now retries for 15 minutes and lets the in-account backup run without
  `age`; a final step still turns the run red.
  Both copies now `--retry 5 --retry-delay 3 --retry-all-errors` and download to a file
  before extracting: a retry resuming mid-stream would splice two responses into `tar`.
  🟡 **Read the count, not the colour.** A healthy run says `435 commits scanned.
  scanned ~6684770 bytes`; the two documented green-but-empty failures said "1 commits
  scanned ... ~60 bytes" and "0 commits scanned".
- **🟡 `timeout-minutes` kills the step's shell, not the `apt-get` that step started.**
  The child survives as an orphan, keeps installing, and keeps holding
  `/var/lib/dpkg/lock-frontend`, so the next step runs against a half-unpacked system: all 23
  viewer-webkit tests died on `libevent-2.1.so.7: cannot open shared object file` while all
  119 chromium/firefox tests passed,
  which reads as a WebKit regression and is not one. A retry races the orphan and exits 100 in
  five seconds; waiting longer does not rescue a degraded mirror; and a wait loop's budget must
  stay strictly below the step's own `timeout-minutes`. No workflow runs `apt` since
  2026-08-30; the runs and timings are in `docs/HARDENING-LOG.md` (same section).

- **🟡 An unparseable workflow is not a failed check — CI goes green.** Found 2026-08-30
  in PR #50. Scoping two secrets out of a job-level `env:` deleted the `env:` key and
  left `GH_TOKEN` orphaned under `timeout-minutes: 10`. A key cannot nest under a
  scalar, so GitHub could not parse the file and produced a run named after the **file
  path** with **no jobs** and `conclusion: failure` — which is not a pull-request check.
  All twelve checks passed. It was visible only in the Actions tab, on
  `diagnostics-digest.yml`, the one workflow that reads the Events table, which had
  already been silently dead once before for a comparable reason (a `permissions:`
  block missing `contents: read`).
  A parse guard in `apps/cms/src/workflowHardening.test.ts` now catches it: a key
  may not be indented deeper than a preceding key that already has a value. Biome does
  not lint YAML.
  🟡 After any workflow edit, look for a run named after the path:
  `gh run list --limit 5 --json name,conclusion`

- **🟡 GitHub's scheduled runs are 19–90 minutes late — measured, n=11, every one.**
  2026-08-26 across `heartbeat.yml`'s last 11 `schedule` runs: 19, 33, 34, 36, 46, 50,
  53, 60, 84, 88 and 90 minutes after the `cron:`. Never on time, never early. So a
  `cron:` here is a queue position, not a deadline, and anything that treats it as one
  manufactures false alarms: the Sentry cron monitor was created with the default
  1-minute `checkin_margin` and logged `missed` on every cycle from that day forward
  while the workflow itself was healthy throughout — `00:44 missed` then `02:13 ok`,
  `06:44 missed` then ok. A watchdog that is wrong every cycle is worse than no
  watchdog: it is the state `uptime.yml` sat in for 23 hours in 8301e60, and it trains
  you to ignore the one alert that matters. Re-measure before assuming it improved:
  `gh run list --workflow=<file>.yml --json createdAt,event`
  🟡 **Re-measured 2026-08-30 and it is worse — and the delay is the wrong number.**
  Over 39 scheduled runs (08-19 → 08-30): worst single delay **331 min**, and **three
  runs were dropped entirely**. A margin sized on lateness assumes every run happens.
  The quantity that matters is the **gap between consecutive check-ins** — worst
  observed **818 min (13.6 h)** against a 6-hour cron, median 364.
  So `heartbeat.yml` now tells Sentry to expect a check-in every **12** hours while the
  `cron:` stays at 6, and `apps/cms/src/heartbeatMonitor.test.ts` asserts Sentry is
  never told to expect one sooner than the cron can deliver — it used to demand the two
  be identical, which is the wrong invariant. Re-measure the gap, not the delay:
  `gh run list --workflow=heartbeat.yml --limit 40 --json createdAt,event`

- **The Sentry cron monitor's config lives in `heartbeat.yml`, not in the dashboard.**
  The check-in POSTs a `monitor_config` body and Sentry upserts it, so the schedule and
  the margin sit beside the `cron:` they have to agree with, and a hand-edit in Sentry's
  UI is corrected on the next ping instead of silently outliving the repo.
  `apps/cms/src/heartbeatMonitor.test.ts` fails if the two ever disagree, with a
  negative control proving it can. The check-in URL is `vars.SENTRY_CRON_URL` and is
  not a secret — it is the same public ingest key already shipped to every browser in
  `VITE_SENTRY_DSN`.

- **🟢 A code-scanning dismissal request is not a dismissal — someone must approve it.**
  Two requests sat `status: pending` from 2026-08-19 to 2026-08-31 with a good
  justification, and both alerts stayed `open` the whole time. Delegated dismissal
  splits the two, and only the filing half had been done. The same account that
  raised them can approve them:
  `gh api -X PATCH /repos/O/R/dismissal-requests/code-scanning/<n> -f status=approve -f message=…`
  (`approve`/`deny`, and `message` is required — a 422 names the legal values).
  🟢 **Alerts carry two severities and the ruleset has two thresholds.**
  `rule.severity` is warning/error and is judged by `alerts_threshold`;
  `rule.security_severity_level` is low…critical and is judged by
  `security_alerts_threshold`. A "medium" alert can be a `warning`, and neither
  number alone tells you whether a merge is blocked.
- **🟡 Read a check's name off a PR head commit, never a merge commit.** A merge commit
  carries fewer check runs: `Socket Security: Project Report` appears on both, and
  `Socket Security: Pull Request Alerts` — the one worth requiring — only on the head.
  Reading the merge commit produced a confident "the audit has the wrong name"
  correction that would have blocked every PR forever on a check Socket never posts.
  Confirm across several PR HEADs before adding a name to the required-checks list.
  🟡 **Reading a red PR run (2026-09-03, PR #60 — three reds, none of them code).**
  `gh pr checks` reports a job cancelled by a second push as `fail`; read conclusions
  from `gh run view <id> --json jobs`. The runner is 2–3× slower than the Mac: a
  real-chain test over ~2 s here trips vitest's 5 s default there (pipeline.test.ts got
  its 60_000), and a bound measured after `load` on software WebGL (placeholder-webgl's
  800 ms) needs seconds. A fresh advisory can land between two runs of the same
  commit; the fix is the override floor + `pnpm install --no-frozen-lockfile`
  (audit-ci.jsonc records why), and CI's "Vulnerable advisories are:" list is the one
  to read — `pnpm audit`'s table ignores the allow-list.
  🟡 **CodeQL parses any file named `action.yml`, wherever it sits** — including under
  `docs/`, including a directory literally named `fake`. A committed fixture that
  contains the defect on purpose raises a real alert. Default setup has no
  path-exclusion config, so rename the fixture (`action.yml.fixture`) rather than
  dismissing an alert that will simply come back.
  🟡 **Default setup scans `actions` and `javascript-typescript` (and, since 2026-10-21, `python`) at the Extended suite
  since 2026-10-01 (owner)** — until then it scanned only the workflows; the first
  JS/TS run found 56 alerts on `main`. Measured on PR #111 with a planted command
  injection: the CodeQL check fails only on "New alerts in code changed by this pull
  request", so an old alert does not block a PR — unless the PR edits code inside that
  alert's data flow, which makes it count as new (#111's escape change re-raised two
  host-pattern alerts that were already open). Fix at the root rather than dismissing.
  The JS/TS analysis takes ~2 min and runs beside the ~13-minute CI run, so PRs wait no
  longer. Undo: `PATCH …/code-scanning/default-setup` with `languages:["actions"]`.
  🟡 `verify` also runs Knip, and since 2026-10-25 it blocks (`pnpm exec knip`, owner decision of
  24 Oct): an unused file, export or package fails the PR. Every ignore and every named entry in
  `knip.jsonc` says why — `sharp` is loaded from `tools/asset-pipeline` on purpose, not via Next.
  A new hand-run script fails it until listed there with who runs it.
  🟡 **`cache-mode` (GA 2026-09-10) is set on every workflow since 2026-10-01 except
  `security-scans.yml`:** `none` where no job touches the cache, `read` for android-chrome,
  lighthouse-live and voiceover, and in ci.yml `none` with `write` on only verify, e2e,
  audit and lighthouse (the jobs that save the pnpm store). actionlint v1.7.12 (the newest)
  predates the key, so `.github/actionlint.yaml` ignores exactly `unexpected key
  "cache-mode"` — a typo such as `cache-mod` still fails `verify` (checked). Scorecard's
  publish check rejects any actionlint warning in the file that publishes, so
  security-scans.yml must never get the key; Scorecard's other checks tolerate it. Note
  setup-node caches automatically only for npm, never for this pnpm repo, so only an
  explicit `cache: pnpm` uses a cache here. Drop the ignore once actionlint knows the key.

- **🟡 CI's WebKit reports a stale computed style, and no write beats it.** 2026-09-05,
  `.page`'s bottom reserve, read on one element in one pass:
  `attr "padding-bottom: 107px !important;"  prio "important"  pad "73px"` — an
  important inline declaration losing the cascade, always to the previous value. Seven
  mechanisms reported that same stale number: a custom property, a bare `var()`, an
  inline style, a forced `offsetHeight` reflow, `!important`, a rAF-deferred write out
  of the ResizeObserver, and a pure-CSS rem floor that cannot be stale for any reason of
  ours. The engine never recomputes after Playwright's `addStyleTag` changes
  `html { font-size }`; macOS WebKit, Chromium and Firefox all do, and a real visitor's
  text-size setting is a different path entirely. **Confirm a test's setup took effect
  before asserting on it** — six CI rounds went into fixing a page that was never
  broken. The specs now `test.skip()` with the measured numbers when the precondition
  demonstrably did not apply; asserting on a page whose setup never landed is measuring
  the harness.

- **🟡 `gh run rerun --failed` can cancel itself on this workflow, and reports `cancelled`
  rather than an error.** Measured 2026-09-07. `ci.yml` cancels in progress on every
  branch except `main` (never there, since 2026-08-31), and a re-run of a job is placed in
  the same concurrency group as the run it belongs to — so on a pull request it queues,
  starts, collides with its own parent and is cancelled. Nothing else had pushed; the
  branch was quiet.
  The trap is what that looks like: the run's conclusion flips from `failure` to
  `cancelled`, so the evidence of the original failure is gone from `gh run list` and the
  obvious reading is "somebody pushed over it". **Then there is no way to re-run one job.**
  To decide whether a failing test is flaky or real, push an empty or trivial commit and
  read the fresh run — and confirm nothing is in flight first, because a push during a run
  cancels that one too (the trap the root `CLAUDE.md` records).
  🟡 **Not every time — re-measured 2026-09-18.** `gh run rerun 35311293630 --failed`, on a
  `pull_request` run with nothing else in flight, ran attempt 2 to `success` and cancelled
  nothing. So try it first, then read the run's `conclusion`. Push an empty commit only if
  it comes back `cancelled`.

- **`DEPLOY_ENABLED=false` pauses nine workflows, not just deploys:** `ci`'s two deploy
  jobs (`deploy`, and `deploy-shrink` since it moved into ci.yml on 2026-09-29),
  `nightly-backup`, `uptime`, `heartbeat`, `diagnostics-digest`, `perf-watch`,
  `lighthouse-live` (added 2026-09-16), `link-crawl` (added 2026-09-23) and `r2-budget`
  (missing from this list until 2026-09-29). Off means no backups
  and no monitoring — measured 2026-09-10, after the
  switch had been off since the public re-creation. Re-count with
  `grep -l 'vars.DEPLOY_ENABLED' .github/workflows/*.yml` — and discount
  `required-checks.yml`, `security-scans.yml` and `refresh-skills.yml`, which name it only
  in a comment saying they are not gated by it.

- **🔴 On a public repo every Actions log is public, and `wrangler d1 export` prints a
  one-hour download link to the whole database.** 2026-09-11, the first nightly-backup
  run here: its log carried a presigned R2 URL to the unencrypted dump (password hashes,
  API keys, customer inquiries), readable by anyone who opened the run. The deploy's
  pre-migration backup was cancelled before it could print a second. `scripts/backup-d1.mjs`
  now captures wrangler's output and prints it through `redactPresignedUrls`, and
  `apps/cms/src/backupD1Redaction.test.ts` runs it against a fake runner that prints a
  real-shaped link. Before any step runs a CLI against production, ask what it prints.

- **🟡 A pull request opened with `GITHUB_TOKEN` waits for a person to start its checks.**
  GitHub's docs ("Triggering a workflow", read 2026-10-03): its `pull_request` event
  "creates workflow runs in an **approval-required** state", and a user with write access
  starts them with **Approve workflows to run** in the merge box; only `workflow_dispatch`
  and `repository_dispatch` runs start as usual. `refresh-skills.yml` opens its weekly PR
  this way, and its body tells the owner to read the diff, then press that button.
  ✅ **Measured on the first robot PR (#123, 2026-10-03), and it overturned the note that
  stood here:** the held `ci.yml` run sat at `action_required` with **0 jobs**, while the
  run the robot started itself (`gh workflow run ci.yml --ref <branch>`) went green on the
  same commit and did not count. GraphQL's `isRequired(pullRequestNumber:)` named the held
  run's checks as the required ones, so the PR stayed blocked with every check green until
  that run was approved (the button, or
  `gh api -X POST repos/hateem2121/RUN-APPAREL-W.D/actions/runs/<id>/approve`). The PR had
  also been given an approving review first, so whether the ruleset needed that too was not
  separated: if a robot PR is still blocked once its checks pass, approve the PR. The robot
  stopped dispatching `ci.yml` the same day and no longer holds `actions: write`. CodeQL's
  default setup and Socket's check started without the button. Opening the PR at all needed
  the repository setting *Allow GitHub Actions to create and approve pull requests*,
  switched on 2026-10-03 by owner decision (the ruleset still requires 0 approvals).
