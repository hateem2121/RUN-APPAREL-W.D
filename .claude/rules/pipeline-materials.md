---
paths:
  - "tools/asset-pipeline/src/texture*.ts"
  - "tools/asset-pipeline/src/alpha-coverage.ts"
  - "tools/asset-pipeline/src/material-class.ts"
  - "tools/asset-pipeline/src/pbr-normalize.ts"
  - "tools/asset-pipeline/src/variant-colour.ts"
  - "tools/asset-pipeline/src/colour-name.ts"
  - "tools/asset-pipeline/src/artwork-geometry.ts"
  - "tools/asset-pipeline/src/ink-contrast.ts"
  - "tools/asset-pipeline/src/overlay-*.ts"
  - "tools/asset-pipeline/src/repair-dead-textures.ts"
  - "tools/asset-pipeline/src/optimize.ts"
  - "packages/shared/src/shrink.ts"
  - "apps/shrink/src/refusals.ts"
---

# The pipeline: materials, textures and printed artwork

Moved from `tools/asset-pipeline/CLAUDE.md` on 2026-09-26, word for word. **Read
`tools/asset-pipeline/CLAUDE.md` too**: before any preset, threshold or export change, the
rendered print is the only judge (its "Before you change the pipeline").

## Traps

- **`chromaSubsampling` does nothing for WebP** in glTF-Transform's
  `textureCompress` — it is a JPEG/AVIF option sharp ignores. Use `smartSubsample`
  via a direct sharp call.
- **`--keep-transparency` is not the fix for damaged artwork.** `<model-viewer>`
  has no order-independent transparency; restoring BLEND trades one "half
  visible" for depth-sorting artefacts. Use `MASK` with `alphaCutoff 0.5`.
- **🟡 A cutout is "little soft alpha IN THE INK" AND "actually cut out somewhere" —
  never the first alone.** Since 2026-09-02 `solidifyMaterials` resolves BLEND→MASK on
  `CUTOUT_MAX_SOFT_INK` (0.31, soft pixels as a share of mid+opaque): the whole-texture
  `CUTOUT_MID_FRACTION` read ARISAN's brush print (4% soft overall, 36% of its ink) as a
  sticker and chopped every fade into steps (F1-01). The line is a table in textures.ts
  — hard cut-outs 0.3–12.6%, the halftone 26.3% (must stay MASK), the brush 36.3%. The
  second half, `CUTOUT_MIN_TRANSPARENT` (0.05), still stops a uniformly translucent
  inset (all soft, cut out nowhere) being MASKed into a hole. Keep both halves, and
  keep `character` 'binary' separate — it is also the gate's cut-out signal.
- **🟡 An explicit `baseColorFactor[3]` beats anything inferred from pixels.** glTF
  effective alpha is `factor.a * texel.a`, so a material declaring itself sheer at
  0.4 can never reach `alphaCutoff 0.5` — MASK renders it as *nothing at all*,
  silently, passing every gate. Test `factor < OPAQUE_FACTOR_THRESHOLD` first.
- **🟡 A CLO export names the MATERIAL and leaves EVERY TEXTURE ANONYMOUS.** Measured
  2026-08-21: **0 of 24 textures had a name or URI**, while materials were called
  `White Black Bold Minimalist Clothing Label_9946645`, `Material_Graphic`,
  `RUN LOGO`. **Any name-based artwork check that reads only the texture is silently
  inert on a real file** — it does not fail, it just never matches. This bit twice in
  one session: a first fix for the mirrored label below did nothing at all, and
  `variant-colour.ts`'s `isGarmentFabric` (texture-name only) let the halftone print
  win on surface area and named every colourway from its dark ink —
  Wine/Slate/Lilac became Brown/Sage/Denim, the same failure as 2026-08-03. Both now
  read the material name too. 🟡 `variant-colour.ts` keeps its OWN word list on
  purpose; do not merge it with `texture-artwork.ts`'s. And use a token-boundary
  pattern, not the texture regex — that one contains `text`/`type`, so `Textile_Cotton`
  and `Polyester_Textured` classify as artwork and would exempt real FABRIC from
  double-siding. Since 2026-09-02 it also sums area by NAME + factor (CLO: one material
  per panel — Geovent CW6, CG-05), drops overlays under alpha 0.5 and UV-span prints,
  and `readVariantColoursSampled` reads the fabric picture only when colourways carry
  different pictures; a shared one stays blank with a note.
