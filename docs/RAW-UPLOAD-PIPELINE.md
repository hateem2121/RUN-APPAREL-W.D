# Raw upload → auto-shrink pipeline

**In one line:** upload a big raw CLO export into the CMS, and it comes back as a
small, correct GLB you review and publish — the heavy shrinking runs on a
Cloudflare Container, and a raw file can never reach customers.

This documents the flow, how to use it, how to turn it on (go-live), and how to
recover when something goes wrong. See also
[HARDENING-LOG.md](HARDENING-LOG.md) (the *why*) and
[tools/asset-pipeline/README.md](../tools/asset-pipeline/README.md) (the shrink recipe).

---

## For the owner — how to use it

1. In the CMS, open **Raw uploads** → **Create new**.
2. Pick the target **product** (optional but helpful), then upload your raw CLO
   GLB. Big files (~350 MB) and messy names are fine — it uploads in chunks with a
   progress bar, not a frozen spinner.
3. **Status** shows **Queued → Processing → Ready to review** (refresh after a
   minute or two). If it says **Failed**, read the **Report** — it explains why.
4. When **Ready**, the shrunk GLB is attached as **Result GLB** and the **Report**
   lists the final size and the colour variants found.
5. Open the target product, attach that GLB as its production model, check the
   variant names match your colourway IDs, tick **Variants verified**, choose a
   default colourway, and **Publish**. (These checks are the existing safety gate —
   nothing is shown to customers until you publish.)

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
- `apps/cms/src/collections/RawUploads.ts` — private inbox + enqueue hook.
- `apps/cms/src/collections/rawRules.ts` — relaxed validation (GLB, no 40 MB cap,
  600 MB ceiling, no .zprj).
- `apps/cms/src/payload.config.ts` — 2nd `r2Storage` (ingest bucket, `clientUploads`).
- `apps/cms/wrangler.jsonc` — `R2_INGEST` bucket + `SHRINK_QUEUE` producer.
- `apps/shrink/` — the shrink Worker (`src/index.ts`), the Container
  (`container/server.ts` + `Dockerfile`), and its `wrangler.jsonc`.
- `.github/workflows/deploy-shrink.yml` — builds + deploys the shrink service.

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

8. **Smoke test:** upload a real raw GLB in **Raw uploads** → watch it reach
   **Ready** with a linked Media < 40 MB → attach, verify, publish → load
   `viewer.wear-run.help/<product>/<colour>` and confirm it renders with no console
   errors. Confirm an unauthenticated fetch of a raw-upload URL is denied.

---

## Cost (Workers Paid $5/mo — verified 2026-07-24)

Container billing is active-time only: `standard-4` (4 vCPU / 12 GiB) for ~1–2 min
per job sits well inside the included 25 GiB-hours + 375 vCPU-min/month (~40–60
jobs/month at $0 extra). Queues + ingest R2 storage are negligible (and raw objects
lifecycle-expire).

## Troubleshooting

- **Status stuck on Queued** → the shrink worker/queue isn't deployed or the
  `SHRINK_QUEUE` binding is missing. Check `wrangler tail run-apparel-viewer-shrink`.
- **Failed: "still over the 40 MB limit"** → the shrunk file is too big; lower the
  simplify ratio (edit `--simplify 0.05` → `0.03` in `apps/shrink/container/server.ts`)
  and redeploy, or re-export a lighter mesh.
- **Failed: container 5xx** → check the shrink worker logs and the container logs;
  usually a bad raw file or an out-of-memory on an unusually heavy mesh (raise the
  instance type / lower simplify).
- **Colours don't switch after publishing** → the GLB's variant names don't match
  the colourway `variantId`s. Rename the CLO colourways to match before export, or
  set the product to `separate-glb-per-colour`.
