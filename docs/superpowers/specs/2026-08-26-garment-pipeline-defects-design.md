# Design — fixing the garment defects the pipeline cannot currently see

**Date:** 2026-08-26
**Status:** awaiting owner approval
**Scope:** `tools/asset-pipeline`, `packages/shared`
**Approach chosen:** A (downstream fixes). Approach B (texture baking) was measured and **refused** — see "Non-goals".

---

## Why

The reported symptom is that some garments render perfectly and others come back
with glitchy, missing or plastic-looking artwork. The natural hypothesis was that
compression is too strong. **It is not.** Every garment runs the same hardcoded
flags from `shrinkFlagsFor` (`packages/shared/src/shrink.ts`), and `balanced` was
calibrated logo-by-logo against rendered crops. Identical settings cannot explain
divergent results.

What differs is the **input**. On 2026-08-26 all 28 raw CLO exports were measured
by reading each file's glTF JSON chunk (7,873 MB total; 6,666 materials; 5,048
images; every file `CLO Standalone OnlineAuth 2025.2.236`). The raw exports are
local-only and deliberately uncommitted, so they are referenced here by garment
name rather than by path.

Four findings drive this design.

### 1. There are two families of export, and the pipeline knows about one

| Family | Count | Examples |
|---|---|---|
| Geometry-heavy (<40% of bytes are textures) | **12** | Cycling Bib (1,051 MB geometry), Geovent Tennis Dress (534 MB), METRO-SHIELD SUIT (341 MB) |
| **Texture-heavy (≥60%)** | **15** | X-MILO CORE OVERSIZE (**1,022.7 MB textures**, 94.9%), ZENMOVE TIGHTS (99%), women athlatic dress (**335.0 MB textures / 0.3 MB geometry, 9,980 triangles**) |
| Mixed | 1 | Mantra Ray Proflex (52.2%) |

`packages/shared/src/shrink.ts` justifies its whole strategy with *"Geometry, not
texture, is what makes a CLO export huge (measured: textures were 2.1 MB in every
variant of the 373 MB export), so `--simplify` and the error budget are the only
levers that matter."* That was true of the one garment it was measured on. **It is
false for 15 of 28 garments.** On `women athlatic dress` the geometry lever has
nothing to pull — there are 9,980 triangles — yet the run still spends its budget
as though geometry were the cost, then compresses the textures to fit. That is the
strongest available explanation for "fabric texture issues" and "graphics not
merged with textures".

### 2. Every graphic arrives on `BLEND`, in every file

Across all 6,666 materials there are **zero** `MASK` materials and **4,200**
`BLEND`. `solidifyMaterials` (`tools/asset-pipeline/src/optimize.ts`) therefore
makes thousands of cutout decisions per garment from one global heuristic.
`THE KINETIC MATRIX JACKET` alone has 1,218 materials, 1,008 of them `BLEND`.

### 3. A small, specific PBR defect — 55 fabric materials across 4 garments

⚠️ **This section said 35 until 2026-08-26, and the section's own arithmetic gave
it away.** 515 materials are metallic with no MR texture and 440 of those are
hardware, leaving **75** — but the table below accounted for 35 fabric plus 20
`Trim_*`, which is 55. Twenty were unaccounted for. Re-measured by running the
classifier over all 6,666 material names: **440 hardware + 55 fabric + 20
unclassified = 515 exactly.** The 35 was a count of distinct NAMES, not materials —
Training Trouser carries 20 distinct names across **40** materials, because five of
them repeat once per colourway (`Fleece_Terry_FCL1PSK002_4036` appears 5 times).
Both numbers are true; the one that says what the fix rewrites is **55**.

An earlier reading of this data over-counted badly and is corrected here. glTF
defaults an absent `metallicFactor` to **1.0**, but 3,593 of those materials also
carry a `metallicRoughnessTexture` whose blue channel supplies metalness per pixel,
and those textures are real (236×39 up to 8192×8192), not 1×1 dummies. Of the 515
materials that are metallic with nothing to override them, **440 are legitimate
hardware** (`Zipper_Slider`, `Puller`, `TopStopper`, `Button`, `люверсы`) and must
stay metal.

The genuine offenders:

| Garment | Materials | metallic | roughness |
|---|---|---|---|
| METRO-SHIELD SUIT | `Nylon_Canvas Copy 1_*` ×5 | absent (= 1.0) | **0.10** — a mirror |
| Training Trouser | `FABRIC 2/3/4_*`, `Fleece_Terry_*` — 20 names, **×40 materials** | 0.46 | 0.84 |
| Scuba-Neck Performance | `Cotton_Canvas_*` ×5 | 0.23 | 0.27 |
| MATRIX-PUFF JACKET | `FABRIC 1_*` ×5 | 0.29 | 0.24 |

Plus 20 `Trim_*` materials at metallic 1.0 / roughness 0.1 that could legitimately
be either metal trim or fabric binding.

Nothing in the pipeline sets metalness on a real garment. The only
`setMetallicFactor` calls are in `tools/asset-pipeline/src/placeholders.ts` — the
**test fixtures** — which correctly seed `metallic: 0`. This is the repo's own
recurring pattern: *the fixtures cannot exhibit the failure.*

### 4. Names are on materials, never on textures

**0 of 5,048 images carry a name or URI**; materials are named
(`Cotton_Canvas_2961`, `RUN LOGO`, `Zipper 1_Slider_3582`). Any classifier reading
texture names is silently inert. This already bit twice, and is recorded in
`tools/asset-pipeline/CLAUDE.md`.

---

## Non-goals

**Texture baking (Approach B) is refused.** Measured, not assumed. All 28 garments
carry 5 colourways (Mantra Ray 6) and 27 of them are **100% variant-mapped**, so
colourways share their artwork textures.

⚠️ **This said "all 28" until 2026-08-26, when `describeGlb` was run over the real
files and flagged one.** `STRUCTURE POLO SET` declares 5 colourways
(`Colorway A`, `Colorway 1`–`4`) and binds **NONE** of them: 0 of its 320 primitives
carry a `KHR_materials_variants` mapping. It is not partially mapped — it is not
mapped at all, so every colourway renders identically and a published switcher
would show five buttons that do nothing. That is a defect in the garment, separate
from anything in this design, and it is why `describeGlb` reports `fullyMapped`
rather than assuming it.

It also explains a measurement that already looked odd: `STRUCTURE POLO SET` is
listed below among the garments where baking costs **1.00–1.06×** "whose colourways
already do not share". They do not share because there is nothing to share — the
cause of that number, found only by checking the file rather than the note. Baking destroys that sharing; each colourway then
needs its own baked base-colour set. Measured cost, holding normal/ORM maps shared:
**1.00× to 3.31×**.

The refusal rests on the *shape* of that spread, not its size:

- Baking is cheapest (**1.00–1.06×**) on X-MILO CORE OVERSIZE, STRUCTURE POLO SET,
  KINETIC SPLATTER SPORTS BRA, ENDURA CROP TOP, ZENMOVE TIGHTS and
  women athlatic dress — whose colourways already do not share, and which are
  10–25× over `GLB_HARD_MAX_BYTES` (`packages/shared/src/media.ts:20`, 40 MB) on
  textures alone. Baking does not touch their binding constraint.
- Baking is dearest (**2.05–3.31×**) on PRO-PILE SHERPA JACKET, AERO-TECH
  WINDBREAKER, Scuba-Neck Performance and Minecut Motion — the small garments where
  headroom for quality actually exists.

Cheap where it does not help; costly where it would. Installing Blender does not
change this arithmetic, and the decision should not be revisited without new
numbers.

**Not in scope:** re-exporting from CLO (owner confirmed unavailable), any change
to `--draco` (still unloadable on the live viewer), and any change to the
`balanced` error budget of 0.001, which is pinned by an absolute test in
`packages/shared/src/shrink.test.ts` and whose only evidence is a rendered crop.

---

## Design

Five units, each independently testable, ordered by how many garments they help.

### Unit 1 — `describe.ts`: read a raw export without processing it

**Purpose:** answer "what will this garment do?" before spending a pipeline run.

Reads only the GLB header and JSON chunk — no binary decode — so the 1,253 MB
Cycling Bib is as fast as the 5 MB PRO-PILE. Returns a plain record:

```
family            'geometry' | 'texture' | 'mixed'   (texture bytes / total bytes)
triangles, stitchTriangles, stitchPct
textureBytes, geometryBytes
materials         { total, opaque, blend, mask, doubleSided }
pbrSuspects       materials that are fabric-or-artwork AND metallic with no MR texture
colourways        count, and whether every primitive is variant-mapped
namedImages       count (expected: 0 — a guard against a future CLO change)
```

