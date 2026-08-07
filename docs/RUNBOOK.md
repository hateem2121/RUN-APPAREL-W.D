# Runbook — operating the RUN APPAREL viewer

Day-to-day operations for the live stack. For first-time setup see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md); for backups see
[BACKUP-RESTORE.md](BACKUP-RESTORE.md); for the July 2026 hardening history,
decisions, and lessons learned see [HARDENING-LOG.md](HARDENING-LOG.md).

## How deploys work

The repo has a **single `main` branch** and no pull requests. Pushing to `main`
triggers `.github/workflows/ci.yml`:

1. **verify** — install, typecheck, all unit tests, build, Playwright e2e.
2. **deploy** (only if verify passes *and* `vars.DEPLOY_ENABLED == 'true'`) —
   deploys the CMS worker, builds + deploys the viewer to the
   **`run-apparel-viewer-site` Worker** (Static Assets; selected by the
   `VIEWER_DEPLOY_TARGET=worker` repo variable since the 2026-07-22 cutover),
   then hits `/api/health` as a gate.

So: **commit to `main`, push, watch the Actions tab.** A red build never
deploys. `gh run watch` follows the latest run from the CLI.

**Manual deploy fallback** (if CI is unavailable):

```bash
pnpm --filter @run-apparel/cms run deploy          # CMS worker (canonical command)
# Use the SAME API base URL as the VITE_API_BASE_URL repo variable (currently the
# CMS workers.dev URL — see "API + media domain cutover" below for why):
VITE_API_BASE_URL="$(gh variable get VITE_API_BASE_URL)" pnpm --filter @run-apparel/viewer build
rm -f apps/viewer/dist/_redirects   # Pages-only file; rejected by Workers Static Assets
pnpm --filter @run-apparel/viewer exec wrangler deploy   # → run-apparel-viewer-site
curl -f https://cms.wear-run.help/api/health
```

Requires Cloudflare auth (`wrangler login` or `CLOUDFLARE_API_TOKEN`).

**The shrink service deploys separately.** `.github/workflows/deploy-shrink.yml`
builds and deploys `run-apparel-viewer-shrink` (Worker + Container) and is *not*
part of `ci.yml` — a green CI run says nothing about it.

> ✅ **Working since 2026-07-28** (run `30368254285`, the first success after 3
> failures). Before that the token could not push a container image, so the
> service was deployed by hand and every automatic redeploy silently did nothing.
>
> Note for the future: the service was healthy that whole time. An earlier version
> of this note said the pipeline was "not operational", inferred from CI logs
> rather than measured. **Query the platform, not the CI history:**
>
> ```bash
> pnpm --filter @run-apparel/shrink exec wrangler containers list
> ```
>
> The workflow's last step prints exactly that, so a green run now carries its own
> proof the *image* moved and not just the Worker script — compare `LAST MODIFIED`
> against the run's own timestamp printed just above it.
>
> **The token this needs** (recorded because it took a live failure to work out,
> and Cloudflare documents none of it). There is no permission template for
> containers; it must be a **Custom** token created at
> https://dash.cloudflare.com/profile/api-tokens with:
>
> | Scope | Permission | Level |
> |---|---|---|
> | Account | Workers Scripts | Edit |
> | Account | **Containers** | **Edit** |
> | Account | **Cloudchamber** | **Edit** |
> | Account | Workers R2 Storage | Edit |
> | Account | D1 | Edit |
> | Account | Queues | Edit |
> | Account | Account Settings | Read |
> | User | User Details | Read |
> | Zone → wear-run.help | Workers Routes | Edit |
>
> Containers **and** Cloudchamber are both required — wrangler routes container
> work through its cloudchamber client, and its own OAuth flow asks for
> `containers:write` and `cloudchamber:write`. A token missing them builds the
> image fine and then fails on the push with `ApiError: Forbidden`,
> `{ error: 'Authentication error' }` — which names neither permission.
>
> To rotate it: `gh secret set CLOUDFLARE_API_TOKEN`, then
> `gh workflow run "Deploy shrink service"` to confirm before relying on it.
>
> Manual fallback, if CI is ever unavailable (needs Docker running; on an
> Apple-silicon Mac the amd64 build is emulated and takes several minutes):
>
> ```bash
> pnpm --filter @run-apparel/shrink exec wrangler deploy
> ```
>
> Full diagnosis and the checklist state: [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md).

## Deploy safety gate

The `deploy` job runs in the **`production`** GitHub Environment. To make every
production deploy pause for a human approval:

- GitHub → repo *Settings → Environments → production → Required reviewers* → add
  yourself (and anyone else who may approve). Now each push to `main` that would
  deploy waits in the *Deploy* job until a reviewer approves in the Actions run.

> **Note (checked 2026-07-22):** on a **private** repo under a personal account,
> the *Deployment protection rules* section (required reviewers / wait timer)
> only appears with **GitHub Pro** or higher — on the Free plan the environment
> page shows only branches/secrets/variables. Decision: skipped for now; the
> automated gates (verify + audit + health check) remain the deploy protection.

This layers on top of the code-review that happens before `main` (see below). The
deploy job also `needs` both `verify` (typecheck/test/build/e2e) and `audit`
(high/critical vulnerabilities), so a red build or a new vulnerability blocks the
deploy regardless of approval.

**Optional pre-prod staging.** For a full staging environment, create *isolated*
staging resources (never the live ones): `run-apparel-viewer-db-staging` (D1),
`run-apparel-viewer-media-staging` (R2), and a `run-apparel-viewer-cms-staging`
worker via a `[env.staging]` block in `apps/cms/wrangler.jsonc`, then add a CI job
that deploys to staging on demand for validation before promoting to production.

## Database migrations

Migrations are applied by an **explicit, gated CI step** — the deployed Worker no
longer migrates on cold start (that lazy `prodMigrations` path hung in production
once and has been removed). In `.github/workflows/ci.yml` the `deploy` job runs
`pnpm --filter @run-apparel/cms migrate:remote` **before** it deploys the new
Worker: it applies any pending committed migrations to the **remote** production
D1, and only if that succeeds does the new Worker ship. So the new code never
serves traffic against a stale schema, and a failed migration blocks the deploy
instead of hanging live requests.

How it targets the live DB: `migrate:remote` sets `PAYLOAD_MIGRATE_REMOTE=1`,
which makes `payload.config.ts` open the production D1 through
`apps/cms/wrangler.migrate.jsonc` (its D1 binding is `remote: true`) via wrangler's
`getPlatformProxy`. It needs `CLOUDFLARE_API_TOKEN` (Account + **D1: Edit**) and
`PAYLOAD_SECRET` in the environment — both already CI secrets.

**Adding a migration:**

