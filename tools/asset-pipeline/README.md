# RUN APPAREL — GLB Asset Pipeline

Merges CLO's per-colourway GLB exports into **one production GLB per product**, with every
colourway bound as a `KHR_materials_variants` entry named after its CMS `variantId`.

> **Why this exists:** CLO's native multi-colourway combined export is not reliable —
> it typically produces one GLB per colourway, and past combined exports have had
> material-linking bugs. **Never assume a raw CLO export is publish-ready.** Every
> product GLB must pass through this pipeline and its validator before upload.

## Commands

Run from the repo root (or inside `tools/asset-pipeline` with `pnpm start`):

```bash
# 1. Merge per-colourway exports into one production GLB
pnpm pipeline merge --out output/n001.glb \
  raw/n001-navy.glb=N001-NAVY \
  raw/n001-black.glb=N001-BLACK \
  raw/n001-crimson.glb=N001-CRIMSON

# 2. Validate the merged GLB against the CMS colourway variantId list
pnpm pipeline validate output/n001.glb --expect N001-NAVY,N001-BLACK,N001-CRIMSON

# Generate placeholder seed assets (development only)
pnpm pipeline placeholders --out output/placeholders
```

## Workflow (must run before any product is published)

1. Export **one GLB per colourway** from CLO (same garment, same pose, same mesh).
2. `merge` them, naming each input's variant **exactly** as the colourway's `variantId`
   in Payload (e.g. `N001-NAVY`). Variant names and CMS IDs must match character-for-character —
   `<model-viewer>` selects variants by this name at runtime.
3. `validate --expect <all active variantIds>` — the check reads variant bindings at the
   **primitive level** (what `<model-viewer>` actually reports as `availableVariants`), so an
   unbound or misnamed variant can never pass.
4. Load the merged GLB in `<model-viewer>`'s scenegraph inspector and visually QA every variant.
5. Upload to Payload, tick **“Variants verified”** on the product, publish.

## When the merge fails or looks wrong

The merge refuses to run if the colourway exports don't share identical geometry
(primitive count / vertex count / index count per primitive). This is deliberate — a forced
merge would silently mis-map materials. In that case:

- Re-export all colourways from the **same** CLO project state, or
- Set the product's `variantMode` to **`separate-glb-per-colour`** in Payload and upload each
  colourway's own (still pipeline-validated) GLB. The viewer swaps `src` per colourway with the
  same poster-first experience. **This mode is always available — a failed merge never blocks
  publishing.**

## Draco compression

`--draco` is available but **off by default** — evaluate case-by-case per the performance brief.
Draco shrinks download size but adds decode time on low-end mobile devices; test on real
hardware before enabling it for a product.

## Notes

- Output GLBs over 8 MB trigger a size warning (QR scans are mobile-first).
- All Khronos extensions are registered for reading, including Draco-compressed inputs.
- Placeholder assets are for the seed dataset only — replace with pipeline-processed CLO
  exports for real products.
