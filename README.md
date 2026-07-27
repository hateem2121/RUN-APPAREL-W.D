# RUN APPAREL — 3D Product Viewer & CMS

One reusable, QR-deep-linkable 3D apparel viewer for B2B buyers, plus the private
CMS that feeds it. A buyer scans a QR code on a garment tag (or in the PDF
catalogue) and lands directly on e.g.:

```
https://viewer.wear-run.help/n001/navy
```

They see an instant static render, the interactive 3D garment loads behind it,
and they can rotate, zoom, switch colourways, jump back to the catalogue, or
contact RUN by email/WhatsApp. **No shop, no cart, no prices — this is a
development reference for partners, not a retail page.**

## What's in this repository

| Folder | What it is |
|---|---|
| `apps/viewer` | The public viewer site (Cloudflare Pages, `viewer.wear-run.help`) |
| `apps/cms` | Payload CMS — private admin + public read-only API (Cloudflare Workers, `cms.wear-run.help`) |
| `packages/shared` | Shared types and helpers used by both |
| `tools/asset-pipeline` | The GLB processing tool (merge colourways, validate, placeholders) |
| `docs/` | `CLOUDFLARE-SETUP.md` (one-time setup) · `QA-CHECKLIST.md` (before every launch) · `AI-TOOLING.md` (agent tooling) |

First-time deployment: follow **`docs/CLOUDFLARE-SETUP.md`** once, top to bottom.

---

## Everyday guide (for the RUN team)

### 1. Logging into the CMS

Go to `https://cms.wear-run.help/admin` and sign in. **Admin / Director**
accounts can manage everything including users and settings; **Editor**
accounts manage products, colourways and media only.

### 2. Adding a new product

1. **Products → Create New.**
2. Fill in: product code (e.g. `T004`), slug (lowercase, e.g. `t004`), buyer-friendly
   name, category, fabric, GSM, fit, performance features, customisation steps.
3. Leave **status = Draft** until assets are ready.
4. Create its **Colourways** (next sections), pick a **default colourway**, then set
   status to **Published**. The CMS blocks publishing until the rules are met
   (exactly one default active colourway, GLB rules below, posters everywhere).

### 3. Preparing 3D files — ALWAYS run the pipeline first

CLO exports **one GLB per colourway**, and raw CLO output is never publish-ready.
On a computer with this repository (needs Node.js + pnpm, one-time `pnpm install`):

```bash
# Merge the per-colour exports into ONE production file. By default the pipeline
# re-encodes textures to WebP (2048px cap) AND forces fabric opaque + double-sided
# (fixes CLO's see-through export). For raw CLO files ALWAYS add --simplify: their
# cloth-sim meshes run to MILLIONS of triangles — that geometry, not the textures,
# is what makes them huge (a real 364 MB export was 9.8 M triangles / only 1 MB of
# textures). --meshopt then compresses the reduced mesh. Start at 0.05 (keep ~5%
# of triangles) and lower if you need to hit the 8 MB mobile guideline.
pnpm pipeline merge --out output/t004.glb --simplify 0.05 --meshopt \
  raw/t004-forest.glb=T004-FOREST \
  raw/t004-sand.glb=T004-SAND

# confirm the file carries exactly the colourway IDs the CMS will use, and that
# it is publish-ready — --strict fails on a raw CLO export, an over-budget file,
# uncompressed textures, or translucent (see-through) materials.
pnpm pipeline validate output/t004.glb --expect T004-FOREST,T004-SAND --strict
```

For a single GLB that does not need merging (a separate-glb-per-colour export, a
CLO "all colourways" combined export, or re-compressing one file), use
`pnpm pipeline optimize <file>.glb --out <out>.glb --simplify 0.05 --meshopt`.

The names after `=` must exactly match each colourway's **variant ID** in the CMS.
The CMS also hard-blocks a raw/oversized upload (over 40 MB) and filenames with
spaces or unsafe characters, so a broken asset can't reach production.
Full details and troubleshooting: `tools/asset-pipeline/README.md`.

### 4. Uploading the processed GLB and posters

1. **Media → Create New** — upload the merged `.glb`, give it clear alt text.
2. Upload each colourway's poster image (WebP preferred, front three-quarter CLO render).
3. On the **product**: set *GLB asset* to the merged file, *Poster fallback* to the
   default colourway's poster.
4. Tick **“Variants verified”** only after step 3's `validate` passed and you've
   looked at every colourway in the viewer. Publishing in single-GLB mode is
   blocked until this is ticked.

Keep files under ~8 MB — the CMS warns you above that. Never upload CLO source
(`.zprj`) files; use the admin-only *source reference* field to note where they live.

### 5. Adding material variant IDs (colourways)

For each colourway: **Colourways → Create New** → pick the product, set
**variant ID** (`T004-FOREST` — must start with the product code + hyphen),
display name (`Forest`), slug (`forest` — this appears in the QR URL), sequence
(tab order), poster, alt text, optional hex swatch. Mark exactly one as
**default**. In single-GLB mode the variant ID must match a variant inside the
merged GLB — that's what the pipeline `validate` step guarantees.