```bash
# 1. change collections, then generate the migration
pnpm --filter @run-apparel/cms migrate:create <name>
# 2. review the generated src/migrations/* files. Prefer ADDITIVE changes
#    (new tables/columns) so the running Worker tolerates the new schema in the
#    brief window between migrate and deploy (expand/contract).
# 3. commit and push — the next deploy's migrate step applies them, then deploys.
```

**Apply / roll back by hand** (needs Cloudflare auth: `wrangler login` or
`CLOUDFLARE_API_TOKEN`, plus `PAYLOAD_SECRET`):

```bash
node scripts/backup-d1.mjs                              # ALWAYS back up first
pnpm --filter @run-apparel/cms migrate:remote           # apply pending → remote D1
pnpm --filter @run-apparel/cms migrate:remote:down      # roll back the most recent batch
```

The `down` runner (`payload.db.migrateDown()`) reverses the latest migration
**batch**, so batch bookkeeping in `payload_migrations` must be correct — see
"Canonicalising migration history" below. Test any rollback against a throwaway DB
first (`docs/BACKUP-RESTORE.md` shows the scratch-DB pattern).

**If a migration fails** (deploy stops, or health check red afterwards): back up,
inspect what's applied, then re-run the migrate or apply the SQL by hand:

```bash
node scripts/backup-d1.mjs
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --command "SELECT id, name, batch, created_at FROM payload_migrations ORDER BY id"
# last-resort manual apply of a specific migration's SQL:
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote --file src/migrations/<file>.sql
```

### Canonicalising migration history

During an earlier recovery a `payload_migrations` row was inserted by hand, so the
table should be verified once against the canonical history. The canonical state
(two committed migrations, applied in order) is exactly:

| id | name | batch |
|---|---|---|
| 1 | `20260720_185735_initial` | 1 |
| 2 | `20260721_084024_add_events` | 2 |

Verify the live table matches (run after a backup):

```bash
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote \
  --command "SELECT id, name, batch FROM payload_migrations ORDER BY id"
```

If a `dev`/`NULL` marker row is present, or the batch numbers differ, reconcile it
(back up first — this edits live bookkeeping, not data):

```bash
cd apps/cms
pnpm exec wrangler d1 execute run-apparel-viewer-db --remote --command "
  DELETE FROM payload_migrations WHERE name IS NULL OR name = 'dev';
  UPDATE payload_migrations SET batch = 1 WHERE name = '20260720_185735_initial';
  UPDATE payload_migrations SET batch = 2 WHERE name = '20260721_084024_add_events';
"
```

Getting the batches right matters so `migrate:remote:down` rolls back exactly the
last migration and no more.

## CI quality gates

Beyond typecheck/test/build/e2e, CI runs these on every push to `main` and every
pull request:

- **Secret scanning** — gitleaks (the `secrets` job in `.github/workflows/ci.yml`,
  config `.gitleaks.toml`). A hit fails the run and **gates the deploy** (the
  `deploy` job needs it). It used to live in its own `security.yml`, where it
  could only fail its own run — `needs:` cannot reach across workflows, so a
  commit carrying a live key was scanned, went red, and deployed regardless. That
  is why it is a job here rather than a separate file. Real secrets never belong
  in git; use `wrangler secret put` / GitHub secrets. Add proven false positives
  to the allowlist in `.gitleaks.toml`.
- **Dependency vulnerabilities** — `audit-ci` (config `audit-ci.jsonc`) fails on
  **high/critical** advisories and **gates the deploy** (the `deploy` job needs
  it). To clear one: bump the dependency, add a `pnpm.overrides` pin for a fixed
  transitive version (how the `tmp` advisory was resolved), or — only if
  unfixable and not exploitable here — add the `GHSA-…` id to `allowlist` in
  `audit-ci.jsonc` with a dated reason.
- **Artwork legibility** — `pnpm eval:artwork` (the `artwork` job) renders the real
  wordmark alpha before and after the real decimation chain and measures how much
  moved. It **gates the deploy** (since 2026-08-06). This is the only gate that
  looks at what a buyer sees: the other three test `alphaMode`, dependencies and
  secrets, none of which change when decimation smears a printed logo.

  It was introduced observe-only on the worry that CI's rasteriser would produce
  different numbers from a developer Mac. That was measured and is **false** —
  1.650% / 3.070% / 9.370% on a Mac and on three CI runs across two runner images,
  identical to three decimal places, because the eval diffs two renders taken by
  the same browser in the same run and the rasteriser cancels.

  If it goes red, **look at the contact sheet it names** before touching the
  ceiling. It also asserts a negative control, so it fails itself if it stops being
  able to detect damage.
- **Artwork legibility on the real garment** — `pnpm eval:artwork:real`. **MANUAL
  AND LOCAL**, not in CI and not scheduled. See "The canonical raw garment" below
  for why, and for how to run it.
- **Performance budget** — Lighthouse CI (`lighthouserc.json`) against the viewer
  served with the e2e mock. Deterministic byte budgets fail on a real regression;
  category scores are non-blocking warnings (they swung 0.64/0.88/0.87 across
  three runs of an identical build, so gating on them would block releases at
  random). This job is informational — make it a required check via branch
  protection to enforce it.

  **Read what it measures.** The page it scores carries the ~10 KB placeholder
  GLB, so it says nothing about a real 8–40 MB garment; the `total-byte-weight`
  assertion was removed in 2026-08-03 because it conflated the app shell with the
  model. What remains is scoped to the shell — script / stylesheet / font — which
  *is* byte-identical in production, at 16–46% above measured.
- **Accessibility** — axe-core in the Playwright suite
  (`apps/viewer/e2e/a11y.spec.ts`), across **five** page states: the product page,
  the unavailable state, the retired-colourway notice, the poster-only fallback
  and the expanded customisation accordion. It covered only the healthy product
  page until 2026-08-03 — i.e. every screen a visitor reaches when something has
  gone wrong was unscanned, and those are the ones carrying the extra live
  regions and injected meta tags. Fails on serious/critical **structural**
  violations; colour-contrast is advisory (a deliberate palette decision).
- **Browsers** — the e2e suite runs Chromium, **WebKit**, **mobile Safari** and
  **Firefox**, plus a SwiftShader project for the real-WebGL test. It ran Chromium
  twice and nothing else until 2026-08-03, which meant iOS Safari — the browser a
  QR code on a garment tag actually opens — had never executed a line of it.

  The WebGL test **fails** rather than skips when no GL context is available. It
  used to `test.skip`, so the single most valuable test in the repo passed
  silently whenever SwiftShader failed to start.

  `retries: 1` in CI: Playwright reports a test that fails then passes as
  **flaky** in its own section, so flakes stay visible and countable while a real
  failure still fails both attempts and still stops the deploy.
