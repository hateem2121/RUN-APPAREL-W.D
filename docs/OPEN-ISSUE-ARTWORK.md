# OPEN ISSUE — printed artwork is damaged on the shrunk model

> ## Status 2026-08-05 (later): **CLOSED, and locked against regression.**
>
> The fix is measured, seen, live, and now pinned by tests that fail when it is
> undone. Suite: **350** (was 340).
>
> **The fixture can now exhibit the failure — for the first time.**
>
> - `src/__fixtures__/wordmark-alpha.png` is the **real** `THE EXTRA MILE
>   (Slogan)` alpha channel, lifted from the 364 MB raw export. 13 KB, because
>   only the alpha is kept and RGB is flattened. It replaces a synthetic
>   approximation of painted stripes at 400×50. Round-trip verified **exact**:
>   0.6638 / 0.3004 / 0.0358, the same numbers the fix was calibrated against.
>   Taken from the RAW export deliberately — `solidifyMaterials`
>   (`optimize.ts:300`) runs BEFORE texture compression (line 305), so
>   `profileAlpha` never sees the WebP.
> - `placeholders.ts` now seeds **five** artwork materials per colourway carrying
>   the five measured profiles, not one clean cutout. The `graded` 3.58% shape —
>   the one that broke production — is in the seeded chain at last.
> - The end-to-end test asserts **every** artwork material comes out `MASK`/0.5
>   and that **zero** remain on BLEND. It previously asserted
>   `masked.length > 0`, which one material made indistinguishable from the
>   stronger claim; the production refusal named *five*.
> - A material that *becomes* MASK inside `solidifyMaterials` is now asserted to
>   keep its incoming sidedness. That was the one gap left open on 2026-08-04.
>
> **Negative controls, each run and observed:**
>
> | reverted | tests that fail |
> |---|---|
> | `CUTOUT_MID_FRACTION` 0.05 → 0.02 | **5**, including the full-chain e2e and the merge test |
> | `CUTOUT_MIN_TRANSPARENT` 0.05 → 0 | 3 |
> | `OPAQUE_FACTOR_THRESHOLD` 0.99 → 0 | 2 |
>
> Before this work, reverting `CUTOUT_MID_FRACTION` failed 2 isolated unit tests.
> It now fails through the real compressed, textured, UV-carrying chain.
>
> Still open, and tracked as separate work: the placeholder poster images and the
> colour data. See
> `docs/superpowers/specs/2026-08-05-n001-production-polish-design.md`.

> ## ⚠ NEW FINDING 2026-08-05: the three gates do NOT catch decimation damage
>
> A six-run sweep from the raw export
> (`tools/asset-pipeline/scripts/sweep-size-vs-artwork.mjs`) varied
> `--simplify-error` from 0.0002 to 0.005. **Every single run passed all three
> blocking gates** — including the one deliberately set up to fail.
>
> | run | `--simplify-error` | size | `artworkAtRisk` | `findArtworkAlphaProblems` | all 26 MASK/0.5 | **gates** | **wordmark, rendered** |
> |---|---|---|---|---|---|---|---|
> | B | 0.0002 (fidelity) | 58.63 MB | 0 | 0 | yes | PASS | — |
> | A | 0.0005 (**balanced, shipped**) | 37.72 MB | 0 | 0 | yes | PASS | **crisp** |
> | D | 0.001, uv 2 | 27.49 MB | 0 | 0 | yes | PASS | — |
> | **C** | **0.001** | **26.96 MB** | 0 | 0 | yes | PASS | **fully legible** |
> | E | 0.002 (**small, shipped**) | 18.81 MB | 0 | 0 | yes | PASS | **MILE breaking up** |
> | F | 0.005 | 12.14 MB | 0 | 0 | yes | PASS | **destroyed** |
>
> Evidence: `images/2026-08-05-size-vs-wordmark.png`, chest crop at 4×, Colorway 2.
>
> **F is illegible and shipped clean through every check.** The gates test
> `alphaMode`, which is a *settings-independent* property — that is why they
> caught the 2026-08-04 bug and why they say nothing here. `artworkAtRisk` fires
> only when a primitive takes the position-only fallback; with `--uv-weight 1` the
> UVs *are* in the error budget, so it is empty. The budget was simply too loose.
> Nothing measures whether the letters survived.
>
> **This is the same class of hole the whole document is about**, one level up: in
> 2026-07 the fixture could not exhibit the failure; now the *gate* cannot.
>
> ### Two consequences
>
> 1. **The shipped `small` preset visibly damages this garment.** Run E is
>    `smallest file — softer detail` exactly as an owner would select it from the
>    admin, and `MILE` is already breaking apart. The Detail copy corrected earlier
>    today says Detail fixes smearing — it can also *cause* it, and the preset
>    offering that is live now.
> 2. **`--simplify-error 0.001` is the better default.** Run C is **28% smaller
>    than what is live** (26.96 MB vs 37.72 MB) with a wordmark still fully
>    legible, and D shows `uv-weight 2` buys only 0.5 MB — the budget is the dial
>    that matters, exactly as `shrink.ts` says.
>
> Neither change has been made. Both need a rendered-crop review per garment,
> because "legible" is not a number this pipeline can currently compute — which is
> the honest reason `findCrushedArtwork` was left advisory.

