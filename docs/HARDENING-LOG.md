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

## Addendum — 3D viewer render fix + compression pipeline (2026-07-23)

Three symptoms reported on `viewer.wear-run.help/n001/navy`: very slow load,
flat/grey fabric, and blacked-out logos. Investigation (against live production
data) traced all three to one root cause: the CMS `glbUrl` pointed at
`WOMEN JACK_Colorway A.glb` — a **raw 66 MB CLO export of the wrong garment**
(generator `CLO Standalone OnlineAuth`, 43.5 MB of it uncompressed PNG, no
`KHR_materials_variants`), served to a `<model-viewer>` that had **no
`environment-image`** so PBR materials rendered flat.

What shipped (both merged to `main`, deploying):

| PR | Area | Change |
|---|---|---|
| #10 | Viewer lighting | `environment-image` (a generated, round-trip-verified studio HDR in `apps/viewer/public/env/` + `apps/viewer/scripts/gen-env-hdr.mjs`), `tone-mapping="neutral"` (model-viewer v4 default), `exposure`, `shadow-softness` |
| #10 | Pipeline | Shared optimizer (`tools/asset-pipeline/src/optimize.ts`): **WebP** textures + 2048px cap (via `sharp`), **Meshopt/Draco** geometry, a single-file **`optimize`** command |
| #10 | Guardrails | `validate` flags raw-CLO/oversize/uncompressed textures (`--strict` = CI gate); CMS `mediaRules.ts` rejects unsafe filenames + GLBs > 40 MB |
| #11 | Pipeline | **KTX2 / Basis** (`--ktx2`, `KHR_texture_basisu`) via WASM `ktx2-encoder` — ETC1S colour + UASTC normals; `next` 16.2.10 → 16.2.11 (clears four fresh advisories) |

Gotchas learned:

- *gltf-transform overwrites `asset.generator` on read* with its own value — so
  raw-CLO detection must read the generator straight from the GLB JSON chunk
  (`readGlbGenerator`), not from the parsed Document.
- *`ktx2-encoder` needs a Node `imageDecoder`* (the browser build uses a canvas);
  `sharp` supplies it and doubles as the resize step. No native `toktx` in CI.
- *An `environment-image` alone does not fix the black logos* — model-viewer
  already ships a neutral light; the black comes from the export's
  `baseColorFactor [0,0,0]` decal materials. That half is a CLO re-export fix.

**Status — NOT yet user-visible.** All three symptoms remain in production until
the owner re-exports the **correct** garment through the pipeline and re-uploads;
the live asset is still the raw jacket. The code/guardrails are the enabling
infrastructure, not the content fix. Verification snapshot: `pnpm typecheck` ·
`pnpm test` (102) · `audit-ci` · e2e (10, incl. real WebGL under CSP) — all green.

## Addendum — opaque + simplify pipeline steps, and the CMS upload investigation (2026-07-23, session 2)

Working from real owner assets (a **cycling uniform**, 5 colourways exported from
CLO 2025.2.236). Two new pipeline capabilities shipped and one upload mystery was
fully diagnosed.

### 1. Opaque + double-sided step (fixes see-through fabric)

`<model-viewer>` (three.js) has **no order-independent transparency (OIT)**. CLO
frequently exports opaque fabric as `alphaMode: BLEND` (a stray fabric opacity
value, or an unused alpha channel in the base-colour texture), which then renders
**see-through** — the garment's back faces show through the front. Fix belongs in
the material, not the viewer.

- `solidifyMaterials()` in `tools/asset-pipeline/src/optimize.ts` decides **per
  material, from the texture's actual alpha channel** — not by blanket rule:

  | Base-colour alpha | Result |
  |---|---|
  | absent, or every pixel solid, and `baseColorFactor[3] ≈ 1` | **OPAQUE**, double-sided — the CLO stray-opacity case |
  | hard binary cutout | **MASK** `alphaCutoff 0.5`, **not** double-sided — a printed decal |
  | genuinely graded | left **BLEND** and reported — real sheer fabric |

  Updated 2026-07-31. It previously forced *every* BLEND material to OPAQUE and
  double-sided *everything*. Those are two different situations: flattening a
  decal fills its cutout back in with the base colour, which reads as artwork
  that is half there. MASK is order-independent and keeps the shape. MASK
  materials are no longer double-sided either — a decal has no inside to see, and
  drawing its back faces invites the z-fighting that speckles printed graphics.
  Nothing is ever forced single-sided.
- On by default in the CLI (`merge`, `optimize`); opt out with
  `--keep-transparency` / `--no-opaque` for genuinely sheer garments.
- ⚠️ `--keep-transparency` is **not** the fix for damaged artwork. `<model-viewer>`
  has no order-independent transparency, so restoring BLEND on a multi-part
  garment trades one "half visible" for depth-sorting artefacts. It is a
  diagnostic; the fix is MASK.
- Guardrail: `validate` now warns when any material is still `alphaMode BLEND`
  (`translucentMaterialCount`), so a see-through export is caught before upload.

### 2. Simplify (geometry decimation) step — the big size lever

**The key finding.** Texture compression alone barely dented the owner's files:
a 364 MB CLO export → ~66 MB (WebP) / ~75 MB (KTX2 — *larger*, mipmaps). Byte
breakdown of the real file exposed why:

| Component | Size |
|---|---|
| All 22 textures (WebP) | **1.0 MB** |
| Geometry | **153 MB raw** — 9.8 M triangles / 6.3 M vertices |

CLO's cloth-simulation mesh is ~50× denser than a web viewer needs. **Geometry,
not textures, is the dominant cost of a raw CLO export**, and splitting into
per-colour files does NOT help (the heavy mesh is shared, so it just repeats).

- New `--simplify <ratio>` flag (`optimize` + `merge`): `weld()` then
  `simplify()` (meshoptimizer `MeshoptSimplifier`) to the requested triangle
  fraction, before geometry compression. Off by default (lossy; opt-in).