- **Post-deploy viewer payload** — `scripts/smoke-viewer-payload.mjs`, run after
  the deploy in `ci.yml` and every 15 minutes from `uptime.yml`. Until 2026-08-05
  the only post-deploy check was `curl /api/health`, which returns `{"ok":true}`
  from a worker with an **empty database** — it proves the process is up and
  nothing about whether a buyer scanning a QR tag sees a garment. The uptime
  workflow's viewer curl was no better: the SPA shell returns 200 and renders its
  no-model state.

  The script fetches `/api/public/viewer/n001/navy` and asserts a product, at
  least one colourway, and a model URL that really fetches and is over 100 KB.

  **It resolves the model URL by the same rule `Stage.tsx:46` uses** —
  `separateMode ? selected.glbUrl : product.glbUrl`, with no fallback between the
  two fields. Writing it as `a || b` would pass on a product whose *unused* field
  happens to be populated, i.e. green CI while every visitor sees the no-model
  state. That case is one of five in the negative control the check was built
  against. It does **not** judge whether the artwork on the model is intact —
  that is not decidable over HTTP, and is gated at pipeline time instead.

## The canonical raw garment

**A raw CLO export is not a durable artifact in this system, and nothing in the
cloud is keeping one for you.**

Two facts, both measured rather than assumed:

- The R2 ingest bucket carries an `expire-raw-uploads` lifecycle rule — **14
  days, all prefixes** — verified live on 2026-08-06.
- `scripts/backup-r2.mjs` mirrors the **media** bucket only. It enumerates keys
  from the CMS `media` table, and raw uploads never enter that table, so the
  ingest bucket is in **no backup at all**.

So the N001 export uploaded on/before 2026-08-05 expired around **2026-08-19**,
and the only copy that survives is a local one.

### What replaced the monthly workflow, and why

`.github/workflows/artwork-real.yml` ran `eval:artwork:real` monthly against the
R2 copy. It was **deleted on 2026-08-07**. It could not have worked: its first
scheduled run was 2026-09-01, by which point the object it pulls was already
deleted — and once the canonical copy became a local one, no GitHub runner can
reach it at all.

It was deleted rather than disabled on purpose. A scheduled job that fails every
month is worse than no job: it trains you to ignore a red X, and this repo has
already paid for that once — the uptime monitor was dead for ~23 hours while its
failures looked like ordinary alerts.

### Running it

```bash
pnpm eval:artwork:real                        # assert against the shipped ceiling
pnpm eval:artwork:real -- --calibrate         # print the damage curve instead
pnpm eval:artwork:real -- --keep output/aw    # keep the renders and contact sheets
pnpm eval:artwork:real -- --all-variants      # every colourway, not just the default
```

⚠️ **Run it on a quiet machine, and never record a number taken while a build or
test suite was running alongside it.**

Measured 2026-08-07 on identical input (checksum verified) with the same Chromium:
**two runs on a busy machine** reported `0.490 / 2.510 / 5.290 / 5.330`, and **three
on an idle one** reported `0.980 / 2.990 / — / 5.810` — identical to three decimal
places across all three, and reproducing the 2026-08-06 calibration exactly. A
*uniform* ~0.48pp offset, not scatter. `--keep` was ruled out as the variable by
running with and without it on an idle machine: byte-for-byte the same numbers.

So this does **not** weaken the determinism claim the eval rests on. It sharpens
it: the numbers are reproducible to three decimals *on an idle machine*, and the
first hypothesis — a Chromium version difference — was wrong. The tell was that the
offset was constant rather than scattered.

All cases are diffed against the same baseline render, so a constant shift across
all of them points at the baseline itself, not at decimation (meshoptimizer is
deterministic). The plausible mechanism is in `render.ts`: after moving the camera
it waits on `jumpCameraToGoal()` plus **two chained animation frames**, which is a
best-effort settle rather than a convergence check — under load a frame can be
captured slightly less converged.

**The verdict is robust to this** — the separation between presets is preserved,
and the quiet-machine numbers reproduce the calibration to three decimal places. So
do not read a small absolute change between runs as a regression. Do re-run on an
idle machine before believing any number you intend to write down.

**When to run it: before shipping any change to a decimation preset, to
`simplify-textured.ts`, or to the texture pipeline.** Not on a calendar — it is
tied to the event that already puts a human in front of it. The per-PR gate in
`ci.yml` (`pnpm eval:artwork`) still runs on every deploy; that one uses a
synthetic fixture and needs no raw export.

### The two guards, and what they are for

Both exist because a wrong input here does not crash — it produces a **plausible
number for the wrong thing**, which is the failure mode this whole area of the
codebase is organised around.

1. **Checksum.** `raw/CANONICAL.json` records the export's size and SHA-256. The
   eval verifies it and refuses to run on a mismatch. A re-export from CLO lands
   at the same path with the same filename and different geometry; without this,
   every threshold in the eval would silently be applied to a garment nobody
   calibrated it on.
2. **Camera framing.** The eval refuses to run if its camera is not pointed at
   the print. `render.ts`'s own `crop-chest` view was framed for a t-shirt; on
   this skinsuit it frames the torso and hips with the wordmark clipped off the
   top edge, and `crop-back` shows a zipper. A mis-aimed camera reports a healthy
   number for *fabric*.

⚠️ **Do not fix a checksum mismatch by editing the checksum, and do not fix a
ceiling breach by raising the ceiling.** Both discard the only evidence that the
numbers mean anything. The evidence is a rendered crop a human looked at — open
the contact sheet.

### Replacing or adding a garment

1. Put the export at `raw/<name>.glb`.
2. `shasum -a 256 raw/<name>.glb`
3. `pnpm eval:artwork:real -- raw/<name>.glb --calibrate --keep output/cal`
4. **Open the contact sheets in `output/cal/`.** Confirm the known-bad case is
   visibly damaged and the shipped preset is not. This step is the authority; the
   numbers only record what you saw.
5. Add an entry to `raw/CANONICAL.json` with the checksum, byte count and the
   ceiling you chose — above `balanced`, below both `known-bad` and `control`.

### Keeping the copy safe

The canonical copy lives on the owner's machine. **One copy on one disk is not a
copy** — keep a second on other hardware (Time Machine or an external drive).
After 2026-08-19 the R2 original is gone, so a lost local copy means N001's
artwork calibration cannot be reproduced at all, and the only route back is a
fresh export from CLO, which would be byte-different and need re-calibrating from
scratch.

