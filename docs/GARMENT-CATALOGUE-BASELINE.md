# Garment catalogue — measured baseline

**In plain words:** Measurements of every raw 3D garment file, taken on 2026-08-26.

Produced by `pnpm pipeline describe`, 2026-08-26, over the 28 raw CLO exports.

⚠️ **The raw exports are local-only and are deliberately not cited by path.** They
are 7.7 GB, the largest single file is 1.25 GB against GitHub's 100 MB cap, and a
path under a home directory would resolve for whoever ran this and fail the
citation gate on a clean checkout. Garments are named, never located.

Every figure here is reproducible in about a second for the whole catalogue —
`describeGlb` reads each file's header and JSON chunk with three positional reads
and decodes nothing, so the 1,253 MB Cycling Bib costs the same as the 5 MB
PRO-PILE. **Re-run it rather than trusting this table.**

```
pnpm pipeline describe "<your raw export directory>"/*.glb
```

## The readout

Columns: `FIX` = fabric materials that are metallic with no `metallicRoughnessTexture`
to override them, which `pbr-normalize` will set to 0. `?` = the same test, but with
a name this cannot classify — **reported, never rewritten** (owner decision,
2026-08-26). `CW` = colourways declared.

```
FAMILY    %TEX   TEXmb    GEOmb    TRIS          STITCH%  MATS  BLEND  FIX  ?  CW  FILE
geometry   15%     5.8     33.3     1,139,138    75.1%   111      8    0  0   5  AERO-TECH WINDBREAKER.glb
geometry   35%    13.3     24.6       841,658    97.8%   102     62    0  0   5  APEX FLEX PULLOVER.glb
texture    94%    43.6      2.9        82,300     0.0%   168    100    0  0   5  ARISAN SPORTS BRA.glb
geometry   28%    47.0    121.2     4,173,075    93.1%   101     36    0  0   5  CAPSULE CORE HOODIE.glb
geometry   16%   201.8   1051.1    33,964,432   100.0%   121     71    0  0   5  Cycling Bib.glb
texture    68%   315.5    145.1     4,965,736    99.5%   151     66    0  0   5  ENDURA CROP TOP.glb
texture    95%   464.4     25.0       882,192     0.0%   291    186    0 10   5  ENDURANCE TRACKSUIT.glb
geometry   13%    77.1    534.3    18,289,503    99.7%   281    194    0  0   5  Geovent Tennis Dress.glb
geometry    6%    10.9    171.1     5,881,084    94.2%   116     65    0  0   5  INDIGO FLOW SWEATSHIRT.glb
texture    89%   512.9     60.4     2,070,225    98.5%    83     42    0  0   5  KINETIC SPLATTER SPORTS BRA.glb
texture    69%    28.9     13.1       480,521     0.0%   105     60    5  0   5  MATRIX-PUFF JACKET.glb
geometry   17%    67.9    340.7    11,687,852    96.6%   432     82    5  0   5  METRO-SHIELD SUIT.glb
mixed      52%     5.3      4.8       149,179     0.0%   825    784    0  0   6  Mantra Ray Proflex.glb
geometry   37%    33.1     56.7     1,837,439    96.8%   128     42    0  0   5  Minecut Motion.glb
texture    63%    34.5     20.4       700,709    77.9%   134     84    0  0   5  PACEZIP RUNNING SHIRT.glb
texture    71%     3.7      1.5        52,698     0.0%    77     12    0  0   5  PRO-PILE SHERPA JACKET.glb
texture    80%    96.8     23.8       807,404    79.5%   358     78    0  0   5  ROSE PACE TRACKSUIT.glb
geometry   37%    40.9     68.8     2,423,262    53.2%    32      8    0  0   5  STRUCTURE POLO SET.glb
geometry    7%    10.6    134.4     4,591,899    99.0%    77     12    5  0   5  Scuba-Neck Performance.glb
geometry   21%    36.4    136.9     4,665,730    84.0%   141     71    0  0   5  TERRA ACTIVE ZIP.glb
texture    85%    58.2     10.5       294,144     0.0%  1218   1008    0  0   5  THE KINETIC MATRIX JACKET.glb
texture    97%   351.3     10.0       366,084     4.9%   161     96   40 10   5  Training Trouser.glb
texture    82%   100.2     21.7       743,738     0.0%   101     56    0  0   5  VANTA CORE JACKET.glb
texture    95%  1022.7     55.3     2,019,303    12.9%   114     99    0  0   5  X-MILO CORE OVERSIZE.glb
texture    82%   106.0     23.6       693,500     0.0%   613    498    0  0   5  X-Milo Training Vest.glb
texture    99%   384.3      4.0        74,750     0.0%   236    231    0  0   5  ZENMOVE TIGHTS.glb
geometry   10%    35.1    328.9    10,616,491    99.4%   271    101    0  0   5  cycling all colours.glb
texture   100%   335.0      0.3         9,980     0.0%   118     48    0  0   5  women athlatic dress.glb
  files:        28 (0 unreadable)
  families:     15 texture, 12 geometry, 1 mixed
  metalness:    55 fabric to fix, 20 unclassified (reported only)
  images:       5048, of which 0 carry a name or URI
  ⚠️  DO NOT PUBLISH — COLOURWAYS DECLARED BUT NOT BOUND:
      STRUCTURE POLO SET.glb — 5 colourways declared, no primitive is variant-mapped. Every colour renders identically and the switcher on the live site would do nothing.
```

