# Staff guide — the everyday steps, in detail

**In plain words:** these are the exact steps the RUN team uses every day.
The [picture guide](guide/README.md) explains the same jobs more simply.

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
4. Add its **Colours** on the Colours tab (next sections), then set status to
   **Published**. The CMS blocks publishing until the rules are met — every colour
   on show needs a photo, a photo description and a colour picked from your CLO
   file, and the product needs a finished 3D file.

   **There is no "default colourway" setting.** The default is simply the topmost
   colour that is switched on, so you choose it by dragging rows. That replaced a
   three-way arrangement (a `defaultColourway` relationship, an `isDefault`
   checkbox and a hook keeping them in step) which could disagree with itself.

### 3. Preparing 3D files — ALWAYS run the pipeline first

> **There is now an easier route.** Upload the raw CLO export straight into
> **Raw uploads** in the CMS and it is shrunk automatically — no command line, no
> Node.js. Start there: [docs/FIRST-GARMENT-UPLOAD.md](FIRST-GARMENT-UPLOAD.md).
> The manual recipe below still works and is the fallback if the automatic route
> fails. It has never been retired.

CLO exports **one GLB per colourway**, and raw CLO output is never publish-ready.
On a computer with this repository (needs Node.js + pnpm, one-time `pnpm install`):

```bash
# Merge the per-colour exports into ONE production file. By default the pipeline
# re-encodes textures to WebP (2048px cap) AND forces fabric opaque + double-sided
# (fixes CLO's see-through export). For raw CLO files ALWAYS add --simplify: their
# cloth-sim meshes run to MILLIONS of triangles — that geometry, not the textures,
# is what makes them huge (a real 364 MB export was 9.8 M triangles / only 1 MB of
# textures). --meshopt then compresses the reduced mesh. Start at 0.05 (keep ~5%
# of triangles). NOTE: --simplify is a TARGET, not a promise — decimation stops
# early once it would exceed --simplify-error, and past that point lowering the
# ratio does nothing. Raise --simplify-error (or lower --uv-weight) for a smaller
# file; see tools/asset-pipeline/README.md.
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

⚠️ **Never run the pipeline on its own output.** Compression quantizes vertex
attributes, and the decimator drops to a position-only fallback when it sees
them — so a second pass silently loses the protection that keeps printed artwork
intact. Always start from the raw CLO export.

**If printed artwork looks wrong**, don't guess at settings — look at it:

```bash
pnpm pipeline textures raw/garment.glb --out output/textures   # what's in the file
pnpm pipeline render   output/t004.glb --out output/after      # screenshot it
pnpm pipeline compare  output/before output/after --out sheet.png
```

`docs/OPEN-ISSUE-ARTWORK.md` explains how to read the results and runs the whole
thing in one command.

The names after `=` must exactly match each colourway's **variant ID** in the CMS.
The CMS also hard-blocks a raw/oversized upload (over 40 MB) and filenames with
spaces or unsafe characters, so a broken asset can't reach production.
Full details and troubleshooting: `tools/asset-pipeline/README.md`.

### 4. Uploading the processed GLB and posters

1. **Media → Create New** — upload the merged `.glb`, give it clear alt text.
2. Upload each colourway's poster image (WebP preferred, front three-quarter CLO render).
3. On the **product**: set *GLB asset* to the merged file, *Poster fallback* to the
   default colourway's poster.
4. **“Colours checked” is not a box you tick** — it is read-only and worked out
   for you. It goes green exactly when every colour on show points at a colour
   that is really inside the processed file. If it is not green, open the Colours
   tab and answer *“Which colour in your CLO file is this?”* for each colour; the
   dropdown shows a swatch of what each one actually looks like, so a maroon
   variant sitting under a row called Navy is visible at a glance.

   It used to be a checkbox the team ticked and hoped about, which is how three
   wrong colour names reached the live site on 2026-08-03.

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

One-time step: in Cloudflare dashboard → Workers & Pages → the
`run-apparel-viewer-site` **Worker** → *Settings → Domains & Routes* → add
`viewer.wear-run.help`. Full walkthrough in `docs/RUNBOOK.md` →
"Viewer: Pages → Worker cutover". (`docs/CLOUDFLARE-SETUP.md` §6 describes the
old Pages route and is kept only as historical reference.)

### 10. Before you announce anything

Run through **`docs/QA-CHECKLIST.md`** on a phone and a desktop, in light and
dark mode.

---
