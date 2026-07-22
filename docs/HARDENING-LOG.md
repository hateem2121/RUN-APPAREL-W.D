# Production Hardening — Engineering Log & Retrospective

A record of the July 2026 hardening pass: what changed, what went wrong, and what
was learned. Written so a future maintainer (or a future session) can pick up with
full context. Operational how-tos live in [RUNBOOK.md](RUNBOOK.md) and
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md); this file is the *why* and the history.

## Outcome

All nine work items were implemented as reviewable commits, merged to `main`, and
the hardened stack **deployed successfully to production**. Kept green throughout:
**82 unit tests + 10 Playwright e2e** (was 9 — an axe accessibility test was
added), plus the new CI gates. The live site was never broken; the one failed
deploy (below) stopped safely by design and left the running site untouched.

## What shipped, by area

| # | Area | Problem it fixed | Status |
|---|---|---|---|
| 1 | **DB migrations** | Cold-start `prodMigrations` hung once in prod | Replaced with a **gated pre-deploy CI migrate** to remote D1 + tested rollback + history-canonicalisation procedure |
| 2 | **Public API domain** | API pinned to `*.workers.dev` (Bot Fight Mode workaround) | Staged the cutover to `cms.wear-run.help`; disabled preview URLs; ordered runbook written (needs zone work) |
| 3 | **Media delivery** | Media streamed through the worker | Wired `PUBLIC_MEDIA_BASE_URL` path for `media.wear-run.help` + Cache Rule (needs R2 domain) |
| 4 | **Viewer platform** | Pages only | Added Worker-with-Static-Assets config; CI target selectable via `VIEWER_DEPLOY_TARGET` (default Pages) |
| 5 | **Deploy safety** | No approval gate | Deploy runs in a `production` GitHub Environment (arm reviewers to activate); needs `verify` + `audit` |
| 6 | **Email** | No adapter — resets/notifications silently failed | Gated Resend adapter (`RESEND_API_KEY`), console fallback when unset |
| 7 | **Security** | No CSP; login/role gaps | Build-time CSP (validated against the real 3D load in e2e); login rate-limit + roles/rotation docs |
| 8 | **Supply-chain / CI** | No secret/dep/perf/a11y gates | gitleaks, `audit-ci` (high/critical), Lighthouse budget, axe; `sharp` deduped; `minimumReleaseAge` policy |
| 9 | **Observability** | Only Workers Logs + uptime | Opt-in Sentry client errors, tree-shaken out when no DSN (zero cost by default) |

Everything requiring dashboard/credentials (items 2, 3, the viewer cutover, email,
the reviewer gate, the rate-limit rule, Sentry) is **deferred to the owner** with
step-by-step runbooks — deliberately not flipped in-repo, because doing so before
the zone/R2 work is done would break live media/API.

## Blocks encountered & how they were resolved

- **`workerd` hangs in the build sandbox.** The local/remote migrate runner spins
  up `workerd` via wrangler's platform proxy, which hangs under this restricted
  container. Impact: the migrate path couldn't be exercised locally. Resolution:
  validated everything else (typecheck/build/82 tests/10 e2e) locally and relied
  on real CI to exercise the migrate — where it worked (see the incident below).
  Lesson: CI-only code paths need a real CI run to validate; sandbox green ≠ done.

- **gitleaks failed twice on the first PR.** (1) `gitleaks-action@v2` now
  *requires* `GITHUB_TOKEN` to scan `pull_request` events; (2) it also needs
  `pull-requests: read` permission to list the PR's commits (403 "Resource not
  accessible by integration"). Fixed by adding both. Neither was a real secret —
  the scan hadn't even run. Lesson: check an action's current PR-scan requirements
  when adding it.

- **`minimumReleaseAge: 4320` (3 days) blocked routine installs.** Every dependency
  re-resolve tripped on whatever transitive was freshest (`lightningcss`,
  `monaco-editor`, …) in this large, fast-moving graph — and a blocked re-resolve
  left the lockfile out of sync with `package.json`, which would fail CI's
  `--frozen-lockfile`. Resolution: lowered to **24h** (still covers the
  highest-risk same-day-compromise window) and excluded the trusted build
  toolchain (`lightningcss*`, `esbuild`). `--frozen-lockfile` is never affected.
  Lesson: supply-chain cooldowns must be sized to the project's dependency
  velocity, not a one-size-fits-all number.

- **Branch deletion blocked by the sandbox git proxy (HTTP 403).** The environment
  permits pushing to branches but forbids deleting refs, and no GitHub API branch-
  delete tool was available. Resolution: documented a one-time manual cleanup for
  the owner (branches page → trash icons).

## The production-deploy incident (biggest mistake + lesson)

**Symptom.** The first gated deploy after merge failed at the pre-deploy migrate:

```
Error: index payload_locked_documents_rels_order_idx already exists: SQLITE_ERROR
  at getPayload() → apps/cms/src/seed/migrate.ts
```

**Root cause (my mistake).** The `migrate:remote` script ran `payload run` **without
`NODE_ENV=production`**, so Payload performed its dev-mode **schema push** on
`getPayload()` init — trying to recreate schema that the already-migrated
production D1 already had.

