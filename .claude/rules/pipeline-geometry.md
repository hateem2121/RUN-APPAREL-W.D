---
paths:
  - "tools/asset-pipeline/src/optimize.ts"
  - "tools/asset-pipeline/src/simplify-textured.ts"
  - "tools/asset-pipeline/src/topstitch.ts"
  - "tools/asset-pipeline/src/uv-remap.ts"
  - "tools/asset-pipeline/src/precision.ts"
  - "tools/asset-pipeline/src/merge-variants.ts"
  - "tools/asset-pipeline/src/variant-texcoord.ts"
  - "tools/asset-pipeline/src/describe.ts"
  - "tools/asset-pipeline/src/gltf-spec.ts"
  - "tools/asset-pipeline/src/cli.ts"
  - "packages/shared/src/shrink.ts"
  - "apps/shrink/container/**"
---

# The pipeline: geometry, compression and the flags that drive it

Moved from `tools/asset-pipeline/CLAUDE.md` on 2026-09-26, word for word. **Read
`tools/asset-pipeline/CLAUDE.md` too**: before any preset, threshold or export change, the
rendered print is the only judge (its "Before you change the pipeline").

## Traps

- **`prune()` renumbers texCoords** via `shiftTexCoords`, so a lone second UV set
  becomes `TEXCOORD_0` before decimation. The real hazard is a material sampling
  two or more UV sets at once.
- **🟡 `opaque` defaults DIFFERENTLY in the two ways you can call the pipeline.**
  `parseOptimizeArgs` defaults it **true**; `optimizeGlb` treats an absent
  `opaque` as **false**. So a hand-built options object silently skips
  `solidifyMaterials` and ships decals still on `alphaMode: BLEND`, which
  `<model-viewer>` renders see-through — the reported symptom exactly. Go through
  the parser, as `apps/shrink/container/server.ts` does. Pinned by a test in
  `pipeline.test.ts`. 🟡 And in zsh an unquoted `$FLAGS` is ONE argument: the robot's seven
  flags arrived as one word, none matched, and the skinsuit "compressed" to 12 MB with
  `geometry: none` (2026-09-03). Build the list as a bash array; `geometry: none` in a log
  means a flag never arrived.
- **🟡 A print piece is NEVER decimated — since 2026-09-02 (fix plan Rank 3).**
  `simplifyTextured` skips every primitive whose material is artwork by name or by
  UV span (colourway mappings walked, thread excluded) and reports `N print piece(s)
  left exactly as exported`; `artworkAtRisk` now ASSERTS that, on every path.
  `--decimate-artwork` is the negative control that brings the damage back —
  measured on the fixed harness: ARISAN macro 20.6%, Trouser logo 8.5%, Minecut
  holes 3.8% → 0.5%. Exports under `SMALL_EXPORT_MAX_TRIANGLES` (500k) get no
  `--simplify` at all (`refineFlagsForSize`). **Before that, the three blocking
  gates did NOT catch decimation damage** — they test `alphaMode`; a 2026-08-05
  sweep (`tools/asset-pipeline/scripts/sweep-size-vs-artwork.mjs`) rendered the N001 wordmark illegible
  at `--simplify-error 0.005` with every gate green and `artworkAtRisk` silent by
  construction on the normal path (HG-02). Only a rendered crop saw it — why the old
  `small` preset was deleted rather than re-tuned, and why `pnpm eval:artwork`
  exists: it renders the real wordmark before and after the real chain on a
  synthetic fixture, so it catches a preset or simplifier regression and would still
  miss damage specific to one CLO export.
- **`--simplify` is not the aggression dial — `--simplify-error` is.** The
  simplifier stops early once the budget binds, so lowering the ratio alone does
  nothing. A sweep over the ratio produces near-identical files and reads as
  "nothing helps".