**If the merged GLB fails or looks wrong:** set the product's *variant mode* to
**“Separate GLB per colourway”** and upload each colourway's own GLB on the
colourway itself. The viewer handles both modes with the same visitor
experience — a failed merge never blocks publishing.

### 6. Creating a QR code for a colourway

The URL is simply:

```
https://viewer.wear-run.help/<product-slug>/<colourway-slug>
```

Generate the QR with any reputable free generator (or `npx qrcode <url>`),
print at ≥ 2×2 cm, and **scan the printed tag with a real phone before sending
anything out**. Never change a colourway's slug once QRs are printed — retire
the colourway instead (next section).

### 7. Marking a colourway inactive (retiring a QR)

Open the colourway and untick **Active**. Existing printed QRs keep working:
visitors see the default colourway plus the notice *“The colourway linked by
this QR is no longer active. You are viewing the current available reference.”*
(editable per product as *retired message*). If it was the default, make another
active colourway default first — the CMS will tell you.

### 8. Publishing and unpublishing a product

Set **status** on the product: *Published* makes it live; *Draft* or *Archived*
hides it — visitors then get the branded “reference unavailable” page with
catalogue and contact links. The public API only ever exposes published data.

### 9. Custom domain for the viewer

One-time step: in Cloudflare Pages → the viewer project → *Custom domains* →
add `viewer.wear-run.help`. Full walkthrough in `docs/CLOUDFLARE-SETUP.md` §6.

### 10. Before you announce anything

Run through **`docs/QA-CHECKLIST.md`** on a phone and a desktop, in light and
dark mode.

---

## For developers

### How work ships (single branch)

This repo uses **one branch, `main`, and no pull requests.** Commit to `main`
and push — GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, all unit
tests, the build and the Playwright e2e suite, then deploys (once
`DEPLOY_ENABLED` is set — see [docs/CLOUDFLARE-SETUP.md](docs/CLOUDFLARE-SETUP.md)).
A red build never deploys. Operational playbooks live in
[docs/RUNBOOK.md](docs/RUNBOOK.md).

> ⚠️ **Never run `git` from your home directory or a parent folder.** This
> project has its own `.git`; keep git commands scoped to this directory.

### Local development

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build   # all workspaces (82 unit tests)

pnpm seed:assets   # placeholder GLBs/posters + merged N001 file
pnpm dev:cms       # Payload admin on http://localhost:3000 (local D1/R2 emulation)
pnpm --filter @run-apparel/cms migrate     # apply migrations to local D1 (first run)
pnpm seed:cms      # seed product N001 + colourways + settings + dev admin user
pnpm dev:viewer    # viewer on http://localhost:5173 (VITE_API_BASE_URL=http://localhost:3000)

cd apps/viewer && pnpm test:e2e   # Playwright suite (mock API + real-WebGL) from a cold checkout
```

For local CMS runs, put a `PAYLOAD_SECRET` in `apps/cms/.env`
(`openssl rand -hex 32`). Other env vars: see `.env.example`.

### Roles

Two roles by design: **Admin / Director** (`admin` — full control incl. users
and settings) and **Editor** (products/colourways/media only). "Director" is the
admin role's label, not a separate permission tier.

### Versions

Dependencies are pinned to the latest stable releases. Deliberate exceptions:

- The **CMS** uses **TypeScript 5.9** (Next.js 16 rejects the TS7 native
  compiler); the **viewer** uses TypeScript 7. Dependabot blocks *major* TS bumps
  (`.github/dependabot.yml`) so neither workspace drifts across that line silently.
- `packageManager` stays pinned to **pnpm 10.33.0**. The `minimumReleaseAge`
  supply-chain policy that gated adopting pnpm 11 is now declared **in-repo**
  (`pnpm-workspace.yaml` → `minimumReleaseAge: 1440`, i.e. 24h, with the trusted
  fast-moving build toolchain excluded), so the pin is a deliberate,
  version-controlled choice rather than an artefact of a machine-global config.
  Moving to pnpm 11 is a safe, isolated follow-up when desired — the policy
  travels with the repo either way. `--frozen-lockfile` installs (CI/deploy) are
  never affected; if a `pnpm add`/update is ever blocked by a too-fresh version,
  wait out the cooldown or add that package to `minimumReleaseAgeExclude`.

`sharp` is de-duplicated to a single version via a `pnpm.overrides` pin (it is a
build-time/optional dependency — image transforms are unavailable on Workers, so
posters are optimised by the asset pipeline before upload). CI additionally runs
secret scanning (gitleaks), a dependency-vulnerability gate (audit-ci, high/
critical), a Lighthouse performance budget, and an axe accessibility check — see
`docs/RUNBOOK.md` → "CI quality gates".

The seeded product **N001** demonstrates both variant modes: it publishes as
`single-glb-variants` with the merged GLB, and every colourway also carries its
own per-colour GLB so switching the product to `separate-glb-per-colour` in the
admin works immediately.
