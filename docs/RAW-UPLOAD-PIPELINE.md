# Raw upload → auto-shrink pipeline

**In one line:** upload a big raw CLO export into the CMS, and it comes back as a
small, correct GLB you review and publish — the heavy shrinking runs on a
Cloudflare Container, and a raw file can never reach customers.

> ## 2026-07-29: CLO no longer has to name anything
>
> Colourways used to have to be named inside CLO 3D as `N001-NAVY`, `N001-BLACK`,
> `N001-CRIMSON` — character for character — because the merged GLB's
> `KHR_materials_variants` names were matched against the CMS by hand. A mismatch
> was silent until the colour buttons died on the live page, and the fix was a
> full re-export plus another ~350 MB upload.
>
> **That requirement is gone.** The names inside the file are now opaque handles:
>
> 1. `inspectGlb` reports `variantsInFileOrder` — the names as the file *declares*
>    them (the pre-existing `variants` is sorted, which is right for set
>    comparison and wrong for anything positional).
> 2. The container puts that list in its report; the shrink Worker PATCHes it onto
>    the raw upload's **Target product** as `fileColours`.
> 3. On the product's **Colours** tab, each colour has a dropdown —
>    *"Which colour in your CLO file is this?"* — offering exactly those names.
> 4. The chosen string is stored as that colour's `variantId` and handed to
>    `<model-viewer>` as its `variantName`.
>
> **Nothing is renamed**, so there is no second processing pass and no extra
> container time. `variantsVerified` is now derived (every switched-on colour
> points at a name that is really in the file), so the manual tick-box is gone.
>
> For the manual `merge` path there is no single file to read names from, so the
> CMS supplies them instead: `pnpm pipeline merge --from-cms <product-slug>` reads
> `GET /api/pipeline/plan/:productSlug` and names the variants positionally. The
> old `<file.glb>=<VARIANT-ID>` form still works.
>
> Colours also moved from a top-level `colourways` collection to an inline array
> on the product, and uploads are reached through the product's **3D file** tab
> (a `join` field) rather than a separate Raw uploads page.