Surfaced as `pnpm inspect <file>`, wired in `tools/asset-pipeline/src/cli.ts`. This
unit has no dependency on the rest and ships first.

**Why it matters:** every finding in this document came from doing this by hand.
As a command it converts an invisible input problem into a readout.

### Unit 2 — family-aware strategy selection

**Purpose:** stop applying a geometry-first budget to texture-first files.

`shrinkFlagsFor` currently returns one hardcoded list per detail level. It gains a
second input: the family from Unit 1.

- **geometry family** — today's flags, unchanged. No regression risk.
- **texture family** — `--simplify` relaxed or skipped (there is nothing to gain),
  and the freed budget spent on `--max-texture` / `--quality` for artwork.

`shrinkFlagsFor` must keep returning literal strings that flow through
`parseOptimizeArgs`, because `opaque` defaults differently on the two call paths —
see the trap in `tools/asset-pipeline/CLAUDE.md`. The container calls it exactly as
`apps/shrink/container/server.ts` does today.

**Boundary:** this unit decides *which* flags; it does not change what any flag
does.

### Unit 3 — `pbr-normalize.ts`: cloth is not metal

**Purpose:** fix the 35 measured offenders without touching the 440 legitimate
hardware materials.

Classifies on the **material** name — never the texture name (Finding 4) — using a
token-boundary pattern. Three buckets: hardware (left alone), fabric/artwork
(forced to `metallic: 0` with a floor on roughness), unclassified (left alone and
**reported**, never silently changed).

`Trim` belongs to the third bucket by owner decision — see "Decisions taken". The
unclassified bucket is therefore a real output of this unit, not a leftover, and
must be surfaced by Unit 1 rather than swallowed.

A material is only rewritten when it is metallic *and* carries no
`metallicRoughnessTexture` to supply metalness per pixel. This is the check that
reduced the apparent defect from thousands to 55, and it is load-bearing.

⚠️ Keep this word list separate from the one in
`tools/asset-pipeline/src/texture-artwork.ts`, for the same reason
`tools/asset-pipeline/src/variant-colour.ts` keeps its own: that list contains
`text`/`type`, so `Textile_Cotton` classifies as artwork.

**Boundary:** materials only. No geometry, no textures, no alpha.

### Unit 4 — per-material alpha and decal decisions

**Purpose:** replace two global rules with two measured ones.

The audit that preceded this work tried both and reverted both. Neither technique
was wrong; both were applied indiscriminately.

- **Alpha.** `MASK` at `alphaCutoff 0.5` is correct for a bold wordmark and
  destroys 1.5 px slogan strokes. Decide per material from the measured stroke
  width of its own texture, not from one threshold. The existing
  `CUTOUT_MID_FRACTION` / `CUTOUT_MIN_TRANSPARENT` pair in
  `tools/asset-pipeline/src/textures.ts` stays — both halves — because
  widening either widens a *blocking* gate.
- **Decal offset.** Nudging a small floating logo off the cloth fixes z-fighting;
  the same nudge tore multi-panel skirt prints open along their seams. Offset only
  primitives that are small, unit-square in UV (**every decal measures exactly
  1.0 × 1.0**, verified) and not seam-sharing. Full-panel prints are excluded by
  construction.

### Unit 5 — weave density matching

**Purpose:** recover most of what baking would have given, at no infrastructure
cost.

Artwork currently renders as smooth plastic because the decal carries no fabric
normal map. Forcing the cloth's map onto it with an arbitrary `[12.0, 12.0]` tiling
was tried and looked obviously wrong.

The correct tiling is computable. Fabric declares its repeat through
`KHR_texture_transform` (Geovent `0.0132 × 0.0152`, Cycling Bib `0.0152 × 0.0167`)
against a raw UV span read from the `TEXCOORD_0` accessor's own `min`/`max`.
Effective repeats land at **1–5× for most fabric**, and the decal's real-world size
comes from its primitive bounds. Tiling the fabric normal map to match that
*density* stops the artwork reading as plastic. Threads will not align in phase
across the boundary — only a true bake does that — and that is accepted.

⚠️ One material measured **396 × 410 repeats** (`FABRIC 2_3169`, Mantra Ray
Proflex). Clamp, and report anything outside a sane band rather than tiling it.

