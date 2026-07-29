# OPEN ISSUE — printed artwork is damaged on the shrunk model

**Status:** open, not diagnosed. Reported by the owner on the live site
2026-07-29, after the first real garment rendered successfully.

**Symptom, in the owner's words:** *"the logo, graphics, words, etc are broken /
half visible, half not."*

This is the blocking issue for the whole pipeline. Everything else works — upload,
shrink, colour mapping, publish, render. But for a B2B garment reference the
printed artwork *is* the product, so "the 3D loads" is not success.

---

## What is known

**The garment.** `cycling all colours.glb`, 382,107,380 bytes raw, a women's
cycling suit with five CLO colourways (`Colorway 2` … `Colorway 6`). Uploaded
against product N001 as a test, so the garment does not match the product name.

**The processed file.** `cycling-all-colours-optimized-2.glb`, 19,385,652 bytes,
produced at Detail = **"Smallest file"** with
`--simplify 0.02 --meshopt --simplify-error 0.01 --uv-weight 1`.

Measured on the *previous* output (Balanced, 37.5 MB) — the shape is the same:

```
triangles      : 3,763,177
vertex data    : 42.7 MB
index data     : 29.2 MB
texture images :  2.1 MB   (22 textures)
```

**95% of the file is geometry. Textures are 2.1 MB of it.** Meshopt is already
applied. Texture format and geometry codec have essentially nothing left to give;
triangle count is the only size lever, which is exactly why shrinking pressures
the artwork.

**Texture inventory of the live file** (`getSize()` per texture). Note the
long-thin ones — those shapes are wordmarks and printed bands — and note how
several are near-empty in bytes:

```
2048x1510  226 KB     2048x1510  464 KB     2048x1510  164 KB
1823x1288   28 KB     1823x1288   24 KB     2031x550    13 KB
2031x550    13 KB     2000x2000  733 KB     2000x2000  111 KB
2048x2048   13 KB  <-- 4 Mpx image in 13 KB
 283x576    65 KB      283x576   105 KB      274x576    56 KB
 853x142     0 KB  <-- wordmark-shaped, effectively empty
 274x576     1 KB  <-- effectively empty
2048x910    29 KB     2048x910     6 KB     1944x121     9 KB
1944x121    10 KB      640x640    23 KB      640x640    23 KB
 256x256    22 KB
```

---

## Candidate causes, most to least likely

**1. Decimation distorting UVs.** "Half visible, half not" is the classic
signature of UV smearing: part of a decal lands correctly, part gets dragged off
its island. The current file is the *most* aggressive preset.

⚠️ **Correct a mistake made during this session before acting on it.** It was
argued that `--simplify-error` and `--uv-weight` are independent, so the budget
could be loosened 20× while "keeping artwork protection at Balanced's level".
That is **not right**. UV error sits *inside* the error budget; `uv-weight` only
sets how heavily UV distortion is priced *within* it. Raising the budget 20×
therefore does permit substantially more UV distortion, at any weight. The
project's own measured table shows the trade is real and unavoidable:

```
uv weight        0     0.1      1     10    100
error 0.001     20t    39t   192t   943t  1983t
error 0.01      20t    20t    38t   194t   929t
```

Read it across: to hold triangle count (and therefore artwork fidelity) while
loosening the budget, `uv-weight` must rise *with* it — error 0.01 @ weight 10
gives 194t, about the same as error 0.001 @ weight 1. Same fidelity, same size.
**There is no free lunch on geometry.** The current "small" preset is very likely
worse for artwork than "Balanced" was.

**2. Texture compression destroying the decals.** Several artwork-shaped textures
are 0–13 KB. A 2048×2048 in 13 KB, or an 853×142 wordmark in 0 KB, is not a
legible graphic. Cause not established — could be WebP at quality 82 on flat
artwork with alpha, could be the source, could be the 2048 px cap resampling thin
text. **This is the cheap lever: textures are only 2.1 MB of 19 MB, so quality
could be raised a long way for very little size.**

**3. Alpha handling.** The pipeline forces `alphaMode BLEND → OPAQUE` on every
material (`solidifyMaterials`, on by default) to stop CLO garments rendering
see-through. Printed decals frequently rely on alpha. `MASK` is deliberately left
alone, but a decal authored as `BLEND` would be flattened to opaque — which would
read exactly as "half visible, half not". **Check this early; it is a one-flag
test (`--keep-transparency`) and would be a complete explanation.**

---

## Suggested investigation

Do this on the **raw** file, not the shrunk one. Re-processing an already
meshopt-quantized GLB is meaningless: attributes are no longer `Float32Array`, so
`simplifyTextured` silently falls back to a border-locking path and does nothing.
This trap wasted time during this session — twice.

1. **Get the raw file locally.** It is in the private ingest bucket:
   `run-apparel-viewer-ingest / cycling all colours.glb`. Render a reference crop
   of a logo from it, untouched. That is the ground truth everything else is
   compared against.
2. **Bisect the three candidates independently**, one variable at a time, from raw:
   - alpha: `--keep-transparency` vs default
   - textures: `--quality 95 --max-texture 4096` vs defaults
   - geometry: `--simplify-error 0.0002 --uv-weight 2` (fidelity) vs current
3. **Compare crops of the same logo** at the same camera. Visual, not numeric —
   the owner's eye is the acceptance test and they have said so.
4. **Only then** pick a preset, and re-derive all three Detail levels together so
   they stay honestly ordered.

A per-texture PNG dump from the raw and processed files, diffed, would settle
candidate 2 in minutes and is probably the fastest first step.

## Do not repeat

- Do not tune presets without looking at a rendered logo. Size numbers alone were
  what produced the current, probably-worse setting.
- Do not test decimation by re-running the pipeline on pipeline output.
- Do not assume `uv-weight` insulates artwork from a looser error budget.