> ## ⚠️ FULLY DEPLOYED, STILL NEVER SMOKE-TESTED (verified against the live account 2026-07-28)
>
> Every piece is in place and automatic. The **only** thing outstanding is that no
> file has ever gone through it end to end. Measured directly against the
> Cloudflare account, not inferred from CI logs:
>
> | Step | State | Evidence |
> |---|---|---|
> | 1 — ingest bucket | ✅ | `run-apparel-viewer-ingest`, created 2026-07-24 |
> | 2 — queues | ✅ | `glb-shrink` (1 producer, 1 consumer) + `glb-shrink-dlq` |
> | 3 — `R2_INGEST_S3_ENDPOINT` | ✅ | set in `wrangler.jsonc` |
> | 4 — robot user | ✅ | `robot@wear-run.help`, editor, API key enabled |
> | 5 — shrink worker secrets | ✅ | all three set on the worker |
> | 6 — container image | ✅ | `version 3`, `sha256:26d43a29…`, 2026-07-28T14:28Z, **`ready`, 1 healthy instance, 0 errors** |
> | 7 — CI deploy | ✅ | run `30368254285`, first success after 3 failures (see below) |
> | 8 — **smoke test** | ❌ | **`raw_uploads` is empty — never once exercised** |
>
> **The first real upload is also the first test.** Run the step-8 procedure below
> with `wrangler tail` armed on both workers, and keep the manual recipe
> (`pnpm pipeline optimize … --simplify --meshopt`, README §3) as the fallback.
>
> **CI deploy: FIXED 2026-07-28.** `.github/workflows/deploy-shrink.yml` had
> failed on every run — the build succeeded (`writing image sha256:… done`) and
> the registry push was then refused with:
>
> ```
> ✘ [ERROR] ApiError: Forbidden
>   body: { error: 'Authentication error' }
> ```
>
> which names neither the missing permission nor the step. Resolved by replacing
> `CLOUDFLARE_API_TOKEN` with a **Custom** token (there is no template for
> containers, and Cloudflare's docs only say authentication "is handled
> automatically"), carrying:
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
> Both Containers **and** Cloudchamber are needed: wrangler still routes container
> work through its cloudchamber client, and its own OAuth flow requests
> `containers:write` and `cloudchamber:write`. Without User Details:Read every run
> ends with a misleading "Unable to retrieve email for this user".
>
> Manual fallback if CI is ever unavailable (needs Docker running):
> `pnpm --filter @run-apparel/shrink exec wrangler deploy`.
>
> **A change to `tools/asset-pipeline` also triggers this workflow — and must.**
> The container runs the pipeline *source* copied into its image (see
> `apps/shrink/Dockerfile`), so a pipeline fix that is merged and deployed to the
> CMS is **not** in the auto-shrinker until the image is rebuilt. This bit us on
> 2026-07-27: the logo-tearing `--simplify` fix shipped to `main` while the
> container kept running the 2026-07-24 image, because the workflow that would
> have caught up was already failing and nothing said so at a glance. The workflow
> now ends by printing `wrangler containers list` next to the run's own timestamp,
> so a green run carries its own proof the image actually moved. Verify by hand
> the same way — compare `LAST MODIFIED` against the commit date.
>
> **What no longer needs a redeploy:** the decimation settings. They are chosen
> per upload from the raw-upload **Detail** field and passed to the container in
> the job, so re-tuning a garment costs one re-upload instead of a Docker build.
>
> Requirements for that manual redeploy, in order of how often they surprise you:
> 1. **Docker must be running.** `wrangler deploy` builds the image locally; with
>    the daemon down it fails with a "Docker is not installed / not running" hint
>    rather than anything about containers.
> 2. **The image must be `linux/amd64`.** On an Apple-silicon Mac Docker emulates
>    it, which makes the build slow (several minutes — `sharp` compiles from
>    source). CI runners are amd64 natively and do not pay this cost.
> 3. The local wrangler login needs `containers`/`cloudchamber` write scope. The
>    interactive OAuth login has it; the CI token is exactly what does not.
>
> ### The upload bug that blocked the first two attempts — FIXED 2026-07-27
>
> Every upload over 50 MB failed **after all chunks had already transferred**,
> with `File type text/plain (from extension glb) is not allowed.` Verified chain
> through payload 3.86.0 / @payloadcms/storage-r2 3.86.0 (both `latest`):
>
> 1. `storage-r2/dist/getFile.js` deliberately returns an **empty body** when
>    `fileSize > 50MB && clientUploadContext` ("or the Worker will run out of memory").
> 2. `payload/dist/utilities/addDataAndFileToRequest.js` builds `req.file.data`
>    from that response → **0 bytes**.
> 3. `payload/dist/uploads/checkFileRestrictions.js` runs *only because
>    `mimeTypes` was set*; `fileTypeFromBuffer(empty)` → `undefined`, so it falls
>    back to `getFileTypeFallback()`, whose extension map has **no `glb` entry**
>    → it guesses `text/plain`.
> 4. `validateMimeType('text/plain', […])` → false → `ValidationError`.
>
> `file-type` *does* recognise GLB, which is why files **under** 50 MB always
> worked and larger ones never did.
>
> **Fix:** `mimeTypes` removed from the RawUploads collection (an empty allow-list
> short-circuits `validateMimeType` to `true` and stops the field-level validator
> being attached at all), plus `allowRestrictedFileTypes: true`. File-type safety
> is unchanged — `checkRawUpload()` in `rawRules.ts` was always the real gate.
> Guarded by `apps/cms/src/collections/uploadConfig.test.ts`; **do not reinstate
> `mimeTypes` on this collection.** A second, independent bug — macOS greying out
> `.glb` in the file picker because `@payloadcms/ui` joins `mimeTypes` verbatim
> into `accept` — is fixed by listing the literal `'.glb'` in Media's array.
>
> Upstream has related GLB mimetype issues (payloadcms/payload#7408, #12620,
> #8673, #12905) but not this >50 MB path — worth filing so the workaround can
> eventually be dropped.
>
> Diagnose from the CLI with `pnpm --filter @run-apparel/shrink exec wrangler containers list`.

This documents the flow, how to use it, how to turn it on (go-live), and how to
recover when something goes wrong. See also
[HARDENING-LOG.md](HARDENING-LOG.md) (the *why*) and
[tools/asset-pipeline/README.md](../tools/asset-pipeline/README.md) (the shrink recipe).

---

## For the owner — how to use it

1. In the CMS, open **Raw uploads** → **Create new**.
2. Pick the target **product** (optional but helpful), then upload your raw CLO
   GLB. Big files (~350 MB) and messy names are fine — it uploads in chunks with a
   progress bar, not a frozen spinner. Two naming notes: give the file a name
   ending in **.glb** (macOS often hides the extension, and a file that genuinely
   has none is stored without one — harmless, but confusing to read later), and
   avoid `? * < > : | " / \` — those are the only characters this system cannot
   store reliably, and an upload containing one is rejected with that message.
3. Leave **Detail** on **Balanced** the first time. It decides how hard the
   shrinker pushes:
   | Detail | Use it when |
   |---|---|
   | **Balanced** (default) | Always start here. |
   | **Highest quality — bigger file** | The printed graphics came back soft or broken. |
   | **Smallest file — softer detail** | It was rejected for being too big, or it loads slowly on a phone. |

   Changing Detail and uploading again re-runs the whole thing — no developer,
   no deploy. That is the intended way to tune a garment.
4. **Status** shows **Queued → Processing → Ready to review** (refresh after a
   minute or two). If it says **Failed**, read the **Report** — it explains why,
   in plain language, including which Detail setting to try next.
5. When **Ready**, the shrunk GLB is attached as **Result GLB** and the **Report**
   lists the final size and the colour variants found.
6. Open the target product, attach that GLB as its production model, and on the
   **Colours** tab answer *"Which colour in your CLO file is this?"* for each
   colour. The dropdown now shows a **swatch and a suggested name** for every
   colour found in the file, so a maroon variant sitting under a row called Navy
   is obvious at a glance — that exact mistake was live on the site until
   2026-08-03. If the banner says some colours in the file have no row yet, add
   them there too.

   **"Colours checked" is not a box you tick.** It is read-only and goes green by
   itself once every colour on show points at a colour that is really inside the
   file. The default colourway is simply the topmost row that is switched on —
   drag to change it. Then **Publish**; nothing is shown to customers until you do.

**Your raw files are private.** They live in a separate storage area with no public
web address and are only visible to signed-in staff. Only the small, shrunk file
ever enters the public media library.

---

## How it works (technical)

```
CMS admin → RawUploads (private) → ingest R2 bucket (5 MB chunked clientUploads)
   │  afterChange hook enqueues { rawUploadId, filename, prefix }
   ▼
glb-shrink Queue → run-apparel-viewer-shrink Worker (consumer)
   │  getContainer(...).fetch({ key, s3 creds })
   ▼
ShrinkContainer (Node, standard-4)
   • S3-GET raw from ingest (read-only token)
   • optimize --simplify 0.05 --meshopt (+ opaque)  ← reuses tools/asset-pipeline
   • validate → { size, variants, warnings }
   • returns shrunk GLB bytes + base64 report header
   ▼
shrink Worker → env.CMS.fetch (service binding, robot API key)
   • POST /api/media   (guardrails run: safe name + < 40 MB → shrunk file passes)
   • PATCH /api/raw-uploads/:id  { status: ready, resultGlb, report }
   ▼
Owner reviews + publishes (publishGating.ts unchanged)
```

**Components (code):**
- `apps/cms/src/collections/RawUploads.ts` — private inbox, **Detail** field, enqueue hook.
- `apps/cms/src/collections/rawRules.ts` — relaxed validation (GLB, no 40 MB cap,
  600 MB ceiling, no .zprj, no filename character the two sanitisers disagree on).
- `apps/cms/src/payload.config.ts` — 2nd `r2Storage` (ingest bucket, `clientUploads`).
- `apps/cms/wrangler.jsonc` — `R2_INGEST` bucket + `SHRINK_QUEUE` producer.
- `packages/shared/src/shrink.ts` — the queue-message type, the detail levels and
  the flags each maps to. One definition, imported by both sides, so the CMS and
  the shrink Worker cannot drift.
- `packages/shared/src/media.ts` — `GLB_HARD_MAX_BYTES`, enforced by the CMS *and*
  pre-flighted by the shrink Worker before it POSTs.
- `tools/asset-pipeline/src/simplify-textured.ts` — texture-aware decimation.
- `apps/shrink/` — the shrink Worker (`src/index.ts`), the Container
  (`container/server.ts` + `Dockerfile`), and its `wrangler.jsonc`.
- `.github/workflows/deploy-shrink.yml` — builds + deploys the shrink service.

### Two design decisions worth not re-deriving

**Decimation is texture-aware, not border-locked.** glTF-Transform's `simplify()`
only sees vertex positions, so it happily smears the UVs under a printed logo and
tears the artwork. The first fix was `lockBorder: true`, which works but freezes
*every* mesh border — necklines, cuffs, hems, UV islands — and took the real
373 MB export from 850 k triangles to 6.0 M / **58.3 MB**, i.e. 45% over the
40 MB publish ceiling, so nothing could ever be published. `simplify-textured.ts`
uses meshoptimizer's `simplifyWithAttributes` instead, which its own README
documents for exactly this ("texture deformation (by using texture coordinates)").
UV error is inside the error budget, so `lockBorder` is not needed and the
interior is free to collapse. `--uv-weight` and `--simplify-error` trade directly
against each other; the measured table is in `simplify-textured.test.ts`.

**Every UV set is weighted, not just `TEXCOORD_0`** (fixed 2026-07-31). CLO's
*Apply Graphic* commonly places prints on a second UV set, and those UVs used to
be decimated at zero weight while the fabric's were protected at full weight —
artwork damaged on some panels and clean on others. Note `prune()` renumbers a
*lone* second set down to `TEXCOORD_0` beforehand, so the case that actually bit
is a material sampling two or more sets at once.

**Check the protection ran.** `optimize` and the shrink report both print a
decimation line; primitives counted as **fallback** were decimated position-only,
so `--uv-weight` did nothing for them. The usual cause is attributes already
quantized by an earlier pass — which is why the pipeline must never be run on its
own output.

Corollary, easy to get wrong: **`--simplify` is a target, not a promise.** Once
the error budget binds, lowering the ratio does nothing at all. Raise the budget
(or lower the UV weight) to get a smaller file.

**The shrunk file is streamed to the CMS, never buffered.** `arrayBuffer()` →
`new File([...])` → `FormData` costs two extra full-size copies inside a Worker
isolate capped at 128 MB — 120–170 MB for a 40 MB model. `streamMultipart()` in
`apps/shrink/src/index.ts` hand-builds the multipart envelope around the
container's response stream so the bytes are only ever in flight.

### Payload v4 — what will break here (audited 2026-07-29)

v4 exists only as `4.0.0-canary.18`; `latest` is still 3.86.0, which is what this
repo pins. Four things in this document's blast radius change on upgrade:

- **Storage adapters move out of `plugins` into a new top-level `storage` key.**
  3.86 has no such key, so the move cannot be made early. Both `r2Storage()` calls
  are kept adjacent in `payload.config.ts` so the edit is a three-line diff.
- **Direct uploads switch to a shared `POST /api/upload-instructions` endpoint.**
  That is the code path the patch below lives on — re-test it, do not assume it
  still applies.
- **`versions` defaults to ON for every collection and global**, which would add
  six `_versions` tables to D1 and roughly double row-writes per save. Every
  collection and global now states `versions: false` explicitly; that is a no-op
  on 3.86 and pins the behaviour through the upgrade.
- **API keys created before v3.46.0 stop authenticating** (the sha1 HMAC fallback
  is removed). **`robot@wear-run.help`'s key must be re-saved or regenerated
  before upgrading**, or the entire auto-shrink flow dies silently.

Also: v4 requires TypeScript ≥ 6.0.3. `apps/cms` is on 6.0.3 — deliberately not
7.x, which Next.js 16 rejects ("TypeScript 7.0.2 does not provide the compiler API
required by Next.js").

### The `@payloadcms/storage-r2` patch — when it can go

`patches/@payloadcms__storage-r2@3.86.0.patch` fixes the frozen-endpoint bug that
meant this inbox never worked (see the ⚠️ banner). Upstream has since fixed it
themselves in **`@payloadcms/storage-r2@4.0.0-canary.17`** (`const getEndpoint =
() => …`), but `latest` is still 3.86.0 and the 4.0 handler signature changed
(`extra`→`props`, `serverHandlerPath`→`endpointPath`, new `name` field) — so
dropping the patch is a **Payload 4.0 migration, not a version bump**.

Two things keep it honest in the meantime:
- pnpm 10 fails the install with `ERR_PNPM_UNUSED_PATCH` if the version key in
  `patchedDependencies` stops matching anything. **Do not set
  `allowUnusedPatches: true`** — that would downgrade it to a warning.
- `apps/cms/src/collections/storageR2Patch.test.ts` asserts the *installed bytes*
  in `node_modules` still contain the fix. That covers what pnpm cannot: the
  patch being edited, removed, or silently applying to a file upstream changed.

**Why a raw file can never go live:** the ingest bucket has no custom domain and no
public access; `RawUploads` is admin/editor-only; the public viewer endpoint reads
only products/colourways/media. Only the shrunk output re-enters Media, where the
existing 40 MB guardrail applies.

---

## Go-live checklist (one-time)

> Order matters: create the resources **before** deploying, or the CMS deploy
> fails (its config now references the ingest bucket + queue).

1. **Create the private ingest bucket** (no public domain):
   ```bash
   wrangler r2 bucket create run-apparel-viewer-ingest
   ```
   Add a lifecycle rule to auto-expire raw objects (~14 days) and clean incomplete
   multipart uploads (dashboard → R2 → the bucket → Settings → Object lifecycle).
   **Do not** add a custom domain or public access to this bucket.

   ⚠️ **The ~14-day expiry rule does NOT exist yet — add it.** Re-verified against
   the live bucket on 2026-07-28: `run-apparel-viewer-ingest` still carries only
   R2's default "abort incomplete multipart uploads after 7 days", which does
   **not** delete completed objects, so raw ~350 MB exports accumulate and bill
   indefinitely. Check, then add:

   ```bash
   pnpm --filter @run-apparel/cms exec wrangler r2 bucket lifecycle list run-apparel-viewer-ingest
   ```
   ```bash
   pnpm --filter @run-apparel/cms exec wrangler r2 bucket lifecycle add run-apparel-viewer-ingest expire-raw-uploads --expire-days 14
   ```

1b. **Optional: the ingest bucket's CORS policy.**

   > **Correction (2026-07-27).** An earlier version of this step claimed CORS was
   > required and that a missing policy was what broke the first real upload
   > attempt. **Both claims were wrong.** `clientUploads` does *not* upload
   > directly to R2: `@payloadcms/storage-r2/dist/client/R2ClientUploadHandler.js`
   > POSTs each 5 MB chunk to the **CMS Worker** at
   > `{serverURL}{apiRoute}/storage-r2-multi-part-upload`, which then writes via
   > the R2 *binding*. That is same-origin with the admin panel, so bucket CORS is
   > never consulted on this path. The real cause was a Payload validation bug —
   > see the ⚠️ banner at the top of this document.

   A CORS policy is set on `run-apparel-viewer-ingest` anyway. It is harmless,
   and it becomes necessary only if this project ever moves to true presigned
   direct-to-R2 uploads. If you do that, note two traps: R2 expects its own
   `{"rules":[…]}` schema (**not** the S3 `AllowedOrigins` shape), and
   `exposeHeaders: ["ETag"]` is mandatory or multipart uploads cannot complete.

   ```bash
   cat > /tmp/ingest-cors.json <<'JSON'
   {
     "rules": [
       {
         "allowed": {
           "origins": ["https://cms.wear-run.help", "http://localhost:3000"],
           "methods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
           "headers": ["*"]
         },
         "exposeHeaders": ["ETag", "Location"],
         "maxAgeSeconds": 3600
       }
     ]
   }
   JSON
   wrangler r2 bucket cors set run-apparel-viewer-ingest --file /tmp/ingest-cors.json
   ```

   `exposeHeaders: ETag` is **not optional** — multipart uploads need to read each
   part's ETag to complete. Note R2 expects its own `{"rules":[…]}` schema, *not*
   the S3 `AllowedOrigins` shape. Verify with a preflight: an allowed origin
   returns `204` + `Access-Control-Allow-Origin`; any other origin returns `403`.

2. **Create the queues:**
   ```bash
   wrangler queues create glb-shrink
   wrangler queues create glb-shrink-dlq
   ```

3. **Create a read-only R2 API token** scoped to `run-apparel-viewer-ingest`
   (R2 → Manage API tokens → **Object Read only**, this bucket). Note the
   **Access Key ID**, **Secret Access Key**, and the S3 endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Set the real endpoint in
   `apps/shrink/wrangler.jsonc` (`R2_INGEST_S3_ENDPOINT`).

4. **Create the robot CMS user:** in the CMS, add a user with role **Editor**
   (e.g. `robot@wear-run.help`), open it, enable **API Key**, and copy the key.
   (API-key auth is already enabled on the Users collection.)

5. **Set the shrink worker secrets:**
   ```bash
   cd apps/shrink
   printf '%s' "<r2-access-key-id>"     | wrangler secret put R2_INGEST_ACCESS_KEY_ID
   printf '%s' "<r2-secret-access-key>" | wrangler secret put R2_INGEST_SECRET_ACCESS_KEY
   printf '%s' "<robot-api-key>"        | wrangler secret put CMS_ROBOT_API_KEY
   ```

6. **Confirm the deploy API token permissions.** The CI/deploy `CLOUDFLARE_API_TOKEN`
   must allow: Workers Scripts (edit), Durable Objects, Queues, R2, and
   **Cloudflare Containers / image push**. Expand it if container deploy is denied.

7. **Deploy** — CMS first (picks up the new bindings), then the shrink service:
   ```bash
   pnpm --filter @run-apparel/cms run deploy        # or push to main (CI)
   pnpm --filter @run-apparel/shrink exec wrangler deploy   # builds + pushes the image (needs Docker)
   ```
   The container image build needs Docker — run it in CI
   (`deploy-shrink.yml`) or on a machine with Docker (arm64 Macs:
   build for `linux/amd64`).

8. **Smoke test.** Nothing has ever flowed through this end to end, so the first
   real upload is also the first test. **Arm `wrangler tail` on BOTH workers
   before you start** — tail is live-only, there is no historical query, and a
   redeploy kills an attached session:
   ```bash
   pnpm --filter @run-apparel/cms exec wrangler tail run-apparel-viewer-cms
   ```
   ```bash
   pnpm --filter @run-apparel/shrink exec wrangler tail run-apparel-viewer-shrink
   ```
   Upload a real raw GLB in **Raw uploads** (Detail: Balanced), then check, in order:

   | Watch for | Proves |
   |---|---|
   | POSTs to `/api/storage-r2-multi-part-upload` **carrying `multipartId`** | the storage-r2 patch is live; chunks are really being uploaded |
   | no "did not finish uploading" | the beforeChange HEAD guard passed |
   | `POST /api/media` returns **201, not 400** | the shrunk file is under 40 MB |
   | no `Exceeded memory limit` on the shrink worker | the streamed multipart body works |
   | Status reaches **Ready to review**, Report lists the colour variants | the whole chain |

   Then attach, verify the variant names match the colourway IDs, publish, and load
   `viewer.wear-run.help/<product>/<colour>` — **inspect the printed graphics at
   zoom, on a phone**, since artwork fidelity is the thing the new decimation is
   trading against. Confirm an unauthenticated fetch of a raw-upload URL is denied.

   Negative tests worth doing once: upload a `.txt` renamed to `.glb`, and a file
   with a `?` in its name. Both must fail with the real message — never
   "Something went wrong."

---

## Cost (Workers Paid $5/mo — verified 2026-07-24)

Container billing is active-time only: `standard-4` (4 vCPU / 12 GiB) for ~1–2 min
per job sits well inside the included 25 GiB-hours + 375 vCPU-min/month (~40–60
jobs/month at $0 extra). Queues + ingest R2 storage are negligible (and raw objects
lifecycle-expire).

## Troubleshooting

- **Status stuck on Queued** → the shrink worker/queue isn't deployed or the
  `SHRINK_QUEUE` binding is missing. Check `wrangler tail run-apparel-viewer-shrink`.
  The image *is* deployed and healthy (verified 2026-07-28,
  `wrangler containers list`), so this is not the expected state any more — but
  confirm the image is current before assuming the code you are reading is running.
- **Failed: "The shrunk model is N MB, over the 40.0 MB limit"** → re-upload with
  **Detail: Smallest file**. No code change or redeploy is needed; that is what the
  field is for. If it still fails at the smallest setting, the export itself is
  too heavy — re-export from CLO at a lower mesh density.
- **Printed graphics look smeared or torn** → re-upload with **Detail: Highest
  quality**. If that is not enough, raise `--uv-weight` for the level in
  `packages/shared/src/shrink.ts` (this one *does* need a container redeploy only
  if you also change the pipeline; a flags-only change ships with the CMS).

  **First, read the report rather than turning knobs.** It now says how many
  parts were decimated *with* artwork protection and how many without, how many
  textures were treated as printed artwork, and how transparency was resolved. If
  most parts came back "without artwork protection", no amount of `--uv-weight`
  will change anything — see `docs/OPEN-ISSUE-ARTWORK.md`. And to actually look
  at a logo instead of guessing, run `node tools/asset-pipeline/scripts/bisect-artwork.mjs` on the raw
  file; it renders the garment and produces side-by-side contact sheets.
- **Failed: "The printed artwork on … was damaged while shrinking this file"** →
  new on 2026-08-03, and this one is the pipeline refusing to save rather than a
  crash. One or more parts carrying printed graphics were decimated without their
  texture coordinates in the error budget, so the artwork on them would be torn.
  Re-upload with **Detail: Highest quality**. If it happens again the artwork on
  those parts needs its own UV map in CLO — the named materials are in the message.
- **Failed: "The printed artwork on … came out see-through"** → also a refusal.
  The graphic ended on `alphaMode: BLEND`, which `<model-viewer>` renders
  half-visible (there is no order-independent transparency). Usually means the
  graphic is painted onto a transparent fabric layer in CLO rather than sitting on
  the garment; re-export it on its own opaque piece.
- **Failed: "Automatic shrink has STOPPED TRYING for this file"** → the job failed
  three times and was dead-lettered. Before 2026-08-03 `glb-shrink-dlq` had no
  consumer at all, so this state was silent: the row kept whatever the last
  transient error was and nothing said the system had given up. Tick **Retry** to
  try once more, or re-upload at a smaller Detail level. The error from the final
  attempt is in the *previous* report on the same upload — a dead-letter message
  re-delivers the original job body, not the failure.
- **Failed: container 5xx** → check the shrink worker logs and the container logs;
  usually a bad raw file or an out-of-memory on an unusually heavy mesh (raise the
  instance type / choose a smaller Detail level).
- **Rejected: "contains a character this system cannot store reliably"** → the
  filename has one of `? * < > : | " / \` or a trailing dot/space. Payload
  sanitises the R2 key and the document filename with *different* rules, so such a
  name would be stored under two different keys and later look like a failed
  upload. Rename and re-upload; spaces and brackets are fine.
- **Colours don't switch after publishing** → the GLB's variant names don't match
  the colourway `variantId`s. Rename the CLO colourways to match before export, or
  set the product to `separate-glb-per-colour`.