- **A CLO export is mostly THREAD, and the two need different budgets.** Measured
  2026-08-21 on a 1,313,979,936-byte Cycling-Bib export: of 33,964,432 triangles,
  🟡 **`Cloth_mesh` — the entire visible garment, carrying all 116 artwork materials —
  is 11,128 (0.03%)**, and 21 `Topstitch_*` meshes hold **99.97%**. `--simplify`
  alone cannot express that and bottoms out at 57.4 MB; `--stitch` (topstitch.ts)
  gives thread its own budget and reaches **20.6 MB** with the prints untouched.
  The stitch meshes carry a flat `baseColor` and **no artwork** — verified by
  walking mesh → primitive → material *including* the `KHR_materials_variants`
  mappings, which is why the looser budget is safe.
  🟡 **TWO STACKED MISTAKES make this look broken, and neither is the triangle
  count.** The first attempt frayed the cord into spikes and was rejected on sight:
  it gave thread `error 0.01` (**20x looser** than the garment's 0.001) *and* let
  `--simplify` decimate it a second time (777k → 445k). With a tight budget and a
  single pass, 1.36M triangles is indistinguishable from the 3.98M original. Do not
  read a small output as proof that thread cannot be small. `simplifyTextured` now
  takes `skipMeshes` and `optimize.ts` sets it whenever the stitch pass ran, so
  passing both flags is safe.
  🟡 **A WIDE CROP CANNOT SEE THIS — the same lesson as the wordmark, on a new
  feature.** At the default `crop-chest` (18°) the ruined cord looked *identical*
  to the original and was reported as such. At **4°** it is obviously spiky. Judge
  thread with `render --views` at 4–7°.
- **🟢 DRACO LOADS LIVE SINCE THE SEEDING FIX (measured 2026-08-30, GEO-02); PRODUCTION
  STAYS `--meshopt` ANYWAY** — the Draco bib was 3.4 MB larger and 20 MB heavier on the
  GPU (LIVE-08). The history: shipped a draco garment on 2026-08-21, it rendered
  NOTHING and fell back to its poster,
  with the console showing model-viewer fetching the decoder from `www.gstatic.com`,
  which the CSP correctly blocks. On a cold live page
  `ModelViewerElement.dracoDecoderLocation` reads the gstatic default while
  `meshoptDecoderLocation` correctly reads `/meshopt_decoder.js`. Cause is in
  model-viewer itself and is documented in `.claude/rules/viewer-model-viewer.md`; the fix lives in
  `Stage.tsx`, and a cold load of the live site read `/draco/` on 2026-09-24.
  The SPEED measurement (4× throttle: meshopt 31.0 MB / 1168 ms vs draco 20.6 MB /
  908 ms) is parked: on the wire and the GPU, LIVE-08 measured Draco worse. **Checking that code
  is committed and deployed is NOT checking that it works** — the decoder line was
  both, and was inert.
- **🟡 A CLO 7.0.242 export is ONE GLB PER COLOURWAY; its "Combine to One File" silently
  emits a single colourway.** Measured 2026-08-29. `pipeline merge` is the fix (5 files
  → 5.59 MB, valid, all five render), but 🟡 **`apps/shrink` never calls `merge`**, so
  such a garment cannot go through the robot unaided.
- **🟡 A finished file's raw UV span means NOTHING — since 2026-09-03 (fix plan Rank 11,
  CT-08).** CLO writes UVs in pattern space (a bib panel spans −206..206) and
  glTF-Transform's quantizer refuses anything outside 0..1, so every UV set in the
  catalogue shipped as 32-bit floats: 47% of the skinsuit's geometry bytes, 57% of the
  bib's. `uv-remap.ts` moves every set into 0..1 (one remap per group of pieces linked by
  a material, colourway mappings included, or a shared accessor), folds the inverse into
  `KHR_texture_transform` composed with CLO's own, and stores 16 bits — 12 would be
  3.1 px on the bib's widest fabric group. Measured on the 2026-09-03 masters: skinsuit
  3.59 → 3.03 MB, bib 8.48 → 7.24 MB, UV bytes halved, validator 0 errors, renders 0.00%
  changed (skinsuit) and 0.01–0.06% (bib: single pixels at the halftone's alpha-tested
  dot edges, no region moved); the negative control (`composeMaterials: false`) moves
  26.9%. So after `optimize` every accessor spans ≤ 1: read spans through
  `uvSpanInPatternSpace` (the record is in the primitive's extras), never
  `getMin`/`getMax` — on a quantized accessor those are raw integers anyway.
  `--no-uv-remap` is the A/B control.

## From the 2026-08-27 session

*Full record: `docs/archive/sessions/SESSION-2026-08-27.md`. Here is only what tells you what to DO.*

🟡 **`prune()` RENUMBERS UV SETS AND UPDATES ONLY THE DEFAULT MATERIAL.** Anything reachable
solely through `KHR_materials_variants` keeps sampling a `TEXCOORD_n` that no longer
exists. `variant-texcoord.ts` repoints them immediately after prune. **LATENT** — no real
garment samples a texCoord other than 0; it surfaces only because `placeholders.ts`
deliberately puts artwork on a second UV set. **Keep that fixture detail**, it is the only
thing exercising the path.
🟡 **When a pass touches materials, ask what it does with the ones behind a variant.**
That was missed twice in one day — here, and in the viewer's decal depth bias at 6 of 26
decals.

🟡 **The spec check is a PRODUCTION dependency and must NOT go inside `describeGlb`.** The
container installs `npm ci --omit=dev`, so a devDependency is missing in the Container —
green everywhere, failing at runtime. And it costs **~3.4x the file
size** in RSS (573 MB → 1,955 MB), while `describeGlb` reads only the JSON chunk, so the
1.25 GB Cycling Bib costs what a 5 MB one costs. `SPEC_MAX_BYTES` is 768 MB and the two
exports over it are **skipped by name** — a skip must never read as a pass.

**`createTransform` is exported from `@gltf-transform/functions`, NOT `@gltf-transform/core`.**