- Result on the real file: `optimize --simplify 0.05 --meshopt` →
  **364 MB → 14 MB (−96 %)**, variants and colours intact, 0 translucent.
- Gotcha learned: **KTX2 can be larger than WebP on disk** for these assets
  (Basis + mipmaps); KTX2's win is GPU VRAM, not file size. WebP is the better
  default for the wire; `--simplify` is the real size lever for CLO.

### 3. Why CMS uploads were failing (diagnosed, not yet changed)

Owner reported that uploads to `cms.wear-run.help/admin` "just keep loading" and
never finish — a 350 MB file **and** a ~30 MB file both failed. Root causes, in
order of how often they bit:

1. **Filenames.** `checkMediaUpload` (`apps/cms/src/collections/mediaRules.ts`)
   rejects any filename with spaces/unsafe chars. Every owner file was named like
   `cycling uniform 2_Colorway 6.glb` / `cycling all colours-optimized (2).glb`
   (spaces + parentheses) → **rejected regardless of size** (this is why even the
   30 MB file failed). Proven by running `checkMediaUpload` against sample facts.
2. **Size — 40 MB hard cap.** `GLB_HARD_MAX_BYTES = 40 MB` blocks the big files
   by design.
3. **Transport — Cloudflare Worker body limit (~100 MB, free/pro).** Uploads
   stream **through** the Worker: `r2Storage` in `payload.config.ts` does **not**
   set `clientUploads`, so the browser→Worker→R2 path inherits the Worker's
   request-body and 128 MB memory limits. A 350 MB body can't even transfer.

**Fix delivered:** ran the owner's raw 364 MB combined file through the new
pipeline → `~/Downloads/cycling-uniform.glb` (14 MB, clean name, opaque, 5
colourways). That file clears all three gates and uploads.

**Open items (owner asked to defer — see the next-session prompt):** raising/
removing the 40 MB cap (needs `clientUploads: true` for direct browser→R2 so the
Worker limits stop applying), and an upload progress %/status in the admin.

### Housekeeping
- `.claude/launch.json` added — named dev servers `viewer` (Vite, 5173) and
  `cms` (Next, 3000).
- Verification snapshot (asset-pipeline package): `pnpm typecheck` clean ·
  `pnpm test` **36 passing** · real-file `optimize`/`validate` runs green.

---

## Addendum — audit of the raw-upload fixes; texture-aware decimation (2026-07-28)

Brief: independently verify the four upload defects fixed on 2026-07-27, trusting
nothing. All four held up, and were confirmed **live in production** rather than
only in source. The audit then found two more defects downstream that would have
made the first end-to-end run fail, plus one false claim in these very docs.
Full narrative: [SESSION-2026-07-28.md](SESSION-2026-07-28.md).

### 1. Decimation now weighs texture error, not mesh borders

The 2026-07-27 logo fix used meshoptimizer's `LockBorder`. It stopped the tearing,
but only as a side effect of freezing **every** topological border — necklines,
cuffs, hems, every UV-island edge. Measured on the real 373 MB export that took
850 k triangles to 6.0 M / **58.3 MB**, against a 40 MB publish ceiling. So the
"fix" made the pipeline incapable of ever completing: the shrink job would POST an
over-size file, be rejected by `checkMediaUpload`, retry twice and dead-letter.

`tools/asset-pipeline/src/simplify-textured.ts` uses `simplifyWithAttributes`
instead — the function meshoptimizer's own README documents for "texture
deformation (by using texture coordinates)", which is precisely this failure. UV
error goes into the error budget, so `LockBorder` becomes unnecessary and the mesh
interior is free to collapse. Anything the fast path cannot take (no UVs,
quantized attributes, non-triangle modes) falls back to the library's position-only
`simplifyPrimitive` with `lockBorder`, so the conservative behaviour is the floor.

**Decision: keep the fallback rather than replace outright.** The new path is
better on every measurement taken, but every one of those measurements is on a
synthetic surface. Leaving a floor costs a few lines and removes the possibility
of a garment shape we have not anticipated coming out worse than before.

Calibration table (synthetic 243 k-triangle draped surface, non-linear unwrap,
control = 1.3e-6): see [SESSION-2026-07-28.md](SESSION-2026-07-28.md) and
`tools/asset-pipeline/README.md`. Headline: at equal size the texture-aware path
has ~26 % lower p99 texture error, and it reaches comparable protection with
2.9–4.8× fewer triangles.

### 2. Tuning moved out of the container image

The pipeline source is baked into the container, so changing a decimation setting
used to cost a Docker build and a `wrangler deploy`. Settings are now chosen per
upload from a **Detail** field on the raw upload (Balanced / Highest quality /
Smallest file), passed through the queue message, and applied by the container.
Re-tuning a garment is a re-upload.

**Decision: three named levels, not a numeric field.** The owner is
non-technical, and the two underlying knobs (`--uv-weight`, `--simplify-error`)
interact in a way that is not guessable — the calibration above exists precisely
because it was not guessable by us either.

### 3. Error surfacing, finished properly

`fd0ecc6` converted `RawUploads.beforeChange` to `APIError`. It did not touch
`rawRules.ts` or `mediaRules.ts`, which still threw plain `Error` from
`beforeValidate` — so **every routine rejection an operator actually hits** still
rendered as "Something went wrong.". The one path that had been fixed was the rare
one. Now `APIError(msg, 400)` at all six sites, asserted in the unit tests.

**Rule going forward:** any user-facing failure thrown from a Payload hook must be
`APIError(message, status)`. `payload/dist/utilities/isErrorPublic.js` hides
anything without a non-500 status.

### 4. Smaller things that were one incident away from mattering

- **Shrink Worker memory.** `arrayBuffer()` → `new File([...])` → `FormData` cost
  two extra full-size copies inside a 128 MB isolate — 120–170 MB for a 40 MB
  model. Now a hand-built multipart envelope around the container's response
  stream; the bytes are only ever in flight.
