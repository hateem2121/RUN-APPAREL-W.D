# OPEN ISSUE — printed artwork is damaged on the shrunk model

**Status:** open, not yet diagnosed — but the pipeline can now be *looked at*
rather than guessed about. Reported by the owner on the live site 2026-07-29,
after the first real garment rendered successfully.

**Symptom, in the owner's words:** *"the logo, graphics, words, etc are broken /
half visible, half not."*

This is the blocking issue for the whole pipeline. Everything else works — upload,
shrink, colour mapping, publish, render. But for a B2B garment reference the
printed artwork *is* the product, so "the 3D loads" is not success.

> **Read this first if you are picking the issue up.** The single most important
> change since it was filed is that guessing is no longer necessary. Run the
> bisect in [Investigation](#investigation) before forming an opinion — it takes
> one command and it answers the question the ranking below only speculates about.

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

Ranking revised 2026-07-31 after reading the pipeline against meshoptimizer,
glTF-Transform, libwebp and model-viewer upstream. Three causes were added that
outrank everything originally listed, and one original candidate turned out to be
a good test but a bad fix.

### H4 — `simplifyTextured` protects only `TEXCOORD_0` ⭐ leading suspect

`simplify-textured.ts:125` returns early unless `TEXCOORD_0` exists, and `:135`
interleaves only that set into the attribute buffer. CLO's *Apply Graphic* places
prints on garments that commonly carry a **second UV set**.

Any material whose `baseColorTexture.texCoord === 1` therefore has its UVs
decimated at **zero weight** while the fabric's are protected at weight 1. Some
panels smear, others do not. That is "half visible, half not", literally — and it
explains why tuning `--uv-weight` never helped: on those materials the knob was
not connected to anything.

Compounding it, `prune({ keepExtras: true })` (`optimize.ts:176`) defaults
`keepAttributes: false`, so glTF-Transform drops unused UV sets *and* renumbers
the survivors via `shiftTexCoords`. Correct in itself, but it means the index the
artwork lands on is not stable across inputs.

**Cheapest possible check, no processing required:**

```
pnpm pipeline textures <raw.glb> --out output/textures-raw
```

If any `texCoords` entry in the manifest is not `[0]`, this is live. `validate`
now warns about it too.

### H5 — lossy WebP has no 4:4:4 mode ⭐

`optimize.ts:188-196` sends **every** texture through `textureCompress` at
`quality: 82` with no slot filter. libwebp's lossy encoder works exclusively in
8-bit Y'CbCr **4:2:0** — chroma is stored at half resolution in both axes, so
sharp saturated edges bleed into their neighbours. That is the canonical failure
mode for wordmarks and flat printed graphics, and it explains the inventory above
better than "the encoder destroyed them": a 2048×2048 in 13 KB is 0.003
bytes/pixel, which is what q82 4:2:0 produces from a mostly-flat logo on
transparency.

**Careful with the fix.** glTF-Transform's `TextureCompressOptions` exposes
`quality`, `lossless`, `nearLossless` and `chromaSubsampling` — but
`chromaSubsampling` is a JPEG/AVIF option and **sharp ignores it for WebP**. The
levers that actually work here are `smartSubsample` (libwebp's "Sharp YUV"),
`alphaQuality` and `preset`, and `textureCompress` exposes none of them. Reaching
them needs a small custom transform; `sharp` is already a direct dependency of
this package (`optimize.ts:7`).

`smartSubsample` costs no file size and exists precisely for this artefact.

### H6 — coplanar print layers z-fight after solidify + quantize

`solidifyMaterials` (`optimize.ts:157-168`) forces every `BLEND` material to
`OPAQUE` **and** calls `setDoubleSided(true)` on *every* material — including the
`MASK` decals it deliberately spared. CLO exports graphics as a surface a fraction
of a millimetre off the fabric. Made opaque, double-sided, decimated, then
position-quantized (`meshopt({ level: 'high' })` → `quantizePosition: 14`,
`quantizationVolume: 'mesh'`), the two surfaces interpenetrate. Stippled, patchy
artwork is the textbook signature.

### H1 — UV distortion from decimation

Still real, and the original self-correction below is right. But it ranks *below*
H4: if the artwork's UV set was never weighted, no `--uv-weight` value was ever
going to help.

⚠️ **A mistake made during the original session, preserved because it is easy to
repeat.** It was argued that `--simplify-error` and `--uv-weight` are independent,
so the budget could be loosened 20× while "keeping artwork protection at
Balanced's level". That is **not right**. meshoptimizer folds attribute error into
a single `target_error` budget; `uv-weight` only sets how heavily UV distortion is
priced *within* it. Raising the budget 20× therefore does permit substantially
more UV distortion, at any weight. The project's own measured table shows the
trade is real and unavoidable:

```
uv weight        0     0.1      1     10    100
error 0.001     20t    39t   192t   943t  1983t
error 0.01      20t    20t    38t   194t   929t
```

Read it across: to hold triangle count (and therefore artwork fidelity) while
loosening the budget, `uv-weight` must rise *with* it — error 0.01 @ weight 10
gives 194t, about the same as error 0.001 @ weight 1. Same fidelity, same size.
**There is no free lunch on geometry.**

### H2 — texture compression destroying the decals

Superseded by H5, which says the same thing with a mechanism attached. The
near-empty textures are a symptom to check against the raw file, not evidence on
their own. Still true that this is **the cheap lever**: textures are 2.1 MB of
19 MB, so quality can be raised a long way for very little size.

### H3 — alpha handling ⚠️ good test, bad fix

The original note called `--keep-transparency` "a one-flag test [that] would be a
complete explanation". It is an excellent *diagnostic* and a **wrong fix**.

`<model-viewer>` (three.js underneath) has **no order-independent transparency**.
Restoring `BLEND` on a multi-part garment produces depth-sorting artefacts —
google/model-viewer#1620 — which is the exact bug `solidifyMaterials` was written
to prevent. Flipping the flag trades one "half visible" for another.

**If alpha turns out to be implicated, the correct fix is `BLEND` → `MASK`,** not
`BLEND` → `OPAQUE` and not "leave it `BLEND`". `MASK` with `alphaCutoff 0.5` is
order-independent, renders solid, and preserves the cutout. Decide per material by
inspecting the actual alpha data — `pnpm pipeline textures` reports whether each
texture's alpha is absent, uniformly opaque, a hard binary cutout, or genuinely
graded, which is exactly the input that decision needs.

---

## Investigation

**One command.** From `tools/asset-pipeline`, against the **raw** file:

```
node scripts/bisect-artwork.mjs <raw.glb> --out output/bisect --detail small
```

It dumps the raw file's texture inventory, then runs the full production chain
five times with **one stage removed each time**, renders every result through
`<model-viewer>`, and writes a contact sheet per run comparing it against the
unprocessed original.

| Run | What is removed | Isolates |
| --- | --- | --- |
| `raw` | everything — ground truth | — |
| `full` | nothing | the reported failure, reproduced |
| `no-textures` | WebP re-encoding | H5 |
| `no-simplify` | decimation | H1 / H4 |
| `no-meshopt` | geometry compression | H6 quantization |
| `no-solidify` | BLEND → OPAQUE | H3 / H6 alpha |

**Why subtractive rather than one-variable-at-a-time.** Varying settings answers
"which knob helps", which has been asked twice and produced a preset that protects
artwork *less* while looking better on the size chart. Removing one stage from the
real chain answers "which stage does the damage", which is the actual question.

**Every run starts from the raw file, never from another run's output.** Meshopt
quantizes vertex attributes to integers and `simplify-textured.ts:144` explicitly
bails to the position-only fallback when it sees them, so a second pass silently
loses artwork protection and blames the wrong stage. This trap wasted time twice.

Then:

1. **Open the `sheet-*.png` files and look at the `crop-*` rows.** The run whose
   crops match `raw` is the one whose removed stage was doing the damage.
2. **Read `textures-raw/manifest.json`.** If any `texCoords` is not `[0]`, H4 is
   live regardless of what the sheets say.
3. **Check the decimation line** in the shrink report or `optimize` output. If
   `fallback` exceeds `attributeAware`, UV-aware decimation did not happen at all
   for most of the garment.
4. **Only then** pick a fix, and re-derive all three Detail levels together so
   they stay honestly ordered (`shrink.test.ts:42-72` enforces the ordering).

The owner's eye is the acceptance test and they have said so. The sheets exist to
make that judgement possible without a phone and a live deploy.

### The individual tools

```
pnpm pipeline textures <file.glb> --out <dir>          # texture inventory + PNG dump
pnpm pipeline render   <file.glb> --out <dir>          # screenshots through <model-viewer>
pnpm pipeline compare  <dirA> <dirB> --out sheet.png   # A | B | amplified difference
```

`render` needs a Chromium. In CI and dev containers set `PLAYWRIGHT_CHROMIUM_PATH`
to the preinstalled one — the same variable `apps/viewer/playwright.config.ts`
already uses.

---

## On the 18.5 MB vs 8 MB gap

Worth setting expectations honestly, because it is what pushed the presets into
damaging territory in the first place.

95% of the file is geometry (3.76 M triangles), so texture codecs have nothing
left to give and `--ktx2` will not close it. **Splitting per colourway does not
help either**: `KHR_materials_variants` shares geometry across variants, so five
separate files would each carry the full mesh — five downloads' worth of geometry
to save four-fifths of 2.1 MB of textures.

The only real lever is decimating harder, and correct UV weighting (H4) is
precisely what buys the headroom to do that safely. Fix H4 first, then re-derive
the presets and find out where the artwork actually breaks. If 8 MB turns out to
be unreachable at acceptable fidelity, say so and adjust the guideline rather than
ship torn logos to meet a number. Progressive / LOD streaming is the industry
answer at this size and is out of scope here.

---

## Do not repeat

- Do not tune presets without looking at a rendered logo. Size numbers alone were
  what produced the current, probably-worse setting. There is now no excuse:
  `pnpm pipeline render` takes the picture for you.
- Do not test decimation by re-running the pipeline on pipeline output.
- Do not assume `uv-weight` insulates artwork from a looser error budget.
- Do not "fix" alpha with `--keep-transparency`. It has no order-independent
  transparency behind it; use `MASK`.
- Do not trust `chromaSubsampling` in `textureCompress` to do anything for WebP.
  It is a JPEG/AVIF option and sharp ignores it there.