## What it says

**1. Fifteen of 28 exports are texture-heavy; twelve are geometry-heavy.**
`packages/shared/src/shrink.ts` justifies a geometry-first strategy with *"Geometry,
not texture, is what makes a CLO export huge (measured: textures were 2.1 MB in
every variant of the 373 MB export), so `--simplify` and the error budget are the
only levers that matter."* That was true of the one garment it was measured on. It
is **false for the majority of this catalogue**.

The clearest case is `women athlatic dress`: **335.0 MB of textures against 0.3 MB
of geometry, and 9,980 triangles in total.** `--simplify` has nothing to pull there,
yet the run still spends its budget as though geometry were the cost and then
compresses the textures to fit.

**2. Every graphic arrives on `BLEND`.** Across all 6,666 materials there are **zero**
`MASK` and **4,200** `BLEND`, so `solidifyMaterials` makes thousands of cutout
decisions per garment from one global heuristic. `THE KINETIC MATRIX JACKET` alone
has 1,218 materials, 1,008 of them `BLEND`.

**3. Metalness: 55 fabric materials to fix, 20 to report.** Of the 6,666 materials,
515 are metallic with no `metallicRoughnessTexture` to override them. Those split
**440 hardware** (zippers, sliders, stoppers, buttons, eyelets — legitimately metal
and left alone), **55 fabric** across four garments, and **20 unclassified** — all
`Trim_*` on ENDURANCE TRACKSUIT and Training Trouser, which the owner chose on
2026-08-26 to flag rather than guess at.

| Garment | Fabric to fix | Unclassified |
|---|---|---|
| Training Trouser | 40 | 10 |
| MATRIX-PUFF JACKET | 5 | 0 |
| METRO-SHIELD SUIT | 5 | 0 |
| Scuba-Neck Performance | 5 | 0 |
| ENDURANCE TRACKSUIT | 0 | 10 |

⚠️ **The design document said 35, and its own arithmetic gave it away:** 515 − 440
leaves 75, but 35 + 20 is 55. The 35 counted distinct NAMES. Training Trouser
carries 20 distinct names across **40** materials, because five of them repeat once
per colourway — `Fleece_Terry_FCL1PSK002_4036` appears 5 times. Both numbers are
true of different things; the one that says what the fix rewrites is **55**.

**4. No image carries a name.** 0 of 5,048, on every file. Any classifier reading a
texture name is silently inert, which is why `material-class.ts` reads the MATERIAL
name. This has already cost two attempts — see `tools/asset-pipeline/CLAUDE.md`.

## ⚠️ STRUCTURE POLO SET must not be published as it stands

It declares five colourways — `Colorway A`, `Colorway 1`–`4` — and binds **none** of
them. **0 of its 320 primitives carry a `KHR_materials_variants` mapping.** It is not
partly mapped; it is not mapped at all. Every colourway renders identically, and the
switcher on the live site would show five buttons that do nothing.

This is a defect in the garment file, not in the pipeline. Re-exporting from CLO is
not available, so it is **reported on every `describe` run** rather than quietly
patched to look correct. `pnpm pipeline describe` prints it under
`DO NOT PUBLISH — COLOURWAYS DECLARED BUT NOT BOUND`.

It also explains a measurement that already looked odd. This garment sits among
those where texture baking would cost **1.00–1.06×** "because their colourways
already do not share". They do not share because there is nothing to share — the
cause of that figure, found by reading the file rather than the note.