**Dependency updates**: Dependabot runs in **quiet mode** — routine version-bump
PRs are off (`open-pull-requests-limit: 0` in `.github/dependabot.yml`) to keep the
branch list clean for a solo maintainer, but it still opens a PR automatically for
a real **security** advisory. Day-to-day, `audit-ci` blocks high/critical
vulnerabilities on every change. To resume routine updates, raise the limits in
`.github/dependabot.yml` (grouping/ignore rules are kept ready); the same CI gates
run on any Dependabot PR before merge.

## The CSP error on every live page load (open, needs a dashboard change)

**Found 2026-08-05 in a real browser on `viewer.wear-run.help`:**

```
Executing inline script violates the following Content Security Policy directive
'script-src 'self' 'wasm-unsafe-eval' 'sha256-wT6H9HqZ3CLsrvABGO2hqbdB9G0iJEbrzwBE6ppc9us='
https://static.cloudflareinsights.com'
```

**It is not our HTML.** The delivered page carries exactly one inline script — the
theme bootstrap in `apps/viewer/index.html` — and `scripts/gen-headers.mjs` hashes
it correctly, which is the `sha256-wT6H9Hq…` the policy already allows. Reading the
live DOM shows a **third** script the HTML never contained:

| # | script | allowed? |
|---|---|---|
| 1 | inline, 426 chars — our theme bootstrap | yes, by hash |
| 2 | `/assets/index-*.js` | yes, `'self'` |
| 3 | **inline, 921 chars, `(function(){function c(){var b=a.contentDocument…`** | **NO** |
| 4 | `static.cloudflareinsights.com/beacon.min.js` | yes, by origin |

Script 3 is injected by **Cloudflare's edge** as the bootstrap for its Web
Analytics beacon (script 4). Its hash changes whenever Cloudflare updates the
beacon, so pinning a hash in `gen-headers.mjs` would go stale silently and is the
wrong fix.

**Impact:** a console error on every page load, and the beacon bootstrap does not
run, so Web Analytics is likely not recording. No user-facing breakage.

**The fix is a Cloudflare dashboard change, not a code change.** Turn off automatic
beacon injection for the zone (Analytics → Web Analytics → the site → disable
*Automatic Setup*). If the analytics are wanted, add the beacon `<script src=…>`
to `apps/viewer/index.html` afterwards — it is a `src` script from an
already-allowlisted origin, so it needs no hash and `gen-headers.mjs` will ignore
it.

**Do not "fix" this by adding `'unsafe-inline'`.** That would re-permit every
inline script on the page and discard the protection the hash list exists to give.

## Rotating PAYLOAD_SECRET

Rotating logs everyone out of `/admin` (sessions are signed with it). Passwords
are unaffected.

```bash
openssl rand -hex 32 | pnpm --filter @run-apparel/cms exec wrangler secret put PAYLOAD_SECRET
# redeploy so the running worker picks it up:
pnpm --filter @run-apparel/cms run deploy
```

## Analytics & events

Viewer telemetry (analytics, diagnostics, client errors) lands in the **Events**
collection in `/admin` (System group). No IP or personal data is stored. The
nightly workflow prunes rows older than 180 days on the 1st of each month; to
prune on demand run `nightly-backup.yml` via *workflow_dispatch*.

Aggregate page views (if enabled) are in Cloudflare **Web Analytics**.

### Somebody has to read them — the weekly digest

`.github/workflows/diagnostics-digest.yml` runs Mondays 08:17 UTC, queries the
last 7 days of `diagnostic` and `error` rows, and opens (or comments on) a
`diagnostics`-labelled GitHub issue. One rolling issue, not one per week.

It exists because **nothing read this table for six weeks.** The 2026-08-03 audit
found it holding 8 × `model-load-error`, 13 × `variant-missing` and an uncaught
React error from real visitor sessions — every one a buyer who did not see a
garment, and none of them known to anybody. The viewer is careful to report *why*
it broke; that only pays off if someone looks.

What the events mean:

| Event | What happened | What to do |
|---|---|---|
| `model-load-error` | A buyer opened a product and the 3D file did not load | Check the GLB is reachable and under 40 MB |
| `model-missing` | A **published** product has no 3D file at all | Attach one, or move it to Draft |
| `variant-missing` | A colour button pointed at a colour not inside the file | Re-answer "Which colour in your CLO file is this?" |
| `webgl-context-lost` | The device gave up the GPU context mid-view — usually memory | Expect on older iPhones with heavy models; the lever is triangle count |
| `variants-unverified-while-published` | A re-upload renamed the colours under a live product | Re-map the colours on the Colours tab |
| `render3d-unavailable` | The device or Data Saver refused 3D up front | Nothing — the poster fallback is working as intended |

## Error tracking

Server-side worker errors are in **Workers Logs** (Observability is enabled in
`wrangler.jsonc`; `wrangler tail` for live). Client-side errors have three layers.

**1. First-party diagnostics → the Events table.** Already running, no
configuration. `lib/telemetry.ts` registers `window.onerror` and
`unhandledrejection` and posts to `POST /api/public/events`; `lib/diagnostic.ts`
adds the named failures in the table above. **This is what works when everything
else is off** — but it carries a *message string only*, capped at 5 per session
and de-duplicated on the first 100 characters. Enough to know something broke,
not enough to find it. Read weekly by `diagnostics-digest.yml`.

**2. React render errors → `ErrorBoundary`.** A component that throws now shows
the branded unavailable state instead of a blank page, and reports through the
same `diagnostic()` seam as `react-render-error`. ⚠️ The reporting is not
optional decoration: React re-throws an *uncaught* render error to
`window.onerror`, so a boundary that stayed silent would trade a white screen for
a white screen nobody hears about. Pinned by `ErrorBoundary.test.tsx`.

**3. Sentry (optional, free tier) → stack traces.** Off by default; set the
`VITE_SENTRY_DSN` repo variable to enable. When unset the SDK is
dead-code-eliminated (measured: zero files matching `/sentry/` in `dist/`). The
CSP auto-allows the DSN's ingest origin at build time.

### Turning Sentry on

1. Create a free Sentry project (platform: `javascript-react`).
2. **In Sentry project settings, before setting the DSN:** switch
   **"Prevent Storing of IP Addresses"** ON and leave **Session Replay** OFF.
   Neither can be done from code — IP capture happens at Sentry's ingestion edge,
   and Replay records the DOM.
3. `gh variable set VITE_SENTRY_DSN --body "<dsn>"`
4. For readable stack traces, also set all three of `SENTRY_ORG` /
   `SENTRY_PROJECT` (variables) and `SENTRY_AUTH_TOKEN` (**secret**, scoped to
   `project:releases`). Without all three, no maps are uploaded *and none are
   generated* — see the coupling note in `vite.config.ts`.

