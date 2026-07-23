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
# 1. Merge per-colourway exports into one production GLB.
#    Textures are re-encoded to WebP and capped at 2048px by default — the
#    dominant size win for CLO exports, which ship mostly uncompressed PNG.
pnpm pipeline merge --out output/n001.glb \
  raw/n001-navy.glb=N001-NAVY \
  raw/n001-black.glb=N001-BLACK \
  raw/n001-crimson.glb=N001-CRIMSON

# 1b. Optimize a single GLB (e.g. a separate-glb-per-colour export). Same
#     compression policy as merge.
pnpm pipeline optimize output/n001-navy.glb --out output/n001-navy.opt.glb --meshopt

# 2. Validate against the CMS colourway variantId list. --strict turns any
#    publish-readiness warning (raw CLO generator, oversize, uncompressed
#    textures) into a non-zero exit for CI gating.
pnpm pipeline validate output/n001.glb --expect N001-NAVY,N001-BLACK,N001-CRIMSON --strict

# Generate placeholder seed assets (development only)
pnpm pipeline placeholders --out output/placeholders
```

### Compression flags (`merge`, `optimize`)

| Flag | Default | Effect |
| --- | --- | --- |
| _(textures)_ | **WebP, 2048px** | Re-encode every texture to WebP (via `sharp`). |
| `--no-webp` | — | Keep original texture formats (skip re-encoding). |
| `--ktx2` | off | KTX2 / Basis Universal textures (see below). |
| `--max-texture <px>` | `2048` | Cap texture width/height, aspect preserved. |
| `--quality <n>` | `82` | WebP quality (1–100) / KTX2 ETC1S quality (1–255). |
| `--meshopt` | off | Meshopt geometry compression — fast decode on low-end mobile. |
| `--draco` | off | Draco geometry compression — smaller, slower to decode. |

### KTX2 / Basis Universal (`--ktx2`)

`KHR_texture_basisu` — GPU-compressed textures with the smallest VRAM footprint,
the best-practice production target, decoded natively by `<model-viewer>` v4.3+
(its Basis transcoder loads from `gstatic`, already allowed by the viewer CSP).
Encoding runs fully in-process via the WASM `ktx2-encoder` (no native `toktx`
binary in CI) with `sharp` decoding the source images. Two passes follow Basis
best practice automatically:

- **normal maps → UASTC** (preserves surface detail lossy ETC1S would smear), and
- **colour / data maps → ETC1S** (far higher compression where it is safe).

WebP remains the no-flag default: universal, needs no runtime decoder, and fast to
encode. Reach for `--ktx2` on final production assets where GPU memory matters most.
KTX2 encoding is slower — expect a few seconds per 2K texture.

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

## Geometry compression — Draco vs Meshopt

Both are **off by default** — evaluate case-by-case per the performance brief; textures
(WebP, on by default) are usually the far bigger win for CLO exports.

- **`--meshopt`** (`EXT_meshopt_compression`): a tiny, very fast decoder — the better
  default for the mobile-first QR-scan audience, and it compresses further under Brotli at
  the edge.
- **`--draco`** (`KHR_draco_mesh_compression`): smaller on the wire, but a heavier decoder
  and slower on low-end mobile.

Test on real hardware before enabling either for a product.

## Notes

- Output GLBs over 8 MB trigger a size warning (QR scans are mobile-first).
- All Khronos extensions are registered for reading, including Draco-compressed inputs.
- Placeholder assets are for the seed dataset only — replace with pipeline-processed CLO
  exports for real products.