**Why it was still safe.** The migrate step runs *before* the worker deploy, so its
failure **stopped the deploy** and the previously-running worker kept serving. The
gated design worked exactly as intended — a bad migrate blocks the release instead
of taking the site down.

**What it also proved (good news).** `getPlatformProxy` with a `remote: true` D1
binding **connected to production D1 on the CI runner with no hang**, `PAYLOAD_SECRET`
was present, and the Cloudflare token had D1 access. Only the dev push was wrong.

**Fix.** Run the remote migrate scripts with `NODE_ENV=production` so Payload skips
the dev push and only connects, then applies pending migrations explicitly
(migrations are the source of truth against the remote DB). On retry the migrate
was a clean no-op and the **deploy succeeded**.

**Lesson.** Any Payload CLI task that touches a production database must force
production mode, or it will try to push schema. This is now enforced in the
`migrate:remote` / `migrate:remote:down` scripts and documented in
`apps/cms/src/seed/migrate.ts`.

## Key decisions & rationale

- **Gated CI migrate, not cold-start.** Migrations apply in an explicit,
  observable, blocking CI step before traffic — a failure blocks the release
  rather than hanging live requests.
- **CSP generated at build time.** The API origin is baked in from
  `VITE_API_BASE_URL` and the inline-script hash is computed from the built HTML,
  so the policy can never drift from what ships and can't break the live site.
- **Infra cutovers deferred, not flipped.** API/media domain and viewer→Worker
  changes are staged behind repo variables/flags with runbooks, so merging never
  risks live traffic; the owner drives the coordinated cutover.
- **Dependabot in quiet mode.** For a solo maintainer, routine version-bump PRs
  create branch clutter that won't get actioned. Routine PRs are off
  (`open-pull-requests-limit: 0`); **security** PRs still open automatically, and
  `audit-ci` blocks high/critical advisories on every change.
- **pnpm 10.33 pin kept, policy tuned.** The pin is deliberate and documented; the
  `minimumReleaseAge` policy lives in-repo (24h) instead of a machine-global config.

## Known follow-ups

- **Accessibility — colour contrast.** axe flags the muted editorial palette
  (`.serif-accent`, `<dt>` labels, statement text). Gating is on *structural*
  a11y only; contrast is advisory. Adjusting token colours is a design decision
  left to the owner.
- **The owner's dashboard/credential extras** — see the runbooks referenced above.

## Verification snapshot

`pnpm typecheck` · `pnpm test` (82) · `pnpm build` · `pnpm --filter
@run-apparel/viewer test:e2e` (10) — all green. CI gates (verify, audit, gitleaks,
lighthouse) green on the PR. Production deploy: **succeeded** (migrate no-op,
worker + viewer deployed, `/api/health` gate passed).

## Addendum — owner-extras session (2026-07-22)

The deferred owner items were worked through with the owner driving
credentials/dashboard steps. Outcomes:

| Item | Outcome |
|---|---|
| Email (Resend) | ✅ Live. Domain verified (send-subdomain records; Hostinger inbound untouched), `RESEND_API_KEY` secret set, forgot-password tested end-to-end |
| Deploy approval gate | ⏭️ Skipped — GitHub requires **Pro** for environment reviewers on private personal repos; automated gates deemed sufficient |
| Admin-login rate limit | ✅ Live. Free plan = ONE rule (fixed values, read in the dashboard), and the slot held a zone-wide leaked-credential rule → **merged** into one rule (leaked-creds OR cms login POST). Live-tested: rejected logins, then 429 once over the limit |
| Admin verify/rotate | ✅ One account only, role Admin/Director, password rotated |
| Media cutover | ✅ `media.wear-run.help` live (30-day edge cache + bucket CORS). **Found & fixed a live outage**: deployed `PUBLIC_MEDIA_BASE_URL` had been mis-set to `RUN`, 404ing all media |
| API cutover | ❌ Attempted, **rolled back within the hour**: free Bot Fight Mode intermittently 403s datacenter traffic to `cms.wear-run.help` (caught by the CI health-check gate — the gate design worked). Needs Cloudflare Pro / Super Bot Fight Mode |
| Viewer → Worker | ✅ `run-apparel-viewer-site` serves `viewer.wear-run.help`; Pages project deleted; `_redirects` stripped in the worker deploy step (Workers rejects the Pages SPA rule, code 100324) |
| Sentry / colour contrast | ⏸️ Deferred by owner |

**Lessons this session:**

- *A handful of green tests from one vantage is not evidence.* Residential curl,
  a browser fetch, and one GitHub-runner check all passed against
  `cms.wear-run.help` — then the deploy gate caught an intermittent Bot Fight
  Mode 403 from the same runner pool. Probabilistic defenses need repeated
  sampling from the right vantage before a cutover.
- *Dashboard-set vars are silently overwritten by the next `wrangler deploy`* —
  and a stray dashboard edit (`PUBLIC_MEDIA_BASE_URL="RUN"`) broke live media
  unnoticed. Config belongs in `wrangler.jsonc`; treat the dashboard as
  read-mostly.
- *Platform validation errors differ between Pages and Workers*: the same
  `dist/` is not drop-in portable (`_redirects` vs `not_found_handling`).
- The gated deploy design (health check after deploy) caught the bad API
  cutover exactly as intended — the second time the gate has paid for itself.