**What the code already guarantees:** `sendDefaultPii: false`; `beforeSend`
strips `user`, cookies, headers, request bodies, and reduces the URL to origin +
pathname so query and fragment can never carry anything; `tracesSampleRate: 0`;
tags limited to release, environment, product slug, colourway slug, WebGL
availability and pointer type. Pinned by `sentry.test.ts`.

**What it cannot leak, structurally:** there is no login, no cookie and no form.
The enquiry path is a `mailto:`/`wa.me` link built client-side
(`components/Contact.tsx`), so nothing a visitor types ever exists in the page.

**Rollback:** unset `VITE_SENTRY_DSN` and redeploy. The SDK leaves the bundle and
the CSP entry disappears with it — no code revert needed.

## Uptime alerts

`.github/workflows/uptime.yml` pings `/api/health` and the viewer every ~15 min
(GitHub cron is best-effort and can drift several minutes — this is monitoring,
not a hard SLA). On failure it opens a single deduplicated GitHub issue labelled
`outage`.

**When an `outage` issue appears:**

1. `curl -i https://cms.wear-run.help/api/health` — 200 `{"ok":true}` = recovered.
2. If down: Cloudflare dashboard → Workers & Pages → `run-apparel-viewer-cms` →
   Logs (Workers Observability is enabled), and `wrangler tail` for live logs.
3. Check the latest CI deploy didn't fail a migration (see above).
4. Once healthy, **close the `outage` issue** (a new one won't open while it's open).

To prove the alert path works: run `uptime.yml` via *workflow_dispatch* with a
bogus `target` URL — it should open an `outage` issue.

Each curl retries twice before failing (`--retry 2 --retry-all-errors`). A single
20-second sample on a best-effort cron was deciding whether to page the owner, so
one transient blip opened an outage issue for a site that was fine.

## Who watches the monitors (`heartbeat.yml`)

**A monitor that fails before it measures anything opens no alert, and silence is
what healthy looks like.** `uptime.yml` gates its issue on
`steps.check.outputs.ok == 'false'`; a job that dies at checkout never sets that
output. That is exactly how the uptime monitor sat dead for ~23 hours on
2026-08-05 while its failures looked like ordinary alerts.

`heartbeat.yml` runs every 6 hours and asks the Actions API when each watched
workflow last **succeeded**:

| Workflow | Runs | Budget before it alerts |
|---|---|---|
| `uptime.yml` | every 15 min | 3 hours |
| `nightly-backup.yml` | nightly | 36 hours |
| `diagnostics-digest.yml` | Mondays | 192 hours (8 days) |

Each budget is several times the workflow's own interval, so GitHub's best-effort
cron skew never trips it. On a breach it opens one deduplicated `monitoring`
issue.

It asks the API rather than requiring workflows to report in, so a workflow that
stops running *entirely* — disabled, renamed, deleted, or silently skipped — is
caught by the same check as one that fails. "No successful run on record at all"
is treated as stale, not as a pass, because a run whose only job is skipped by an
`if:` also concludes as `success`.

**When a `monitoring` issue appears** it does *not* mean the site is down. It
means a check is not running, so whatever it watches is currently unobserved.
Open that workflow in the Actions tab and read its latest run; if it is failing at
`actions/checkout` with "Repository not found", the cause is a `permissions:`
block missing `contents: read`.

⚠️ **The heartbeat cannot watch itself.** That is the accepted base case — the
blind spot shrinks from "every scheduled job" to "one job that makes a single API
call". Closing it entirely needs an off-platform monitor, which this project's
budget does not run to.

## Uploading GLB assets to the CMS (and why an upload fails)

**Always run the asset pipeline before uploading — never upload a raw CLO export.**
The CMS media upload streams **through the Worker** (`r2Storage` in
`payload.config.ts` does not set `clientUploads`), so it inherits Cloudflare's
Worker limits on top of the app's own guardrails.

When an upload "just keeps loading" / never completes, check these in order:

1. **Filename.** `checkMediaUpload` (`apps/cms/src/collections/mediaRules.ts`)
   rejects any name with spaces or characters outside `A–Z a–z 0–9 . _ -`. CLO
   exports are named like `cycling uniform 2_Colorway 6.glb` — **rename to
   `n002-navy.glb` style first.** This blocks the file at *any* size.
2. **Size — 40 MB hard cap.** `GLB_HARD_MAX_BYTES = 40 MB` rejects raw/oversized
   GLBs by design (a pipeline-processed file should be well under 8 MB).
3. **Transport — ~100 MB Cloudflare Worker body limit** (free/pro) + 128 MB Worker
   memory. Anything approaching these can't finish transferring. Fix a genuinely
   large-but-valid need by enabling **direct browser→R2 upload**
   (`clientUploads: true` on the `r2Storage` media collection), which bypasses the
   Worker entirely. Not enabled today — see the deferred item below.
4. **Required `alt` field.** The Media collection requires `alt`; leaving it blank
   makes the save fail *after* the file transfers (looks like a hung upload).

Every one of those rejections is now an `APIError(…, 400)`, so the *real* message
reaches the admin panel. Any rejection thrown from a Payload hook **must** be —
a plain `new Error()` is replaced by Payload's generic handler with the useless
"Something went wrong." (`payload/dist/utilities/isErrorPublic.js` hides anything
without a non-500 status). That cost a full diagnostic round-trip on 2026-07-27;
`rawRules.ts` and `mediaRules.ts` were converted on 2026-07-28.

