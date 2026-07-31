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
| #10 | Viewer lighting | `environment-image` (a generated, round-trip-verified studio HDR in `apps/viewer/public/env/` + `scripts/gen-env-hdr.mjs`), `tone-mapping="neutral"` (model-viewer v4 default), `exposure`, `shadow-softness` |
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
`scripts/bisect-artwork.mjs`.

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