- **Deterministic failures no longer retry.** A too-big output was worth three
  `standard-4` container runs to reach the same answer. Permanent failures `ack()`.
- **Filename desync.** The R2 key is built with `sanitizeFilename` (path + control
  chars) and the document filename with `sanitize-filename` (which also strips
  ``/ ? < > \ : * | "`` and trailing dots). A name containing one is stored under
  two keys, and the integrity guard then reports a good upload as failed. Rejected
  at `checkRawUpload` with a message that says to rename the file.
- **`allowRestrictedFileTypes` dropped.** Believed load-bearing; never was. With
  `mimeTypes` unset, `checkFileRestrictions` tests `name.endsWith(ext)` against an
  executable blocklist, and no restricted extension is a suffix of "…glb". Setting
  it only disabled that blocklist for the whole collection.
- **Patch guard.** `storageR2Patch.test.ts` asserts the *installed bytes* still
  carry the storage-r2 multipart fix. pnpm 10 raises `ERR_PNPM_UNUSED_PATCH` when
  the version key matches nothing (verified by deliberately breaking it), but that
  does not cover the patch being edited, removed, or applied to a file upstream
  changed.

### 5. CI could not deploy the container at all

`deploy-shrink.yml` had failed on every run since it was written. The image built
fine; the *registry push* was refused with `ApiError: Forbidden`,
`{ error: 'Authentication error' }` — which names neither the missing permission
nor the step. There is no Cloudflare permission template for containers and their
docs say only that authentication "is handled automatically". The requirement,
derived from wrangler's own OAuth scope list: Account **Containers:Edit** *and*
**Cloudchamber:Edit**. Fixed 2026-07-28; run `30368254285` was the first success.

The workflow now ends by printing `wrangler containers list` next to the run's own
timestamp, so a green run carries its own proof the **image** moved rather than
just the Worker script.

### 6. Docs were wrong in both directions

`RUNBOOK.md` claimed the auto-shrink pipeline was "not operational". It had been
deployed by hand and was healthy the whole time; the claim was inferred from CI
logs. Then this session created the mirror error — banners saying the CI deploy
was broken, left in place after fixing it. Both cost real time.

**Rule:** for any "is X deployed?" question, query the platform
(`wrangler containers list`, `wrangler deployments list`, a D1 `SELECT`), never
the CI history. And when a status claim stops being true, it is not documentation
debt — it is a defect.

### Verification snapshot

`pnpm typecheck` clean · `pnpm test` **159 passing** across 5 packages ·
`pnpm build` clean · patched storage-r2 confirmed present in the freshly-built
client chunk *and* in the one production serves · CI green · container `version 3`
(`sha256:26d43a29…`) `ready`, 0 errors.

> **Correction (2026-07-31).** This snapshot originally ended "· ingest bucket
> lifecycle `expire-raw-uploads` (14 days) live". That was not true and is not
> true now: re-verification on 2026-07-28 found only R2's default "abort
> incomplete multipart uploads" on `run-apparel-viewer-ingest`, which does not
> delete completed objects. `apps/cms/wrangler.jsonc` asserted the same thing and
> has been corrected too. Raw ~350 MB exports still accumulate and bill
> indefinitely — see [RAW-UPLOAD-PIPELINE.md](RAW-UPLOAD-PIPELINE.md) for the one
> command that fixes it. Recorded here rather than quietly edited, because this
> log's own rule is that a status claim which stops being true is a defect.

**Still outstanding, and not a code problem:** the pipeline has never been
exercised end to end (`raw_uploads` is empty), and N001 is published with
`glbUrl: null` — the live page renders its static fallback with no model. Both
need a CLO export whose colourways are named exactly `N001-NAVY`, `N001-BLACK`,
`N001-CRIMSON`. See [FIRST-GARMENT-UPLOAD.md](FIRST-GARMENT-UPLOAD.md).

---

## Addendum — artwork pipeline fixes + the 2026-07-29 backlog (2026-07-31)

The blocking issue was that printed artwork came out damaged on the first real
garment, three candidate causes had been written down, and **none had been
tested** — because there was no way to look at a logo without opening the live
site on a phone. Every preset change to that point had been made against
file-size numbers alone, which is how a setting that protects artwork *less*
shipped as "Smallest file".

### 1. Build the ability to see, before changing anything

Three CLI verbs — `pipeline textures` (texture inventory + PNG dump, no
processing), `pipeline render` (screenshots through `<model-viewer>` on flat
neutral lighting, including tight logo crops), `pipeline compare` (contact sheet:
A | B | amplified difference, with the unamplified numbers per row) — plus
`tools/asset-pipeline/scripts/bisect-artwork.mjs`.

**The bisect is subtractive, not one-variable-at-a-time.** Varying settings
answers "which knob helps", which had already been asked twice and produced a
worse preset. Removing one stage at a time from the real chain answers "which
stage does the damage". Every run starts from the raw file; the script now
refuses to bisect an already-processed GLB, because meshopt quantizes attributes
and the simplifier silently drops to its position-only fallback, so a second pass
blames the wrong stage. That trap cost two sessions.

### 2. Three causes, each traceable to a line

| | Cause | Fix |
|---|---|---|
| **H4** | Decimation interleaved only `TEXCOORD_0`, so artwork on a second UV set was decimated at **zero weight** while fabric UVs were protected at full weight | `listUvSets()` collects every `TEXCOORD_n` and prices them identically |
| **H5** | Lossy WebP is **4:2:0 chroma only**, which bleeds the hard saturated edges logos are made of | `texture-artwork.ts` replaces `textureCompress`; `smartSubsample` on for every texture, detected artwork at q95 / `alphaQuality 100` / 4096 cap |
| **H6/H3** | `solidifyMaterials` forced *every* BLEND material OPAQUE and double-sided *everything* | Decided per material from real alpha; cutouts become **MASK**, and MASK materials are no longer double-sided |

H4 also explains why `--uv-weight` tuning never helped: on those materials the
knob was not connected to anything.

**A measured correction that narrowed H4.** The first write-up claimed it hit any
material with `texCoord: 1`. Driving `prune()` directly showed otherwise — it
calls `shiftTexCoords`, so a *lone* second UV set is renumbered down to
`TEXCOORD_0` before decimation ever sees it, and is harmless. The hazard is a
material sampling **two or more** sets at once (fabric AO on UV0 plus a graphic
on UV1). The diagnostic keys on that, not on "any texCoord != 0", which would
have sent the next person chasing a phantom. Pinned by a test that drives
`prune()` both ways.

### 3. Fixtures that can fail — and immediately did

`seed:assets` now merges with `--meshopt`, and the placeholder tee carries a
printed graphic on a second UV set over a BLEND material with a hard cutout.

That change **found a live production bug within minutes**: the Meshopt decoder
builds its worker's source as a Blob and loads it through a `blob:` URL, Chromium
checks that against `connect-src`, and `connect-src` had no `blob:` entry. Every
production garment was raising a CSP violation on load. It was invisible because
the seeded placeholder was uncompressed — the *same* blind spot that let the
missing `meshoptDecoderLocation` reach production on 2026-07-29 with 177 tests
green.

**Rule:** a fixture that cannot exhibit the failure mode is not a fixture. If
production compresses, seed compressed. If production prints, seed a print.

### 4. The backlog

**The migration replay harness did not exist.** `SESSION-2026-07-29.md` records
it as the fix for the data-loss incident; nothing was ever committed, so the
incident could recur exactly as before. It now replays every migration against
real SQLite with **foreign keys ON**, seeds every table generically, and fails if
any table that had rows ends up empty. One test reproduces the original loss and
asserts the harness catches it — a harness that cannot fail on the bug it was
written for is decoration.

It found two more latent bugs the same day:

- `add_events` and `add_raw_uploads` dropped a table while a live column still
  referenced it, guarded by `PRAGMA foreign_keys=OFF` — **a no-op on D1**, since
  SQLite ignores that pragma inside a transaction and D1 wraps statements in one.
  Fixed by ordering. `defer_foreign_keys` defers *checks*, not cascades, so the
  pragma alone would not have saved either.
- The initial migration's `down` dropped `users`/`media`/`products` before the
  `_rels` tables referencing them, failing with `no such table: main.users`.

**Shrink retries leaked Media docs.** Every re-run created a new doc and
overwrote `resultGlb`, stranding the previous one in the **public** bucket. The
`-2` in `cycling-all-colours-optimized-2.glb` is that leak, recorded in a
filename. Now retired *after* the replacement is attached, guarded by a reference
check that **fails safe** — any error, any unexpected shape, and the answer is
"still referenced". `scripts/find-orphan-media.mjs` cleans up what already
leaked, dry-run by default.

**Two silent-failure sinks closed.** The queue consumer's failure-reporting write
ended in a bare `.catch(() => {})` — twelve lines from the machinery written to
prevent exactly that, so the one failure that mattered most was guaranteed to be
silent. And `App.tsx` collapsed every load failure into one screen with nothing
recorded anywhere.

**Build and CI.** Decoders are asserted non-empty before the build proceeds — they
are generated and gitignored, so their absence was invisible in the repo *and* at
build time, which is indistinguishable from the bug the script exists to prevent.
Draco and KTX2 are now self-hosted alongside Meshopt, so **`gstatic.com` is gone
from the CSP entirely** (verified by encoding and rendering a GLB in each codec
through the self-hosted files). Two exit-code masks tightened. And the **shrink
container is now typechecked in CI** — it is not a workspace member, so
`pnpm -r typecheck` had been skipping the code that processes every real garment.

### Decisions worth keeping

- **`--keep-transparency` is a diagnostic, not a fix.** `<model-viewer>` has no
  order-independent transparency, so restoring BLEND on a multi-part garment
  trades one "half visible" for depth-sorting artefacts. Where alpha is
  implicated the answer is MASK.
- **The H6 quantization half was deliberately not touched.** `quantizePosition: 14`
  is a sensible default and loosening it costs size on every garment. If the
  bisect's `no-meshopt` run comes back clean, the targeted fix is a larger
  `quantizationVolume` or a bigger decal offset at export.
- **8 MB is probably not reachable for this garment.** 95 % of the file is
  geometry, so texture codecs and KTX2 cannot close it, and per-colourway
  splitting does not help because `KHR_materials_variants` shares geometry.
  Correct UV weighting is what buys headroom to decimate harder; if that is not
  enough, adjust the guideline rather than ship torn logos to meet a number.

### Verification snapshot

`pnpm typecheck` clean across 5 packages **plus the container** ·
`pnpm test` **252 passing** (from 187) · `pnpm build` clean · **10/10 e2e**
including the WebGL suite against a Meshopt-compressed model · CI green.
Manually exercised: all three CLI verbs, the bisect script end to end, Draco and
KTX2 renders through the self-hosted decoders, and the seeded fixture resolving
its decal to MASK.

**Still outstanding, and not a code problem:**

- **The artwork is not confirmed fixed.** Three mechanisms were real and no longer
  happen; nobody has re-processed the 382 MB raw file and looked at a logo. That
  needs the R2 credentials and the owner's eye — run the bisect.
- N001 is published as "Velocity Performance Tee" but the uploaded garment is a
  cycling suit. A content decision.
- Neither R2 bucket has a working lifecycle rule (see the correction above).

---

# 2026-08-03 — the audit that started outside the repo

Every previous entry in this log begins by reading code. This one began by
querying the running system: Cloudflare Workers/D1/R2, the public API, and the
live site in a real browser. **Almost nothing below was visible from the source.**

## The finding that matters most is a pair of timestamps

| | |
|---|---|
| Live GLB `cycling-all-colours-optimized-2.glb` built | 2026-07-29 14:34 UTC |
| The artwork fixes landed (commit `7bef9c4`) | 2026-07-31 16:37 UTC |

The artwork damage was photographed on the live site — the chest wordmark reading
`⬛HE EXTRA ⬛⬛⬛⬛E` where it should read `✳ THE EXTRA MILE` — which finally
answered the question `OPEN-ISSUE-ARTWORK.md` had carried for five days. But the
file serving it is two days older than the fix, so it answered a *different*
question than it appeared to. The fix remains untested. One **Retry** tick in the
CMS re-runs the fixed pipeline on the original raw file, which is still in the
ingest bucket, and settles it.

**The lesson generalises past this bug:** "we fixed it" and "the fix is running"
are different claims, and the repo could not distinguish them. The same shape as
2026-07-27, when a pipeline fix shipped to the CMS while the container ran a
three-day-old image. Both times the missing step was asking the platform what it
was actually running.

## Every published colour name was wrong

Read per-variant off the live model: Colorway 2 `#502626` maroon was labelled
"Navy", Colorway 3 `#E6AEAE` blush was "Black", Colorway 4 `#AEDCE6` powder blue
was "Crimson". Colorways 5 and 6 were never mapped at all, so two of the five
colours in the file were invisible to every buyer.

Nothing could have caught it. The names are free text; the mapping is a human
dropdown choice; and `variantsVerified` only checks that a chosen name *exists* in
the file, not that it is the right one. There was no fact anywhere in the system
that the two disagreed.

**So the fact was created.** `variant-colour.ts` reads each variant's dominant
fabric colour out of the file and `colour-name.ts` names it, and the CMS shows the
swatch beside the option. A maroon variant under a row called Navy is now visibly
wrong at the moment of choosing.

Three decisions worth keeping:

- **Area, not material count.** N001 splits 44 active materials per variant into
  18/14/6/4. Counting works there and breaks on a garment cut into many small
  panels of one colour, so the dominant fabric is chosen by summed triangle area.
- **CIEDE2000, not RGB distance.** RGB is perceptually non-uniform exactly in the
  dark saturated region sportswear occupies — two obviously different dark colours
  can sit closer than two shades of one hue.
- **The palette contains none of the observed hexes.** An earlier draft seeded it
  with the five measured values and every ΔE came out 0, which proves only that a
  lookup can find a value it was handed. With canonical values the five real
  colours land at ΔE 1.50–6.32 and still name correctly — that is a result.

## The artwork gate: block on facts, warn on statistics

Three checks now refuse to save a model, and one only warns. The split is the
whole design:

**Structural → blocking.** A primitive carrying artwork took the position-only
decimation path; an artwork material ended `BLEND`; an artwork `MASK` has a cutoff
other than 0.5. Each is a stated fact about the output with no false-positive
case.

**Statistical → advisory.** Bytes-per-pixel below 0.02. Measured on a 1024²
fixture: smooth content lands at 0.009–0.015 bpp at *every* quality, noise at
0.167–0.958. The metric cannot separate "legitimately flat label" from "destroyed
wordmark", and **a gate the owner learns to override is worse than no gate**.

The bpp check and its threshold had existed since the original investigation,
correct, and wired only into the manual `pipeline textures` command — never into
`inspectGlb`, which is what the container runs. The live damaged file trips it at
0.003 bpp. *The cheapest measurement of the reported damage was already written
and was connected to nothing.*

## Three traps, all now in CLAUDE.md

1. **`opaque` defaults differently** between `parseOptimizeArgs` (true) and
   `optimizeGlb` (false), so a hand-built options object skips the step that
   resolves a BLEND decal to a MASK cut-out. Found because an end-to-end test
   "failed" and was blaming the pipeline for something only the test had done.
2. **React sets `src` as a property on a custom element**, never an attribute —
   `getAttribute('src')` on `<model-viewer>` is always null.
3. **`webglcontextlost` never reaches a listener on the host**: not composed, so
   it does not cross the shadow boundary; and model-viewer 4.x renders into a
   *shared offscreen* canvas, so the one in the shadow root returns a `2d` context
   and `WEBGL_lose_context` on it does nothing. The real contract is
   model-viewer's own `error` event with `detail.type === 'webglcontextlost'`.

## Negative controls earned their keep twice

A test written for the context-loss handler passed with the handler disabled — it
was asserting a poster fallback the *old* code already did. Rewritten to assert
the distinct diagnostic, it fails without the change. A second test, written to
prove that fixing the `src` read made `VARIANT_NOTICE` reachable, **failed** — so
that claim was removed rather than shipped as a comment. `VARIANT_NOTICE` is still
unreachable for a reason not yet isolated, and `Stage.tsx` says exactly that.

**Both cost time and both were worth it.** A test that cannot fail is the failure
mode this repo has been burned by four times now; the only defence is to disable
the fix and watch.

## One plan item was wrong and was not implemented

The audit's own plan said to add `fileColours` to `GATED_FIELDS`. `Products.ts`
documents in detail why it is deliberately absent: gating it once blocked the
shrink robot's own write on a published-but-model-less product — it prevented
recovery from the very state it was complaining about. Implementing the plan would
have reintroduced a fixed production bug. Reporting was built instead
(`becameUnverifiedWhilePublished` → an Events row).

**A plan written from an audit is a hypothesis, not an instruction.** The code
comment was right and the plan was wrong, and the only reason that surfaced is
that the comment explained *why* rather than *what*.

## Also closed

`glb-shrink-dlq` had been configured since 2026-07-24 with **no consumer**, so a
job that failed three times evaporated. The Events table had collected real
failures for six weeks and **nothing had ever read it** — 8 × `model-load-error`,
13 × `variant-missing`, an uncaught React error. gitleaks lived in its own
workflow where `needs:` could not reach it, so a commit carrying a live key was
scanned, went red, and deployed anyway. The e2e suite ran Chromium twice and
called it a matrix, leaving iOS Safari — the browser a QR code actually opens —
completely unexercised.

## State

334 unit tests, 66 e2e across Chromium / WebKit / mobile Safari / Firefox /
SwiftShader. Five workspaces plus the non-workspace container typecheck; all
builds green.

---

# 2026-08-04 — the root cause, found by ticking Retry

Full detail in [SESSION-2026-08-04.md](SESSION-2026-08-04.md). Ten commits.

The session acted on the one recommendation the 2026-08-03 audit could not carry
out itself, and the **refusal** that came back was the finding.

## The wordmark was misread as sheer fabric

Ticking Retry produced no file. It produced a `PermanentJobError` — the gate added
the day before, blocking five artwork materials left on `alphaMode: BLEND`.
Chasing it found one mis-calibrated number.

Measured on the live `THE EXTRA MILE (Slogan)` texture, 1944×121: **66.38%**
transparent, **30.04%** opaque, **3.58%** mid. **96.42% at the extremes — a cutout
by any reading — and `BINARY_MID_FRACTION` (0.02) classified it `graded`**, i.e.
"leave it on BLEND". It missed by 1.6 points.

The cause is **high ink coverage**, not thin strokes: 30% of the strip is ink, so
there is a great deal of edge. A reviewer rendered real wordmark type at this size
across five faces and measured 1.2–2.3% mid — ordinary lettering was never at risk.

Both ways of getting this wrong had already shipped to a paying customer. Before
`7bef9c4` the branch forced `OPAQUE`, which ignores the alpha channel, so the 66%
transparent background painted its underlying RGB — **(240,240,240)**, a near-white
box across the chest, and that is the file live today. After `7bef9c4` the
`graded → BLEND` branch *added by the artwork fix to protect sheer fabric* caught
artwork as collateral. **The 2026-07-31 fix traded one bug for another**, invisible
because the live file predated it. The repo's opening pattern again: the fixtures
could not exhibit the failure.

The fix is **not** simply a wider band, and an adversarial review caught the first
attempt that was. `CUTOUT_MID_FRACTION` (0.05) governs only the BLEND→MASK
decision; `BINARY_MID_FRACTION` stays 0.02 because `character` also feeds a
*blocking* gate. `CUTOUT_MIN_TRANSPARENT` (0.05) exists because a uniformly
translucent inset measures 1.95–6.06% mid too, and MASKing it at 0.5 when its alpha
is ~0.35 **deletes** it — a hole, and MASK@0.5 is what the gate calls correct, so
nothing would catch it. `OPAQUE_FACTOR_THRESHOLD` (0.99) makes an explicit
`baseColorFactor[3]` beat anything inferred from pixels. Three tests, each verified
to fail when its own constant is reverted.

**Still open: the mechanism is measured, the render is not.** The corrected
pipeline has never produced a file, and only 1 of the 5 blocked materials has been
profiled.

## Also closed

`gitleaks` moved into `ci.yml` as a job the deploy `needs:`, which is what makes
the word "gate" true; `security.yml` was deleted (`.gitleaks.toml` kept citing it
until 2026-08-05). `deploy-shrink.yml` gained a `needs:` — the workflow shipping
the container that processes every real garment was the one nothing gated.

The container image was **not reproducible**: `npm install` with no lockfile and
`ktx2-encoder`/`meshoptimizer` floating on `^`. Non-reproducible squeezing looks
exactly like a random artwork bug. Now `npm ci` against a committed lock.

`glb-shrink-dlq` got its consumer; the Events table got its first reader in six
weeks (8 × `model-load-error`, 13 × `variant-missing`, an uncaught React error).
The e2e matrix gained WebKit, mobile Safari and Firefox, and `webgl.spec.ts` stopped
`test.skip()`-ing itself into a silent pass. Colour names are now read from the file
by area + CIEDE2000 rather than typed. Four high advisories fixed by override, not
allowlist — the allowlist is now empty.

## State

340 unit tests (re-measured 2026-08-05 across five workspaces: shared 28, pipeline
136, shrink 30, viewer 27, cms 119), 66 e2e. All green.

**Blocking item, unchanged and not a code change:** production serves
`cycling-all-colours-optimized-2.glb`, built 2026-07-29 14:34 UTC, predating every
fix. One Retry tick on raw upload #1 tests the fix and replaces it. See
[RUNBOOK.md](RUNBOOK.md) → "Re-processing a garment".

---

# 2026-08-05 — the artwork issue closes, and what it was hiding

Full detail in [SESSION-2026-08-05.md](SESSION-2026-08-05.md).

## Closed, and SEEN

The owner ticked Retry at 05:46:02 UTC; the pipeline succeeded in 87 seconds
(364.4 MB → 37.7 MB, `artworkVerdict: ok`). The output was then **rendered and
inspected** — the chest wordmark reads `THE EXTRA MILE` in full, the `RUN` mark is
intact. All 26 artwork materials resolved to `MASK`/0.5; whole-file census
`{ OPAQUE: 174, MASK: 26 }`, zero BLEND.

Only the Slogan ever needed the fix: the other four artwork textures measure
0.41–0.90% mid and were already `binary`. `CUTOUT_MID_FRACTION` is load-bearing
for exactly one texture, at a 28% margin. The bytes-per-pixel advisory fired three
times and **all three were false alarms** — vindicating the decision to warn
rather than block.

Locked with a **real** 13 KB fixture (the Slogan's actual alpha channel, extracted
from the raw export because `solidifyMaterials` runs before texture compression),
a five-artwork seeded fixture, and negative controls. Reverting
`CUTOUT_MID_FRACTION` now fails **5** tests including the full-chain e2e; it used
to fail 2. Suite 340 → **352**.

## ⚠ The finding that outlives the fix

A six-run sweep from the raw export rendered the wordmark **illegible** at
`--simplify-error 0.005` — and **every run passed all three blocking gates**. The
gates test `alphaMode`, which decimation does not change, and `artworkAtRisk`
cannot fire when `--uv-weight` puts the UVs inside the budget. Nothing in the
system measures whether the letters survived.

The repo's own pattern, one level up: in July the *fixture* could not exhibit the
failure; now the *gate* cannot.

Consequence: the `small` Detail level shipped visible damage while passing every
check, and was **deleted** rather than re-tuned. `--simplify` was also confirmed
not to be the aggression dial — the budget is.

`--simplify-error 0.001` gives 26.96 MB with a wordmark measurably identical to
the live 37.72 MB (mean │Δ│ 0.06/255). Verified, not applied — owner decision, and
now coupled to the `small` removal, which took away the escape hatch under the
40 MB cap.

## The placeholder data behind it

With the garment finally rendering, everything around it was setup leftovers:
the product was a "Tee" (it is a skinsuit), three colourways carried seeded
swatches while the file held five measured ones, and every poster was a hand-drawn
SVG **t-shirt**. All corrected; two previously invisible colourways are now live.

## Two live bugs found by verifying

The loading poster had been overflowing its stage by **926px** since launch — a
grid item's `min-height: auto` silently beating `max-height: 100%`, which read as
the image tiling. And Cloudflare's edge injects an inline beacon bootstrap that
its own CSP blocks on every page load; the fix is a dashboard toggle, still open.

## State

352 unit tests, 66 e2e. Five workspaces plus the container typecheck; viewer
builds. D1 backup and before/after payloads captured.

---

# 2026-08-06 — the gates learn to read

An agent-tooling audit that turned into closing the legibility gap. Full detail in
`docs/SESSION-2026-08-06.md`; this is the retrospective.

## The shape of the day

Four things that were written down as fact turned out to be false, and each had
been load-bearing:

| Belief | Reality |
|---|---|
| "CI's rasteriser will give different numbers from a dev Mac" | Identical to **three decimal places** across 4 runs / 2 OSes / 3 runner images. The eval has no golden image — it diffs two renders from the same browser in the same run, so the rasteriser cancels. This is why the `artwork` job had never been allowed to gate. |
| "The sweep remains the authority on a real garment" | `sweep-size-vs-artwork.mjs` **renders nothing**. Its own output reports `wouldShip: true` for run F, the run that renders the wordmark illegible. The authority was always a human opening a sheet the sweep did not produce. |
| "claude-mem is unused" | **Broken.** Zero observations across every project, because it shells out to a `claude` CLI that is not installed. 354 queued jobs retrying every 35 s. |
| "Cleaning the disabled plugins frees ~476 MB" | ~2 MB. 444 of the 446 MB was claude-mem. |

The pattern is the one this repo keeps paying for, one level up again: in July the
*fixture* could not exhibit the failure; on 2026-08-05 the *gate* could not; today
the *belief about the gate* was the thing that had never been checked.

## What shipped

- **`artwork` gates the deploy.** The only one of the five that looks at what a
  buyer sees; the others test `alphaMode`, dependencies, secrets and byte budgets,
  none of which move when decimation smears a logo.
- **`pnpm eval:artwork:real`** — the same method on the real 382 MB export,
  monthly, in its own workflow. Baseline is the full chain *minus decimation*, so
  the diff isolates the one stage no gate can see. Ceiling 4.2%, sitting between a
  shipped 2.990% and a known-illegible 5.770%.
- **The cached 404 became a control.** A bare browser-shaped GET on the post-deploy
  path only, with the body cancelled at the status line. Its regression test keeps
  the *blind spot* as an asserted fact, not just the fix.
- **A version pin** on `codebase-memory-mcp`, which `.mcp.json` could never provide.
- **`~/.claude` 476 MB → 30 MB**, and one vendored skill dropped for naming an MCP
  server this setup does not have.

## The near-miss worth remembering

The real-garment eval was first pointed at render.ts's `crop-chest` view, because
the name says chest. On N001 that frames the torso and hips **with the wordmark
clipped off the top edge**. Calibrated there, it would have measured how decimation
moves fabric, produced a believable number, and gone green forever.

It was caught by opening the PNG — the same act that has caught every artwork
problem in this log. The eval now refuses to run unless its camera target lands on
the largest artwork primitive, because a mis-aimed camera does not fail; it
answers.

## State

369 unit tests (was 366), 5/5 typecheck. The monthly real-garment workflow has
**never run** — its R2 read permission is the one thing this session could not
verify. Trigger it by hand once rather than waiting for the 1st.

---

# 2026-08-18 — all 24 findings of the 2026-08-17 whole-monorepo audit

Design: `docs/superpowers/specs/2026-08-18-audit-remediation-design.md`.
Plan: `docs/superpowers/plans/2026-08-18-audit-remediation.md`.

## The gate that could not fail, and the two it hid

`node scripts/doc-citations.mjs` was a pure module with no entry point: **0 bytes of
output, exit 0, no document read**, while `CLAUDE.md` named it as the mechanism by
which every document is citation-checked. The audit ran it twice as its own
verification, declared itself clean, and `pnpm test` then failed that same document
with seven broken citations (M4).

Fixing it surfaced two more defects nobody had found:

- **`citedPaths` could not strip a line RANGE.** The expression had no branch for the
  hyphen, so `file.ts:53-80` kept the range as part of the filename and could never
  resolve. All seven of those failures were ranges.
- **`docs/` was walked ONE LEVEL DEEP.** `docs/reviews/` and `docs/superpowers/` had
  never been read by anything. Widening it surfaced **eight** unresolvable citations
  across three documents at once. `git log --diff-filter=A` split them cleanly: three
  files really existed and were deleted by `a57b66d`; four **never existed** —
  filenames a plan proposed that the implementation did not use. That divergence
  between intent and what shipped was invisible to this repository until today.

The lesson generalises past this gate: **running a gate is not the same as checking
that the gate reads the thing you care about.** The audit made that mistake with the
bare command; this session made it one step removed, claiming a passing 406-test
suite had verified two documents the suite never opened.

## Corrections to the audit itself

- **H1 said the events table has no automated retention. It has had a monthly prune
  all along.** The gap was real but different: nothing MEASURED growth. Retention
  went 180 → 90 days and a 5,000-rows-per-24h alarm was built on the existing
  scheduled workflow — no new service, no new secret.
- **M3 omitted that `viewer-mobile-safari` already runs `devices['iPhone 13']`**, so
  the page handed to the skipped test was already a touch context. The fix was
  smaller than the finding implied, and its **measured outcome was that no defect
  exists** — the `(hover: hover)` guards are correct on WebKit.
- **N1 was already fixed** by `4bd23f2`, and fixed the better way: the stale "904
  tests" became "the full suite", a description that cannot rot.

## Two findings that shrank, one that grew

M6 and L8 were both scoped Low by one upstream fact — `shrinkFlagsFor` returns
hardcoded literals, so no operator text reaches the parser. Both were fixed anyway,
because the comment in the container described a control that did not exist, and a
future operator-editable flags field would have read it as confirmation.

M2 grew. It began as "six wrong strings" and became a publish-time gate, a
normalised comparison (RXPS vs R-XPS broke a post-deploy gate on 2026-08-17), and a
correction to `og:image:alt` in the viewer's static head that the audit never found.

## What was deliberately NOT done

- **No migration for the removed `cacheSeconds` field.** The nullable column stays,
  following the precedent recorded three lines above it for
  `analytics_cf_beacon_token`: a D1 table rebuild is not worth an unused column, and
  a `DROP` runs an implicit `DELETE` that cascades.
- **The `Cache-Control` VALUE is unchanged.** The plan had specified tightening it;
  that would have been an unrequested behaviour change to every repeat view. The
  finding was the inert knob, not the directives.
- **Poster filenames keep their `n001-` prefix** (N3). Invisible to customers,
  risky to rename live, zero benefit. Recorded in `docs/RUNBOOK.md` so it is not
  rediscovered as a finding.

## State

934 unit tests (was 899), lint clean across 271 files, typecheck 5/5, container
typecheck separate and green, `eval:artwork` unmoved at 1.650 / 3.070 / 9.370
against a 5.000 ceiling, bundle budget green with a new 90% warning naming `wasm` at
91%. Every new guard carries a negative control, and each was demonstrated failing
by hand rather than assumed from a green run.

---

# 2026-08-31 — audit remediation (2026-08-30 PM audit)

Continues the log after a **140-commit gap**. The root `CLAUDE.md` called this file
the "full history" while it stopped on 2026-08-18, which is finding L13-08 of the
2026-08-30 PM audit. Two things follow from that: entries resume here, and the
claim in `CLAUDE.md` was corrected rather than left to rot again.

## The cached-404 incident, in full

Demoted from `CLAUDE.md`, which had **three characters** of headroom against its own
39,000-character CI gate (finding L13-02). This is history; the rule that survives
in `CLAUDE.md` is the one-paragraph version.

`media.wear-run.help` is an R2 custom domain behind a 30-day edge Cache Rule, so a
request for an object that does not exist **yet** cached the miss for a month.

- **2026-08-06.** A model the shrink worker had just written returned `GET 404` — a
  28 KB Cloudflare error page — while `HEAD` returned **200 with the correct
  `content-length`**. The two landed on different cache entries. The cached 404 was
  **25 hours old**, from a probe made before the file existed. The object was intact
  in R2 the whole time (`wrangler r2 object get` returned all 28,271,780 bytes) and
  the same URL with `?v=1` served 200 immediately.
- **What was green while it was broken:** `artworkVerdict: ok`, the filesize, the
  `{OPAQUE, MASK}` census, and a `HEAD`. Swapping `glbAsset` on those signals would
  have put a 404 on the live page.
- **2026-08-13, the opposite direction.** Same URL, same minute: `GET` →
  `cf-cache-status: HIT`, `age: 49431` (~13.7 h against `max-age=14400`); `HEAD` →
  `DYNAMIC`. So the divergence is not specific to a cached 404 — `HEAD` does not
  share the `GET`'s cache entry at all. A session measuring cache behaviour with
  `curl -I` reads `DYNAMIC` and concludes the 27 MB model is uncached on every
  request. That is a plausible-looking performance finding and it is wrong.

**Closed 2026-08-31.** The media Cache Rule now carries
`status_code_ttl: [{400–499: 10s}, {500–599: 10s}]` beside its unchanged 30-day
default, so a cached miss lasts seconds. Proved on a fresh URL: `MISS` → `HIT age 0`
→ **`EXPIRED` 14 seconds later**, while the real 28 MB garment still returned
`206 / HIT` at `age 489670` and the pre-existing stuck 404 stayed at `age 1065989`
because it had been cached under the old rule. That last one is the cleanest control
available: same host, same rule, opposite behaviour, and the only difference is when
the entry was created.

The GET/HEAD divergence is **not** fixed by that and never will be — it is how the
edge keys entries. Read `cf-cache-status` off the GET's own headers.

## Also this session

- **Firewall.** The single custom rule skipped the WAF, Super Bot Fight Mode and
  seven legacy products for **every** address on `cms.wear-run.help`, admin login
  included. Narrowed to `/api/`. Not to `/api/public/` as the audit proposed:
  `apps/shrink` and the scripts call `/api/products`, `/api/raw-uploads`,
  `/api/media` and `/api/health` as non-browser clients, so that scoping would have
  put the garment pipeline behind bot protection.
- **workers.dev retired** on the CMS, closing a second hostname outside the zone
  that published `/admin` where no zone rule could reach it.
- **The restore guide restored zero files** and is rewritten and drilled.
- **A required check was flaky** — `viewer-mobile-safari` failed 2 of 3 CI runs on a
  media-query subscription that headless WebKit never notified. Fixed by listening
  to `resize` as well as `change`.

Full finding-by-finding status: `docs/audit-2026-08-30-pm/WORKLIST.md`.