The **private raw-upload inbox** (`raw-uploads`) deliberately relaxes rules 1–3 —
big files and messy names are its whole purpose — but it rejects the characters
`? * < > : | " / \` and trailing dots/spaces. Not cosmetic: Payload builds the R2
object key with `sanitizeFilename` (path + control chars only) and the document
filename with `sanitize-filename` (which also strips those), so such a name is
stored under two different keys and the integrity guard then reports it as a
failed upload.

**The pipeline recipe for a raw CLO file** (the mesh, not the textures, is the cost
— a real export was 9.8 M triangles / 1 MB of textures):

```bash
pnpm pipeline optimize "raw.glb" --out out.glb --simplify 0.05 --meshopt
pnpm pipeline validate out.glb          # expect 0 translucent, < 40 MB, no CLO generator
```

**Tuning `--simplify` — read this before turning the dial.** `--simplify` is a
*target*, not a promise: decimation stops early once the error budget binds, and
once it does, **lowering the ratio changes nothing at all**. The knobs that
actually move the output are:

| Flag | Default | Effect |
|---|---|---|
| `--simplify-error <r>` | `0.0001` | Error ceiling as a fraction of mesh radius. Raise it for a smaller file. |
| `--uv-weight <n>` | `1` | How heavily texture distortion counts against that budget. **This is what keeps printed logos intact.** Lower it for a smaller file; raise it if artwork looks smeared. `0` turns texture-awareness off. Applies to **every** UV set the mesh carries, not just `TEXCOORD_0`. |
| `--normal-weight <n>` | `0.5` | Same for shading. |
| `--artwork-quality <n>` | `95` | WebP quality for textures detected as printed artwork. Separate from `--quality` because lossy WebP is 4:2:0 chroma only and bleeds the hard edges logos are made of. |
| `--artwork-max-texture <px>` | `4096` | Resize cap for artwork. Higher than `--max-texture`: thin lettering is the first thing resampling destroys. |

⚠️ **Check `--uv-weight` actually applied.** `optimize` and the shrink report both
print a decimation line. Primitives counted as **fallback** were decimated
position-only, so the flag did nothing for them — usually because an earlier
meshopt pass already quantized the attributes. Never re-run the pipeline on its
own output.

Those two knobs trade directly against each other, and the effect is large — the
measured table is in `tools/asset-pipeline/src/simplify-textured.test.ts`. Note
the effect only exists where the UV map is non-linear, which real garment unwraps
are and a flat test plane is not.

**Calibration of the three Detail levels** (2026-07-28). Measured on a synthetic
draped surface — 243,602 triangles, non-linear unwrap, hard-edged texture —
running the real pipeline. "Texture error" is the distance between the UV the
decimated mesh interpolates at a point and the UV that point should have; the
undecimated control measures 1.3e-6, so the numbers below are signal.

| setting | triangles | size (meshopt) | mean err | p99 err |
|---|---|---|---|---|
| OLD `lockBorder`, err 0.0001 | 58,378 | 0.29 MB | 0.00001 | 0.00013 |
| OLD `lockBorder`, err 0.001 | 12,180 | 0.07 MB | 0.00006 | 0.00073 |
| **fidelity** (uv 2, err 0.0002) | 20,421 | 0.11 MB | 0.00003 | 0.00036 |
| **balanced** (uv 1, err 0.0005) | 12,180 | 0.07 MB | 0.00005 | 0.00054 |
| **small** (uv 0.5, err 0.002) | 4,872 | 0.04 MB | 0.00013 | 0.00161 |

> ⚠️ **The row labels are the presets as they stood on 2026-07-28.** The measurements
> are still valid for the settings named, but two of the names have since moved:
> `balanced` is now **err 0.001** (adopted 2026-08-05, taking N001 from 37.7 MB to
> 27.0 MB), and `small` was **deleted** — at err 0.002 it renders the chest wordmark
> with MILE breaking apart while passing all three blocking gates. Read the row for
> `small` as "what err 0.002 costs", which is exactly why it is gone.
>
> Note also what this table cannot tell you: every number in it is a *UV error*
> metric, and the 2026-08-05 sweep showed those metrics stay comfortable while the
> rendered lettering degrades. `packages/shared/src/shrink.ts` is the source of truth
> for the current values.

Read it this way:
- **At equal size**, texture-aware beats position-only: `balanced` and OLD-0.001
  both land on 12,180 triangles, but p99 error is 0.00054 vs 0.00073.
- **The size win is the big one.** `fidelity` gets p99 error within 3x of the old
  safest setting using **2.9x fewer triangles**; `balanced` uses 4.8x fewer. That
  ratio is what takes the real garment's 58.3 MB down under the 40 MB cap.
- **Caveat, stated plainly:** this surface is one smooth UV patch. A real CLO
  unwrap has many islands, and `lockBorder` freezes every island edge — so its
  real-world cost should be *worse* than measured here, not better. Treat the
  table as directional and re-measure on a real garment when one is available.

Historical numbers on one real 373 MB export at `--simplify 0.05 --meshopt`:
`--simplify-error 0.001` with borders unlocked gave 14.2 MB but tore the printed
logos; `lockBorder` with the same budget gave 36.1 MB; `lockBorder` with
`0.0001` gave 58.3 MB — over the 40 MB publish cap, so unusable. Those all
predate texture-aware decimation; re-measure rather than extrapolate.

For the automatic shrinker, do **not** edit flags in the container — pick the
**Detail** level on the raw upload instead (Balanced / Highest quality / Smallest
file). The levels map to these flags in `packages/shared/src/shrink.ts`.

**Detail only moves decimation, and it is worth being exact about what that
rules out.** It is the right knob for artwork that comes back *smeared*, warped
or stretched — that is UV distortion from pushing the triangle budget. It does
**nothing** for artwork that is see-through, hidden behind a pale box, or absent:
those come from `alphaMode`, which `solidifyMaterials` decides per material by
reading the actual alpha, identically at every Detail level. Retrying N001 at
"Highest quality" on 2026-08-04 would have produced a byte-for-byte equivalent
failure. Symptom → knob:

| Symptom | Cause | What actually helps |
|---|---|---|
| Graphic smeared, warped, letters stretched | UV distortion during decimation | **Detail → Highest quality.** Also check `artworkAtRisk` in the report: if it names a part, that part's UVs were outside the error budget. |
| Graphic see-through / "half there" | material left on `alphaMode: BLEND`; `<model-viewer>` has no OIT | Nothing the owner can set. The gate now refuses to save it — read the `Report`, which names the materials. |
| Graphic covered by a pale box | material forced `OPAQUE`, so the transparent background painted its underlying RGB — measured (240,240,240) on N001 | Nothing the owner can set. Fixed in `d8d745f`; a file built before 2026-08-04 still shows it. |
| Graphic missing entirely | a `MASK` whose effective alpha never reaches `alphaCutoff 0.5`, or a decal drawn from its back face only | Nothing the owner can set. Report it. |

**Deferred (owner request):** remove/raise the 40 MB cap and add an upload
progress %/status in the admin. Both hinge on switching media uploads to
`clientUploads: true` (direct browser→R2) so the Worker body/memory limits and the
opaque "just loading" spinner stop applying. Not yet actioned.

## Re-processing a garment (the Retry tick-box)

**When you need this:** the pipeline was fixed and you want the fix applied to a
garment already uploaded. The raw export is still in the R2 ingest bucket (it has
no lifecycle rule), so you do **not** re-upload the file.

**This is the only way to start a re-run.** The job is enqueued by an `afterChange`
hook on the collection (`apps/cms/src/collections/RawUploads.ts`), which fires only
on `create` or on `retry` flipping `false → true` through a save. Writing to D1
directly, or calling the REST API to set the column, enqueues **nothing** — the
row changes and no work happens. There is no developer shortcut for this step.

### Doing it

1. Open `https://cms.wear-run.help/admin/collections/raw-uploads/<id>`
   (the first real garment is id **1**).
2. In the right-hand sidebar, **leave Detail as it is** unless you have a reason —
   see "What Detail can and cannot fix" above. Changing it changes the experiment.
