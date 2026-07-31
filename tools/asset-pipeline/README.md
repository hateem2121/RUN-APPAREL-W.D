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

### Diagnostics — for looking at artwork instead of guessing at it

```bash
# Texture inventory: dump every texture to PNG with a manifest saying which
# materials and slots use it, WHICH UV SET it samples, and what its alpha
# channel really contains. Processes nothing, so it is the cheapest first step.
pnpm pipeline textures raw/garment.glb --out output/textures-raw

# Screenshot a GLB through <model-viewer> from fixed angles, including tight
# crops where printed logos live. Flat neutral lighting, shadows off, so a diff
# shows the artwork rather than the lighting.
pnpm pipeline render output/n001.glb --out output/renders/after

# Contact sheet: A | B | amplified difference, per view, with the real numbers.
pnpm pipeline compare output/renders/before output/renders/after --out sheet.png
```

`render` needs a Chromium. Where Playwright's own download is absent (CI images,
dev containers) point `PLAYWRIGHT_CHROMIUM_PATH` at the preinstalled one — the
same variable `apps/viewer/playwright.config.ts` already reads.

**To find which pipeline stage damages printed artwork**, run all of it at once
against the raw file:

```bash
node scripts/bisect-artwork.mjs raw/garment.glb --out output/bisect --detail small
```

That runs the full production chain five times with one stage removed each time,
renders every result, and writes a contact sheet per run against the unprocessed
original. See `docs/OPEN-ISSUE-ARTWORK.md` for how to read the output.

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
| `--simplify <ratio>` | off | Decimate geometry to this fraction of triangles (0–1), e.g. `0.05` keeps ~5%. A **target**, not a promise — see below. |
| `--simplify-error <r>` | `0.0001` | Error ceiling as a fraction of mesh radius. Decimation stops early rather than exceed it. |
| `--uv-weight <n>` | `1` | How heavily texture distortion counts against that budget. **This is what keeps printed logos intact.** `0` disables texture-aware decimation. |
| `--normal-weight <n>` | `0.5` | Same idea for vertex normals — protects shading rather than artwork. |

> **`--simplify` is essential for raw CLO exports.** CLO's cloth simulation produces
> meshes with **millions** of triangles (a real export measured 9.8 M triangles /
> 6.3 M vertices) — 50×+ past what a web viewer needs. That geometry, not the
> textures, is what makes the file huge: texture compression alone took one 364 MB
> export only to ~66 MB, but `--simplify 0.05 --meshopt` brought it to **14 MB**.
> Splitting into per-colour files does **not** help — the heavy mesh is shared, so
> it just repeats in every file.

> ⚠️ **`--simplify` is a TARGET, not a promise — and this trips people up.**
> Decimation stops early as soon as it would exceed `--simplify-error`. Once that
> budget is the binding constraint, **lowering the ratio changes nothing at all.**
> (An earlier version of this README advised "lower it to 0.03 to hit the 8 MB
> guideline". That advice does not work once the budget binds.) To get a smaller
> file, raise `--simplify-error` or lower `--uv-weight`.

### How printed artwork is protected

Decimation used to tear printed logos apart, because glTF-Transform's `simplify()`
only ever sees vertex **positions** — it cannot know how far a UV has been dragged,
and smearing the UVs under a printed graphic tears the image.

The first fix was meshoptimizer's `LockBorder` flag. It works, but for the wrong
reason: glTF-Transform documents it for "adjacent 'chunks' of a large mesh (e.g.
terrain) [that] share a border", and it freezes **every** topological border —
every neckline, cuff, hem and UV-island edge. On a real 373 MB export that took the
result from 850 k triangles to 6.0 M / **58.3 MB**, over the CMS's 40 MB publish
ceiling, so nothing could be published at all.

`src/simplify-textured.ts` now uses meshoptimizer's `simplifyWithAttributes`
instead, which its own README documents for exactly this case: it "can improve
shading (by using vertex normals), **texture deformation (by using texture
coordinates)**". With UV error inside the error budget, `LockBorder` is
unnecessary and the mesh interior — where there is nothing to protect — is free to
collapse. Anything the fast path can't take (no UVs, quantized attributes,
non-triangle draw modes) falls back to the library's own position-only
`simplifyPrimitive` with `lockBorder`, so the conservative behaviour is still the
floor.