---

## Testing

The controlling rule is the repo's own: *if production compresses, seed
compressed.* Three of these defects are invisible today precisely because
`tools/asset-pipeline/src/placeholders.ts` seeds **correct** values.

Fixtures must gain, and be asserted against:

1. A material with `metallicFactor` **undefined** and no `metallicRoughnessTexture`
   — CLO's real shape. Today every fixture sets `metallic: 0`, so no test can fail
   on Unit 3.
2. A material with `metallicFactor` undefined **and** an MR texture — the negative
   control. Unit 3 must leave it alone; without this the classifier can pass by
   rewriting everything.
3. A hardware-named material (`Zipper_Slider`) that must stay metal.
4. A texture-heavy fixture: high texture bytes, near-zero triangles. Unit 2 must
   pick the texture strategy. No current fixture resembles `women athlatic dress`.
5. A decal at exactly `1.0 × 1.0` UV **and** a multi-panel print sharing a seam.
   Unit 4 must offset the first and not the second — the exact failure that tore
   the skirt.
6. Fine and bold text on one garment, so Unit 4's alpha decision is forced to
   differentiate rather than pick one rule.

**The blocking gates do not catch decimation damage** — they test `alphaMode`,
which decimation does not change (`docs/OPEN-ISSUE-ARTWORK.md`). So every unit that
can move a pixel is additionally judged on a rendered contact sheet via
`tools/asset-pipeline/src/render.ts`, including a **4–7° macro crop** for thread; at
the default 18° a ruined cord is indistinguishable from an intact one.

Coverage floors in `vitest.coverage.mjs` are measurements, not targets. New files
raise the measured number honestly or the floor stays put; neither is lowered.

## Error handling

- `describe.ts` never throws on a malformed file — it returns `{ error }` so one
  bad garment cannot break a batch readout.
- Unit 3 reports unclassified materials; it never guesses.
- Unit 5 clamps and reports out-of-band tiling rather than applying it.
- No new **blocking** gate. The three existing structural gates stay exactly as
  they are; everything added here warns. A gate the owner learns to override is
  worse than no gate, and none of these findings is structural in that sense.

## Risks

| Risk | Mitigation |
|---|---|
| Unit 2 changes flags for 15 garments at once | Geometry family byte-identical by construction; texture family verified on rendered crops before merge |
| Unit 3 mis-classifies a material | Only rewrites when metallic *and* no MR texture; hardware list explicit; unclassified reported not changed |
| A change regresses a garment that renders correctly today | The 9 currently-clean garments are the regression watch and are compared before/after on rendered crops. Six of the nine are texture-heavy, so Unit 2 also changes their strategy — they need the closest look, not the least |
| Numbers here go stale | Every figure came from reading the JSON chunk; Unit 1 makes them reproducible in seconds |

## Decisions taken (2026-08-26)

1. **The 20 `Trim_*` materials are FLAGGED, not fixed.** Owner could not say from
   the name whether they are metal trim or fabric binding, and chose to leave them
   untouched. Unit 3 must therefore classify `Trim` as **unclassified** — reported
   on every run by Unit 1, never rewritten. Do not "tidy" this later by adding
   `trim` to either word list without a rendered crop: `Zipper 1_TapeFabric_*`
   already shows that a trim-adjacent name can be genuine hardware, and the two
   garments involved are a texture-heavy pair where a wrong guess is visible across
   a whole panel.

2. **The regression set is all 28 garments**, not the two live products. Owner
   intends to publish the full catalogue over time, so the tests cover all four
   problem families rather than only what `rxps` and `r-xmp` happen to exercise.

   The sharpest regression watch is the **9 garments that currently render with no
   thread-geometry problem** — KINETIC MATRIX, Mantra Ray Proflex, X-Milo Training
   Vest, ZENMOVE TIGHTS, ENDURANCE TRACKSUIT, ARISAN SPORTS BRA, MATRIX-PUFF
   JACKET, women athlatic dress, PRO-PILE SHERPA JACKET. These are the ones a
   change can only make *worse*, so they are compared before and after on rendered
   crops. Note six of the nine are also texture-heavy, so Unit 2 changes their
   strategy — they are simultaneously the regression set and the group Unit 2 is
   meant to help. Judge them on crops, not on file size.