3. Tick **"Try this again"**.
4. Press **Save**.

Processing takes roughly ten minutes. Refresh the page rather than waiting on it.

### Reading the outcome

| `Status` | What it means | What to do |
|---|---|---|
| **Queued** / **Processing** | Picked up, still working. The tick-box has already reset itself to unticked and `Report` reads "Trying again…". | Wait, refresh. |
| **Ready to review** | It produced a file. `The shrunk, pipeline-processed GLB` (`resultGlb`) carries today's date, and `Report` lists the final size and the colours found. | Go to visual acceptance below. |
| **Failed** | The pipeline **refused to save**, which since 2026-08-03 is a designed outcome, not a crash. | Read `Report` — copy it verbatim to whoever is fixing it. |

**The `Report` box is the gate speaking in plain English.** Three structural
findings make the shrink worker throw `PermanentJobError` and save nothing: printed
artwork decimated without its UVs in the error budget, an artwork material left on
`alphaMode: BLEND`, and an artwork `MASK` whose `alphaCutoff` drifted off 0.5. Each
names the offending materials. Do not treat a Failed status as a bug report until
you have read it.

**If the row is stuck or unusable**, uploading the file again creates a new
`RawUploads` row, and `create` enqueues by the same path. That is the fallback, not
the first move — it costs a 350 MB+ upload.

### Visual acceptance — the sign-off

Processing successfully is **not** the same claim as the garment looking right.
This repo keeps those separate on purpose, and the 2026-08-04 fix is measured but,
as of this writing, still unrendered.

- [ ] Open the new `resultGlb` — CMS preview, or attach it to the product in a
      draft and open the viewer.
- [ ] **Zoom right in on the chest logo, on a phone.** For N001 the wordmark must
      read `✳ THE EXTRA MILE` in full.
- [ ] It is **not** see-through and **not** sitting in a pale box. (The 2026-07-29
      file rendered a near-white box measured at (240,240,240).)
- [ ] It is **not missing entirely.** A logo that vanished is a different fault —
      a decal whose faces point inward and is no longer double-sided.
- [ ] Edges are clean, not smeared or torn. *That* one is a Detail problem.
- [ ] Screenshot the chest crop and attach it to `docs/OPEN-ISSUE-ARTWORK.md`.

Until that screenshot exists, the artwork issue stays open regardless of what the
tests say.

## API + media domain cutover

> **Status (2026-07-22): MEDIA HALF DONE, API HALF BLOCKED on the free plan.**
> - **Media:** ✅ cut over. Served direct from R2 at `media.wear-run.help`
>   (R2 custom domain, Active) with a 30-day edge Cache Rule
>   (`viewer-media-30d-edge-cache`) and a bucket CORS policy (viewer origins,
>   GET/HEAD). `PUBLIC_MEDIA_BASE_URL=https://media.wear-run.help` is set in
>   `wrangler.jsonc` and live. Reliable from datacenters too (edge-cached
>   responses bypass Bot Fight Mode) — verified 6/6 from GitHub runners.
>   **Incident found during this work:** the deployed var had been mis-set to
>   the literal `RUN` (stray dashboard edit) → all media URLs became
>   `<origin>/RUN/<file>` → **every poster/GLB 404'd and the streaming fallback
>   500'd on the live site**. If media ever breaks across the board, check this
>   var first. Emergency fallback: set it to `""` (media streams through the
>   CMS worker) and purge the `media.wear-run.help` hostname cache. Note R2
>   sends `Vary: Origin`, so per-origin cache entries self-heal after a CORS
>   policy change — but purge the hostname once after editing the policy.
> - **API:** ❌ still on `workers.dev`. A cutover attempt to `cms.wear-run.help`
>   was **rolled back**: free **Bot Fight Mode** *intermittently* returns HTTP
>   **403** to datacenter/automated requests on `cms.wear-run.help` (caught by
>   the post-deploy health check; ~low frequency but real). Residential browsers
>   usually pass, so casual `curl` tests give false confidence — do NOT trust a
>   handful of green curls. The `workers.dev` zone has no Bot Fight Mode and is
>   reliable. The existing "Exempt CMS API" WAF **Skip** rule cannot exempt the
>   *free* Bot Fight Mode (only Super Bot Fight Mode is per-host exemptible), so
>   it does NOT fully solve this — and it is therefore **load-bearing, not a
>   redundant leftover; do not delete it.**
> - **To finish the API half you need the Cloudflare Pro plan (~$20/mo):** enable
>   **Super Bot Fight Mode** + a WAF Skip rule for `http.host eq
>   "cms.wear-run.help"`, then repeat the repoint below and confirm the CI
>   health check stays green across several deploys before retiring workers.dev.

**Where we are now.** The viewer calls the CMS API via the worker's
`run-apparel-viewer-cms.<account>.workers.dev` URL (the `VITE_API_BASE_URL` repo
variable), because the `wear-run.help` zone's **Bot Fight Mode** (protecting the
separate live commercial site) challenges automated requests to
`cms.wear-run.help` and — unlike Super Bot Fight Mode — it cannot be exempted
per-hostname. Media is served from `media.wear-run.help` (done). Visitors only
ever see `viewer.wear-run.help`; the workers.dev URL is internal.

**Target end state.** API served from `cms.wear-run.help` (Bot Fight Mode
resolved via Pro/Super Bot Fight Mode), media served direct from R2 at
`media.wear-run.help` (done), and the workers.dev URL retired.

Do this as one coordinated cutover — **in this order**, so live media/API never
break mid-flight (each config flip is a one-liner already commented in
`apps/cms/wrangler.jsonc`):

1. **Resolve Bot Fight Mode for the API host.** In the zone → *Security → Bots*,
   turn on **Super Bot Fight Mode**, then *Security → WAF → Custom rules* add a
   **Skip** rule (skip Super Bot Fight Mode) for
   `http.host eq "cms.wear-run.help"`. Verify a plain `curl -fsS
   https://cms.wear-run.help/api/health` returns `{"ok":true}` with no challenge.
2. ✅ **Connect the media domain — DONE (2026-07-22).** R2 →
   `run-apparel-viewer-media` → custom domain `media.wear-run.help` (Active),
   Cache Rule `viewer-media-30d-edge-cache` (Edge TTL 30 days, ignore origin
   cache-control), bucket CORS policy for the viewer origins.
3. **Point the viewer at the custom domain:**
   `gh variable set VITE_API_BASE_URL --body https://cms.wear-run.help`.
4. **Flip the two worker config values** in `apps/cms/wrangler.jsonc`:
   `PUBLIC_MEDIA_BASE_URL` → `"https://media.wear-run.help"`, and once step 3 is
   live, `workers_dev` → `false`. Commit + deploy (the next push/merge).