> ## Status 2026-08-05: **RESOLVED — the fix is measured AND SEEN.**
>
> The owner ticked Retry on raw upload #1 at **05:46:02 UTC**. The pipeline
> **succeeded**: `status: ready`, `resultGlb` = Media #11
> `cycling-all-colours-optimized-3.glb`, 364.4 MB → **37.7 MB**,
> `artworkVerdict: ok`.
>
> **The render was then checked, which is the claim this document has been
> waiting on since 2026-07-29.** `pnpm pipeline render` on the new file, two
> colourways, plus every artwork texture extracted at native resolution:
>
> - The chest wordmark reads **`THE EXTRA MILE`** — every letter, clean edges.
>   It rendered as `⬛HE EXTRA ⬛⬛⬛⬛E` on 2026-08-03.
>   → `images/2026-08-05-n001-wordmark-zoom.png` (4× nearest-neighbour)
> - The `RUN` mark — running figure + lettering + ® — is **fully present**. That
>   is the `✳` that was destroyed.
> - Nothing is see-through, boxed, or missing.
>   → `images/2026-08-05-n001-front-cream.png`,
>     `images/2026-08-05-n001-front-colorway2-maroon.png`
>
> ### All five artwork textures, measured (this closes the "only 1 of 5" gap)
>
> 26 material instances = 5 distinct textures × 5 colourways. **Every one resolved
> to `MASK` / `alphaCutoff 0.5`. `findArtworkAlphaProblems` is EMPTY.** Whole-file
> census: `{ OPAQUE: 174, MASK: 26 }` — **zero BLEND**.
>
> | texture | size | transparent | opaque | mid | character | margin under `CUTOUT_MID_FRACTION` |
> |---|---|---|---|---|---|---|
> | `Teamwear Logo` | 1823×1288 | 55.90% | 43.69% | **0.41%** | `binary` | 92% |
> | `TEAM WEAR FRONT LABEL` | 4096×1821 | 18.77% | 80.70% | **0.53%** | `binary` | 89% |
> | `Zipper 3_TapeFabric` | 274×576 | 0.00% | 99.33% | **0.67%** | `binary` | 87% |
> | `RUN LOGO` | 2031×550 | 67.01% | 32.10% | **0.90%** | `binary` | 82% |
> | `THE EXTRA MILE (Slogan)` | 1944×121 | 66.38% | 30.04% | **3.58%** | `graded` | **28%** |
>
> **Answering the question this table was built to answer: 0.05 is NOT a near-miss
> for four more textures.** Four of the five are `binary` at 0.41–0.90% mid — they
> resolved correctly under the *old* 0.02 threshold too and never needed the fix.
> The Slogan is the sole outlier at 3.58%, sitting 28% under the new ceiling. The
> mis-calibration affected exactly one texture, and the new constant is not
> load-bearing for anything else in this garment.
>
> Note `Zipper 3_TapeFabric` at **0.00% transparent**: it reaches MASK via the
> `character === 'binary'` branch, not the cutout branch, and would fail
> `CUTOUT_MIN_TRANSPARENT` outright. Harmless here — at 99.33% opaque nothing is
> discarded — but it is the shape that constant exists to catch, sitting in a real
> file.
>
> ### The bytes-per-pixel advisory fired three times. All three were false alarms.
>
> `findCrushedArtwork` flagged #3 (0.0126 bpp), #5 (0.014) and #15 (0.0114). Every
> one was extracted and inspected at native resolution and is **completely
> intact** — #15 is legible down to `⚠ CAUTION ⚠ DO NOT BLEECH OR WASH IN HOT
> WATER` at 4096×1821 (`images/2026-08-05-n001-front-label-native.png`; the typo
> is in the source artwork).
>
> **This is the designed behaviour, now demonstrated on a real garment:** these are
> flat black-and-white marks, and flat artwork legitimately encodes this small.
> Had `CRUSHED_BYTES_PER_PIXEL` been a *blocking* gate it would have refused a
> perfectly good file three times over. Keep it advisory.
>
> ### Double-siding on converted materials — resolved, no regression
>
> **10 of 26** MASK materials are double-sided (the zipper tapes); the other 16 —
> every logo — are single-sided. They render correctly, so their normals face
> outward and `optimize.ts` preserving source sidedness is doing the right thing.
> The feared "decal facing inward now renders as nothing" did not occur.
> **Still unpinned:** no test asserts sidedness for a material that *becomes* MASK
> inside `solidifyMaterials`.
>
> ### What this did NOT fix
>
> - **Size: 37.7 MB, up from 19.4 MB.** Under `GLB_HARD_MAX_BYTES` (40 MB) by only
>   2.3 MB and **4.7× over** `SIZE_WARNING_BYTES` (8 MB). This is a QR-scanned,
>   phone-first product. Treat as the next issue.
> - **Colour names are wrong, now confirmed visually.** Colorway 2 renders
>   **maroon** and the CMS calls it "Navy". The file reports Maroon / Blush /
>   Cream / Lime / Black; the CMS shows Navy / Black / Crimson and does not expose
>   Colorways 5–6 at all.
> - **The product is a women's cycling skinsuit published as "Velocity Performance
>   Tee".**
> - **Production still serves the old file.** The new GLB is on the upload row, not
>   attached to the product. That is a separate owner action.

> ## Status 2026-08-04: ROOT CAUSE FOUND AND MEASURED.
>
> The Retry was ticked. The pipeline **refused to save** — the gate added the day
> before caught five artwork materials left on `alphaMode: BLEND`. Chasing that
> refusal to its source found a single mis-calibrated number, and it explains
> *both* observed failures.
>
> `profileAlpha` (`textures.ts`) called an alpha channel a hard cutout only when
> fewer than **2%** of pixels sat between the extremes. The damaged wordmark,
> measured from the live GLB:
>
> | | `THE EXTRA MILE (Slogan)`, 1944x121 |
> |---|---|
> | transparent (`<=8`) | **66.38%** — background around the letters |
> | opaque (`>=248`) | **30.04%** — the letters |
> | mid | **3.58%** — anti-aliasing on the letter edges |
>
> **96.42% at the extremes — a cutout by any reading — and it missed by 1.6
> points.** The band was calibrated on chunky decal fixtures. What puts this
> texture over it is **high ink coverage**: 30% of the strip is ink, so there is
> a great deal of edge. (An earlier draft of this note said "thin strokes have a
> high perimeter-to-area ratio". A reviewer rendered real wordmark type at this
> size across five faces and measured 1.2–2.3% mid — already binary. Ordinary
> lettering was never affected; heavy coverage is the distinguishing property.)
> This is the repo's opening pattern again: *the fixtures could not exhibit the
> failure.*
>
> Classified `graded`, the wordmark took the "sheer fabric" branch of
> `solidifyMaterials`, and **both** ways of getting that wrong have now shipped:
>
> | | what `solidifyMaterials` did | what rendered |
> |---|---|---|
> | before `7bef9c4` (the live file) | forced `OPAQUE` | alphaMode OPAQUE ignores alpha, so the 66% background painted its underlying RGB — measured **(240,240,240)**, a near-white box across the garment |
> | after `7bef9c4` (2026-08-04 rerun) | left on `BLEND` | no OIT in `<model-viewer>` → half-visible; now **blocked** by the gate |
>
> The 2026-07-31 fix added the `graded → BLEND` branch to protect genuinely sheer
> fabric, and artwork fell into it — **it traded one bug for another**, which
> nobody could see because the live file predated it.
>
> **Fix — and note it is NOT simply a wider band.** An adversarial review caught
> the first attempt before it shipped, and the counterexamples are now tests:
>
> - `CUTOUT_MID_FRACTION = 0.05` governs only `solidifyMaterials`' BLEND→MASK
>   decision. `BINARY_MID_FRACTION` stays **0.02**, because `character` also
>   feeds `isArtworkTexture` → `findArtworkAlphaProblems`, which *throws* and
>   saves nothing. Widening a blocking gate to rescue one texture is collateral
>   for no gain — the wordmark is 16:1 and already artwork by aspect ratio.
> - `CUTOUT_MIN_TRANSPARENT = 0.05` — **a cutout must actually cut something
>   out.** Raising the mid ceiling alone would have swept up a uniformly
>   translucent inset (2–6% of a map measures 1.95–6.06% mid), MASKed it at 0.5,
>   and since its alpha is ~0.35 *every* fragment fails the test: the region is
>   not hardened, it is **deleted**, leaving a hole. The real wordmark is 66.38%
>   fully transparent; those insets are 0.000%. Three orders of magnitude apart.
> - An explicit `baseColorFactor[3] < 0.99` now beats an inferred cutout. A
>   material declaring itself sheer at 0.4 can never reach `alphaCutoff 0.5`, so
>   MASK would render it as *nothing at all* — silently, passing every gate.
>
> The real texture now resolves to `MASK` / `alphaCutoff 0.5`, which is what
> CLAUDE.md has said all along. The margin to genuine translucency is real but
> **~26x, not "two orders of magnitude"** — the repo's own ramp fixture measures
> 92.19% mid, not ~100%.
>
> Pinned by three tests, each verified to fail when its own constant is reverted.
>
> **Still unverified: how it LOOKS.** The mechanism is measured, the render is
> not. Nobody has yet zoomed in on the re-processed logo. Do that before calling
> this closed — the whole point of this document is that mechanism and appearance
> are different claims.

**Status 2026-08-03: the damage is CONFIRMED on the live site — and the file
serving it predates every fix, so the fixes are still untested.**

The live page was opened in a real browser. The chest wordmark, which should read
`✳ THE EXTRA MILE`, renders as `⬛HE EXTRA ⬛⬛⬛⬛E`: the mark and the whole word
MILE destroyed. That settles the "has anyone actually looked" question this
document has carried since 2026-07-29. Nobody had. Now somebody has.

**It does NOT settle whether the fixes work**, because of the dates:

| | |
|---|---|
| Live GLB `cycling-all-colours-optimized-2.glb` built | 2026-07-29 14:34 UTC |
| The three fixes below landed (commit `7bef9c4`) | 2026-07-31 16:37 UTC |

The file on the site is two days older than the fix. What was photographed is the
*original* damage. Nothing below has been disproven, and nothing has been proven.

**THE UNBLOCK IS ONE CHECKBOX.** The raw 382 MB export is still in the R2 ingest
bucket (it has no lifecycle rule), and `RawUploads` supports retry without
re-uploading. Tick **Retry** on raw upload id 1 in the CMS: that re-runs the fixed
pipeline on the original file and both tests the fix and replaces what production
is serving. Until that runs, every statement about whether the artwork survives is
speculation — including this document's.

**Symptom, in the owner's words:** *"the logo, graphics, words, etc are broken /
half visible, half not."*

**What now catches this automatically.** Since 2026-08-03 the shrink worker
refuses to save a model on three structural findings — artwork decimated without
its UVs in the error budget (`artworkAtRisk`), artwork left on `alphaMode: BLEND`,
and an artwork `MASK` whose `alphaCutoff` drifted off 0.5. The bytes-per-pixel
measurement warns rather than blocks. See "Detection" at the end of this file.

This is the blocking issue for the whole pipeline. Everything else works — upload,
shrink, colour mapping, publish, render. But for a B2B garment reference the
printed artwork *is* the product, so "the 3D loads" is not success.

> **Read this first if you are picking the issue up.** Three causes below are
> fixed, and *fixed* means "the mechanism was real and the code no longer does
> it" — **not** "the reported damage is gone".
>
> The damage has now been seen (see the status above), but on a file built two
> days BEFORE the fixes, so it tells you nothing about whether they worked.
>
> **Do the Retry tick first.** It re-runs the fixed pipeline on the original raw
> file and is the only thing that can tell you whether the artwork survives now.
> Only if it comes back damaged is the bisect in [Investigation](#investigation)
> worth the hours it costs. Re-running the bisect on the pre-fix file would
> reproduce a result that is already known.

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

Status per cause is marked in each heading. **FIXED** means the mechanism was
confirmed by reading the code against upstream and the pipeline no longer does
it; it does not mean the garment has been re-processed and looked at.

Ranking revised 2026-07-31 after reading the pipeline against meshoptimizer,
glTF-Transform, libwebp and model-viewer upstream. Three causes were added that
outrank everything originally listed, and one original candidate turned out to be
a good test but a bad fix.

### H4 — decimation protected only `TEXCOORD_0` ⭐ leading suspect — **FIXED**

`simplify-textured.ts` interleaved only `TEXCOORD_0` into the attribute buffer it
hands meshoptimizer. CLO's *Apply Graphic* places prints on garments that
commonly carry a **second UV set**, and artwork on that set was therefore
decimated at **zero weight** while the fabric's UVs were protected at weight 1.
Some panels smear, others do not — "half visible, half not", literally. It also
explains why tuning `--uv-weight` never helped: on those materials the knob was
not connected to anything.

`listUvSets` now collects every `TEXCOORD_n` on the primitive and prices them all
identically. A set it cannot read (quantized) demotes the whole primitive to the
conservative path rather than protecting some of its UVs and silently not others.

#### ⚠️ The trigger condition is narrower than it first appears — measured

`prune({ keepExtras: true })` runs *before* decimation and calls `shiftTexCoords`.
Measured directly (pinned in `textures.test.ts`):

| Material samples | After `prune()` | H4 |
| --- | --- | --- |
| **one** UV set, on `texCoord: 1` | set renumbered down to `TEXCOORD_0` | **cannot bite** |
| **two** sets (e.g. AO on UV0, graphic on UV1) | both survive, `texCoord: 1` intact | **bites** |

So a lone `texCoord: 1` in a raw CLO export is self-correcting, and warning about
it would send the next person chasing a hazard the pipeline already fixes for
itself. What matters is a material sampling **two or more** UV sets at once —
which is exactly what a printed graphic applied over mapped fabric produces.

`validate` and `textures` both report `materialsWithMultipleUvSets` and warn only
on that. The manifest still records each texture's `texCoords` as a fact.

**Cheapest possible check, no processing required:**

```
pnpm pipeline textures <raw.glb> --out output/textures-raw
```

Then confirm the `optimize` output's `UV sets:` line lists every set the file
uses. A set that appears in the manifest but not there is unprotected artwork.

### H5 — lossy WebP has no 4:4:4 mode ⭐ — **FIXED**

the old `optimize.ts` texture pass sent **every** texture through `textureCompress` at
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

**Fixed** in `texture-artwork.ts`, which replaced the blanket `textureCompress`
call. `smartSubsample` is now on for *every* texture — it changes how chroma is
computed, not how much is stored, so there is no reason to have it off. Textures
detected as artwork (alpha cutout, aspect ratio ≥ 3:1, or a name like
`logo`/`print`/`wordmark`) additionally get quality 95, `alphaQuality 100` and a
4096 cap instead of 2048. Data maps (normal, ORM) are never classified as
artwork whatever they are called.

### H6 — coplanar print layers z-fight after solidify + quantize — **PARTLY FIXED**

`solidifyMaterials` (in `optimize.ts`) forces every `BLEND` material to
`OPAQUE` **and** calls `setDoubleSided(true)` on *every* material — including the
`MASK` decals it deliberately spared. CLO exports graphics as a surface a fraction
of a millimetre off the fabric. Made opaque, double-sided, decimated, then
position-quantized (`meshopt({ level: 'high' })` → `quantizePosition: 14`,
`quantizationVolume: 'mesh'`), the two surfaces interpenetrate. Stippled, patchy
artwork is the textbook signature.

**The double-siding half is fixed:** `solidifyMaterials` no longer double-sides
`MASK` materials. A decal has no inside to see, and drawing its back faces is a
direct source of the speckling. Materials are only ever set double-sided, never
back, so a source that already double-sided its cutouts keeps that.

**The quantization half is not**, and should not be changed speculatively —
`quantizePosition: 14` over a mesh-sized volume is a sensible default, and
loosening it costs size on every garment. If the bisect's `no-meshopt` run is the
one that comes back clean, the targeted fix is a larger `quantizationVolume` or a
slightly larger decal offset at export, not a blanket precision increase.

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

### H3 — alpha handling ⚠️ good test, bad fix — **FIXED, correctly**

The original note called `--keep-transparency` "a one-flag test [that] would be a
complete explanation". It is an excellent *diagnostic* and a **wrong fix**.

`<model-viewer>` (three.js underneath) has **no order-independent transparency**.
Restoring `BLEND` on a multi-part garment produces depth-sorting artefacts —
google/model-viewer#1620 — which is the exact bug `solidifyMaterials` was written
to prevent. Flipping the flag trades one "half visible" for another.

**The correct fix is `BLEND` → `MASK`,** not `BLEND` → `OPAQUE` and not "leave it
`BLEND`". `MASK` with `alphaCutoff 0.5` is order-independent, renders solid, and
preserves the cutout.

`solidifyMaterials` now decides per material by reading the actual alpha rather
than by blanket rule:

| Base-colour alpha | Decision | Why |
| --- | --- | --- |
| absent, or every pixel solid, and `baseColorFactor[3] ≈ 1` | → `OPAQUE`, double-sided | CLO's stray fabric opacity. The original behaviour, and correct. |
| hard binary cutout | → `MASK` `alphaCutoff 0.5`, **not** double-sided | A printed decal. `OPAQUE` would fill the cutout back in. |
| genuinely graded | left `BLEND`, reported | Real translucency. Destroying it is not the pipeline's call. |
| undecodable (KTX2) | → `OPAQUE` | The previous behaviour, kept as the floor, and reported. |

The seeded placeholders now carry a BLEND decal with a real cutout, and the
merged fixture asserts it comes out `MASK` — so this cannot silently regress.

---

## Investigation

**One command.** From `tools/asset-pipeline`, against the **raw** file:

```
node tools/asset-pipeline/scripts/bisect-artwork.mjs <raw.glb> --out output/bisect --detail small
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
quantizes vertex attributes to integers and `simplify-textured.ts` (the `Float32Array`
check in `trySimplifyTexturedPrimitive`) explicitly
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