The other 27 exports are 100% variant-mapped.

---

## Texture-family calibration — measured 2026-08-26

Six candidates, on `women athlatic dress` (the purest texture case: 335 MB of
textures, 9,980 triangles) and `X-MILO CORE OVERSIZE` (the largest: 1,022.7 MB of
textures, 1.77 M triangles).

| Candidate | What changed | X-MILO | women athlatic dress |
|---|---|---|---|
| A — control | today's flags | 71.0 MB — **over the ceiling** | 6.1 MB |
| B — no simplify | dropped `--simplify` | **80.2 MB — WORSE** | 6.1 MB — **identical** |
| C — more quality | `--quality 85` | 96.0 MB — worse | 9.0 MB |
| D — less texture | `--max-texture 2048 --quality 70` | 34.0 MB | 4.8 MB |
| E — artwork first | D + `--artwork-max-texture 4096` | — | **byte-identical to D** |
| F — both | today's geometry + D's textures | **24.8 MB** | 4.8 MB |

### Three findings, and the third stops F shipping

**1. `--simplify` does exactly nothing on a low-triangle garment, and is worth 9 MB
on a high-triangle one.** B measured **+0.0%** against the control on
`women athlatic dress` (9,980 triangles) — byte-identical output — and **+13%** on
X-MILO, which still carries 1.77 M triangles despite being 95% textures by size.

⚠️ **So the texture fraction is the WRONG lever for the geometry decision, and the
design document proposed exactly that** — "`--simplify` relaxed or skipped (there is
nothing to gain)". There is nothing to gain on one of these garments and 9 MB to
lose on the other. Triangle count decides geometry; texture fraction decides
textures. F keeps today's geometry flags unchanged for everybody.

**2. Candidate E could not differ from D.** `--artwork-max-texture 4096` IS
`DEFAULT_ARTWORK_MAX_TEXTURE`, so E was the same run with a longer command line and
produced a byte-identical file. A candidate that cannot differ is not a candidate;
recorded rather than deleted.

**3. ⛔ F DAMAGES THE ARTWORK, AND ONLY THE MACRO CROP SAW IT.** Rendered A against F
on X-MILO: whole-garment views differ by **0.03–0.05% of pixels** and are
indistinguishable by eye. At a 5–6° macro crop on the chest slogan the lettering is
**visibly softer**, and the amplified difference shows the LETTERFORMS in red rather
than uniform noise — the artwork moved, not just the weave. See
`docs/images/2026-08-26-xmilo-texture-sweep-macro.png`.

This is the repository's most expensive lesson reproducing itself exactly: the three
blocking gates pass, every whole-garment number looks perfect, and only a rendered
crop can see the damage.

### Why the artwork was not protected — the actual root cause

Artwork is supposed to be exempt: `--artwork-quality 95` and a 4096 cap, identical in
A and F. It was not exempt, because **the artwork was never classified as artwork.**

`ARTWORK_MATERIAL_NAME` in `tools/asset-pipeline/src/texture-artwork.ts` matches
`logo|print|graphic|artwork|label|decal|badge|emblem|wordmark`. X-MILO's artwork
materials are named:

`Slogan_2948` · `Extra Mile_2970` · `Asset 1_2926` · `Asset 5_2992`

**Zero of its 114 materials match.** Measured across all 28 exports, **8 garments
have no artwork-named material at all**: AERO-TECH WINDBREAKER, ENDURA CROP TOP,
PRO-PILE SHERPA JACKET, Scuba-Neck Performance, THE KINETIC MATRIX JACKET, VANTA
CORE JACKET, X-MILO CORE OVERSIZE, ZENMOVE TIGHTS.

Real artwork material names the current list misses:

`Slogan` · `Extra Mile` · `never look back` · `Asset 1` · `Asset 2@2400x` ·
`Asset 3 Copy 1` · `Asset 5` · `design` · `ルン ろご。` (Japanese: "run logo") ·
`ZZ00000ZZZZ0` · `76197`

Non-name signals rescue some of it — X-MILO classified **5 of 26** textures as
artwork by aspect ratio and alpha — but not the slogan, which took the fabric path.

**This is happening TODAY, at the current settings**; F only widens the gap between
the protected path and the unprotected one. It is the strongest candidate yet for
the original report of "graphics not merged with textures".

### Status

**F is NOT adopted.** Artwork classification has to work on these names first; then
the sweep is re-run and re-judged on the same macro crop.