5. **KEEP the "Exempt CMS API subdomain from bot challenges" custom rule** —
   this supersedes older advice to remove it. It is load-bearing (skips managed
   rules / Browser Integrity Check / Security Level for the cms host, and
   deliberately does *not* skip rate-limiting rules, so the merged
   login-rate-limit keeps firing). With Super Bot Fight Mode on, its "All Super
   Bot Fight Mode Rules" checkbox becomes the step-1 exemption — one rule doing
   both jobs.
6. **Verify:** the CSP already allows `*.wear-run.help`, so no viewer change is
   needed. Check `curl` on the API + a `media.wear-run.help/...` URL (long
   `cache-control`), then load `viewer.wear-run.help/n001/navy`; run the QA
   checklist. Roll back by reverting step 4 and re-pointing `VITE_API_BASE_URL`
   at the workers.dev URL if anything regresses.

The admin panel is reachable at `cms.wear-run.help/admin` throughout (a real
browser solves any challenge automatically).

## Viewer: Pages → Worker cutover

The viewer can deploy either to a **Worker with Static Assets**
(`apps/viewer/wrangler.jsonc`, Cloudflare's 2026 recommended static platform —
**the current target**, `VIEWER_DEPLOY_TARGET=worker`) or to Cloudflare **Pages**
(kept only as the rollback path documented at the end of this section).

> **Status: ✅ CUT OVER COMPLETE (2026-07-22).** The Worker
> **`run-apparel-viewer-site`** serves `viewer.wear-run.help` (custom domain
> attached in the dashboard; `VIEWER_DEPLOY_TARGET=worker`). The old
> `run-apparel-viewer` Pages project has been **deleted**, and the worker's
> `workers_dev`/`preview_urls` are disabled — the custom domain is the only
> public surface. `run-apparel-viewer.pages.dev` was also removed from
> `VIEWER_ALLOWED_ORIGINS` (CMS CORS) and from the R2 bucket CORS policy scope.

How it works / notes learned during the cutover:

- SPA fallback comes from `not_found_handling: "single-page-application"` in
  `apps/viewer/wrangler.jsonc`; the Pages-style `dist/_redirects`
  (`/* /index.html 200`) is **rejected** by Workers Static Assets as an
  infinite-loop rule (code 100324), so the CI worker-deploy step deletes it
  before `wrangler deploy`. `dist/_headers` (CSP + immutable caching) is
  honoured natively.
- A Worker custom domain refuses a hostname that already has DNS records
  ("externally managed DNS records"): the old proxied CNAME
  `viewer → run-apparel-viewer.pages.dev` had to be **deleted in DNS → Records
  first**, then the domain added to the worker (brief downtime between the two
  steps; the worker then manages its own record).
- Immediately after deploy/domain changes, expect a few minutes of DNS/route
  propagation (transient 404s or stale resolution) before judging health.

**Rollback to Pages** (the CI Pages steps are kept for exactly this):

1. `gh variable set VIEWER_DEPLOY_TARGET --body pages` and run
   `gh workflow run ci.yml --ref main` — the deploy job **recreates** the Pages
   project (`run-apparel-viewer`) and deploys the viewer to it.
2. Dashboard: remove `viewer.wear-run.help` from the worker, then add it as a
   custom domain on the recreated Pages project.
3. Re-add `https://run-apparel-viewer.pages.dev` to `VIEWER_ALLOWED_ORIGINS`
   in `apps/cms/wrangler.jsonc` if the pages.dev URL is used directly.

## Login protection

The admin login locks an account for 10 minutes after 5 failed attempts
(`maxLoginAttempts`/`lockTime` on the Users collection). A Cloudflare rate-limit
rule on `cms.wear-run.help/api/users/login` adds an IP-level edge layer — see
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) §3 for the exact rule.

## Admin accounts & roles

Two roles by design (enforced in `apps/cms/src/access/roles.ts`):

| Role | Value | Can do |
|---|---|---|
| **Admin / Director** | `admin` | Everything: products, colourways, media, **users**, **site settings** |
| **Editor** | `editor` | Products, colourways, media only — never users, roles or settings |

"Director" is the admin role's label, not a separate tier. Editors can read only
their own user record (needed for their session); only admins create/modify users
or change roles.

**Verify / rotate the `admin@wear-run.help` account** (do this on go-live and
periodically):

1. Log in at `https://cms.wear-run.help/admin` → *Users*. Confirm exactly the
   intended people exist and that `admin@wear-run.help` has role **Admin /
   Director**. Delete or downgrade any stray accounts.
2. Rotate its password from the user's *Account* screen (or *Users → edit*). This
   is independent of `PAYLOAD_SECRET` — rotating the secret logs everyone out but
   does not change passwords (see "Rotating PAYLOAD_SECRET").
3. The production database must **never** contain the local dev seed admin. The
   seed only creates it when `SEED_DEV_ADMIN=1` (local `seed` script) and never
   in production (`apps/cms/src/seed/seed.ts` guards this); confirm no
   known-password dev admin exists in prod.

## Viewer security headers (CSP)

The viewer ships a Content-Security-Policy plus `X-Content-Type-Options: nosniff`
and `Referrer-Policy` via `dist/_headers`, honoured by Cloudflare Pages and
Workers Static Assets. `_headers` is **generated** by
`apps/viewer/scripts/gen-headers.mjs` at build time — do not hand-edit
`dist/_headers`. The generator:

- hashes the inline theme `<script>` so `script-src` needs no `'unsafe-inline'`;
- bakes the API origin in from `VITE_API_BASE_URL`, and allows `*.wear-run.help`
  (media);
- allows `blob:` in `connect-src` and `worker-src` — the Meshopt decoder builds
  its worker's source as a Blob, and every production GLB is Meshopt-compressed.

**No third-party origin is allowed for decoders.** `www.gstatic.com` used to be
in `connect-src` for model-viewer's built-in Draco and KTX2 locations;
`apps/viewer/scripts/copy-decoders.mjs` now self-hosts all three and `Stage.tsx`
points at the local copies, so it was removed. Adding a codec means adding its
decoder to that script, not re-opening the CSP.

To change what the viewer may load, edit the generator (not the output) and
re-run the build; the webgl e2e spec fails on any CSP violation, so a missing
directive is caught in CI. If a subresource ever breaks in production, widen the
relevant directive there. The CSP is validated against the real 3D-model load in
`apps/viewer/e2e/webgl.spec.ts`.

## The home-directory git footgun (developer note)

`~` (the home directory) is itself a git repo on the original author's machine.
This project has its **own** `.git`, so commands run from inside it are safe —
but never run `git` from `~` or a parent directory, and never `git add -A` there.