---

## Detection — what the pipeline now catches on its own

Added 2026-08-03. Until then this document ranked causes and the *only* acceptance
test was a human looking at a rendered logo — which is how a damaged garment
published and stayed live for five days.

### Blocking (the job fails, no Media row is created)

| Check | Mechanism it catches | Where |
|---|---|---|
| `artworkAtRisk` | **H4** — a primitive carrying printed artwork took the position-only decimation fallback, so its UVs were free to smear | `simplify-textured.ts` |
| `findArtworkAlphaProblems` → `blend` | **H3** — an artwork material ended translucent; `<model-viewer>` has no OIT so it renders half-visible | `texture-artwork.ts` |
| `findArtworkAlphaProblems` → `cutoff` | **H3** — an artwork `MASK` whose `alphaCutoff` is not 0.5, which thins or fattens lettering | `texture-artwork.ts` |

These are **structural**: each is a stated fact about the output file with no
false-positive case. That is precisely why they are safe to block on.

### Advisory (reported, publishes anyway)

| Check | Mechanism | Why it does not block |
|---|---|---|
| `findCrushedArtwork` | **H5** — an artwork texture stored below 0.02 bytes/pixel | A legitimately flat single-colour label encodes just as small as a smashed wordmark. Measured on a 1024² fixture: smooth content lands at 0.009–0.015 bpp at *every* quality, noise at 0.167–0.958. The signal cannot separate "flat" from "destroyed". |
| `artworkResized` | An artwork texture was resampled down to fit the cap | A real trade-off, not an error — but it is stroke detail gone from a wordmark, so it is said out loud. |

The live damaged file trips `findCrushedArtwork` at **0.003 bpp**, 6.6× past the
threshold. That threshold and a check using it had existed since the original
investigation, wired only into the manual `pipeline textures` command and never
into `inspectGlb`, which is what the container actually runs.

### What is still NOT detected

Nothing measures whether a logo is *legible*. Doing so needs a rendered
comparison, and the honest scoping is in the session notes: a whole-frame SSIM or
mean-delta would miss a 142 px wordmark band in a 2000 px render — under 1% of the
pixels — so a per-job render check would cost Chromium in the container and still
not catch this bug. If it is ever built it must be **crop-targeted** at the
artwork UV islands. Until then the owner's eye remains the acceptance test for
legibility, and `pipeline compare` is how to apply it.