- **🟡 `solidifyMaterials` forced EVERY non-`MASK` material double-sided, and that put a
  MIRRORED care label on the OUTSIDE of the garment.** The label is authored INSIDE
  and single-sided, so backface culling correctly hid it; double-siding rendered its
  reverse face through the fabric with the text reversed. The `MASK` exemption existed
  because "a printed decal" should keep its front — this label is a printed decal that
  landed on `BLEND` and so missed it. Judge on what the texture IS, not which
  alphaMode it reached. 🟡 **Found by the OWNER looking at the rendered garment**; no
  gate saw it, and it had been latent since long before. It only fires on a garment
  whose artwork carries enough soft edge to miss the cutout test — N001's live model
  has 0 BLEND materials and is unaffected, so do not assume a past model needs
  re-running without measuring it.
- **Normal/ORM maps ran at COLOUR-map resolution and outweighed the artwork.** They
  were **9.63 MB against the artwork's 7.03 MB** of a 16.65 MB texture budget.
  `--data-max-texture` (half `--max-texture`) is invisible and saves 5.5 MB.
  **Quartering was tried and REFUSED**: 1.67% of pixels moved by >8/255 and it
  visibly flattens the white fabric's weave, for one more megabyte.
- **🟡 An all-over print on `BLEND` is classified as sheer FABRIC and takes the 2048
  cap.** The Cycling-Bib halftone is 4952×7014 and got squashed to 1446×2048 (0.29×),
  turning round dots into blocky squares. **`--max-texture 4096` is the safe lever.**
  Do NOT instead widen `isArtworkTexture`: since 2026-09-02 it feeds the compression
  budget only, but its aspect-ratio rule is exactly what misread thread as a wordmark.
- **KTX2 came out SMALLER here (20.3 MB vs 22.2 MB) and must still be REFUSED.**
  ETC1S turned the clean white bib panel **grey and blotchy**; the letters survived,
  the fabric did not — seen only by cropping the same region from both renders.
  Judge it on the fabric, not the size — the older "KTX2 is larger on disk" argument
  would have led the wrong way here.

## From the 2026-08-27 session

*Full record: `docs/archive/sessions/SESSION-2026-08-27.md`. Here is only what tells you what to DO.*

**Artwork is separated from fabric by UV SPAN, not by name** (`artwork-geometry.ts`).
Measured over every textured primitive in 28 exports: fabric median **294.81**, topstitch
0.83, artwork **1.00**. Names cannot do it — real artwork materials are called
`ZZ00000ZZZZ0`, `ZZZ00000`, `76197`, `01`, `Untitled-1` and `ルン ろご。`, and 8 garments
match none of the nine English words.

🟡 **THE KHRONOS VALIDATOR DOES NOT CATCH A SOURCE-LESS TEXTURE.** `texture.source` is
OPTIONAL per the spec, so it is valid glTF (ARISAN: 0 errors, 0 warnings) and
gltf-transform is merely stricter. Anyone adding the validator to name that failure will
find it silent.

**A WebP image without `EXT_texture_webp` declared is INVALID glTF, and
`<model-viewer>` renders it anyway** — which is why every gate stayed green while every
processed garment was invalid (p001 44 errors, n001 42). Declared in
`texture-artwork.ts`, pinned by a negative-control test that strips it back out.

🟡 **`repair-dead-textures.ts` removes the REFERENCES, never the entries.** Deleting
`textures[5]` renumbers every later index and a material pointing at 6 silently acquires
the picture from 7. It also pads the JSON chunk so the BIN chunk cannot move. Since
2026-09-03 the repair is reported, and the robot REFUSES a stripped baseColour or
emissive slot (`apps/shrink/src/refusals.ts`).

## 🟢 The print takes the CLOTH'S colour — REPORTED since 2026-09-03, never auto-fixed

🟡 glTF renders base-colour TEXTURE x FACTOR; these artwork textures are near-white stencils,
so the FACTOR is the ink — and CLO writes a colourway FABRIC colour into it on 13 of 16
garments, `n001` included. **It is in the RAW export.** 🟡 Two fixes were tried and BOTH
were wrong (whiten every cut-out; whiten a print matching a cloth colour, reverted in
`447d15f`): a white stencil x a dark factor is how a COLOURED print is authored, and
Minecut's slogan matched the grey skirt while sitting on the white band. Judge a print
against the cloth **it sits on** — `ink-contrast.ts` does, from the overlay scan's support
primitive (`pipeline ink <glb> --strip <dir>`; the robot report lists the flagged pairs).
The number is WCAG luminance: butter on sky-blue reads 1.32:1 yet is readable by hue, and
black cloth reads 2.30 by file against 1.22 rendered — **the strip judges, the number
hints**. 🟡 Read variants off the PRIMITIVES; `root.getExtension(...)` returns nothing.