**Two knobs, trading directly against each other.** Measured on a synthetic
243,602-triangle draped surface with a non-linear unwrap (control, undecimated:
1.3e-6 texture error):

| setting | triangles | size (meshopt) | p99 texture error |
| --- | --- | --- | --- |
| `--uv-weight 0 --simplify-error 0.0001` (old, lockBorder) | 58,378 | 0.29 MB | 0.00013 |
| `--uv-weight 0 --simplify-error 0.001` (old, lockBorder) | 12,180 | 0.07 MB | 0.00073 |
| `--uv-weight 2 --simplify-error 0.0002` | 20,421 | 0.11 MB | 0.00036 |
| `--uv-weight 1 --simplify-error 0.0005` | 12,180 | 0.07 MB | 0.00054 |
| `--uv-weight 0.5 --simplify-error 0.002` | 4,872 | 0.04 MB | 0.00161 |

At equal size, texture-aware wins (0.00054 vs 0.00073 p99 at 12,180 triangles);
the larger effect is size, at 2.9–4.8× fewer triangles for comparable protection.

⚠️ **UV weighting only does anything where the unwrap is non-linear.** A linearly
mapped surface keeps its texture perfectly under decimation regardless of weight —
measured, every weight from 0 to 100 gave an identical result on a flat grid. Real
garment unwraps are non-linear; flat test planes are not, so don't calibrate on one.

For the automatic shrinker, don't set these by hand — pick the **Detail** level on
the raw upload (Balanced / Highest quality / Smallest file). The mapping lives in
`packages/shared/src/shrink.ts`.

⚠️ **Check that the protection actually ran.** `optimize` and the shrink report
both print a decimation line:

```
decimation: 412 primitive(s) with UV error in the budget, 3 fallback, 0 skipped
```

Primitives counted as **fallback** were decimated position-only with borders
locked — `--uv-weight` did nothing for them. If `fallback` exceeds
`attributeAware`, artwork protection did not happen for most of the garment, and
no amount of tuning that flag will change the result. The usual causes are a
missing `TEXCOORD_0` or attributes that were already quantized by an earlier
meshopt pass (which is why you must never re-run the pipeline on its own output).

**Every UV set is weighted, not just `TEXCOORD_0`.** Decimation used to weight
the first set only, so a printed graphic on `TEXCOORD_1` — which is where CLO's
*Apply Graphic* puts it — was decimated with no protection while the fabric's UVs
were fully protected. The `UV sets:` line in `optimize`'s output lists what was
actually weighted; if a set the file uses is missing from it, artwork on that set
is unprotected.

Note that `prune()` renumbers a *lone* second UV set down to `TEXCOORD_0` before
decimation sees it, so the hazard is specifically materials sampling **two or
more** sets at once (fabric AO on UV0 plus a graphic on UV1). `validate` warns on
exactly those. See `docs/OPEN-ISSUE-ARTWORK.md` (H4).

### Material flags (`merge`, `optimize`) — opaque + double-sided

| Flag | Default | Effect |
| --- | --- | --- |
| _(opaque step)_ | **on** | Force every fabric material solid: convert `alphaMode` **BLEND → OPAQUE** and set it **double-sided**. |
| `--keep-transparency` | — | Skip the opaque step. Alias: `--no-opaque`. |

CLO frequently exports opaque fabric as **`alphaMode: BLEND`** — from a stray fabric
opacity value or an unused alpha channel left in the base-colour texture. `<model-viewer>`
(three.js underneath) has **no order-independent transparency (OIT)**, so it draws that
fabric **see-through**: you see the garment's back faces through the front. The fix belongs
in the material, not the viewer — a garment that was never meant to be sheer should not be
translucent in the first place — so the pipeline converts BLEND → OPAQUE by default.

The step also sets every material **double-sided**, so single-layer (CLO "Thin") fabric
stays visible from the inside (necklines, cuffs, open plackets) instead of vanishing where a
back face would be culled.

**Deliberately left untouched:** `MASK` materials (hard alpha cutouts — a logo decal or a
genuine mesh hole). They are order-independent and intentional; forcing them opaque would
fill the cutouts back in.

Use `--keep-transparency` **only** for genuinely sheer garments (mesh, lace, tulle). The
`validate` command warns whenever a GLB still carries BLEND materials, so a see-through
export is caught before upload even if the step was skipped.

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
