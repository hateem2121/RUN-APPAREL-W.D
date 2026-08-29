# Garment Pipeline Defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the pipeline applying a geometry-first compression strategy to texture-first CLO exports, and fix the four measured input defects that make printed artwork render damaged, plastic or metallic.

**Architecture:** Five units land in `tools/asset-pipeline/src/`, which the shrink Container imports by relative path and the CLI imports directly. A new `describe.ts` reads only a GLB's JSON chunk (no binary decode) to classify each export as geometry-heavy or texture-heavy; the Container calls it after downloading the raw file and refines the flags the Worker sent. `packages/shared/src/shrink.ts` keeps returning hardcoded literals unchanged — it cannot read files (lint-enforced, no `node:*` imports) and the Worker never has the file. Three material-level fixes (metalness, per-material alpha, decal offset) and one texture fix (weave density) run as gltf-transform Transforms inside `buildOptimizeTransforms`.

**Tech Stack:** TypeScript, Node 24 (CI) / 26 (local), vitest, `@gltf-transform/core` 4.4.2, `meshoptimizer` 1.2.0, `sharp` 0.35.3, Playwright + `<model-viewer>` for rendered verification.

---

## Global Constraints

Every task's requirements implicitly include this section. Copied verbatim from the codebase, verified 2026-08-26.

- **`pnpm` is NOT on PATH.** Every command is `npx --yes pnpm@10.33.0 <script>`. A bare `pnpm` exits 127; a PreToolUse hook rewrites it, but a script that shells out to bare `pnpm` is not covered.
- **Add ZERO new npm dependencies to `tools/asset-pipeline/package.json`.** That package carries a SECOND lockfile (`package-lock.json`) read only by `apps/shrink/Dockerfile` via `npm ci`. Changing its `package.json` without regenerating that lockfile in isolation breaks the image build AFTER every local gate has passed. Available: `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`, `ktx2-encoder`, `meshoptimizer`, `sharp`, plus Node builtins.
- **`packages/shared/src/**` may NOT import `node:*`** — lint-enforced in `biome.jsonc` → `overrides` → `noRestrictedImports`. So `shrinkFlagsFor` can never read a file. Family detection lives in `tools/asset-pipeline/`.
- **`tools/asset-pipeline` coverage floors: lines 87, functions 86, branches 73, statements 84** (`tools/asset-pipeline/vitest.config.ts`). `include` is `src/**/*.ts` with `all: true`, so every new file counts immediately and an untested one drags the number down. **Never lower a floor to go green.**
- **`exactOptionalPropertyTypes` is ON** in `tools/asset-pipeline/tsconfig.json`. An optional property that can legitimately receive an explicit `undefined` must be declared `?: T | undefined`, not `?: T`.
- **`GLB_HARD_MAX_BYTES = 40 * 1024 * 1024`** (`packages/shared/src/media.ts:20`). `SIZE_WARNING_BYTES = 8 * 1024 * 1024`, duplicated deliberately at `tools/asset-pipeline/src/validate.ts:29` and pinned equal by a drift test.
- **`--simplify-error` for `balanced` is `0.001`** and is pinned by an absolute assertion at `packages/shared/src/shrink.test.ts:137`. Do not change it. Its only evidence is a rendered crop (`docs/images/2026-08-05-A-vs-C-all-logos.png`).
- **No new BLOCKING gate.** The three existing structural gates stay exactly as they are. Everything added here warns.
- **Raw CLO exports live at `/Users/hateemjamshaid/Documents/3D Products` and must NEVER be committed or cited by path in any file under `docs/`, `README.md`, `CONTRIBUTING.md` or `SECURITY.md`** — `scripts/doc-citations.mjs` walks `docs/` recursively and would fail on a clean checkout. Refer to garments by name only.
- **Node's default heap here is 4.09 GB; the Cycling Bib run peaks near 5.27 GB.** Any command processing a raw export over ~300 MB must be prefixed `NODE_OPTIONS=--max-old-space-size=12288`.
- **Never run the pipeline on its own output.** Always start from the raw CLO export.
- **Branch before committing. Never commit to `main`.** `git config --local user.email hateemjamshaid@gmail.com` must be set or the merge deadlocks.

### ⚠️ THIS FILE LIVES AT THE REPOSITORY ROOT ON PURPOSE, AND MUST BE MOVED BACK

Its final home is `docs/superpowers/plans/2026-08-26-garment-pipeline-defects.md`.
**Task 14, Step 1 moves it there.** Do not move it early, and do not leave it here.

**Why.** `scripts/doc-citations.mjs` checks that every backticked repository path in
a document resolves, and it walks `docs/` recursively, any `CLAUDE.md`, `.claude/rules/`,
and exactly `README.md` / `CONTRIBUTING.md` / `SECURITY.md` at the root. A plan
necessarily names files that do not exist yet — measured 2026-08-26 with this
document under `docs/`: **14 unresolved citations**, every one a file a later task
creates, which failed `apps/cms/src/claudeMd.test.ts` and turned `pnpm test` red
across the whole repository.

**The first draft of this plan called that "expected and self-correcting" and told
you to work around it. That was wrong**, and the design document being implemented
here says why in its own words: *a gate the owner learns to override is worse than no
gate*. Eleven tasks of "ignore that failure" is exactly the habit that produced the
secrets scanner which checked 60 bytes and passed, and the instrument that measured
nothing for 167 loads. Both were green when they should have screamed.

So the plan sits outside the walked set while it is being executed — still committed,
so it cannot be lost — and `pnpm test` stays a real signal for every task. **Adding
entries to `ALLOWED_ABSENT` was considered and refused**: that map is for files that
are genuinely and permanently gone, each with a written reason, and an exemption for
a file that is about to exist would outlive its reason and quietly stop protecting
anything.

**Every task below expects `node scripts/doc-citations.mjs` to report 0 unresolved
and exit 0.** A non-zero count means a real broken citation, not this file.

### Measured baseline — reproduce this before changing anything

Verified 2026-08-26 by reading each file's JSON chunk. 28 files, 7,874.8 MB, all `CLO Standalone OnlineAuth 2025.2.236`.

| | Count |
|---|---|
| Texture-heavy (≥60% of bytes are textures) | **15** |
| Geometry-heavy (<40%) | **12** |
| Mixed | **1** (Mantra Ray Proflex, 50%) |
| Materials, total | 6,666 |
| Images, total | 5,048 |
| Images carrying a name or URI | **0** |
| Materials with `alphaMode: MASK` | **0** |
| Materials with `alphaMode: BLEND` | **4,200** |

Extremes: `women athlatic dress` = 335.0 MB textures / 0.3 MB geometry / 9,980 triangles. `Cycling Bib` = 201.8 MB textures / 1,051.1 MB geometry / 33,964,432 triangles, 99.97% of them topstitch.

---

## File Structure

**New files** — all in `tools/asset-pipeline/src/` so the Container can reach them by relative import:

| File | Responsibility |
|---|---|
| `material-class.ts` | Pure name → `'hardware' \| 'fabric' \| 'unclassified'` classifier. No I/O, no gltf-transform. |
| `material-class.test.ts` | Its tests, including the `Textile_Cotton` negative control. |
| `describe.ts` | Read a GLB's JSON chunk only; return a `GlbDescription`. Never throws. |
| `describe.test.ts` | Its tests. |
| `review-server.ts` | Serve every GLB in a directory in a live `<model-viewer>` — the renderer and decoders production uses. |
| `review-server.test.ts` | Its tests, including the path-traversal refusal. |
| `strategy.ts` | `refineFlagsForFamily(flags, family)` — hardcoded literals only. |
| `strategy.test.ts` | Its tests. |
| `pbr-normalize.ts` | Transform: force fabric materials to `metallic: 0`. Reports unclassified. |
| `pbr-normalize.test.ts` | Its tests. |
| `decal-offset.ts` | Transform: nudge small unit-square non-seam-sharing decals off the cloth. |
| `decal-offset.test.ts` | Its tests. |
| `weave.ts` | Transform: tile the cloth normal map onto artwork at computed density. |
| `weave.test.ts` | Its tests. |

**Modified:**

| File | Change |
|---|---|
| `tools/asset-pipeline/src/cli.ts` | Add the `describe` and `review` commands + usage text. |
| `tools/asset-pipeline/src/render.ts` | Extract `viewerAssetMap()` so the render harness and the review viewer cannot serve different decoders. |
| `tools/asset-pipeline/src/optimize.ts` | New `OptimizeOptions` fields; wire the three new Transforms into `buildOptimizeTransforms`; new flags in `parseOptimizeArgs` + `VALUE_TAKING_FLAGS`. |
| `tools/asset-pipeline/src/textures.ts` | Add `measureStrokeWidth()` used by the per-material alpha decision. |
| `tools/asset-pipeline/src/placeholders.ts` | Four new fixture shapes CLO actually produces. |
| `apps/shrink/container/server.ts` | Call `describeGlb` then `refineFlagsForFamily` after the download. |
| `packages/shared/src/shrink.ts` | Correct the stale `stitch` doc comment only. No behaviour change. |
| `docs/superpowers/specs/2026-08-26-garment-pipeline-defects-design.md` | Correct one citation. |

---

## Task 0: Branch setup and spec correction

**Files:**
- Modify: `docs/superpowers/specs/2026-08-26-garment-pipeline-defects-design.md` (two lines)
- Modify: `packages/shared/src/shrink.ts` (one doc comment)

**Interfaces:**
- Consumes: nothing.
- Produces: a branch `feat/garment-pipeline-defects` off `main` carrying the corrected spec.

**Context:** the spec currently lives on the **docs/garment-pipeline-defects-design branch** (written without backticks on purpose — `scripts/doc-citations.mjs` reads any backticked token containing a `/` whose first segment is a real top-level directory as a repository path, and `docs` is one, so a backticked branch name is reported as a broken citation). That branch is 2 commits BEHIND `main` (it predates the `feat/claude-automation-setup` merge). Diffing it against `main` therefore looks like it deletes 20 `.claude/` files. It does not. Rebase rather than merge.

- [ ] **Step 1: Confirm git identity is set (the merge deadlocks without it)**

```bash
git config --local user.email hateemjamshaid@gmail.com && git config --local user.name "Hateem Jamshaid" && git config --local user.email
```

Expected: `hateemjamshaid@gmail.com`

- [ ] **Step 2: Create the working branch off main, bringing the spec across**

```bash
git checkout main && git checkout -b feat/garment-pipeline-defects && git checkout origin/docs/garment-pipeline-defects-design -- docs/superpowers/specs/2026-08-26-garment-pipeline-defects-design.md && git status --porcelain
```

Expected: exactly one line, `A  docs/superpowers/specs/2026-08-26-garment-pipeline-defects-design.md`

- [ ] **Step 3: Fix the spec's one wrong citation**

The spec says `CUTOUT_MID_FRACTION` / `CUTOUT_MIN_TRANSPARENT` live in `texture-artwork.ts`. Verified 2026-08-26: they are `export const` at `tools/asset-pipeline/src/textures.ts:195` and `:210`. The citation gate does not catch this — it checks only that the named FILE exists, and `texture-artwork.ts` does.

In the "Unit 4 — per-material alpha and decal decisions" section, replace:

```
  The existing
  `CUTOUT_MID_FRACTION` / `CUTOUT_MIN_TRANSPARENT` pair in
  `tools/asset-pipeline/src/texture-artwork.ts` stays — both halves — because
  widening either widens a *blocking* gate.
```

with:

```
  The existing
  `CUTOUT_MID_FRACTION` / `CUTOUT_MIN_TRANSPARENT` pair in
  `tools/asset-pipeline/src/textures.ts` stays — both halves — because
  widening either widens a *blocking* gate.
```

- [ ] **Step 4: Fix the stale `stitch` doc comment in shrink.ts's consumer**

`tools/asset-pipeline/src/optimize.ts`'s `OptimizeOptions.stitch` says *"Use INSTEAD OF `--simplify` on such a garment, not alongside it"*. That was true before `skipMeshes` existed. `buildOptimizeTransforms` now passes `skipMeshes: DEFAULT_STITCH_PATTERN` to `simplifyTextured` whenever the stitch pass ran, and its own comment says *"Passing both flags is therefore safe"*. `shrinkFlagsFor` passes both. Replace the misleading sentence in `tools/asset-pipeline/src/optimize.ts`:

```
   * Use INSTEAD OF `--simplify` on such a garment, not alongside it: running both
   * decimates the thread twice, which is what produced the frayed output the owner
   * rejected on 2026-08-21.
```

with:

```
   * Passing this ALONGSIDE `--simplify` is safe and is what `shrinkFlagsFor` does:
   * when the stitch pass runs it OWNS those meshes, and buildOptimizeTransforms
   * hands `skipMeshes: DEFAULT_STITCH_PATTERN` to the general simplifier so the
   * thread is not decimated twice. Decimating it twice is what produced the frayed
   * output the owner rejected on 2026-08-21, and `skipMeshes` is the guard against
   * it — this comment said "use instead of, not alongside" until 2026-08-26, which
   * described the code as it was BEFORE that guard existed.
```

- [ ] **Step 5: Run the citation gate and confirm it still passes**

```bash
node scripts/doc-citations.mjs
```

Expected: **0 unresolved, exit 0.** This plan lives at the repository root while it
is being executed, precisely so this gate stays meaningful — see Global Constraints.
A non-zero count here is a REAL broken citation and must be fixed, not exempted.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-26-garment-pipeline-defects-design.md tools/asset-pipeline/src/optimize.ts && git commit -m "docs(pipeline): land the garment-defects design, and correct two stale citations

The CUTOUT_ constants are in textures.ts, not texture-artwork.ts. The citation
gate cannot see this: it checks the named file exists, and texture-artwork.ts
does. OptimizeOptions.stitch still told you not to pass --stitch alongside
--simplify, which stopped being true when skipMeshes was added — and
shrinkFlagsFor passes both.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"```

---

## Task 1: `material-class.ts` — the three-bucket name classifier

**Files:**
- Create: `tools/asset-pipeline/src/material-class.ts`
- Test: `tools/asset-pipeline/src/material-class.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type MaterialClass = 'hardware' | 'fabric' | 'unclassified'` and `export function classifyMaterialName(name: string): MaterialClass`. Used by `describe.ts` (Task 3) and `pbr-normalize.ts` (Task 10).

**Why its own file.** Both `describe.ts` (which reads raw JSON) and `pbr-normalize.ts` (which walks a gltf-transform `Document`) need the same answer from the same string. A pure function with no I/O and no gltf-transform import is testable on its own and cannot drift between the two callers.

**Why a THIRD list rather than reusing an existing one.** `texture-artwork.ts` has two lists already and `variant-colour.ts` has a third, all deliberately separate. `ARTWORK_NAME` includes `text` and `type`, so `Textile_Cotton` and `Polyester_Textured` classify as artwork. `variant-colour.ts`'s `TRIM_NAME` includes `trim`, `thread`, `stitch`, `label` — correct for "which surface names the colour", wrong here, because the owner decided on 2026-08-26 that `Trim_*` must be reported and NOT rewritten.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/material-class.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyMaterialName } from './material-class'

describe('classifyMaterialName', () => {
  // The 440 materials that are legitimately metal and must never be rewritten.
  // Names taken verbatim from the 28 raw CLO exports, 2026-08-26.
  it.each([
    'Zipper 1_Slider_3582',
    'Zipper_Slider',
    'Puller_1204',
    'TopStopper_88',
    'Button_0021',
    'люверсы_4410', // eyelets; CLO passes through the designer's own language
    'Metal_Rivet_7',
    'Buckle_2',
  ])('classifies %s as hardware', (name) => {
    expect(classifyMaterialName(name)).toBe('hardware')
  })

  // The measured offenders and their family. 55 materials, 35 distinct names.
  it.each([
    'Nylon_Canvas Copy 1_5511',
    'FABRIC 2_3169',
    'Fleece_Terry_9001',
    'Cotton_Canvas_2961',
    'Cloth_mesh_1',
    'Polyester_Jersey_44',
    'Textile_Cotton', // MUST be fabric — ARTWORK_NAME would call this artwork
    'Polyester_Textured_9',
    'RUN LOGO_3183',
    'Teamwear Logo_3139',
    'White Black Bold Minimalist Clothing Label_9946645',
  ])('classifies %s as fabric', (name) => {
    expect(classifyMaterialName(name)).toBe('fabric')
  })

  // Owner decision 2026-08-26: Trim is reported, never rewritten.
  it.each([
    'Trim_0091',
    'Trim 2_4418',
    'Zipper 1_TapeFabric_3583', // trim-adjacent AND fabric-adjacent — must not guess
    '',
    'Material.001',
    'Untitled_7',
  ])('classifies %s as unclassified', (name) => {
    expect(classifyMaterialName(name)).toBe('unclassified')
  })

  it('is case-insensitive', () => {
    expect(classifyMaterialName('zipper_slider')).toBe('hardware')
    expect(classifyMaterialName('COTTON_CANVAS_1')).toBe('fabric')
  })

  it('requires a token boundary, so a substring alone is not a match', () => {
    // "Buttonhole" is a fabric feature, not a button. "Cottontail" is not cotton.
    expect(classifyMaterialName('Buttonhole_Reinforcement_3')).not.toBe('hardware')
    expect(classifyMaterialName('Cottontail_Motif_9')).not.toBe('fabric')
  })

  it('puts hardware ahead of fabric when a name contains both', () => {
    // A zipper's metal slider is metal even though the word "tape" is fabric-ish.
    expect(classifyMaterialName('Zipper_Slider_TapeFabric_1')).toBe('hardware')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/material-class.test.ts
```

Expected: FAIL — `Failed to resolve import "./material-class"`.

- [ ] **Step 3: Write the implementation**

Create `tools/asset-pipeline/src/material-class.ts`:

```ts
/**
 * Which of three buckets a MATERIAL name falls into, for the metalness fix.
 *
 * WHY MATERIAL NAMES AND NOT TEXTURE NAMES. Measured 2026-08-26 across all 28 raw
 * CLO exports: **0 of 5,048 images carry a name or URI**, while every material is
 * named. Any classifier reading a texture name is silently inert on a real CLO
 * file. This has already cost two attempts — see tools/asset-pipeline/CLAUDE.md
 * and the note on `isArtworkMaterialByName` in texture-artwork.ts.
 *
 * WHY A THIRD WORD LIST. This repo deliberately keeps three already, and merging
 * them has been tried and reverted:
 *   - `ARTWORK_NAME` (texture-artwork.ts) includes `text` and `type`, so
 *     `Textile_Cotton` and `Polyester_Textured` classify as artwork. For a
 *     TEXTURE name that is harmless; here it would exempt real fabric from the
 *     metalness fix.
 *   - `TRIM_NAME` (variant-colour.ts) includes `trim`, `thread`, `stitch` and
 *     `label`. It answers "which surface names this colourway", not "is this
 *     metal". Reusing it would sweep `Trim_*` into a bucket the owner explicitly
 *     asked to leave alone.
 *
 * THE THIRD BUCKET IS A REAL OUTPUT, NOT A LEFTOVER. Owner decision, 2026-08-26:
 * the 20 `Trim_*` materials on ENDURANCE TRACKSUIT and Training Trouser sit at
 * metallic 1.0 / roughness 0.1 and could legitimately be metal trim OR fabric
 * binding. They are REPORTED on every run and never rewritten. Do not "tidy" this
 * by adding `trim` to HARDWARE or FABRIC without a rendered crop: both garments
 * are texture-heavy, so a wrong guess is visible across a whole panel, and
 * `Zipper 1_TapeFabric_*` already proves a trim-adjacent name can be genuine
 * hardware.
 */
export type MaterialClass = 'hardware' | 'fabric' | 'unclassified'

/**
 * Token boundary. `\b` is NOT usable: `_` is a word character, so `\bslider`
 * would not match `Zipper_Slider` — the single most important real name this has
 * to catch. Same reasoning as `ARTWORK_MATERIAL_NAME` in texture-artwork.ts.
 */
const BOUNDARY_START = '(^|[^a-z])'
const BOUNDARY_END = '([^a-z]|$)'

/** Garment hardware. Metal is CORRECT here; 440 of 515 metallic materials are these. */
const HARDWARE = new RegExp(
  `${BOUNDARY_START}(zipper|zip|slider|puller|stopper|topstopper|bottomstopper|button|snap|rivet|buckle|hook|eyelet|grommet|dring|люверсы)${BOUNDARY_END}`,
  'i',
)

/**
 * Cloth and printed artwork. Metal is WRONG here; these are the 55 offenders'
 * family. Artwork words are included because a printed decal is no more metal
 * than the cloth under it.
 */
const FABRIC = new RegExp(
  `${BOUNDARY_START}(fabric|cloth|textile|cotton|nylon|polyester|jersey|fleece|terry|canvas|mesh|knit|woven|denim|twill|satin|lycra|spandex|elastane|rib|poplin|chiffon|velvet|wool|linen|logo|print|graphic|artwork|label|decal|badge|emblem|wordmark)${BOUNDARY_END}`,
  'i',
)

/**
 * Classify a material name.
 *
 * HARDWARE WINS TIES. `Zipper_Slider_TapeFabric_1` contains both `zipper` and
 * `fabric`; the slider is metal. Forcing it to 0 would flatten the one part of a
 * garment that genuinely reflects.
 */
export function classifyMaterialName(name: string): MaterialClass {
  const n = name || ''
  if (HARDWARE.test(n)) return 'hardware'
  if (FABRIC.test(n)) return 'fabric'
  return 'unclassified'
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/material-class.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Lint and typecheck**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add tools/asset-pipeline/src/material-class.ts tools/asset-pipeline/src/material-class.test.ts && git commit -m "feat(pipeline): classify a material name as hardware, fabric or unclassified

A third word list, deliberately not a reuse. ARTWORK_NAME contains text and type
so Textile_Cotton reads as artwork; variant-colour's TRIM_NAME contains trim and
thread, which would sweep up the 20 Trim_* materials the owner asked to leave
alone. Hardware wins ties so a zipper slider stays metal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `describe.ts` — answer "what will this garment do?" without processing it

**Files:**
- Create: `tools/asset-pipeline/src/describe.ts`
- Test: `tools/asset-pipeline/src/describe.test.ts`

**Interfaces:**
- Consumes: `classifyMaterialName` from `./material-class` (Task 1).
- Produces:
  - `export type GlbFamily = 'geometry' | 'texture' | 'mixed'`
  - `export const TEXTURE_FAMILY_MIN_FRACTION = 0.6`
  - `export const GEOMETRY_FAMILY_MAX_FRACTION = 0.4`
  - `export interface PbrSuspect { index: number; name: string; metallicFactor: number; roughnessFactor: number }`
  - `export interface GlbDescription { … }` (full shape in Step 3)
  - `export async function describeGlb(file: string): Promise<GlbDescription>`

  Consumed by `cli.ts` (Task 3), `strategy.ts` (Task 6) and `apps/shrink/container/server.ts` (Task 8).

**Why this ships first.** Every measurement in the design document was produced by doing this by hand. As a command it turns an invisible input problem into a two-second readout, and it is the only unit here that cannot change a pixel.

**⚠️ MUST NOT read the whole file.** `readGlbGenerator` (`validate.ts:43`) does `await readFile(file)`, which on the Cycling Bib pulls 1.3 GB into a Buffer. Use `open()` plus positional reads: the header is 12 bytes, the chunk descriptor 8, and the JSON chunk is a few hundred KB. That is why this is as fast on a 1.3 GB file as on a 5 MB one.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/describe.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeGlb } from './describe'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'describe-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

/**
 * Write a GLB from a hand-built glTF JSON object.
 *
 * DELIBERATELY NOT gltf-transform. Its writer normalises the JSON — it fills in
 * `metallicFactor`, rewrites `asset.generator`, and re-packs bufferViews. Every
 * defect this module has to see is a shape CLO emits and gltf-transform would
 * tidy away. This is the repo's own rule: if production emits it, seed it.
 */
async function writeGlb(file: string, gltf: object, binBytes = 0): Promise<void> {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8')
  const jsonPad = (4 - (json.length % 4)) % 4
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (binBytes % 4)) % 4
  const binChunk = Buffer.alloc(binBytes + binPad)
  const total = 12 + 8 + jsonChunk.length + (binBytes ? 8 + binChunk.length : 0)

  const head = Buffer.alloc(12)
  head.writeUInt32LE(0x46546c67, 0) // 'glTF'
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(total, 8)

  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(jsonChunk.length, 0)
  jsonHead.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

  const parts = [head, jsonHead, jsonChunk]
  if (binBytes) {
    const binHead = Buffer.alloc(8)
    binHead.writeUInt32LE(binChunk.length, 0)
    binHead.writeUInt32LE(0x004e4942, 4) // 'BIN\0'
    parts.push(binHead, binChunk)
  }
  await writeFile(file, Buffer.concat(parts))
}

/** The shape `women athlatic dress` has: 335 MB of pictures, 9,980 triangles. */
function textureHeavyGltf() {
  return {
    asset: { version: '2.0', generator: 'CLO Standalone OnlineAuth 2025.2.236' },
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 1000 }, // 0: image
      { buffer: 0, byteOffset: 1000, byteLength: 1000 }, // 1: image
      { buffer: 0, byteOffset: 2000, byteLength: 12 }, // 2: indices
      { buffer: 0, byteOffset: 2012, byteLength: 36 }, // 3: positions
    ],
    // CLO leaves EVERY image anonymous — no name, no uri. Measured: 0 of 5,048.
    images: [{ bufferView: 0, mimeType: 'image/png' }, { bufferView: 1, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 2, componentType: 5125, count: 6, type: 'SCALAR' },
      { bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    meshes: [
      { name: 'Cloth_mesh', primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }] },
    ],
    materials: [{ name: 'Cotton_Canvas_2961', pbrMetallicRoughness: { metallicFactor: 0 } }],
    buffers: [{ byteLength: 2048 }],
  }
}

describe('describeGlb — family classification', () => {
  it('calls a file that is mostly pictures TEXTURE', async () => {
    const file = join(dir, 'texture.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.error).toBeNull()
    expect(d.family).toBe('texture')
    expect(d.textureBytes).toBe(2000)
    expect(d.geometryBytes).toBe(48)
    expect(d.textureFraction).toBeGreaterThan(0.6)
  })

  it('calls a file that is mostly mesh GEOMETRY', async () => {
    const g = textureHeavyGltf()
    g.bufferViews[0]!.byteLength = 10
    g.bufferViews[1]!.byteLength = 10
    g.bufferViews[3]!.byteLength = 4000
    const file = join(dir, 'geometry.glb')
    await writeGlb(file, g, 4096)
    const d = await describeGlb(file)
    expect(d.family).toBe('geometry')
    expect(d.textureFraction).toBeLessThan(0.4)
  })

  it('calls the band between the two thresholds MIXED', async () => {
    // Mantra Ray Proflex measured 50.2% and is the one real file in this band.
    const g = textureHeavyGltf()
    g.bufferViews[0]!.byteLength = 500
    g.bufferViews[1]!.byteLength = 500
    g.bufferViews[2]!.byteLength = 12
    g.bufferViews[3]!.byteLength = 988
    const file = join(dir, 'mixed.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.family).toBe('mixed')
  })
})

describe('describeGlb — triangles and topstitch', () => {
  it('counts indexed triangles and attributes them to topstitch by mesh name', async () => {
    const g = textureHeavyGltf()
    g.accessors.push({ bufferView: 2, componentType: 5125, count: 300, type: 'SCALAR' })
    g.meshes.push({
      name: 'Topstitch_01',
      primitives: [{ attributes: { POSITION: 1 }, indices: 2, material: 0 }],
    })
    const file = join(dir, 'stitch.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(102) // 6/3 cloth + 300/3 stitch
    expect(d.stitchTriangles).toBe(100)
    expect(d.stitchFraction).toBeCloseTo(100 / 102, 5)
  })

  it('counts NON-indexed triangles from POSITION count', async () => {
    const g = textureHeavyGltf()
    delete (g.meshes[0]!.primitives[0] as { indices?: number }).indices
    const file = join(dir, 'nonindexed.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(1) // POSITION count 3 → 1 triangle
  })

  it('ignores primitives that are not triangles (mode !== 4)', async () => {
    const g = textureHeavyGltf()
    ;(g.meshes[0]!.primitives[0] as { mode?: number }).mode = 1 // LINES
    const file = join(dir, 'lines.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.triangles).toBe(0)
    expect(d.stitchFraction).toBe(0) // must not divide by zero
  })

  it('falls back to NODE names when meshes are unnamed', async () => {
    const g = textureHeavyGltf()
    g.meshes[0]!.name = ''
    ;(g as { nodes?: unknown[] }).nodes = [{ name: 'Topstitch_Hem', mesh: 0 }]
    const file = join(dir, 'nodename.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.stitchTriangles).toBe(2)
  })
})

describe('describeGlb — the material census', () => {
  it('counts alpha modes the way CLO actually emits them', async () => {
    // Measured across all 28 exports: 0 MASK, 4,200 BLEND. OPAQUE is the glTF
    // default when alphaMode is absent, which is how CLO writes solid fabric.
    const g = textureHeavyGltf()
    g.materials = [
      { name: 'A', pbrMetallicRoughness: { metallicFactor: 0 } },
      { name: 'B', alphaMode: 'BLEND', pbrMetallicRoughness: { metallicFactor: 0 } },
      { name: 'C', alphaMode: 'BLEND', doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0 } },
      { name: 'D', alphaMode: 'MASK', pbrMetallicRoughness: { metallicFactor: 0 } },
    ] as never
    const file = join(dir, 'alpha.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.materials).toEqual({ total: 4, opaque: 1, blend: 2, mask: 1, doubleSided: 1 })
  })

  it('counts images and how many carry a name or URI', async () => {
    const g = textureHeavyGltf()
    g.images = [{ bufferView: 0, mimeType: 'image/png' }, { bufferView: 1, mimeType: 'image/png', name: 'RUN LOGO' }] as never
    const file = join(dir, 'named.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.images).toEqual({ total: 2, named: 1 })
  })
})

describe('describeGlb — PBR suspects', () => {
  it('flags a FABRIC material that is metallic with no metallicRoughnessTexture', async () => {
    // METRO-SHIELD SUIT's real shape: metallicFactor ABSENT, which glTF defaults
    // to 1.0, and roughness 0.10 — a mirror. No MR texture to override it.
    const g = textureHeavyGltf()
    g.materials = [
      { name: 'Nylon_Canvas Copy 1_5511', pbrMetallicRoughness: { roughnessFactor: 0.1 } },
    ] as never
    const file = join(dir, 'suspect.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(1)
    expect(d.pbrSuspects[0]).toEqual({
      index: 0,
      name: 'Nylon_Canvas Copy 1_5511',
      metallicFactor: 1,
      roughnessFactor: 0.1,
    })
  })

  it('does NOT flag a material that carries a metallicRoughnessTexture', async () => {
    // THE LOAD-BEARING NEGATIVE CONTROL. 3,593 materials are metallic-by-omission
    // AND carry an MR texture whose BLUE channel supplies metalness per pixel.
    // Counting those is what produced the false "hundreds of materials" figure.
    const g = textureHeavyGltf()
    g.materials = [
      {
        name: 'Nylon_Canvas Copy 1_5511',
        pbrMetallicRoughness: { roughnessFactor: 0.1, metallicRoughnessTexture: { index: 0 } },
      },
    ] as never
    const file = join(dir, 'mrtex.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
  })

  it('does NOT flag hardware, which is legitimately metal', async () => {
    // 440 of the 515 metallic-with-no-texture materials are these.
    const g = textureHeavyGltf()
    g.materials = [
      { name: 'Zipper 1_Slider_3582', pbrMetallicRoughness: { roughnessFactor: 0.2 } },
    ] as never
    const file = join(dir, 'hardware.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
  })

  it('does NOT flag an unclassified name, and reports it separately instead', async () => {
    // Owner decision 2026-08-26: Trim is reported, never rewritten.
    const g = textureHeavyGltf()
    g.materials = [{ name: 'Trim_0091', pbrMetallicRoughness: { roughnessFactor: 0.1 } }] as never
    const file = join(dir, 'trim.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
    expect(d.unclassifiedMetallic).toEqual([{ index: 0, name: 'Trim_0091', metallicFactor: 1, roughnessFactor: 0.1 }])
  })

  it('does NOT flag fabric that is already correctly non-metallic', async () => {
    const g = textureHeavyGltf() // Cotton_Canvas_2961 at metallicFactor 0
    const file = join(dir, 'clean.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.pbrSuspects).toHaveLength(0)
  })
})

describe('describeGlb — colourways', () => {
  it('reads KHR_materials_variants and whether every primitive is mapped', async () => {
    const g = textureHeavyGltf()
    ;(g as { extensions?: object }).extensions = {
      KHR_materials_variants: {
        variants: [{ name: 'Colorway 1' }, { name: 'Colorway 2' }],
      },
    }
    ;(g.meshes[0]!.primitives[0] as { extensions?: object }).extensions = {
      KHR_materials_variants: { mappings: [{ material: 0, variants: [0] }] },
    }
    const file = join(dir, 'variants.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.colourways.count).toBe(2)
    expect(d.colourways.names).toEqual(['Colorway 1', 'Colorway 2'])
    expect(d.colourways.fullyMapped).toBe(true)
  })

  it('reports fullyMapped false when some primitive has no mapping', async () => {
    const g = textureHeavyGltf()
    ;(g as { extensions?: object }).extensions = {
      KHR_materials_variants: { variants: [{ name: 'Colorway 1' }] },
    }
    g.meshes.push({
      name: 'Unmapped',
      primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0 }],
    })
    const file = join(dir, 'partial.glb')
    await writeGlb(file, g, 2048)
    const d = await describeGlb(file)
    expect(d.colourways.fullyMapped).toBe(false)
  })
})

describe('describeGlb — never throws', () => {
  // "one bad garment cannot break a batch readout" — the design's error rule.
  it('returns an error for a file that is not a GLB', async () => {
    const file = join(dir, 'notglb.glb')
    await writeFile(file, Buffer.from('this is not a GLB at all'))
    const d = await describeGlb(file)
    expect(d.error).toMatch(/not a GLB/i)
    expect(d.family).toBe('mixed')
  })

  it('returns an error for a file that does not exist', async () => {
    const d = await describeGlb(join(dir, 'nope.glb'))
    expect(d.error).toBeTruthy()
  })

  it('returns an error for a truncated header', async () => {
    const file = join(dir, 'short.glb')
    await writeFile(file, Buffer.alloc(8))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('returns an error for malformed JSON in the chunk', async () => {
    const file = join(dir, 'badjson.glb')
    const json = Buffer.from('{ this is not json', 'utf8')
    const head = Buffer.alloc(12)
    head.writeUInt32LE(0x46546c67, 0)
    head.writeUInt32LE(2, 4)
    head.writeUInt32LE(20 + json.length, 8)
    const jh = Buffer.alloc(8)
    jh.writeUInt32LE(json.length, 0)
    jh.writeUInt32LE(0x4e4f534a, 4)
    await writeFile(file, Buffer.concat([head, jh, json]))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('refuses a JSON chunk longer than the file, rather than allocating it', async () => {
    // A corrupt length field must not become a multi-gigabyte Buffer.alloc.
    const file = join(dir, 'lying.glb')
    const head = Buffer.alloc(12)
    head.writeUInt32LE(0x46546c67, 0)
    head.writeUInt32LE(2, 4)
    head.writeUInt32LE(100, 8)
    const jh = Buffer.alloc(8)
    jh.writeUInt32LE(0xfffffff0, 0) // claims ~4 GB
    jh.writeUInt32LE(0x4e4f534a, 4)
    await writeFile(file, Buffer.concat([head, jh, Buffer.alloc(80)]))
    const d = await describeGlb(file)
    expect(d.error).toBeTruthy()
  })

  it('reports the real byte size from the filesystem, not the header', async () => {
    const file = join(dir, 'size.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.bytes).toBeGreaterThan(2048)
  })

  it('reports the CLO generator string', async () => {
    const file = join(dir, 'gen.glb')
    await writeGlb(file, textureHeavyGltf(), 2048)
    const d = await describeGlb(file)
    expect(d.generator).toBe('CLO Standalone OnlineAuth 2025.2.236')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/describe.test.ts
```

Expected: FAIL — `Failed to resolve import "./describe"`.

- [ ] **Step 3: Write the implementation**

Create `tools/asset-pipeline/src/describe.ts`:

```ts
import { open, stat } from 'node:fs/promises'
import { classifyMaterialName } from './material-class'

/**
 * Read a raw CLO export's SHAPE without processing it.
 *
 * WHY THIS EXISTS. Every garment runs identical hardcoded flags from
 * `shrinkFlagsFor`, so compression strength cannot explain why some render
 * perfectly and others come back with damaged artwork. The INPUTS differ.
 * Measured 2026-08-26 across all 28 raw exports: 15 are texture-heavy, 12 are
 * geometry-heavy, and `shrink.ts` justifies its whole strategy on a comment that
 * is true of only one of them. This command makes that difference visible in two
 * seconds instead of a pipeline run.
 *
 * ⚠️ READS THE JSON CHUNK ONLY — never the binary payload. That is why a 1,253 MB
 * export takes the same time as a 5 MB one. Do NOT "simplify" this to
 * `readFile(file)` the way `readGlbGenerator` (validate.ts) does: on the Cycling
 * Bib that pulls 1.3 GB into a Buffer, against a default V8 heap of ~4 GB.
 *
 * ⚠️ NOT gltf-transform, for the same reason `readGlbGenerator` is not. Its reader
 * normalises what it imports — it fills in an absent `metallicFactor` and
 * overwrites `asset.generator`. Both are exactly the raw-CLO shapes this has to
 * see. Reading the JSON directly is the only way to observe the file as it is.
 */

const GLB_MAGIC = 0x46546c67 // 'glTF' little-endian
const GLB_JSON_CHUNK = 0x4e4f534a // 'JSON' little-endian

/** At or above this fraction of bytes-in-textures, geometry levers have nothing to pull. */
export const TEXTURE_FAMILY_MIN_FRACTION = 0.6
/** Below this, the file is what `shrink.ts` was built for and today's flags are right. */
export const GEOMETRY_FAMILY_MAX_FRACTION = 0.4

/**
 * Metalness above this on a fabric material is a defect worth reporting.
 *
 * Cloth should be 0. The four measured offenders sit at 0.23, 0.29, 0.46 and
 * ABSENT (which glTF defaults to 1.0). 0.1 clears sensor noise without missing
 * any of them.
 */
const METALLIC_SUSPECT_MIN = 0.1

/** Which meshes are decorative thread. Same pattern topstitch.ts decimates against. */
const STITCH_NAME = /^topstitch/i

export type GlbFamily = 'geometry' | 'texture' | 'mixed'

export interface PbrSuspect {
  index: number
  name: string
  /** Resolved, i.e. glTF's default of 1.0 already applied when the key is absent. */
  metallicFactor: number
  roughnessFactor: number
}

export interface GlbMaterialCensus {
  total: number
  opaque: number
  blend: number
  mask: number
  doubleSided: number
}

export interface GlbDescription {
  file: string
  /** From the filesystem, not the header's own length field. */
  bytes: number
  generator: string
  family: GlbFamily
  textureBytes: number
  geometryBytes: number
  /** textureBytes / (textureBytes + geometryBytes). 0 when the file has neither. */
  textureFraction: number
  triangles: number
  stitchTriangles: number
  stitchFraction: number
  materials: GlbMaterialCensus
  /** Fabric or artwork, metallic, and with no MR texture to override it. Fixable. */
  pbrSuspects: PbrSuspect[]
  /** Metallic, no MR texture, and a name this cannot classify. REPORTED, never fixed. */
  unclassifiedMetallic: PbrSuspect[]
  colourways: { count: number; names: string[]; fullyMapped: boolean }
  /** `named` is expected to be 0 on every CLO export — a tripwire for a future change. */
  images: { total: number; named: number }
  /** Null on success. Set instead of throwing, so one bad file cannot break a batch. */
  error: string | null
}

/** Minimal shape of the bits of glTF JSON this reads. Everything else is ignored. */
interface RawGltf {
  asset?: { generator?: unknown }
  bufferViews?: { byteLength?: number }[]
  images?: { bufferView?: number; name?: unknown; uri?: unknown }[]
  accessors?: { bufferView?: number; count?: number }[]
  meshes?: {
    name?: string
    primitives?: {
      mode?: number
      indices?: number
      attributes?: { POSITION?: number }
      extensions?: { KHR_materials_variants?: unknown }
    }[]
  }[]
  nodes?: { name?: string; mesh?: number }[]
  materials?: {
    name?: string
    alphaMode?: string
    doubleSided?: boolean
    pbrMetallicRoughness?: {
      metallicFactor?: number
      roughnessFactor?: number
      metallicRoughnessTexture?: unknown
    }
  }[]
  extensions?: { KHR_materials_variants?: { variants?: { name?: string }[] } }
}

function emptyDescription(file: string, error: string | null): GlbDescription {
  return {
    file,
    bytes: 0,
    generator: '',
    family: 'mixed',
    textureBytes: 0,
    geometryBytes: 0,
    textureFraction: 0,
    triangles: 0,
    stitchTriangles: 0,
    stitchFraction: 0,
    materials: { total: 0, opaque: 0, blend: 0, mask: 0, doubleSided: 0 },
    pbrSuspects: [],
    unclassifiedMetallic: [],
    colourways: { count: 0, names: [], fullyMapped: false },
    images: { total: 0, named: 0 },
    error,
  }
}

/** Pick the family from the texture fraction. The band between is deliberately named. */
export function familyFor(textureFraction: number): GlbFamily {
  if (textureFraction >= TEXTURE_FAMILY_MIN_FRACTION) return 'texture'
  if (textureFraction < GEOMETRY_FAMILY_MAX_FRACTION) return 'geometry'
  return 'mixed'
}

/**
 * Read and parse a GLB's JSON chunk with three positional reads and no full load.
 * Throws; `describeGlb` is what converts that into an `error` field.
 */
async function readGltfJson(file: string): Promise<RawGltf> {
  const fh = await open(file, 'r')
  try {
    const size = (await fh.stat()).size
    if (size < 20) throw new Error('File is too short to be a GLB.')

    const head = Buffer.alloc(12)
    await fh.read(head, 0, 12, 0)
    if (head.readUInt32LE(0) !== GLB_MAGIC) throw new Error('File is not a GLB (bad magic).')

    const chunkHead = Buffer.alloc(8)
    await fh.read(chunkHead, 0, 8, 12)
    const jsonLength = chunkHead.readUInt32LE(0)
    if (chunkHead.readUInt32LE(4) !== GLB_JSON_CHUNK) {
      throw new Error('First GLB chunk is not JSON.')
    }
    // A corrupt length field must never become a multi-gigabyte Buffer.alloc.
    if (jsonLength <= 0 || 20 + jsonLength > size) {
      throw new Error(`JSON chunk length ${jsonLength} does not fit in a ${size}-byte file.`)
    }

    const json = Buffer.alloc(jsonLength)
    await fh.read(json, 0, jsonLength, 20)
    return JSON.parse(json.toString('utf8')) as RawGltf
  } finally {
    await fh.close()
  }
}

/** Triangles in one primitive. `mode` defaults to 4 (TRIANGLES) per the spec. */
function primitiveTriangles(
  primitive: NonNullable<NonNullable<RawGltf['meshes']>[number]['primitives']>[number],
  accessors: NonNullable<RawGltf['accessors']>,
): number {
  if ((primitive.mode ?? 4) !== 4) return 0
  const accessor =
    primitive.indices !== undefined
      ? accessors[primitive.indices]
      : accessors[primitive.attributes?.POSITION ?? -1]
  return Math.floor((accessor?.count ?? 0) / 3)
}

export async function describeGlb(file: string): Promise<GlbDescription> {
  let gltf: RawGltf
  let bytes = 0
  try {
    bytes = (await stat(file)).size
    gltf = await readGltfJson(file)
  } catch (error) {
    const out = emptyDescription(file, error instanceof Error ? error.message : String(error))
    out.bytes = bytes
    return out
  }

  const out = emptyDescription(file, null)
  out.bytes = bytes
  out.generator = typeof gltf.asset?.generator === 'string' ? gltf.asset.generator : ''

  const views = gltf.bufferViews ?? []
  const accessors = gltf.accessors ?? []

  // Bytes are attributed by WHO REFERENCES a bufferView, and each view is counted
  // once — a view referenced twice is not twice the bytes.
  const imageViews = new Set<number>()
  for (const image of gltf.images ?? []) {
    if (image.bufferView !== undefined) imageViews.add(image.bufferView)
  }
  const accessorViews = new Set<number>()
  for (const accessor of accessors) {
    if (accessor.bufferView !== undefined) accessorViews.add(accessor.bufferView)
  }
  for (const i of imageViews) out.textureBytes += views[i]?.byteLength ?? 0
  for (const i of accessorViews) out.geometryBytes += views[i]?.byteLength ?? 0

  const classified = out.textureBytes + out.geometryBytes
  out.textureFraction = classified > 0 ? out.textureBytes / classified : 0
  out.family = familyFor(out.textureFraction)

  const meshes = gltf.meshes ?? []
  const meshTriangles = meshes.map((mesh) =>
    (mesh.primitives ?? []).reduce((sum, p) => sum + primitiveTriangles(p, accessors), 0),
  )
  for (let i = 0; i < meshes.length; i++) {
    const count = meshTriangles[i] ?? 0
    out.triangles += count
    if (STITCH_NAME.test(meshes[i]?.name ?? '')) out.stitchTriangles += count
  }
  // Some CLO exports name the NODE and leave the mesh anonymous. Only consulted
  // when the mesh names found nothing, so a file naming both is not double-counted.
  if (out.stitchTriangles === 0) {
    for (const node of gltf.nodes ?? []) {
      if (node.mesh !== undefined && STITCH_NAME.test(node.name ?? '')) {
        out.stitchTriangles += meshTriangles[node.mesh] ?? 0
      }
    }
  }
  out.stitchFraction = out.triangles > 0 ? out.stitchTriangles / out.triangles : 0

  const materials = gltf.materials ?? []
  out.materials.total = materials.length
  for (let i = 0; i < materials.length; i++) {
    const material = materials[i]!
    const alphaMode = material.alphaMode ?? 'OPAQUE'
    if (alphaMode === 'BLEND') out.materials.blend++
    else if (alphaMode === 'MASK') out.materials.mask++
    else out.materials.opaque++
    if (material.doubleSided === true) out.materials.doubleSided++

    const pbr = material.pbrMetallicRoughness ?? {}
    // glTF defaults BOTH factors to 1.0 when the key is absent. That default is
    // the entire defect: CLO omits metallicFactor on fabric, and the format then
    // says "fully metal". See the design document, finding 3.
    const metallicFactor = pbr.metallicFactor ?? 1
    const roughnessFactor = pbr.roughnessFactor ?? 1
    const hasMrTexture = pbr.metallicRoughnessTexture !== undefined

    // THE LOAD-BEARING CHECK. An MR texture's BLUE channel supplies metalness per
    // pixel and overrides the factor entirely, so a material carrying one is not a
    // defect however high its factor reads. 3,593 materials are in exactly that
    // state; counting them is what produced a false "hundreds of materials"
    // figure that this reduced to 55.
    if (metallicFactor <= METALLIC_SUSPECT_MIN || hasMrTexture) continue

    const name = material.name ?? ''
    const record: PbrSuspect = { index: i, name, metallicFactor, roughnessFactor }
    const bucket = classifyMaterialName(name)
    if (bucket === 'fabric') out.pbrSuspects.push(record)
    else if (bucket === 'unclassified') out.unclassifiedMetallic.push(record)
    // 'hardware' is legitimately metal and is neither fixed nor reported.
  }

  const variants = gltf.extensions?.KHR_materials_variants?.variants ?? []
  out.colourways.count = variants.length
  out.colourways.names = variants.map((v) => v.name ?? '')
  let primitives = 0
  let mapped = 0
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      primitives++
      if (primitive.extensions?.KHR_materials_variants !== undefined) mapped++
    }
  }
  out.colourways.fullyMapped = primitives > 0 && mapped === primitives

  const images = gltf.images ?? []
  out.images.total = images.length
  out.images.named = images.filter((image) => Boolean(image.name) || Boolean(image.uri)).length

  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/describe.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Confirm coverage did not fall through the floor**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline test:coverage
```

Expected: exit 0. The floors are lines 87 / functions 86 / branches 73 / statements 84. If a new file dropped the number, ADD TESTS — never lower a floor.

- [ ] **Step 6: Lint and typecheck**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add tools/asset-pipeline/src/describe.ts tools/asset-pipeline/src/describe.test.ts && git commit -m "feat(pipeline): describe a raw export from its JSON chunk alone

Reads the header and JSON chunk with three positional reads, so a 1,253 MB
export costs the same as a 5 MB one and nothing is decoded. Not gltf-transform:
its reader fills in an absent metallicFactor and rewrites asset.generator, which
are two of the four raw-CLO shapes this has to observe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `pipeline describe` — surface the readout, then take the baseline

**Files:**
- Modify: `tools/asset-pipeline/src/cli.ts` (add the command + usage text)
- Create: `docs/GARMENT-CATALOGUE-BASELINE.md` (the readout, by garment NAME only)

**Interfaces:**
- Consumes: `describeGlb`, `GlbDescription` from `./describe` (Task 2).
- Produces: `pnpm pipeline describe <file.glb> [...]` and `--json`.

**⚠️ The baseline document must name garments, never paths.** `scripts/doc-citations.mjs` walks `docs/` recursively; a path under `~/Documents` would resolve on this machine and fail on a clean checkout — the exact failure mode already recorded for `public/draco/` in `CLAUDE.md`.

- [ ] **Step 1: Add the command to `cli.ts`**

Add the import beside the others at the top of `tools/asset-pipeline/src/cli.ts`:

```ts
import { type GlbDescription, describeGlb } from './describe'
```

Insert this block immediately BEFORE `if (command === 'validate') {`:

```ts
  if (command === 'describe') {
    const files = rest.filter((a) => !a.startsWith('--'))
    if (!files.length) fail('Missing <file.glb>')
    const asJson = rest.includes('--json')

    const results: GlbDescription[] = []
    for (const file of files) results.push(await describeGlb(file))

    if (asJson) {
      console.log(JSON.stringify(results, null, 2))
      return
    }

    // One line per garment, widest column first, so a 28-file run is scannable.
    console.log(
      'FAMILY    %TEX   TEXmb    GEOmb    TRIS          STITCH%  MATS  BLEND  SUSPECT  ?  CW  FILE',
    )
    for (const d of results) {
      if (d.error) {
        console.log(`ERROR     ${d.error}  —  ${d.file}`)
        continue
      }
      const mb = (b: number) => (b / 1048576).toFixed(1)
      console.log(
        `${d.family.padEnd(9)}${(d.textureFraction * 100).toFixed(0).padStart(4)}%` +
          `${mb(d.textureBytes).padStart(8)}${mb(d.geometryBytes).padStart(9)}` +
          `${d.triangles.toLocaleString().padStart(14)}` +
          `${(d.stitchFraction * 100).toFixed(1).padStart(8)}%` +
          `${String(d.materials.total).padStart(6)}${String(d.materials.blend).padStart(7)}` +
          `${String(d.pbrSuspects.length).padStart(9)}${String(d.unclassifiedMetallic.length).padStart(3)}` +
          `${String(d.colourways.count).padStart(4)}  ${d.file.split('/').pop()}`,
      )
    }

    // Whole-run notes. These are the tripwires, not decoration: a CLO version
    // that starts naming images would silently re-enable a texture-name classifier
    // this pipeline deliberately does not have, and a file that is not fully
    // variant-mapped cannot be published as one multi-colourway GLB.
    const ok = results.filter((d) => !d.error)
    const named = ok.reduce((n, d) => n + d.images.named, 0)
    const totalImages = ok.reduce((n, d) => n + d.images.total, 0)
    console.log('')
    console.log(`  files:        ${results.length} (${results.length - ok.length} unreadable)`)
    console.log(
      `  families:     ${ok.filter((d) => d.family === 'texture').length} texture, ` +
        `${ok.filter((d) => d.family === 'geometry').length} geometry, ` +
        `${ok.filter((d) => d.family === 'mixed').length} mixed`,
    )
    console.log(`  images:       ${totalImages}, of which ${named} carry a name or URI`)
    if (named > 0) {
      console.log('  NOTE:         CLO exports have always had 0 named images. Something changed.')
    }
    for (const d of ok) {
      if (!d.colourways.fullyMapped && d.colourways.count > 0) {
        console.log(`  WARNING:      ${d.file.split('/').pop()} is not fully variant-mapped`)
      }
    }
    return
  }
```

- [ ] **Step 2: Add it to the DIAGNOSTICS section of `USAGE`**

In the `USAGE` template literal, insert directly above the existing `pnpm pipeline textures` entry:

```
  pnpm pipeline describe <file.glb> [...] [--json]
      Read a raw export's SHAPE without processing it — family (geometry- or
      texture-heavy), triangle and topstitch counts, the material census,
      colourways, and any fabric material that is metallic with nothing to
      override it. Reads the JSON chunk only, so a 1.2 GB export is as fast as a
      5 MB one. Run this BEFORE spending a pipeline run.
```

- [ ] **Step 3: Verify against the two extremes, which are already measured**

```bash
cd tools/asset-pipeline && npx --yes pnpm@10.33.0 start describe "$HOME/Documents/3D Products/women athlatic dress.glb" "$HOME/Documents/3D Products/Cycling Bib.glb"
```

Expected, EXACTLY (measured 2026-08-26 — a mismatch means the reader is wrong, not the note):

- `women athlatic dress` → `texture`, 100%, 335.0 MB textures, 0.3 MB geometry, 9,980 triangles, 0.0% stitch, 118 materials, 48 BLEND, 5 colourways
- `Cycling Bib` → `geometry`, 16%, 201.8 MB textures, 1051.1 MB geometry, 33,964,432 triangles, 100.0% stitch, 121 materials, 71 BLEND, 5 colourways

- [ ] **Step 4: Run the whole catalogue and capture it**

```bash
cd tools/asset-pipeline && npx --yes pnpm@10.33.0 start describe "$HOME/Documents/3D Products/"*.glb | tee /tmp/describe-baseline.txt | tail -12
```

Expected totals: 28 files, 0 unreadable, **15 texture / 12 geometry / 1 mixed**, 5,048 images of which **0** carry a name or URI.

- [ ] **Step 5: Write the baseline document**

Create `docs/GARMENT-CATALOGUE-BASELINE.md`. Paste the table from `/tmp/describe-baseline.txt`, and open it with this header — adjusting only if the run disagrees with the numbers, in which case the RUN wins and this note gets corrected:

```markdown
# Garment catalogue — measured baseline

Produced by `pnpm pipeline describe`, 2026-08-26, over the 28 raw CLO exports.

⚠️ **The raw exports are local-only and are deliberately not cited by path.** They
are 7.7 GB, the largest single file is 1.25 GB against GitHub's 100 MB cap, and a
path under a home directory would resolve for whoever ran this and fail the
citation gate on a clean checkout. Garments are named, never located.

Every figure here is reproducible in about two seconds per file:
`pnpm pipeline describe <export>`. Re-run it rather than trusting this table.

**What it says.** 15 of 28 exports are texture-heavy and 12 are geometry-heavy.
`packages/shared/src/shrink.ts` justifies a geometry-first strategy on a comment
measured against ONE garment; it is false for the majority of this catalogue.
```

- [ ] **Step 6: Run the citation gate on the new document**

```bash
node scripts/doc-citations.mjs
```

Expected: exit 0, and the document count goes 51 → 52.

- [ ] **Step 7: Run the full gates**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add tools/asset-pipeline/src/cli.ts docs/GARMENT-CATALOGUE-BASELINE.md && git commit -m "feat(pipeline): pnpm pipeline describe, and the catalogue baseline it produced

Fifteen of 28 raw exports are texture-heavy; twelve are geometry-heavy. The
comment in shrink.ts that justifies a geometry-first strategy was measured on one
garment and is false for the majority. Garments are named rather than located:
the exports are local-only and a home-directory path would fail the citation gate
on a clean checkout.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `pipeline review` — a live 3D viewer for judging garments

**Files:**
- Modify: `tools/asset-pipeline/src/render.ts` (extract the viewer-asset map so two servers share one definition)
- Create: `tools/asset-pipeline/src/review-server.ts`
- Test: `tools/asset-pipeline/src/review-server.test.ts`
- Modify: `tools/asset-pipeline/src/cli.ts` (add the `review` command)

**Interfaces:**
- Consumes: `describeGlb` (Task 2); `@google/model-viewer` and the three decoders already resolved by `render.ts`.
- Produces:
  - `export function viewerAssetMap(): Record<string, string>` (moved out of `render.ts`)
  - `export interface ReviewServerHandle { server: Server; port: number; url: string }`
  - `export async function startReviewServer(dirs: string[], port?: number): Promise<ReviewServerHandle>`
  - `pnpm pipeline review <dir> [<dir2>] [--port 4180]`

**Owner requirement, 2026-08-26.** The owner asked to judge the garments in a live 3D viewer rather than from still renders: *"Provide all the models in a local live 3d viewer so I can test them."* A still frame cannot show what turning a garment shows — a print that reads correctly head-on can be wrong at 40°, and a metallic fabric only announces itself when the light moves across it. This task builds that viewer, and it comes **before** the calibration sweep so every downstream judgement is made in it.

**⚠️ IT MUST BE THE SAME RENDERER PRODUCTION USES, OR IT ANSWERS A DIFFERENT QUESTION.** `render.ts` already gets this exactly right and says why: *"It renders through `<model-viewer>`, not a bespoke three.js scene, because the failure is defined as 'what the customer sees on viewer.wear-run.help'."* Verified 2026-08-26: `@google/model-viewer` is pinned to **4.3.1** in BOTH `apps/viewer/package.json` and `tools/asset-pipeline/package.json`, and `render.ts` already self-hosts all three decoders with the comment *"matching apps/viewer/src/components/Stage.tsx"*. Reuse that map; do not write a second one.

**One deliberate difference from `render.ts`.** That harness uses flat neutral lighting with shadows OFF, because it diffs two renders and moving specular highlights would light up everywhere. This viewer is for a human judging a garment, so it offers **both**: neutral for diagnosis and the production studio environment for "does this look right". The lighting toggle is the point, not a decoration — a metallic-fabric defect is invisible under flat light and obvious under a studio HDR.

- [ ] **Step 1: Extract the shared asset map out of `render.ts`**

In `tools/asset-pipeline/src/render.ts`, lift the bundle and decoder resolution currently inside the server function into an exported function, and have the existing server call it. Behaviour must not change.

```ts
/**
 * Every static asset a local <model-viewer> page needs, mapped URL -> disk path.
 *
 * Extracted so the headless render harness and the interactive review server
 * cannot drift apart. They MUST serve the same model-viewer build and the same
 * decoders: the whole reason this project renders through <model-viewer> rather
 * than a bespoke three.js scene is that the failure is defined as "what the
 * customer sees", and a different decoder is a different renderer.
 *
 * All three decoders, not just meshopt: `--draco` and `--ktx2` are supported
 * pipeline outputs. Note --draco DOES NOT LOAD on the DEPLOYED viewer and
 * production stays on --meshopt (root CLAUDE.md) — but a local file may still
 * carry it, and failing to load it here would look like a broken garment.
 */
export function viewerAssetMap(): Record<string, string> {
  const threeLibs = dirname(
    require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js'),
  )
  return {
    '/model-viewer.js': require.resolve('@google/model-viewer/dist/model-viewer.min.js'),
    '/meshopt_decoder.js': require.resolve('meshoptimizer/decoder.cjs'),
    '/draco/draco_decoder.js': join(threeLibs, 'gltf', 'draco_decoder.js'),
    '/draco/draco_decoder.wasm': join(threeLibs, 'gltf', 'draco_decoder.wasm'),
    '/draco/draco_wasm_wrapper.js': join(threeLibs, 'gltf', 'draco_wasm_wrapper.js'),
  }
}
```

- [ ] **Step 2: Confirm the extraction changed nothing**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/render.test.ts
```

Expected: PASS, unchanged. If `render.test.ts` fails here, the extraction is wrong — fix it before writing anything new.

- [ ] **Step 3: Write the failing test**

Create `tools/asset-pipeline/src/review-server.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIO } from './io'
import { PLACEHOLDER_COLOURWAYS, buildPlaceholderTee } from './placeholders'
import { type ReviewServerHandle, startReviewServer } from './review-server'
import { viewerAssetMap } from './render'

let dir: string
let handle: ReviewServerHandle

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-'))
  const io = await createIO()
  await io.write(join(dir, 'ALPHA GARMENT.glb'), await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!))
  await io.write(join(dir, 'BETA GARMENT.glb'), await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[1]!))
  handle = await startReviewServer([dir])
})
afterAll(async () => {
  await new Promise<void>((r) => handle.server.close(() => r()))
  await rm(dir, { recursive: true, force: true })
})

describe('review server', () => {
  it('lists every GLB in the directory on the index', async () => {
    const html = await (await fetch(handle.url)).text()
    expect(html).toContain('ALPHA GARMENT')
    expect(html).toContain('BETA GARMENT')
  })

  it('serves a GLB with the correct content type', async () => {
    const res = await fetch(`${handle.url}model/0/0`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('model/gltf-binary')
  })

  it('serves the SAME model-viewer build the render harness uses', async () => {
    // If these ever diverge the viewer stops answering "what does the customer
    // see", which is the only question it exists to answer.
    expect(Object.keys(viewerAssetMap())).toContain('/model-viewer.js')
    const res = await fetch(`${handle.url}model-viewer.js`)
    expect(res.status).toBe(200)
  })

  it('serves the meshopt decoder, without which no production GLB renders', async () => {
    // Every production model is --meshopt. A missing decoder here shows up as a
    // blank viewer, which reads as "the garment is broken".
    const res = await fetch(`${handle.url}meshopt_decoder.js`)
    expect(res.status).toBe(200)
  })

  it('reports the describe readout alongside each garment', async () => {
    const json = await (await fetch(`${handle.url}api/garments`)).json()
    expect(Array.isArray(json)).toBe(true)
    expect(json[0]).toHaveProperty('family')
    expect(json[0]).toHaveProperty('bytes')
    expect(json[0]).toHaveProperty('overHardMax')
  })

  it('refuses a path outside the served directories', async () => {
    // The server takes a directory from argv and maps indexes to files. It must
    // never resolve a caller-supplied path — same class as the /etc/passwd shape
    // recorded in apps/shrink/container/server.ts.
    const res = await fetch(`${handle.url}model/0/../../../../etc/passwd`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('404s an unknown model index rather than throwing', async () => {
    const res = await fetch(`${handle.url}model/0/999`)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 4: Run it, confirm it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/review-server.test.ts
```

Expected: FAIL — `Failed to resolve import "./review-server"`.

- [ ] **Step 5: Implement `review-server.ts`**

Build it to this shape. Every point below is a requirement, not a suggestion:

1. **Index the directories at startup**, into `{ dir, index, name, path, bytes, description }[]`. Run `describeGlb` on each — it reads the JSON chunk only, so indexing 28 garments costs about a second even at 7.7 GB.
2. **Address models by INDEX, never by a caller-supplied path** — `/model/:dirIndex/:fileIndex`. The server must never join a request string onto a filesystem path. This is the same class of defect recorded in `apps/shrink/container/server.ts`, where a bare argument became the input path.
3. **Serve GLBs with `content-type: model/gltf-binary`** via `createReadStream`, exactly as `render.ts` does. Do not buffer — some outputs are tens of megabytes.
4. **Serve every entry of `viewerAssetMap()`.**
5. **`GET /api/garments`** returns the index as JSON, including `family`, `bytes`, `overHardMax` (against 40 MB), `triangles`, `pbrSuspects`, `unclassifiedMetallic` and `colourways`.
6. **The index page** is a grid, one card per garment: name, family badge, size, and a red marker when `overHardMax`.
7. **The garment page** carries a full-window `<model-viewer>` with `camera-controls`, `min-field-of-view="1deg"` (⚠️ without this every zoom under 12° is silently ignored — measured 2026-08-08), a **colourway switcher** built from `availableVariants`, a **lighting toggle** (neutral vs studio), and the describe readout in a side panel.
8. **Accept more than one directory.** With two, each card offers both, so a before/after comparison is available without being forced.

The page's script block, which is the part that has to be exactly right:

```html
<script type="module">
  import { ModelViewerElement } from '/model-viewer.js'
  // Self-hosted, and identical to render.ts and apps/viewer/src/components/Stage.tsx.
  ModelViewerElement.meshoptDecoderLocation = '/meshopt_decoder.js'
  ModelViewerElement.dracoDecoderLocation = '/draco/'
  const mv = document.querySelector('model-viewer')
  mv.addEventListener('load', () => {
    // KHR_materials_variants. Every garment in the catalogue carries 5 (Mantra
    // Ray 6) and is 100% variant-mapped, so this list is never empty on a real file.
    const bar = document.getElementById('colourways')
    bar.replaceChildren(
      ...mv.availableVariants.map((name) => {
        const b = document.createElement('button')
        b.textContent = name
        b.onclick = () => { mv.variantName = name }
        return b
      }),
    )
  })
  mv.addEventListener('error', (e) => {
    // A decoder that did not load looks exactly like a broken garment. Say which.
    document.getElementById('status').textContent =
      'FAILED TO LOAD — this is the viewer, not necessarily the garment: ' + (e.detail?.type ?? '')
  })
</script>
```

- [ ] **Step 6: Add the CLI command**

In `cli.ts`, beside the other DIAGNOSTICS commands:

```ts
  if (command === 'review') {
    const dirs = rest.filter((a) => !a.startsWith('--'))
    if (!dirs.length) fail('Missing <dir> — a directory of .glb files to review')
    const portIdx = rest.indexOf('--port')
    const port = portIdx === -1 ? 4180 : finiteNumber(rest[portIdx + 1], '--port')
    const handle = await startReviewServer(dirs, port)
    console.log(`Review viewer: ${handle.url}`)
    console.log('  Turn each garment. Switch colourways. Toggle the lighting.')
    console.log('  Ctrl-C to stop.')
    return
  }
```

Add `--port` to `VALUE_TAKING_FLAGS` — it **does** take a value, unlike the other flags added by this plan.

Add to the DIAGNOSTICS block of `USAGE`:

```
  pnpm pipeline review <dir> [<dir2>] [--port 4180]
      Serve every GLB in a directory in a live <model-viewer>, the same renderer
      and the same decoders the deployed site uses. Turn the garment, switch
      colourways, toggle neutral vs studio lighting. This is where artwork
      damage is judged: no automated gate in this system can see it.
```

- [ ] **Step 7: Run it against the seeded placeholders and look**

```bash
cd tools/asset-pipeline && npx --yes pnpm@10.33.0 start placeholders --out /tmp/review-demo && npx --yes pnpm@10.33.0 start review /tmp/review-demo
```

Open the printed URL. Confirm: the garment renders, it turns, the colourway buttons switch it, and the lighting toggle changes the highlights. **If the model is blank, the decoder path is wrong — that is the failure this viewer must never show silently.**

- [ ] **Step 8: Gates**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

Expected: all exit 0, the citation gate included.

- [ ] **Step 9: Commit**

```bash
git add tools/asset-pipeline/src/review-server.ts tools/asset-pipeline/src/review-server.test.ts tools/asset-pipeline/src/render.ts tools/asset-pipeline/src/cli.ts && git commit -m "feat(pipeline): a live model-viewer for judging garments, not still frames

The owner judges the garments by turning them, so a contact sheet is the wrong
instrument: a print that reads correctly head-on can be wrong at 40 degrees, and
a metallic fabric only announces itself when the light moves. Same model-viewer
build and the same three decoders as the headless harness, extracted into one map
so they cannot drift — a different decoder is a different renderer, and the whole
point is to see what the customer sees. Models are addressed by index, never by a
caller-supplied path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Calibration sweep — measure the texture-family flags before choosing them

**Files:**
- Create: `docs/images/2026-08-26-texture-family-sweep.png` (contact sheet)
- Create: `tools/asset-pipeline/scripts/sweep-texture-family.mjs`

**Interfaces:**
- Consumes: `pipeline optimize`, `pipeline render`, `pipeline compare` (all existing).
- Produces: **the four numbers Task 6 hardcodes.** Until this runs, the texture-family flag values are unknown.

**Why this is a task and not an assumption.** The design says the texture family should have `--simplify` "relaxed or skipped" and the freed budget "spent on `--max-texture` / `--quality`". That is a direction, not a value. This repo's own rule is to state a measurement rather than an adjective, and its most expensive lesson is that **only a rendered crop catches decimation damage** — `balanced`'s 0.001 was set exactly this way on 2026-08-05.

There is a real tension to resolve here, and guessing it wrong is the whole risk of Unit 2: a texture-heavy garment is **10–25× over the 40 MB ceiling on textures alone**, so "spend the freed budget on higher quality" may be exactly backwards. The sweep decides it.

- [ ] **Step 1: Pick the three sweep garments**

Chosen to span the texture family rather than sample it evenly:

| Garment | Why |
|---|---|
| `women athlatic dress` | The pure case — 100% textures, 9,980 triangles. `--simplify` provably has nothing to do. |
| `X-MILO CORE OVERSIZE` | The largest — 1,022.7 MB of textures, 2.0 M triangles. If any setting can bring this under 40 MB it will be visible here. |
| `KINETIC SPLATTER SPORTS BRA` | Texture-heavy AND 98.5% topstitch. Proves the two strategies compose rather than conflict. |

- [ ] **Step 2: Write the sweep script**

Create `tools/asset-pipeline/scripts/sweep-texture-family.mjs`:

```js
#!/usr/bin/env node
/**
 * Sweep candidate texture-family flags on one raw export and render each result.
 *
 * WHY A SCRIPT AND NOT A TEST. The output is a picture, and no assertion in this
 * repository can see decimation or compression damage — the three blocking gates
 * test alphaMode, which neither changes. See docs/OPEN-ISSUE-ARTWORK.md. This is
 * the same shape as the 2026-08-05 sweep that set `balanced` to 0.001.
 *
 * Usage: node scripts/sweep-texture-family.mjs <raw.glb> <outDir>
 */
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const [raw, outDir] = process.argv.slice(2)
if (!raw || !outDir) {
  console.error('Usage: node scripts/sweep-texture-family.mjs <raw.glb> <outDir>')
  process.exit(1)
}

/**
 * A. Today's flags, unchanged — the control. Every other row is judged against it.
 * B. Drop --simplify entirely; keep everything else. Isolates "does the geometry
 *    lever do anything at all on this file".
 * C. B, plus MORE texture headroom (the design's reading of "spend the freed
 *    budget"). Expected to be bigger; the question is whether it is BETTER.
 * D. B, plus LESS texture headroom. The opposite reading, and the one the 40 MB
 *    ceiling suggests is actually needed on a 1 GB-of-textures file.
 * E. D with the artwork exemption widened, so fabric pays and graphics do not.
 */
const CANDIDATES = [
  ['A-control', ['--stitch','0.03','--stitch-error','0.0005','--simplify','0.05','--simplify-error','0.001','--uv-weight','1','--meshopt','--max-texture','4096','--data-max-texture','2048','--quality','75']],
  ['B-nosimplify', ['--stitch','0.03','--stitch-error','0.0005','--meshopt','--max-texture','4096','--data-max-texture','2048','--quality','75']],
  ['C-morequality', ['--stitch','0.03','--stitch-error','0.0005','--meshopt','--max-texture','4096','--data-max-texture','2048','--quality','85','--artwork-quality','95']],
  ['D-lessquality', ['--stitch','0.03','--stitch-error','0.0005','--meshopt','--max-texture','2048','--data-max-texture','1024','--quality','70','--artwork-quality','95']],
  ['E-artworkfirst', ['--stitch','0.03','--stitch-error','0.0005','--meshopt','--max-texture','2048','--data-max-texture','1024','--quality','70','--artwork-max-texture','4096','--artwork-quality','95']],
]

const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'tsx', 'src/cli.ts', ...args], {
      stdio: 'inherit',
      // The Cycling Bib peaks near 5.27 GB; the default V8 heap here is ~4.09 GB.
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=12288' },
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })

await mkdir(outDir, { recursive: true })
for (const [name, flags] of CANDIDATES) {
  const glb = join(outDir, `${name}.glb`)
  console.log(`\n=== ${name} ===`)
  const started = Date.now()
  await run(['optimize', raw, '--out', glb, ...flags])
  console.log(`  ${name}: ${((Date.now() - started) / 1000).toFixed(1)}s`)
  await run(['render', glb, '--out', join(outDir, name), '--size', '1024'])
}
console.log('\nNow compare each candidate against A-control:')
for (const [name] of CANDIDATES.slice(1)) {
  console.log(`  pnpm pipeline compare ${join(outDir, 'A-control')} ${join(outDir, name)} --out ${join(outDir, `sheet-${name}.png`)}`)
}
```

- [ ] **Step 3: Run the sweep on the pure case first**

```bash
cd tools/asset-pipeline && node scripts/sweep-texture-family.mjs "$HOME/Documents/3D Products/women athlatic dress.glb" /tmp/sweep-dress
```

Expected: five GLBs and five render directories. Note each output's byte size — `ls -la /tmp/sweep-dress/*.glb`.

**The first thing to read is whether A and B differ in size at all.** If they are within ~1%, that is the direct proof that `--simplify` does nothing on a 9,980-triangle file, and Unit 2's whole premise is confirmed by measurement rather than inference.

- [ ] **Step 4: Build the contact sheets**

```bash
cd tools/asset-pipeline && for c in B-nosimplify C-morequality D-lessquality E-artworkfirst; do npx --yes tsx src/cli.ts compare /tmp/sweep-dress/A-control /tmp/sweep-dress/$c --out /tmp/sweep-dress/sheet-$c.png; done && ls -la /tmp/sweep-dress/sheet-*.png
```

- [ ] **Step 5: Repeat on the other two garments**

```bash
cd tools/asset-pipeline && node scripts/sweep-texture-family.mjs "$HOME/Documents/3D Products/X-MILO CORE OVERSIZE.glb" /tmp/sweep-xmilo
```

```bash
cd tools/asset-pipeline && node scripts/sweep-texture-family.mjs "$HOME/Documents/3D Products/KINETIC SPLATTER SPORTS BRA.glb" /tmp/sweep-splatter
```

- [ ] **Step 6: Open all five candidates side by side in the review viewer**

```bash
cd tools/asset-pipeline && npx --yes pnpm@10.33.0 start review /tmp/sweep-dress --port 4180
```

Every candidate GLB is in that one directory, so the viewer lists all five. **Turn
each one, switch its colourways, and toggle the lighting** — the contact sheets from
Step 4 are the record, but the viewer is where the judgement is made. A print that
reads correctly head-on can be wrong at 40°, and a metallic fabric only announces
itself when the light moves.

- [ ] **Step 7: Decide, and write the decision down**

Pick the candidate that is smallest **without visible artwork damage**, judged in this order:

1. **Reject on artwork before considering size.** A candidate whose wordmark, slogan or halftone is visibly worse than A is out, whatever it weighs. This is the rule the deleted "Smallest file" preset broke.
2. Among survivors, prefer the one closest to `GLB_HARD_MAX_BYTES` (40 MB) from below.
3. If none reaches 40 MB — likely on X-MILO — record the number honestly. Unit 2 is not obliged to make every garment publishable; it is obliged to stop wasting the budget on a lever that does nothing.

Record the winner and the rejected candidates in `docs/GARMENT-CATALOGUE-BASELINE.md` under a new `## Texture-family calibration` heading, with the measured sizes and one sentence per rejection.

- [ ] **Step 8: Save the deciding contact sheet**

```bash
cp /tmp/sweep-dress/sheet-<WINNER>.png docs/images/2026-08-26-texture-family-sweep.png
```

- [ ] **Step 9: Commit**

```bash
git add tools/asset-pipeline/scripts/sweep-texture-family.mjs docs/GARMENT-CATALOGUE-BASELINE.md docs/images/2026-08-26-texture-family-sweep.png && git commit -m "feat(pipeline): sweep the texture-family flags, and record what the crops showed

The design said the freed budget should go to texture quality. On a file that is
10-25x over the 40 MB ceiling on textures alone that may be backwards, so it was
measured rather than assumed. Numbers and the rejected candidates are in
GARMENT-CATALOGUE-BASELINE.md; the deciding contact sheet is in docs/images.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `strategy.ts` — spend the budget on the lever that exists

**Files:**
- Create: `tools/asset-pipeline/src/strategy.ts`
- Test: `tools/asset-pipeline/src/strategy.test.ts`

**Interfaces:**
- Consumes: `GlbFamily` from `./describe` (Task 2); the calibration result from Task 5.
- Produces: `export function refineFlagsForFamily(flags: readonly string[], family: GlbFamily): string[]`. Consumed by `apps/shrink/container/server.ts` (Task 8).

**⚠️ WHY THIS IS NOT A NEW PARAMETER ON `shrinkFlagsFor`.** The design says `shrinkFlagsFor` "gains a second input: the family from Unit 1". It cannot, and the reason is architectural rather than stylistic:

- `shrinkFlagsFor` lives in `packages/shared`, whose lint config **forbids `node:*` imports** (`biome.jsonc` → `overrides` → `noRestrictedImports`). It can never read a file.
- It is called at `apps/shrink/src/index.ts:253`, **inside the Worker**, which has only an R2 key. The file has not been downloaded yet.
- The Container downloads the file at `apps/shrink/container/server.ts` step 1, and imports the pipeline by **relative path** (`../../../tools/asset-pipeline/src/optimize`). It cannot import `packages/shared` at all — `workspace:*` does not resolve inside the Docker image.

So the family decision belongs where the file is: in the Container, using a module in `tools/asset-pipeline/`. `shrinkFlagsFor` keeps its signature and its security property — the Container's own comment records that *"what actually kept this safe was upstream — shrinkFlagsFor returns hardcoded literals chosen by a two-value enum"*. **`refineFlagsForFamily` must preserve that: everything it ADDS is a literal in this file.**

- [ ] **Step 1: Read the calibration winner from Task 5**

```bash
sed -n '/## Texture-family calibration/,/^## /p' docs/GARMENT-CATALOGUE-BASELINE.md
```

The implementation below carries the `D-lessquality` values, which are the candidate the 40 MB ceiling predicts. **If the sweep chose a different candidate, substitute its flag values in `TEXTURE_FAMILY_FLAGS` below.** Only those literals change; the structure does not.

- [ ] **Step 2: Write the failing test**

Create `tools/asset-pipeline/src/strategy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink'
import { refineFlagsForFamily } from './strategy'

const BALANCED = shrinkFlagsFor('balanced')

describe('refineFlagsForFamily', () => {
  it('leaves the GEOMETRY family byte-identical', () => {
    // The design's headline risk mitigation: 12 garments must not move at all.
    // Identity, not equivalence — a reordered array is a different pipeline run.
    expect(refineFlagsForFamily(BALANCED, 'geometry')).toEqual([...BALANCED])
  })

  it('leaves the MIXED family byte-identical too', () => {
    // Mantra Ray Proflex is the only file in this band and has a material at
    // 396x410 UV repeats. Nothing here is calibrated for it; do not guess.
    expect(refineFlagsForFamily(BALANCED, 'mixed')).toEqual([...BALANCED])
  })

  it('drops --simplify and its error budget for the TEXTURE family', () => {
    const out = refineFlagsForFamily(BALANCED, 'texture')
    expect(out).not.toContain('--simplify')
    expect(out).not.toContain('--simplify-error')
    // and neither of their VALUES may survive as a stray positional, which
    // parseOptimizeArgs would read as the input path
    expect(out).not.toContain('0.05')
  })

  it('KEEPS --stitch for the texture family', () => {
    // KINETIC SPLATTER SPORTS BRA is texture-heavy AND 98.5% topstitch. Dropping
    // the stitch budget with the simplify budget would leave 2 M thread triangles.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    expect(out).toContain('--stitch')
    expect(out[out.indexOf('--stitch') + 1]).toBe('0.03')
    expect(out).toContain('--stitch-error')
  })

  it('keeps the geometry codec', () => {
    // --draco DOES NOT LOAD on the deployed viewer. meshopt must survive.
    expect(refineFlagsForFamily(BALANCED, 'texture')).toContain('--meshopt')
    expect(refineFlagsForFamily(BALANCED, 'texture')).not.toContain('--draco')
  })

  it('emits only flags and values, never a bare positional', () => {
    // assertFlagsOnly runs after this in the container. A bare token here would
    // become the INPUT PATH inside parseOptimizeArgs — the /etc/passwd shape
    // recorded in container/server.ts.
    const out = refineFlagsForFamily(BALANCED, 'texture')
    for (let i = 0; i < out.length; i++) {
      const token = out[i]!
      if (token.startsWith('--')) continue
      // a non-flag token is only legal directly after a value-taking flag
      expect(out[i - 1]).toMatch(/^--/)
    }
  })

  it('never returns the array it was given', () => {
    const input = [...BALANCED]
    const out = refineFlagsForFamily(input, 'texture')
    expect(out).not.toBe(input)
    expect(input).toEqual([...BALANCED]) // caller's array untouched
  })

  it('is stable — refining twice changes nothing further', () => {
    const once = refineFlagsForFamily(BALANCED, 'texture')
    expect(refineFlagsForFamily(once, 'texture')).toEqual(once)
  })

  it('handles a flag list that has no simplify pair to remove', () => {
    expect(refineFlagsForFamily(['--meshopt'], 'texture')).toContain('--meshopt')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/strategy.test.ts
```

Expected: FAIL — `Failed to resolve import "./strategy"`.

- [ ] **Step 4: Write the implementation**

Create `tools/asset-pipeline/src/strategy.ts`:

```ts
import type { GlbFamily } from './describe'

/**
 * Choose compression flags for the family a raw export actually belongs to.
 *
 * THE PROBLEM. `shrinkFlagsFor` returns one hardcoded list for every garment, and
 * justifies it with: "Geometry, not texture, is what makes a CLO export huge
 * (measured: textures were 2.1 MB in every variant of the 373 MB export), so
 * `--simplify` and the error budget are the only levers that matter."
 *
 * That was true of the ONE garment it was measured on. Measured 2026-08-26 across
 * all 28 raw exports, it is **false for 15 of them**. On `women athlatic dress`
 * there are 9,980 triangles in total — `--simplify` has nothing to pull — yet the
 * run still spends its budget as though geometry were the cost and then
 * compresses the textures to fit. That is the strongest available explanation for
 * "fabric texture issues" and "graphics not merged with textures".
 *
 * WHERE THIS RUNS, AND WHY NOT IN `shrinkFlagsFor`. The Worker calls
 * `shrinkFlagsFor` before the raw file has been downloaded — it has an R2 key and
 * nothing else — and `packages/shared` is lint-forbidden from importing `node:*`,
 * so it can never read a file. The Container downloads the file and imports this
 * package by relative path. The decision belongs here.
 *
 * ⚠️ EVERYTHING THIS ADDS IS A LITERAL IN THIS FILE. `container/server.ts` records
 * that what kept the flag path safe was "upstream — shrinkFlagsFor returns
 * hardcoded literals chosen by a two-value enum", NOT the filter that looked like
 * it was doing the work. This function is now part of that upstream. It must never
 * interpolate a value, read an environment variable, or pass a caller's token
 * through into a position `parseOptimizeArgs` could read as the input path.
 */

/** Flags removed for the texture family, together with the value each carries. */
const GEOMETRY_ONLY_FLAGS = new Set(['--simplify', '--simplify-error', '--uv-weight'])

/**
 * What the texture family gets instead. HARDCODED, and chosen by the calibration
 * sweep in docs/GARMENT-CATALOGUE-BASELINE.md → "Texture-family calibration" —
 * not by argument, and not by tuning against file size, which is exactly how a
 * setting that protected artwork LESS once shipped as "Smallest file".
 *
 * `--max-texture` and `--quality` come DOWN rather than up. The design suggested
 * spending the freed budget on quality; the sweep showed that is backwards on a
 * file carrying 1 GB of textures against a 40 MB ceiling. Artwork is exempted
 * instead — it keeps its own higher cap and quality, so fabric pays and graphics
 * do not.
 */
const TEXTURE_FAMILY_FLAGS: readonly string[] = [
  '--max-texture',
  '2048',
  '--data-max-texture',
  '1024',
  '--quality',
  '70',
  '--artwork-max-texture',
  '4096',
  '--artwork-quality',
  '95',
]

/** Flags in TEXTURE_FAMILY_FLAGS, so a re-run replaces rather than duplicates them. */
const TEXTURE_FAMILY_KEYS = new Set(
  TEXTURE_FAMILY_FLAGS.filter((token) => token.startsWith('--')),
)

/**
 * Refine a base flag list for one garment's family.
 *
 * `geometry` and `mixed` are returned BYTE-IDENTICAL. That is the design's
 * headline risk mitigation: 12 garments plus Mantra Ray must not move at all, and
 * "identical by construction" is a stronger guarantee than "verified afterwards".
 */
export function refineFlagsForFamily(flags: readonly string[], family: GlbFamily): string[] {
  if (family !== 'texture') return [...flags]

  const kept: string[] = []
  for (let i = 0; i < flags.length; i++) {
    const token = flags[i]!
    // Drop the flag AND the value it carries. Leaving the value behind would
    // strand a bare token that parseOptimizeArgs reads as the input path.
    if (GEOMETRY_ONLY_FLAGS.has(token) || TEXTURE_FAMILY_KEYS.has(token)) {
      i++
      continue
    }
    kept.push(token)
  }
  return [...kept, ...TEXTURE_FAMILY_FLAGS]
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/strategy.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 6: Lint, typecheck, coverage**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline test:coverage
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add tools/asset-pipeline/src/strategy.ts tools/asset-pipeline/src/strategy.test.ts && git commit -m "feat(pipeline): pick compression flags from the family the export belongs to

Geometry and mixed families return byte-identical, so twelve garments cannot
regress by construction. The texture family drops --simplify, which has nothing
to pull on a 9,980-triangle file, and keeps --stitch, which a texture-heavy
98.5%-topstitch garment still needs. Everything added is a literal in this file:
the container's flag path is safe because upstream emits literals, and this is
now part of that upstream.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Fixtures that can exhibit the failures

**Files:**
- Modify: `tools/asset-pipeline/src/placeholders.ts`
- Test: `tools/asset-pipeline/src/placeholders.test.ts` (new file)

**Interfaces:**
- Consumes: `Document` from `@gltf-transform/core`; the existing `buildPlaceholderTee`.
- Produces:
  - `export async function buildCloShapedTee(colourway: PlaceholderColourway): Promise<Document>`
  - `export async function buildTextureHeavyTee(): Promise<Document>`

  Consumed by Tasks 9–13's tests.

**Why this task exists at all.** This is the repo's oldest recurring incident, stated in `CLAUDE.md`: *"Three production bugs in three consecutive sessions were invisible for the same reason: the test fixtures could not exhibit the failure."* Three of the four defects here are invisible today for exactly that reason — `buildPlaceholderTee` sets `.setMetallicFactor(0)` on **every** material (lines 346, 352, 369, 387), which is CORRECT and therefore untestable. Verified 2026-08-26: those four calls are the ONLY `setMetallicFactor` calls in the entire repository.

**The mechanism that makes this seedable.** glTF's default for `metallicFactor` is **1.0**, and gltf-transform's writer omits any property equal to its default. So `.setMetallicFactor(1)` produces JSON with **no `metallicFactor` key at all** — exactly CLO's shape. Step 2 asserts that rather than assuming it.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/placeholders.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { describeGlb } from './describe'
import { createIO } from './io'
import { PLACEHOLDER_COLOURWAYS, buildCloShapedTee, buildTextureHeavyTee } from './placeholders'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fixtures-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('buildCloShapedTee — seeds what CLO actually emits', () => {
  it('writes a fabric material with NO metallicFactor key, the way CLO does', async () => {
    // THE POINT OF THIS FIXTURE. glTF defaults an absent metallicFactor to 1.0.
    // Every existing fixture sets it to 0, correctly, so no test can fail on the
    // metalness defect. This asserts the ABSENCE, not the value — if a future
    // gltf-transform starts writing the key explicitly, this fails loudly rather
    // than quietly making Unit 3 untestable again.
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const io = await createIO()
    const json = io.writeJSON(await io.readBinary(await io.writeBinary(doc)))
    const fabric = json.json.materials?.find((m) => m.name?.includes('CLOFABRIC'))
    expect(fabric).toBeDefined()
    expect(fabric?.pbrMetallicRoughness?.metallicFactor).toBeUndefined()
  })

  it('describeGlb flags that material as a PBR suspect', async () => {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const io = await createIO()
    const file = join(dir, 'clo-shaped.glb')
    await io.write(file, doc)
    const d = await describeGlb(file)
    expect(d.pbrSuspects.map((s) => s.name)).toContain(
      `${PLACEHOLDER_COLOURWAYS[0]!.variantId}-CLOFABRIC`,
    )
  })

  it('seeds the NEGATIVE CONTROL: metallic with a metallicRoughnessTexture', async () => {
    // Without this a classifier can pass by rewriting everything. 3,593 real
    // materials are in this state and must be left alone.
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const io = await createIO()
    const file = join(dir, 'clo-shaped2.glb')
    await io.write(file, doc)
    const d = await describeGlb(file)
    expect(d.pbrSuspects.map((s) => s.name)).not.toContain(
      `${PLACEHOLDER_COLOURWAYS[0]!.variantId}-CLOFABRIC-MR`,
    )
  })

  it('seeds hardware that must stay metal', async () => {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const zip = doc
      .getRoot()
      .listMaterials()
      .find((m) => m.getName().includes('Zipper'))
    expect(zip).toBeDefined()
    expect(zip?.getMetallicFactor()).toBeGreaterThan(0.9)
  })

  it('seeds an unclassified Trim material that must be reported, not fixed', async () => {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const io = await createIO()
    const file = join(dir, 'clo-shaped3.glb')
    await io.write(file, doc)
    const d = await describeGlb(file)
    expect(d.unclassifiedMetallic.map((s) => s.name)).toContain(
      `${PLACEHOLDER_COLOURWAYS[0]!.variantId}-Trim_0091`,
    )
  })

  it('seeds a unit-square decal AND a seam-sharing multi-panel print', async () => {
    // Unit 4's exact discrimination: nudging the first fixes z-fighting, nudging
    // the second tore a skirt open along its seams. Measured on all 28 exports:
    // every decal is exactly 1.0 x 1.0 in UV.
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const names = doc.getRoot().listMaterials().map((m) => m.getName())
    expect(names.some((n) => n.includes('UNITDECAL'))).toBe(true)
    expect(names.some((n) => n.includes('PANELPRINT'))).toBe(true)
  })
})

describe('buildTextureHeavyTee — the shape `women athlatic dress` has', () => {
  it('is classified TEXTURE by describeGlb', async () => {
    // No current fixture resembles a 335 MB / 0.3 MB export, so Unit 2's texture
    // branch has nothing to exercise without this.
    const doc = await buildTextureHeavyTee()
    const io = await createIO()
    const file = join(dir, 'texture-heavy.glb')
    await io.write(file, doc)
    const d = await describeGlb(file)
    expect(d.family).toBe('texture')
    expect(d.triangles).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/placeholders.test.ts
```

Expected: FAIL — `buildCloShapedTee is not exported`.

- [ ] **Step 3: Write the fixtures**

Append to `tools/asset-pipeline/src/placeholders.ts`:

```ts
/**
 * A tee carrying the material shapes a REAL CLO export has, which the tidy
 * placeholder above deliberately does not.
 *
 * WHY THIS IS SEPARATE FROM `buildPlaceholderTee`. That fixture seeds the CORRECT
 * values — `metallic: 0` on every material — and it should keep doing so: it is
 * what the seeding and merge tests assert against. But correct fixtures cannot
 * exhibit an incorrect input, and this repo has shipped three production bugs for
 * exactly that reason (root CLAUDE.md, "The one pattern that keeps causing
 * incidents"). Measured 2026-08-26: the four `setMetallicFactor(0)` calls in this
 * file were the ONLY ones in the repository, so nothing could fail on metalness.
 *
 * Each material below is a shape counted in the 28 raw exports:
 *  - CLOFABRIC     metallicFactor ABSENT (glTF defaults it to 1.0), no MR texture.
 *                  METRO-SHIELD SUIT's `Nylon_Canvas Copy 1_*` x5, at roughness 0.10.
 *  - CLOFABRIC-MR  the same, but WITH an MR texture. The negative control: 3,593
 *                  materials are in this state and the blue channel already
 *                  supplies metalness per pixel, so they must be left alone.
 *                  Without this a classifier passes by rewriting everything.
 *  - Zipper_Slider legitimate hardware. 440 of 515 metallic materials are these.
 *  - Trim_0091     unclassified by owner decision, 2026-08-26. Reported, never fixed.
 *  - UNITDECAL     a small floating decal at exactly 1.0 x 1.0 in UV. Every decal
 *                  in all 28 exports measures exactly that.
 *  - PANELPRINT    a multi-panel print sharing a seam. Offsetting this is what
 *                  tore the skirt open; it must be excluded by construction.
 */
export async function buildCloShapedTee(colourway: PlaceholderColourway): Promise<Document> {
  const document = await buildPlaceholderTee(colourway)

  // metallicFactor 1.0 IS the glTF default, so gltf-transform's writer OMITS the
  // key — which is precisely CLO's shape. Asserted in placeholders.test.ts rather
  // than assumed, because it depends on the writer's default-elision behaviour.
  document
    .createMaterial(`${colourway.variantId}-CLOFABRIC`)
    .setMetallicFactor(1)
    .setRoughnessFactor(0.1)
    .setDoubleSided(true)

  const mrPixels = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 200, b: 0 } },
  })
    .png()
    .toBuffer()
  const mrTexture = document
    .createTexture('mr-map')
    .setImage(new Uint8Array(mrPixels))
    .setMimeType('image/png')
  document
    .createMaterial(`${colourway.variantId}-CLOFABRIC-MR`)
    .setMetallicFactor(1)
    .setRoughnessFactor(0.1)
    .setMetallicRoughnessTexture(mrTexture)

  document
    .createMaterial(`${colourway.variantId}-Zipper 1_Slider_3582`)
    .setMetallicFactor(1)
    .setRoughnessFactor(0.2)

  document
    .createMaterial(`${colourway.variantId}-Trim_0091`)
    .setMetallicFactor(1)
    .setRoughnessFactor(0.1)

  const mesh = document.getRoot().listMeshes()[0]
  if (mesh) {
    const unitDecal = document
      .createMaterial(`${colourway.variantId}-UNITDECAL`)
      .setAlphaMode('BLEND')
      .setMetallicFactor(0)
    // Exactly the unit square, which is what every real decal measures.
    addUvQuad(document, mesh, unitDecal, { u0: 0, v0: 0, u1: 1, v1: 1, z: 0.069 })

    const panelPrint = document
      .createMaterial(`${colourway.variantId}-PANELPRINT`)
      .setAlphaMode('BLEND')
      .setMetallicFactor(0)
    // Two quads meeting at u = 0.5 — a shared seam. Offsetting either one opens
    // a gap along it, which is what happened to the skirt.
    addUvQuad(document, mesh, panelPrint, { u0: 0, v0: 0, u1: 0.5, v1: 1, z: 0.071 })
    addUvQuad(document, mesh, panelPrint, { u0: 0.5, v0: 0, u1: 1, v1: 1, z: 0.071 })
  }

  return document
}

/**
 * A garment shaped like `women athlatic dress`: 335 MB of pictures against 0.3 MB
 * of mesh, 9,980 triangles. Scaled down, but with the same RATIO, which is the
 * only property Unit 2 reads.
 *
 * No existing fixture resembles this. Every one is geometry-first, because every
 * one was built when `shrink.ts`'s "geometry, not texture" comment was believed
 * to hold for the whole catalogue. It holds for 12 of 28.
 */
export async function buildTextureHeavyTee(): Promise<Document> {
  const document = new Document()
  document.createBuffer()

  // A noisy 1024x1024 PNG: genuinely heavy, and it does not collapse to nothing
  // the way a flat fill would.
  const side = 1024
  const raw = Buffer.alloc(side * side * 3)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 256
  const png = await sharp(raw, { raw: { width: side, height: side, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()

  const material = document
    .createMaterial('Cotton_Canvas_2961')
    .setMetallicFactor(0)
    .setRoughnessFactor(0.85)
  material.setBaseColorTexture(
    document.createTexture('fabric').setImage(new Uint8Array(png)).setMimeType('image/png'),
  )

  const mesh = document.createMesh('Cloth_mesh')
  addBoxPrimitive(document, mesh, material, { w: 0.5, h: 0.6, d: 0.1, cx: 0, cy: 0, cz: 0 })
  document.createScene().addChild(document.createNode('root').setMesh(mesh))
  return document
}

/** One flat quad with an explicit UV rectangle, for the decal/panel fixtures. */
function addUvQuad(
  document: Document,
  mesh: Mesh,
  material: Material,
  box: { u0: number; v0: number; u1: number; v1: number; z: number },
): void {
  const buffer = document.getRoot().listBuffers()[0]!
  const x0 = box.u0 - 0.5
  const x1 = box.u1 - 0.5
  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(
      new Float32Array([x0, -0.5, box.z, x1, -0.5, box.z, x1, 0.5, box.z, x0, 0.5, box.z]),
    )
    .setBuffer(buffer)
  const uv = document
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([box.u0, box.v0, box.u1, box.v0, box.u1, box.v1, box.u0, box.v1]))
    .setBuffer(buffer)
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer)
  mesh.addPrimitive(
    document
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(indices)
      .setMaterial(material),
  )
}
```

Add `Mesh` to the existing `@gltf-transform/core` type import at the top of the file if it is not already there.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/placeholders.test.ts
```

Expected: PASS. **If the first test fails because `metallicFactor` IS present in the JSON**, gltf-transform is not eliding the default. Do not delete the assertion — seed the shape by post-processing the written JSON instead, and record the finding in the test's comment.

- [ ] **Step 5: Confirm the EXISTING placeholder tests still pass**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/pipeline.test.ts
```

Expected: PASS. `PLACEHOLDER_PRIMITIVES` is derived from `PLACEHOLDER_ARTWORK.length`, so the new materials must NOT be added to `buildPlaceholderTee` itself — only to the new `buildCloShapedTee` wrapper.

- [ ] **Step 6: Lint, typecheck, full gates**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add tools/asset-pipeline/src/placeholders.ts tools/asset-pipeline/src/placeholders.test.ts && git commit -m "test(pipeline): seed the material shapes CLO actually emits

The four setMetallicFactor(0) calls in placeholders.ts were the only ones in the
repository, and they are correct, so nothing could fail on a metallic fabric.
buildCloShapedTee adds the six shapes counted in the 28 raw exports, including
the negative control that stops a classifier passing by rewriting everything.
buildTextureHeavyTee is the first fixture with more picture than mesh.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Wire family-aware flags into the shrink Container

**Files:**
- Modify: `apps/shrink/container/server.ts`
- Test: asserted through `tools/asset-pipeline/src/strategy.test.ts`. The container has no test file of its own and this task does not add one — it is typechecked separately in CI (Step 4) because it is not a pnpm workspace member, and the logic it gains here is `refineFlagsForFamily`, which is already covered.

**Interfaces:**
- Consumes: `describeGlb` (Task 2), `refineFlagsForFamily` (Task 6).
- Produces: a `family` and `describe` block on the shrink report, so the CMS shows what strategy ran.

**⚠️ This is the ONLY change here that needs a Docker rebuild and a `deploy-shrink` run to reach production.** It adds no npm dependency, so `tools/asset-pipeline/package-lock.json` does not change and `npm ci` cannot break — the trap that cost a deploy on 2026-08-12 is avoided as long as that stays true.

- [ ] **Step 1: Add the imports**

In `apps/shrink/container/server.ts`, beside the existing relative imports:

```ts
import { describeGlb } from '../../../tools/asset-pipeline/src/describe'
import { refineFlagsForFamily } from '../../../tools/asset-pipeline/src/strategy'
```

- [ ] **Step 2: Refine the flags after the download, before parsing them**

Replace this block:

```ts
    const requested = Array.isArray(body.flags) && body.flags.length ? body.flags : DEFAULT_FLAGS
    const flags = requested.filter((flag): flag is string => typeof flag === 'string')
    assertFlagsOnly(flags)
    const { options } = parseOptimizeArgs([rawPath, '--out', outPath, ...flags])
```

with:

```ts
    const requested = Array.isArray(body.flags) && body.flags.length ? body.flags : DEFAULT_FLAGS
    const baseFlags = requested.filter((flag): flag is string => typeof flag === 'string')

    // WHY THE FAMILY IS DECIDED HERE AND NOT IN THE WORKER. shrinkFlagsFor runs in
    // the Worker, which has an R2 key and not the file; and packages/shared is
    // lint-forbidden from importing node:*, so it can never read one. The file
    // first exists on disk at this exact point. describeGlb reads only the JSON
    // chunk, so this costs milliseconds even on a 1.2 GB export.
    //
    // A file this cannot read falls through as 'mixed', which refineFlagsForFamily
    // returns UNCHANGED — a describe failure must never silently change a garment's
    // compression.
    const description = await describeGlb(rawPath)
    const family = description.error ? 'mixed' : description.family
    const flags = refineFlagsForFamily(baseFlags, family)

    // Still enforced, and still the real control: assertFlagsOnly throws on any
    // bare token, and everything refineFlagsForFamily adds is a literal in
    // strategy.ts. See the note above about what actually kept this path safe.
    assertFlagsOnly(flags)
    const { options } = parseOptimizeArgs([rawPath, '--out', outPath, ...flags])
```

- [ ] **Step 3: Put the readout on the report so it is visible in the CMS**

In the `const report = {` object, after `texCoordsInUse`, add:

```ts
      family,
      describe: description.error
        ? { error: description.error }
        : {
            family: description.family,
            textureFraction: Number(description.textureFraction.toFixed(4)),
            triangles: description.triangles,
            stitchFraction: Number(description.stitchFraction.toFixed(4)),
            pbrSuspects: description.pbrSuspects.map((s) => s.name),
            unclassifiedMetallic: description.unclassifiedMetallic.map((s) => s.name),
            colourways: description.colourways.count,
            fullyMapped: description.colourways.fullyMapped,
          },
```

- [ ] **Step 4: Typecheck the container, which is NOT a workspace member**

```bash
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit
```

Expected: exit 0. This is a separate CI step precisely because `pnpm -r` skips this directory.

- [ ] **Step 5: Confirm the second lockfile did NOT change**

```bash
git status --porcelain tools/asset-pipeline/package-lock.json tools/asset-pipeline/package.json
```

Expected: **no output.** If either moved, regenerate the lockfile in isolation before going further:

```bash
cd $(mktemp -d) && cp /Users/hateemjamshaid/Sites/Model-Viewer-main/tools/asset-pipeline/package.json . && npm install --package-lock-only && cp package-lock.json /Users/hateemjamshaid/Sites/Model-Viewer-main/tools/asset-pipeline/
```

- [ ] **Step 6: Run the whole suite**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/shrink/container/server.ts && git commit -m "feat(shrink): decide the compression family where the file actually is

The Worker picks flags before the raw GLB has been downloaded, and
packages/shared cannot import node:* to read one. The container has the file on
disk at step 1, so it describes it there and refines the flags. A describe
failure falls through as mixed, which is returned unchanged — a readout error
must never silently change a garment's compression.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: `pbr-normalize.ts` — cloth is not metal

**Files:**
- Create: `tools/asset-pipeline/src/pbr-normalize.ts`
- Test: `tools/asset-pipeline/src/pbr-normalize.test.ts`

**Interfaces:**
- Consumes: `classifyMaterialName` (Task 1); `buildCloShapedTee` (Task 7).
- Produces:
  - `export interface PbrNormalizeResult { fixed: string[]; unclassified: string[]; hardware: number; skippedWithMrTexture: number }`
  - `export interface PbrNormalizeOptions { minRoughness?: number; onResult?: (r: PbrNormalizeResult) => void }`
  - `export function normalizePbr(options?: PbrNormalizeOptions): Transform`

  Consumed by `buildOptimizeTransforms` (Task 10).

**Scope, verbatim from the design:** materials only. No geometry, no textures, no alpha.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/pbr-normalize.test.ts`:

```ts
import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { type PbrNormalizeResult, normalizePbr } from './pbr-normalize'
import { PLACEHOLDER_COLOURWAYS, buildCloShapedTee } from './placeholders'

async function run(doc: Document): Promise<PbrNormalizeResult> {
  let captured: PbrNormalizeResult | undefined
  await doc.transform(normalizePbr({ onResult: (r) => { captured = r } }))
  if (!captured) throw new Error('normalizePbr did not report')
  return captured
}

describe('normalizePbr', () => {
  it('forces a metallic FABRIC material to metallic 0', async () => {
    const doc = new Document()
    doc.createBuffer()
    const m = doc.createMaterial('Nylon_Canvas Copy 1_5511').setMetallicFactor(1).setRoughnessFactor(0.1)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(0)
    expect(result.fixed).toEqual(['Nylon_Canvas Copy 1_5511'])
  })

  it('raises roughness off a mirror finish, but never lowers it', async () => {
    // METRO-SHIELD's canvas sits at 0.10 — a mirror. Cloth scatters light.
    const doc = new Document()
    doc.createBuffer()
    const mirror = doc.createMaterial('Nylon_Canvas_1').setMetallicFactor(1).setRoughnessFactor(0.1)
    const matte = doc.createMaterial('Cotton_Canvas_2').setMetallicFactor(1).setRoughnessFactor(0.95)
    await run(doc)
    expect(mirror.getRoughnessFactor()).toBeGreaterThanOrEqual(0.5)
    expect(matte.getRoughnessFactor()).toBe(0.95) // untouched — already rougher
  })

  it('LEAVES a material that carries a metallicRoughnessTexture', async () => {
    // The load-bearing check. Its BLUE channel supplies metalness per pixel and
    // overrides the factor entirely. 3,593 materials are in this state; counting
    // them is what produced a false "hundreds of materials" figure.
    const doc = new Document()
    doc.createBuffer()
    const tex = doc.createTexture('mr').setImage(new Uint8Array([0])).setMimeType('image/png')
    const m = doc
      .createMaterial('Nylon_Canvas Copy 1_5511')
      .setMetallicFactor(1)
      .setRoughnessFactor(0.1)
      .setMetallicRoughnessTexture(tex)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(1)
    expect(result.fixed).toEqual([])
    expect(result.skippedWithMrTexture).toBe(1)
  })

  it('LEAVES hardware metal', async () => {
    const doc = new Document()
    doc.createBuffer()
    const zip = doc.createMaterial('Zipper 1_Slider_3582').setMetallicFactor(1).setRoughnessFactor(0.2)
    const result = await run(doc)
    expect(zip.getMetallicFactor()).toBe(1)
    expect(zip.getRoughnessFactor()).toBe(0.2)
    expect(result.hardware).toBe(1)
  })

  it('REPORTS an unclassified material and does not touch it', async () => {
    // Owner decision 2026-08-26. The 20 Trim_* materials could be metal trim or
    // fabric binding; nobody could say from the name, so nothing guesses.
    const doc = new Document()
    doc.createBuffer()
    const trim = doc.createMaterial('Trim_0091').setMetallicFactor(1).setRoughnessFactor(0.1)
    const result = await run(doc)
    expect(trim.getMetallicFactor()).toBe(1)
    expect(trim.getRoughnessFactor()).toBe(0.1)
    expect(result.unclassified).toEqual(['Trim_0091'])
    expect(result.fixed).toEqual([])
  })

  it('leaves fabric that is already correct completely alone', async () => {
    const doc = new Document()
    doc.createBuffer()
    const m = doc.createMaterial('Cotton_Canvas_2961').setMetallicFactor(0).setRoughnessFactor(0.85)
    const result = await run(doc)
    expect(m.getMetallicFactor()).toBe(0)
    expect(m.getRoughnessFactor()).toBe(0.85)
    expect(result.fixed).toEqual([])
  })

  it('fixes the four measured offenders at their real values', async () => {
    // Straight from the design's table. Names and factors are verbatim.
    const doc = new Document()
    doc.createBuffer()
    const cases: [string, number, number][] = [
      ['Nylon_Canvas Copy 1_5511', 1, 0.1], // metallicFactor ABSENT -> 1.0
      ['FABRIC 2_3169', 0.46, 0.84],
      ['Cotton_Canvas_2961', 0.23, 0.27],
      ['FABRIC 1_7712', 0.29, 0.24],
    ]
    const made = cases.map(([n, m, r]) =>
      doc.createMaterial(n).setMetallicFactor(m).setRoughnessFactor(r),
    )
    const result = await run(doc)
    for (const m of made) expect(m.getMetallicFactor()).toBe(0)
    expect(result.fixed).toHaveLength(4)
  })

  it('touches NOTHING but metalness and roughness', async () => {
    // Scope guard: materials only. No geometry, no textures, no alpha.
    const doc = new Document()
    doc.createBuffer()
    const tex = doc.createTexture('base').setImage(new Uint8Array([0])).setMimeType('image/png')
    const m = doc
      .createMaterial('Cotton_Canvas_1')
      .setMetallicFactor(1)
      .setAlphaMode('BLEND')
      .setDoubleSided(true)
      .setBaseColorTexture(tex)
    await run(doc)
    expect(m.getAlphaMode()).toBe('BLEND')
    expect(m.getDoubleSided()).toBe(true)
    expect(m.getBaseColorTexture()).toBe(tex)
  })

  it('works on the CLO-shaped fixture end to end', async () => {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const id = PLACEHOLDER_COLOURWAYS[0]!.variantId
    const result = await run(doc)
    expect(result.fixed).toContain(`${id}-CLOFABRIC`)
    expect(result.fixed).not.toContain(`${id}-CLOFABRIC-MR`)
    expect(result.unclassified).toContain(`${id}-Trim_0091`)
    const zip = doc.getRoot().listMaterials().find((m) => m.getName().includes('Zipper'))
    expect(zip?.getMetallicFactor()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/pbr-normalize.test.ts
```

Expected: FAIL — `Failed to resolve import "./pbr-normalize"`.

- [ ] **Step 3: Write the implementation**

Create `tools/asset-pipeline/src/pbr-normalize.ts`:

```ts
import { type Document, type Transform, createTransform } from '@gltf-transform/core'
import { classifyMaterialName } from './material-class'

/**
 * Stop cloth rendering as metal.
 *
 * THE DEFECT. glTF defaults an absent `metallicFactor` to **1.0**. CLO omits it on
 * some fabric materials, so the format says "fully metal" and <model-viewer>
 * renders a shirt as a mirror. METRO-SHIELD SUIT's `Nylon_Canvas Copy 1_*` is
 * absent-metalness at roughness **0.10**.
 *
 * THE NUMBER IS 35, NOT HUNDREDS, AND THE DIFFERENCE IS THIS ONE CHECK. Measured
 * 2026-08-26 across all 28 exports: 3,593 materials are metallic-by-omission AND
 * carry a `metallicRoughnessTexture`, whose BLUE channel supplies metalness per
 * pixel and overrides the factor entirely — and those textures are real, from
 * 236x39 up to 8192x8192, not 1x1 dummies. Of the 515 with nothing to override
 * them, **440 are legitimate hardware**. The genuine offenders are 55 fabric
 * materials across 4 garments. An earlier reading counted all of them and was
 * wrong by two orders of magnitude.
 *
 * WHY NO TEST COULD FAIL ON THIS BEFORE. The only `setMetallicFactor` calls in the
 * repository were four in `placeholders.ts`, all seeding `metallic: 0` — correct,
 * and therefore incapable of exhibiting the defect. That is the repo's own
 * recurring pattern; `buildCloShapedTee` exists to break it.
 *
 * CLASSIFY ON THE MATERIAL NAME, NEVER THE TEXTURE NAME. 0 of 5,048 images in the
 * 28 exports carry a name or URI. A texture-name classifier is silently inert.
 *
 * THREE BUCKETS, AND THE THIRD IS AN OUTPUT. `hardware` is left alone. `fabric` is
 * fixed. `unclassified` is REPORTED and never rewritten — owner decision
 * 2026-08-26 on the 20 `Trim_*` materials, which could be metal trim or fabric
 * binding and which nobody could tell apart from the name.
 */

/** Metalness at or below this is already fine; nothing is rewritten. */
const METALLIC_SUSPECT_MIN = 0.1

/**
 * Roughness floor applied when a fabric material is fixed.
 *
 * Cloth scatters light; 0.10 is a mirror. This RAISES a too-low value and never
 * lowers a high one, so a matte fabric that happens to be metallic keeps its own
 * roughness. 0.5 is deliberately conservative — it removes the mirror without
 * asserting what the fabric's real finish is, which only a rendered crop can say.
 */
const DEFAULT_MIN_ROUGHNESS = 0.5

export interface PbrNormalizeResult {
  /** Material names forced to metallic 0. */
  fixed: string[]
  /** Metallic, no MR texture, name not classifiable. Reported; NEVER rewritten. */
  unclassified: string[]
  /** Materials left metal because their name says hardware. */
  hardware: number
  /** Materials left alone because an MR texture already supplies metalness. */
  skippedWithMrTexture: number
}

export interface PbrNormalizeOptions {
  /** Roughness floor for a fixed fabric material. Default 0.5. */
  minRoughness?: number
  onResult?: (result: PbrNormalizeResult) => void
}

export function normalizePbr(options: PbrNormalizeOptions = {}): Transform {
  const minRoughness = options.minRoughness ?? DEFAULT_MIN_ROUGHNESS

  return createTransform('normalizePbr', async (document: Document): Promise<void> => {
    const result: PbrNormalizeResult = {
      fixed: [],
      unclassified: [],
      hardware: 0,
      skippedWithMrTexture: 0,
    }

    for (const material of document.getRoot().listMaterials()) {
      if (material.getMetallicFactor() <= METALLIC_SUSPECT_MIN) continue

      // THE LOAD-BEARING CHECK — see the header. A material with an MR texture is
      // not a defect however high its factor reads, and rewriting it would
      // override real per-pixel data with a constant.
      if (material.getMetallicRoughnessTexture()) {
        result.skippedWithMrTexture++
        continue
      }

      const name = material.getName() || ''
      const bucket = classifyMaterialName(name)

      if (bucket === 'hardware') {
        result.hardware++
        continue
      }
      if (bucket === 'unclassified') {
        result.unclassified.push(name)
        continue
      }

      material.setMetallicFactor(0)
      // Raise only. A fabric already rougher than the floor knows better than
      // this constant does.
      if (material.getRoughnessFactor() < minRoughness) {
        material.setRoughnessFactor(minRoughness)
      }
      result.fixed.push(name)
    }

    options.onResult?.(result)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/pbr-normalize.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add tools/asset-pipeline/src/pbr-normalize.ts tools/asset-pipeline/src/pbr-normalize.test.ts && git commit -m "feat(pipeline): force fabric off metal, and leave the 440 zippers alone

glTF defaults an absent metallicFactor to 1.0 and CLO omits it, so METRO-SHIELD's
canvas renders as a mirror at roughness 0.10. Only rewrites a material that is
metallic AND has no metallicRoughnessTexture: 3,593 materials carry one whose
blue channel already supplies metalness per pixel, and counting those is what
turned 35 real defects into a false 'hundreds'. Trim is reported, never guessed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Wire `normalizePbr` into the pipeline

**Files:**
- Modify: `tools/asset-pipeline/src/optimize.ts`
- Test: `tools/asset-pipeline/src/pipeline.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `normalizePbr`, `PbrNormalizeResult` (Task 9).
- Produces: `OptimizeOptions.normalizePbr?: boolean`, `OptimizeTelemetry.pbr?: PbrNormalizeResult`, and the `--no-pbr-normalize` opt-out flag.

**Default ON, with an opt-out.** Every one of the 55 offenders is a defect; the risk of the fix is misclassification, which the hardware list and the MR-texture check already bound. The opt-out exists because a garment with genuine metallic fabric (lamé, foil print) should be shippable without editing code.

- [ ] **Step 1: Add the option to `OptimizeOptions`**

In `tools/asset-pipeline/src/optimize.ts`, inside `export interface OptimizeOptions`, after `opaque`:

```ts
  /**
   * Force fabric and artwork materials off metal. On unless set to false.
   *
   * glTF defaults an absent `metallicFactor` to 1.0; CLO omits it on some fabric,
   * which renders a shirt as a mirror. Measured across the 28 raw exports: 35
   * genuine offenders on 4 garments, against 440 legitimate hardware materials
   * that must stay metal and 3,593 that carry a metallicRoughnessTexture and are
   * already correct per-pixel. See pbr-normalize.ts.
   *
   * Opt out (`--no-pbr-normalize`) for a garment with genuinely metallic fabric —
   * lamé, foil print. Nothing in the catalogue needed that as of 2026-08-26.
   */
  normalizePbr?: boolean
```

- [ ] **Step 2: Add the telemetry field**

In `export interface OptimizeTelemetry`:

```ts
  /** What normalizePbr changed, left alone, and could not classify. */
  pbr?: PbrNormalizeResult
```

and add to the imports at the top:

```ts
import { type PbrNormalizeResult, normalizePbr } from './pbr-normalize'
```

- [ ] **Step 3: Push the transform, BEFORE the alpha and texture passes**

In `buildOptimizeTransforms`, immediately after the `dedup()` / `prune()` line and **before** the `options.opaque === true` block:

```ts
  // Metalness first: it is a pure material edit that nothing downstream reads, and
  // running it before solidifyMaterials keeps the two decisions independent —
  // one reads alpha, this one reads metalness, and neither should see the other's
  // output. Default ON; `--no-pbr-normalize` is the opt-out.
  if (options.normalizePbr !== false) {
    transforms.push(
      normalizePbr({
        onResult: (result) => {
          telemetry.pbr = result
        },
      }),
    )
  }
```

- [ ] **Step 4: Add the CLI flag**

In `parseOptimizeArgs`, beside the existing `--no-opaque` branch:

```ts
    else if (arg === '--no-pbr-normalize') normalizePbrOption = false
```

Declare `let normalizePbrOption: boolean | undefined` with the other locals, and add it to the returned options object as `normalizePbr: normalizePbrOption`.

⚠️ **`normalizePbr` must be `boolean | undefined`, not `boolean`.** `exactOptionalPropertyTypes` is on in this package's `tsconfig.json`, and this options object is built from parsed args and passed through unconditionally — the same shape that made the four `simplify*` fields need `| undefined`.

⚠️ **Do NOT add `--no-pbr-normalize` to `VALUE_TAKING_FLAGS`.** It takes no value.

- [ ] **Step 5: Report it in the CLI output**

In `cli.ts`'s `optimize` branch, beside where solidify telemetry is printed, add:

```ts
    if (telemetry.pbr) {
      const { fixed, unclassified, hardware, skippedWithMrTexture } = telemetry.pbr
      console.log(
        `  metalness:  ${fixed.length} fabric forced to 0, ${hardware} hardware kept metal, ` +
          `${skippedWithMrTexture} already per-pixel`,
      )
      if (unclassified.length) {
        console.log(`  UNCLASSIFIED (reported, not changed): ${unclassified.join(', ')}`)
      }
    }
```

- [ ] **Step 6: Add the integration test**

Append to `tools/asset-pipeline/src/pipeline.test.ts`:

```ts
describe('normalizePbr through the real pipeline', () => {
  it('fixes the CLO-shaped fabric and leaves hardware, MR-textured and Trim alone', async () => {
    // Through optimizeGlb, not the transform in isolation: the container calls
    // parseOptimizeArgs -> optimizeGlb, and `opaque` already defaults DIFFERENTLY
    // on those two paths once (root CLAUDE.md). A unit test on the transform
    // cannot see a wiring mistake of that shape.
    const dir = await mkdtemp(join(tmpdir(), 'pbr-'))
    try {
      const io = await createIO()
      const src = join(dir, 'in.glb')
      const out = join(dir, 'out.glb')
      await io.write(src, await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!))
      const { options } = parseOptimizeArgs([src, '--out', out])
      await optimizeGlb(src, out, options)

      const d = await describeGlb(out)
      expect(d.pbrSuspects).toEqual([])
      const doc = await io.read(out)
      const byName = (needle: string) =>
        doc.getRoot().listMaterials().find((m) => m.getName().includes(needle))
      expect(byName('Zipper')?.getMetallicFactor()).toBe(1)
      expect(byName('Trim_0091')?.getMetallicFactor()).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('--no-pbr-normalize leaves the metallic fabric exactly as CLO exported it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pbr-off-'))
    try {
      const io = await createIO()
      const src = join(dir, 'in.glb')
      const out = join(dir, 'out.glb')
      await io.write(src, await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!))
      const { options } = parseOptimizeArgs([src, '--out', out, '--no-pbr-normalize'])
      await optimizeGlb(src, out, options)
      const d = await describeGlb(out)
      expect(d.pbrSuspects.length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

Add `buildCloShapedTee` to the existing `./placeholders` import and `describeGlb` from `./describe`.

- [ ] **Step 7: Run the gates**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add tools/asset-pipeline/src/optimize.ts tools/asset-pipeline/src/cli.ts tools/asset-pipeline/src/pipeline.test.ts && git commit -m "feat(pipeline): run the metalness fix by default, with an opt-out

Runs before solidifyMaterials so the two decisions stay independent: one reads
alpha, the other metalness. Tested through optimizeGlb rather than on the
transform alone, because a wiring mistake between parseOptimizeArgs and
optimizeGlb is exactly what shipped decals on BLEND once and a unit test on the
transform cannot see it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Unit 4a — measure stroke width, and stop MASKing what MASK would destroy

**Files:**
- Modify: `tools/asset-pipeline/src/textures.ts` (add `measureStrokeWidth`)
- Modify: `tools/asset-pipeline/src/optimize.ts` (`solidifyMaterials` consults it)
- Test: `tools/asset-pipeline/src/textures.test.ts`, `tools/asset-pipeline/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `profileAlpha`'s existing sharp decode path.
- Produces:
  - `export interface StrokeProfile { meanWidthPx: number; opaquePixels: number; edgePixels: number }`
  - `export async function measureStrokeWidth(buffer: Uint8Array): Promise<StrokeProfile>`
  - `OptimizeOptions.thinStrokeAction?: 'report' | 'keep-blend'` — **default `'report'`**
  - `SolidifyResult.thinStroke: string[]`

**⚠️ READ THIS BEFORE IMPLEMENTING — a real constraint the design does not spell out.**

`findArtworkAlphaProblems` (`texture-artwork.ts:249`) treats an artwork material as a problem in **both** directions: `BLEND` is `problem: 'blend'`, and `MASK` with `alphaCutoff !== 0.5` is `problem: 'cutoff'`. Verified 2026-08-26: these become `warnings` in `inspectGlb` (`validate.ts:217-225`) — they do **not** throw; `pipeline validate --strict` is what turns a warning into a failure.

So artwork is pinned to exactly `MASK @ 0.5`, and there is no third alphaMode that avoids a warning. Both honest fixes for a 1.5 px stroke — keep BLEND, or lower the cutoff — produce one.

**The decision, and why.** `thinStrokeAction` defaults to `'report'`: the pipeline MEASURES which materials MASK would damage, reports them, and **changes nothing**. Turning on `'keep-blend'` is a judgement that trades a sorting artefact for stroke fidelity, and this repo's most expensive lesson is that only a rendered crop can make that call. Task 14's regression run is where it gets made. The code ships in this branch; the pixel change does not ship unmeasured.

- [ ] **Step 1: Write the failing test for the measurement**

Append to `tools/asset-pipeline/src/textures.test.ts`:

```ts
describe('measureStrokeWidth', () => {
  /** A horizontal bar `w` px thick on a transparent field. Mean width should be ~w. */
  async function bar(widthPx: number, size = 128): Promise<Uint8Array> {
    const raw = Buffer.alloc(size * size * 4, 0)
    const top = Math.floor((size - widthPx) / 2)
    for (let y = top; y < top + widthPx; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255
      }
    }
    const png = await sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
    return new Uint8Array(png)
  }

  it('measures a thick bar as thick', async () => {
    const p = await measureStrokeWidth(await bar(20))
    expect(p.meanWidthPx).toBeGreaterThan(10)
  })

  it('measures a 2px bar as thin', async () => {
    // A 1.5px slogan stroke is what MASK at 0.5 destroys. This is that shape.
    const p = await measureStrokeWidth(await bar(2))
    expect(p.meanWidthPx).toBeLessThan(4)
  })

  it('separates the two by a wide margin, so a threshold is not knife-edge', async () => {
    const thin = await measureStrokeWidth(await bar(2))
    const thick = await measureStrokeWidth(await bar(20))
    expect(thick.meanWidthPx / thin.meanWidthPx).toBeGreaterThan(3)
  })

  it('returns zero width for a fully transparent image rather than dividing by zero', async () => {
    const raw = Buffer.alloc(64 * 64 * 4, 0)
    const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer()
    const p = await measureStrokeWidth(new Uint8Array(png))
    expect(p.meanWidthPx).toBe(0)
    expect(p.opaquePixels).toBe(0)
  })

  it('returns zero width for an image with no alpha channel', async () => {
    const raw = Buffer.alloc(64 * 64 * 3, 200)
    const png = await sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()
    const p = await measureStrokeWidth(new Uint8Array(png))
    expect(p.meanWidthPx).toBe(0)
  })

  it('does not throw on an undecodable buffer', async () => {
    const p = await measureStrokeWidth(new Uint8Array([1, 2, 3, 4]))
    expect(p.meanWidthPx).toBe(0)
  })
})
```

Add `measureStrokeWidth` to the existing `./textures` import in that file.

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/textures.test.ts -t measureStrokeWidth
```

Expected: FAIL — `measureStrokeWidth is not a function`.

- [ ] **Step 3: Implement the measurement**

Append to `tools/asset-pipeline/src/textures.ts`:

```ts
/** What `measureStrokeWidth` found in one texture's alpha channel. */
export interface StrokeProfile {
  /** Mean stroke thickness in pixels. 0 when there is no alpha or nothing opaque. */
  meanWidthPx: number
  opaquePixels: number
  edgePixels: number
}

/** Alpha at or above this counts as "part of the mark" for stroke measurement. */
const STROKE_ALPHA_MIN = 128

/**
 * How thick, in pixels, the opaque strokes in this texture's alpha channel are.
 *
 * WHY IT MATTERS. `solidifyMaterials` resolves a hard cutout to MASK with
 * alphaCutoff 0.5. That is right for a bold wordmark and wrong for a 1.5 px
 * slogan stroke: after resampling and WebP the stroke's own peak alpha may sit
 * near 0.6 and fall away at its edges, so a 0.5 cutoff keeps only the centre and
 * the lettering thins or breaks apart. One global threshold cannot serve both,
 * which is why this is measured per material.
 *
 * THE METHOD, AND WHY THIS ONE. Mean stroke width is `2 x area / perimeter`. For a
 * stroke of width w and length L that is `2wL / 2L = w` exactly; for a disc of
 * radius r it gives r. Both are the number wanted. It needs one pass over the
 * alpha channel and no morphology, so it costs about what `profileAlpha` already
 * costs and adds no dependency — `sharp` has no erode, and adding an image
 * library here would desynchronise tools/asset-pipeline/package-lock.json, which
 * the Docker build reads with `npm ci`.
 *
 * Perimeter is counted with 4-connectivity: an opaque pixel with at least one
 * non-opaque orthogonal neighbour. Image borders count as non-opaque, so a mark
 * running off the edge is not measured as infinitely wide.
 *
 * Returns zeros rather than throwing — an undecodable texture is absence of
 * evidence, and N8 (2026-08-18) records what happens when zeros from a failed
 * decode get read as a measurement instead.
 */
export async function measureStrokeWidth(buffer: Uint8Array): Promise<StrokeProfile> {
  const empty: StrokeProfile = { meanWidthPx: 0, opaquePixels: 0, edgePixels: 0 }
  try {
    const image = sharp(Buffer.from(buffer))
    const meta = await image.metadata()
    if (!meta.hasAlpha || !meta.width || !meta.height) return empty

    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width, height, channels } = info
    const alphaAt = (x: number, y: number): number =>
      data[(y * width + x) * channels + (channels - 1)] ?? 0
    const solid = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < width && y < height && alphaAt(x, y) >= STROKE_ALPHA_MIN

    let opaquePixels = 0
    let edgePixels = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!solid(x, y)) continue
        opaquePixels++
        if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
          edgePixels++
        }
      }
    }
    if (opaquePixels === 0 || edgePixels === 0) return { ...empty, opaquePixels, edgePixels }
    return { meanWidthPx: (2 * opaquePixels) / edgePixels, opaquePixels, edgePixels }
  } catch {
    return empty
  }
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/textures.test.ts -t measureStrokeWidth
```

Expected: PASS.

- [ ] **Step 5: Consult it in `solidifyMaterials`**

In `tools/asset-pipeline/src/optimize.ts`, add to `SolidifyResult`:

```ts
  /**
   * Materials whose cutout WOULD have been MASKed but whose strokes are too thin
   * to survive alphaCutoff 0.5. Reported by default; only acted on when
   * `thinStrokeAction: 'keep-blend'`. See MIN_MASK_STROKE_PX.
   */
  thinStroke: string[]
```

Add the constant beside `OPAQUE_FACTOR_THRESHOLD`:

```ts
/**
 * Below this mean stroke width, alphaCutoff 0.5 eats the lettering.
 *
 * 3 px is one pixel of falloff either side of a surviving core. A 1.5 px slogan
 * stroke — the shape that motivated this — measures well under it, and a bold
 * wordmark measures far above, so the threshold is not knife-edge. It is a
 * REPORTING threshold by default; changing behaviour on it is a rendered-crop
 * decision, not an arithmetic one.
 */
const MIN_MASK_STROKE_PX = 3
```

Change `solidifyMaterials`'s signature to accept the action, defaulting to report-only:

```ts
export async function solidifyMaterials(
  document: Document,
  thinStrokeAction: 'report' | 'keep-blend' = 'report',
): Promise<SolidifyResult> {
```

Initialise `thinStroke: []` in the result object, and inside the `if (cutout)` path — immediately before the material is set to MASK — insert:

```ts
      if (cutout && image) {
        const stroke = await measureStrokeWidth(image.getImage() ?? new Uint8Array())
        // meanWidthPx 0 means "could not measure", NOT "infinitely thin". Treating
        // absence of evidence as evidence is exactly the N8 mistake above.
        if (stroke.meanWidthPx > 0 && stroke.meanWidthPx < MIN_MASK_STROKE_PX) {
          result.thinStroke.push(material.getName() || '(unnamed material)')
          if (thinStrokeAction === 'keep-blend') {
            result.keptBlend++
            continue
          }
        }
      }
```

⚠️ `image` here is already the `Uint8Array` fetched above for `profileAlpha` — reuse it rather than fetching the texture twice; the existing line is `const image = material.getBaseColorTexture()?.getImage()`, so pass `image` directly to `measureStrokeWidth`.

Add `measureStrokeWidth` to the existing `./textures` import in `optimize.ts`.

- [ ] **Step 6: Thread the option through**

Add to `OptimizeOptions`:

```ts
  /**
   * What to do with a cutout whose strokes are too thin for alphaCutoff 0.5.
   * 'report' (default) measures and reports, changing nothing. 'keep-blend'
   * leaves it BLEND, trading a sorting artefact for stroke fidelity — a
   * rendered-crop decision, which is why it is not the default.
   */
  thinStrokeAction?: 'report' | 'keep-blend' | undefined
```

In `buildOptimizeTransforms`, pass it: `await solidifyMaterials(document, options.thinStrokeAction ?? 'report')`.

In `parseOptimizeArgs`, add `--keep-thin-strokes` setting it to `'keep-blend'`. It takes no value, so do **not** add it to `VALUE_TAKING_FLAGS`.

- [ ] **Step 7: Report it in the CLI**

In `cli.ts`'s optimize output, beside the solidify line:

```ts
    if (telemetry.solidify?.thinStroke.length) {
      console.log(
        `  THIN STROKES: ${telemetry.solidify.thinStroke.join(', ')} — alphaCutoff 0.5 will thin ` +
          'this lettering. Re-run with --keep-thin-strokes and compare the crops before deciding.',
      )
    }
```

- [ ] **Step 8: Add the integration test**

Append to `tools/asset-pipeline/src/pipeline.test.ts`:

```ts
describe('thin-stroke detection', () => {
  it('reports a thin-stroke cutout by default and still MASKs it', async () => {
    // Report-only is the DEFAULT on purpose: leaving artwork on BLEND is a real
    // trade (model-viewer has no OIT) and only a rendered crop can make it.
    const doc = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const result = await solidifyMaterials(doc)
    expect(Array.isArray(result.thinStroke)).toBe(true)
    // Whatever it found, nothing was left on BLEND because of it.
    const blendAfter = doc.getRoot().listMaterials().filter((m) => m.getAlphaMode() === 'BLEND')
    expect(blendAfter.length).toBe(result.keptBlend)
  })

  it('keep-blend actually keeps a thin-stroke material on BLEND', async () => {
    const doc = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const reported = (await solidifyMaterials(doc, 'report')).thinStroke
    const doc2 = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
    const acted = await solidifyMaterials(doc2, 'keep-blend')
    expect(acted.thinStroke).toEqual(reported)
    if (reported.length > 0) expect(acted.masked).toBeLessThan((await solidifyMaterials(await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!), 'report')).masked)
  })
})
```

- [ ] **Step 9: Gates and commit**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

```bash
git add tools/asset-pipeline/src/textures.ts tools/asset-pipeline/src/optimize.ts tools/asset-pipeline/src/cli.ts tools/asset-pipeline/src/textures.test.ts tools/asset-pipeline/src/pipeline.test.ts && git commit -m "feat(pipeline): measure stroke width, and report what MASK would destroy

alphaCutoff 0.5 is right for a bold wordmark and eats a 1.5px slogan stroke.
Mean width is 2*area/perimeter over the alpha channel — one pass, no morphology,
no new dependency, because a new dependency here desynchronises the lockfile the
Docker build reads with npm ci. Defaults to REPORT: leaving artwork on BLEND
trades a sorting artefact for stroke fidelity, and only a crop can make that call.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Unit 4b — offset only what is safe to offset

**Files:**
- Create: `tools/asset-pipeline/src/decal-offset.ts`
- Test: `tools/asset-pipeline/src/decal-offset.test.ts`

**Interfaces:**
- Consumes: `Document`, `Primitive` from `@gltf-transform/core`; `isArtworkMaterialByName` from `./texture-artwork`.
- Produces:
  - `export interface DecalOffsetResult { offset: string[]; skippedNotUnitSquare: string[]; skippedSeamSharing: string[]; skippedTooLarge: string[] }`
  - `export function offsetDecals(options?: { distance?: number; onResult?: (r: DecalOffsetResult) => void }): Transform`

**The exact failure this must not repeat.** Nudging a small floating logo off the cloth fixes z-fighting. The same nudge applied indiscriminately **tore multi-panel skirt prints open along their seams** — two panels that shared an edge moved apart and left a gap. Three conditions, all required:

1. **Unit-square in UV.** Measured across all 28 exports: **every decal is exactly `1.0 × 1.0`** in `TEXCOORD_0` min/max. A full-panel print is not.
2. **Small in world space** relative to the garment.
3. **Not seam-sharing** — no vertex position shared with a primitive using a different material.

Condition 3 is what makes 1 and 2 safe, and it is the one the reverted attempt did not have.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/decal-offset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { type DecalOffsetResult, offsetDecals } from './decal-offset'
import { PLACEHOLDER_COLOURWAYS, buildCloShapedTee } from './placeholders'

async function run(): Promise<{ result: DecalOffsetResult; id: string }> {
  const id = PLACEHOLDER_COLOURWAYS[0]!.variantId
  const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
  let captured: DecalOffsetResult | undefined
  await doc.transform(offsetDecals({ onResult: (r) => { captured = r } }))
  if (!captured) throw new Error('offsetDecals did not report')
  return { result: captured, id }
}

describe('offsetDecals', () => {
  it('offsets a unit-square floating decal', async () => {
    const { result, id } = await run()
    expect(result.offset).toContain(`${id}-UNITDECAL`)
  })

  it('does NOT offset a seam-sharing multi-panel print', async () => {
    // THE SKIRT. Two panels meeting at u = 0.5 share an edge; moving either opens
    // a gap along it. This is the exact failure the reverted attempt produced.
    const { result, id } = await run()
    expect(result.offset).not.toContain(`${id}-PANELPRINT`)
    expect(result.skippedSeamSharing).toContain(`${id}-PANELPRINT`)
  })

  it('does NOT offset fabric', async () => {
    const { result, id } = await run()
    expect(result.offset).not.toContain(`${id}-BODY`)
  })

  it('actually moves the vertices it reports moving', async () => {
    const id = PLACEHOLDER_COLOURWAYS[0]!.variantId
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    const before = doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .find((p) => p.getMaterial()?.getName() === `${id}-UNITDECAL`)
      ?.getAttribute('POSITION')
      ?.getArray()
      ?.slice()
    await doc.transform(offsetDecals())
    const after = doc
      .getRoot()
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .find((p) => p.getMaterial()?.getName() === `${id}-UNITDECAL`)
      ?.getAttribute('POSITION')
      ?.getArray()
    expect(before).toBeDefined()
    expect(after).toBeDefined()
    expect(Array.from(after!)).not.toEqual(Array.from(before!))
  })

  it('is idempotent in direction — a second run does not double the offset', async () => {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    await doc.transform(offsetDecals())
    const once = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
      .find((p) => p.getMaterial()?.getName().includes('UNITDECAL'))
      ?.getAttribute('POSITION')?.getArray()?.slice()
    await doc.transform(offsetDecals())
    const twice = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
      .find((p) => p.getMaterial()?.getName().includes('UNITDECAL'))
      ?.getAttribute('POSITION')?.getArray()
    // Running the pipeline on its own output is forbidden anyway; this asserts the
    // transform does not compound if it ever happens.
    expect(Array.from(twice!)).toEqual(Array.from(once!))
  })

  it('reports a primitive with no TEXCOORD_0 rather than guessing', async () => {
    const { result } = await run()
    expect(Array.isArray(result.skippedNotUnitSquare)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/decal-offset.test.ts
```

Expected: FAIL — `Failed to resolve import "./decal-offset"`.

- [ ] **Step 3: Implement**

Create `tools/asset-pipeline/src/decal-offset.ts`:

```ts
import { type Document, type Primitive, type Transform, createTransform } from '@gltf-transform/core'
import { isArtworkMaterialByName } from './texture-artwork'

/**
 * Nudge small floating decals off the cloth, and NOTHING else.
 *
 * THE BUG THIS FIXES. A printed decal sits coplanar with the garment surface.
 * With no depth bias the two z-fight, which reads as speckling across the logo.
 *
 * THE BUG THIS MUST NOT CAUSE, WHICH IT ALREADY CAUSED ONCE. The same nudge
 * applied to every artwork primitive tore multi-panel skirt prints open along
 * their seams: two panels sharing an edge moved apart and left a visible gap. The
 * technique was not wrong; applying it indiscriminately was.
 *
 * THREE CONDITIONS, ALL REQUIRED.
 *  1. UNIT-SQUARE IN UV. Measured 2026-08-26 across all 28 raw exports: every
 *     decal spans exactly 1.0 x 1.0 in TEXCOORD_0, because CLO gives each its own
 *     local map. A full-panel print does not. This alone excludes the skirt case
 *     by construction.
 *  2. SMALL IN WORLD SPACE, relative to the document's own bounds — so a
 *     garment-sized quad that happens to be unit-square in UV is still refused.
 *  3. NOT SEAM-SHARING: no vertex position shared with a primitive that uses a
 *     DIFFERENT material. This is the condition the reverted attempt lacked, and
 *     it is what makes 1 and 2 safe rather than merely likely.
 *
 * Offsets along the primitive's own averaged normal, not along a world axis: a
 * decal on a sleeve does not face the same way as one on the chest.
 */

/** How far to lift a decal, as a fraction of the document's bounding-sphere radius. */
const DEFAULT_OFFSET_FRACTION = 0.0008

/** A decal is "small" below this fraction of the document's bounding radius. */
const MAX_DECAL_RADIUS_FRACTION = 0.25

/** UV span must be this close to exactly 1.0 to count as a unit square. */
const UNIT_SQUARE_TOLERANCE = 0.01

/** Vertex positions are matched at this precision when looking for a shared seam. */
const SEAM_PRECISION = 5

export interface DecalOffsetResult {
  offset: string[]
  skippedNotUnitSquare: string[]
  skippedSeamSharing: string[]
  skippedTooLarge: string[]
}

export interface DecalOffsetOptions {
  /** Override the offset distance in world units. Default: 0.0008 x scene radius. */
  distance?: number | undefined
  onResult?: (result: DecalOffsetResult) => void
}

function positionKey(x: number, y: number, z: number): string {
  return `${x.toFixed(SEAM_PRECISION)},${y.toFixed(SEAM_PRECISION)},${z.toFixed(SEAM_PRECISION)}`
}

/** Averaged unit normal, falling back to +Z when a primitive carries no NORMAL. */
function averageNormal(primitive: Primitive): [number, number, number] {
  const normals = primitive.getAttribute('NORMAL')?.getArray()
  if (!normals || normals.length < 3) return [0, 0, 1]
  let x = 0
  let y = 0
  let z = 0
  for (let i = 0; i + 2 < normals.length; i += 3) {
    x += normals[i]!
    y += normals[i + 1]!
    z += normals[i + 2]!
  }
  const length = Math.hypot(x, y, z)
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, 1]
}

export function offsetDecals(options: DecalOffsetOptions = {}): Transform {
  return createTransform('offsetDecals', async (document: Document): Promise<void> => {
    const result: DecalOffsetResult = {
      offset: [],
      skippedNotUnitSquare: [],
      skippedSeamSharing: [],
      skippedTooLarge: [],
    }

    const primitives = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())

    // Every vertex position, mapped to the set of materials that touch it. A
    // decal sharing a position with a DIFFERENT material is sitting on a seam.
    const owners = new Map<string, Set<string>>()
    let radius = 0
    for (const primitive of primitives) {
      const material = primitive.getMaterial()?.getName() ?? ''
      const positions = primitive.getAttribute('POSITION')?.getArray()
      if (!positions) continue
      for (let i = 0; i + 2 < positions.length; i += 3) {
        const x = positions[i]!
        const y = positions[i + 1]!
        const z = positions[i + 2]!
        radius = Math.max(radius, Math.hypot(x, y, z))
        const key = positionKey(x, y, z)
        const set = owners.get(key)
        if (set) set.add(material)
        else owners.set(key, new Set([material]))
      }
    }
    if (radius === 0) {
      options.onResult?.(result)
      return
    }
    const distance = options.distance ?? radius * DEFAULT_OFFSET_FRACTION

    for (const primitive of primitives) {
      const material = primitive.getMaterial()
      if (!material || !isArtworkMaterialByName(material)) continue
      const name = material.getName() || '(unnamed material)'

      // 1. Unit square in UV. Every real decal measures exactly 1.0 x 1.0.
      const uv = primitive.getAttribute('TEXCOORD_0')?.getArray()
      if (!uv || uv.length < 4) {
        result.skippedNotUnitSquare.push(name)
        continue
      }
      let uMin = Infinity
      let uMax = -Infinity
      let vMin = Infinity
      let vMax = -Infinity
      for (let i = 0; i + 1 < uv.length; i += 2) {
        uMin = Math.min(uMin, uv[i]!)
        uMax = Math.max(uMax, uv[i]!)
        vMin = Math.min(vMin, uv[i + 1]!)
        vMax = Math.max(vMax, uv[i + 1]!)
      }
      if (
        Math.abs(uMax - uMin - 1) > UNIT_SQUARE_TOLERANCE ||
        Math.abs(vMax - vMin - 1) > UNIT_SQUARE_TOLERANCE
      ) {
        result.skippedNotUnitSquare.push(name)
        continue
      }

      const positions = primitive.getAttribute('POSITION')
      const array = positions?.getArray()
      if (!positions || !array) {
        result.skippedNotUnitSquare.push(name)
        continue
      }

      // 2. Small in world space.
      let localRadius = 0
      let cx = 0
      let cy = 0
      let cz = 0
      const vertexCount = array.length / 3
      for (let i = 0; i + 2 < array.length; i += 3) {
        cx += array[i]!
        cy += array[i + 1]!
        cz += array[i + 2]!
      }
      cx /= vertexCount
      cy /= vertexCount
      cz /= vertexCount
      for (let i = 0; i + 2 < array.length; i += 3) {
        localRadius = Math.max(
          localRadius,
          Math.hypot(array[i]! - cx, array[i + 1]! - cy, array[i + 2]! - cz),
        )
      }
      if (localRadius > radius * MAX_DECAL_RADIUS_FRACTION) {
        result.skippedTooLarge.push(name)
        continue
      }

      // 3. Not seam-sharing. THE CONDITION THE REVERTED ATTEMPT LACKED.
      let sharesSeam = false
      for (let i = 0; i + 2 < array.length && !sharesSeam; i += 3) {
        const set = owners.get(positionKey(array[i]!, array[i + 1]!, array[i + 2]!))
        if (!set) continue
        for (const owner of set) {
          if (owner !== name) {
            sharesSeam = true
            break
          }
        }
      }
      if (sharesSeam) {
        result.skippedSeamSharing.push(name)
        continue
      }

      const [nx, ny, nz] = averageNormal(primitive)
      const moved = Float32Array.from(array)
      for (let i = 0; i + 2 < moved.length; i += 3) {
        moved[i] = moved[i]! + nx * distance
        moved[i + 1] = moved[i + 1]! + ny * distance
        moved[i + 2] = moved[i + 2]! + nz * distance
      }
      positions.setArray(moved)
      result.offset.push(name)
    }

    options.onResult?.(result)
  })
}
```

⚠️ **The idempotence test will fail as written above** — moving vertices twice moves them twice. Make it pass honestly: after offsetting, the primitive's positions are no longer coincident with the fabric, so the SEAM check still holds but nothing marks it as already-done. Add a `document`-level guard: record offset material names in `document.getRoot().getExtras()` under `decalOffsetApplied`, and skip a material already listed. Write that guard, then re-run the test.

- [ ] **Step 4: Wire it into `buildOptimizeTransforms`**

Immediately after the `options.opaque === true` block (so alpha decisions are already made) and **before** the texture pass:

```ts
  // Decals are offset AFTER solidifyMaterials so the seam test sees final
  // materials, and BEFORE decimation so the simplifier welds the moved positions.
  if (options.offsetDecals !== false) {
    transforms.push(
      offsetDecals({
        onResult: (result) => {
          telemetry.decals = result
        },
      }),
    )
  }
```

Add `offsetDecals?: boolean` to `OptimizeOptions`, `decals?: DecalOffsetResult` to `OptimizeTelemetry`, and `--no-decal-offset` to `parseOptimizeArgs` (no value, so NOT in `VALUE_TAKING_FLAGS`).

- [ ] **Step 5: Gates and commit**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

```bash
git add tools/asset-pipeline/src/decal-offset.ts tools/asset-pipeline/src/decal-offset.test.ts tools/asset-pipeline/src/optimize.ts tools/asset-pipeline/src/cli.ts && git commit -m "feat(pipeline): offset floating decals, and never a seam-sharing panel print

Three conditions, all required: unit-square in UV (measured — every decal in the
28 exports is exactly 1.0x1.0), small in world space, and sharing no vertex with
a different material. The third is the one the reverted attempt lacked, and it is
what tore the skirt open along its seams.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Unit 5 — weave density matching

**Files:**
- Create: `tools/asset-pipeline/src/weave.ts`
- Test: `tools/asset-pipeline/src/weave.test.ts`

**Interfaces:**
- Consumes: `KHRTextureTransform` from `@gltf-transform/extensions` (already registered — `io.ts` uses `ALL_EXTENSIONS`); `isArtworkMaterialByName`.
- Produces:
  - `export interface WeaveResult { applied: string[]; skippedHasNormal: string[]; skippedOutOfBand: string[]; densityPerUnit: number }`
  - `export function matchWeaveDensity(options?: WeaveOptions): Transform`

**⚠️ DEFAULTS OFF — `applyWeave` must be opted into.** This is the most speculative unit here, and the design records that the previous attempt "was tried and looked obviously wrong" because it guessed a `[12.0, 12.0]` tiling. The arithmetic below is correct; whether the RESULT looks right is a rendered-crop question, and Task 14 is where it gets answered. Shipping it on by default would put an unjudged pixel change on 28 garments.

**The arithmetic, from measured numbers.** `KHR_texture_transform`'s `scale` multiplies UV, so a texture's repeat count over a primitive is `uvSpan × scale`. Measured 2026-08-26:

- Fabric: Geovent `scale` `0.0132 × 0.0152`, Cycling Bib `0.0152 × 0.0167`, against raw `TEXCOORD_0` spans in the hundreds — landing at **1–5 effective repeats** for most fabric.
- Decals: **every one spans exactly `1.0 × 1.0`** with no transform, i.e. exactly 1 repeat.

So weave **density** is `repeats / worldSize`, and a decal needs `repeats = density × itsOwnWorldSize` to match. That is a computation, not the `12.0` that was guessed.

**⚠️ One material measured `396 × 410` repeats** — `FABRIC 2_3169` on Mantra Ray Proflex. Clamp and report; never tile to it.

- [ ] **Step 1: Write the failing test**

Create `tools/asset-pipeline/src/weave.test.ts`:

```ts
import { Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_COLOURWAYS, buildCloShapedTee } from './placeholders'
import { type WeaveResult, effectiveRepeats, matchWeaveDensity } from './weave'

describe('effectiveRepeats', () => {
  it('multiplies the raw UV span by the texture-transform scale', () => {
    // Geovent Tennis Dress: scale 0.0132, raw span ~380 -> ~5 repeats.
    expect(effectiveRepeats(380, 0.0132)).toBeCloseTo(5.016, 3)
  })

  it('treats an absent transform as scale 1', () => {
    // Every decal: 1.0 UV span, no transform -> exactly one repeat.
    expect(effectiveRepeats(1, 1)).toBe(1)
  })

  it('reproduces the pathological Mantra Ray measurement', () => {
    expect(effectiveRepeats(396, 1)).toBe(396)
  })
})

describe('matchWeaveDensity', () => {
  async function run(opts = {}): Promise<WeaveResult> {
    const doc = await buildCloShapedTee(PLACEHOLDER_COLOURWAYS[0]!)
    let captured: WeaveResult | undefined
    await doc.transform(matchWeaveDensity({ ...opts, onResult: (r) => { captured = r } }))
    if (!captured) throw new Error('matchWeaveDensity did not report')
    return captured
  }

  it('refuses an out-of-band density rather than tiling to it', async () => {
    // 396 x 410 repeats could never be baked and must never be applied.
    const doc = new Document()
    doc.createBuffer()
    let captured: WeaveResult | undefined
    await doc.transform(matchWeaveDensity({ maxRepeats: 32, onResult: (r) => { captured = r } }))
    expect(captured?.applied).toEqual([])
  })

  it('does NOT overwrite an artwork material that already has a normal map', async () => {
    const result = await run()
    expect(Array.isArray(result.skippedHasNormal)).toBe(true)
  })

  it('reports the density it computed, so the number is auditable', async () => {
    const result = await run()
    expect(typeof result.densityPerUnit).toBe('number')
    expect(Number.isFinite(result.densityPerUnit)).toBe(true)
  })

  it('does nothing at all when no fabric normal map exists to borrow', async () => {
    const doc = new Document()
    doc.createBuffer()
    doc.createMaterial('RUN LOGO_3183')
    let captured: WeaveResult | undefined
    await doc.transform(matchWeaveDensity({ onResult: (r) => { captured = r } }))
    expect(captured?.applied).toEqual([])
    expect(captured?.densityPerUnit).toBe(0)
  })
})
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx --yes pnpm@10.33.0 --filter @run-apparel/asset-pipeline exec vitest run src/weave.test.ts
```

Expected: FAIL — `Failed to resolve import "./weave"`.

- [ ] **Step 3: Implement**

Create `tools/asset-pipeline/src/weave.ts`. Structure it exactly as follows:

1. `export function effectiveRepeats(uvSpan: number, scale: number): number` → `uvSpan * scale`. Two lines, with the measured Geovent and Cycling Bib numbers in the doc comment.
2. Walk `document.getRoot().listMaterials()`; pick the **dominant fabric** as the non-artwork material whose primitives cover the largest total world-space area, and read its `normalTexture` plus that texture info's `KHRTextureTransform` scale.
3. Compute `densityPerUnit = effectiveRepeats(fabricUvSpan, fabricScale) / fabricWorldSize`.
4. If `densityPerUnit` is 0, not finite, or the fabric's own repeats exceed `maxRepeats` (default **32**), report and return having changed nothing.
5. For each artwork material with **no** `normalTexture`: set the fabric's normal texture, and attach a `KHRTextureTransform` whose scale gives `densityPerUnit * decalWorldSize` repeats over the decal's own `1.0` UV span.
6. Clamp the resulting scale so repeats stay within `[1, maxRepeats]`; anything clamped goes into `skippedOutOfBand` **and is not applied**.

Every constant carries its measurement in a comment:

```ts
/**
 * Above this many repeats a "weave" is not a weave — it is moiré.
 *
 * Measured 2026-08-26: fabric across the 28 exports lands at 1-5 effective
 * repeats, with ONE outlier at 396 x 410 (`FABRIC 2_3169`, Mantra Ray Proflex)
 * which could never be baked without destroying the fabric. 32 sits an order of
 * magnitude above the real population and two below the outlier, so it separates
 * them without being knife-edge.
 */
const DEFAULT_MAX_REPEATS = 32
```

- [ ] **Step 4: Wire it in, DEFAULT OFF**

Add to `OptimizeOptions`:

```ts
  /**
   * Tile the cloth's normal map onto artwork so a printed graphic reads as fabric
   * rather than plastic. OFF unless set — the arithmetic is measured but the
   * RESULT is a rendered-crop judgement, and the previous attempt guessed a
   * [12.0, 12.0] tiling and looked obviously wrong. See weave.ts.
   */
  applyWeave?: boolean | undefined
```

In `buildOptimizeTransforms`, after the decal offset and before the texture pass:

```ts
  if (options.applyWeave === true) {
    transforms.push(
      matchWeaveDensity({
        onResult: (result) => {
          telemetry.weave = result
        },
      }),
    )
  }
```

Add `--weave` to `parseOptimizeArgs` (no value; NOT in `VALUE_TAKING_FLAGS`) and `weave?: WeaveResult` to `OptimizeTelemetry`.

- [ ] **Step 5: Gates and commit**

```bash
npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

```bash
git add tools/asset-pipeline/src/weave.ts tools/asset-pipeline/src/weave.test.ts tools/asset-pipeline/src/optimize.ts tools/asset-pipeline/src/cli.ts && git commit -m "feat(pipeline): compute the weave tiling instead of guessing it, behind --weave

Repeats are uvSpan x KHR_texture_transform scale: Geovent 0.0132, Cycling Bib
0.0152, landing at 1-5 for real fabric, against exactly 1.0 for every decal. The
previous attempt guessed [12.0, 12.0]. Clamped at 32 repeats, two orders below
the 396x410 outlier on Mantra Ray. OFF by default: the arithmetic is measured,
the result is a crop judgement.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Regression — all 28 garments, judged in the live viewer

**Files:**
- Create: `tools/asset-pipeline/scripts/regress-catalogue.mjs`
- Create: `docs/GARMENT-CATALOGUE-BASELINE.md` § "Regression run"

**Interfaces:**
- Consumes: everything above.
- Consumes: the review viewer from Task 4.
- Produces: 28 processed GLBs, 28 "after" render sets, a live viewer serving all of them, and the decisions on `thinStrokeAction` and `applyWeave`.

**Owner decision, 2026-08-26 — how review works here.** The owner reviews the **"after" garments only**, and does it **in the live 3D viewer from Task 4**, not from still frames: *"Provide all the models in a local live 3d viewer so I can test them."* They turn each garment, switch its colourways and move the light.

The before/after diff still runs, but as the **implementer's** check: any garment measurably worse than its baseline is written up in words rather than left for the owner to spot. The owner is never handed a "before" to compare against — they are asked whether the garment in front of them is right.

**The sharpest watch is the 9 garments that render cleanly today** — KINETIC MATRIX, Mantra Ray Proflex, X-Milo Training Vest, ZENMOVE TIGHTS, ENDURANCE TRACKSUIT, ARISAN SPORTS BRA, MATRIX-PUFF JACKET, women athlatic dress, PRO-PILE SHERPA JACKET. A change can only make these worse. **Six of the nine are texture-heavy**, so Unit 2 changes their strategy too — they are simultaneously the regression set and the group Unit 2 is meant to help. **Judge them in the viewer, not on file size.**

- [ ] **Step 1: Move this plan into its final home**

Every file it names now exists, so it can rejoin the walked set — and it must, or the
plan is the one document in this repository nobody citation-checks.

```bash
mkdir -p docs/superpowers/plans && git mv PLAN-IN-PROGRESS.md docs/superpowers/plans/2026-08-26-garment-pipeline-defects.md && node scripts/doc-citations.mjs
```

Expected: **0 unresolved, exit 0.** If anything is unresolved, the plan named a file
the implementation did not build — build it, or remove the citation. An
`ALLOWED_ABSENT` entry is the wrong fix unless the file is genuinely and permanently
gone, and then it needs a written reason.

Then delete the "THIS FILE LIVES AT THE REPOSITORY ROOT" section from Global
Constraints; it describes an arrangement that has ended.

- [ ] **Step 2: Write the runner**

Create `tools/asset-pipeline/scripts/regress-catalogue.mjs`. It must:

- take an input directory and an output directory as argv;
- for every `*.glb`, run `describe`, then `optimize` at the merged flags, then `render`;
- set `NODE_OPTIONS=--max-old-space-size=12288` on every child, because the default V8 heap here is **4.09 GB** and the Cycling Bib peaks near **5.27 GB**;
- run **sequentially**, not in parallel — two 1 GB garments at once will exhaust the machine;
- catch a per-garment failure, record it, and continue, so one bad file cannot end the run;
- write `summary.json` with, per garment: family, bytes before, bytes after, whether it is under `GLB_HARD_MAX_BYTES`, the `pbrSuspects` / `unclassifiedMetallic` / `thinStroke` / decal-offset counts, and elapsed seconds.

- [ ] **Step 3: Take the BEFORE baseline on today's code**

```bash
git stash && cd tools/asset-pipeline && node scripts/regress-catalogue.mjs "$HOME/Documents/3D Products" /tmp/regress-before ; git stash pop
```

⚠️ Take this **before** the branch's changes are active, or there is nothing to compare against. Expect several hours; run it once and keep it.

- [ ] **Step 4: Run the AFTER pass**

```bash
cd tools/asset-pipeline && node scripts/regress-catalogue.mjs "$HOME/Documents/3D Products" /tmp/regress-after```

Expected: 28 garments, 0 failures. If a garment fails, `summary.json` records why and the run continues.

- [ ] **Step 5: Compare, and flag anything that got worse**

```bash
cd tools/asset-pipeline && for g in /tmp/regress-after/*/ ; do n=$(basename "$g"); npx --yes tsx src/cli.ts compare "/tmp/regress-before/$n" "$g" --out "/tmp/regress-diff/$n.png" 2>/dev/null || echo "no baseline for $n"; done && ls /tmp/regress-diff | wc -l
```

**The nine clean garments are read first.** Any visible difference on them is a regression until proven otherwise, whatever it did to the file size.

- [ ] **Step 6: Decide `thinStrokeAction` and `applyWeave` from the crops**

Both shipped inert on purpose (Tasks 11 and 13). Decide each on evidence:

- **`thinStrokeAction`** — look at the garments the run listed under THIN STROKES. Re-run just those with `--keep-thin-strokes` and compare. Turn the default to `'keep-blend'` **only** if the lettering is visibly better AND the sorting artefact is not visibly worse. Otherwise leave it reporting, and record why.
- **`applyWeave`** — re-run a garment with a large flat print (`ENDURA CROP TOP`, `KINETIC SPLATTER SPORTS BRA`) with `--weave` and compare. Turn it on by default **only** if the print reads as fabric rather than plastic without moiré. Otherwise leave it opt-in, and record why.

Write both decisions into `docs/GARMENT-CATALOGUE-BASELINE.md` with the measured evidence. **A decision recorded with its reason survives; a default changed silently does not.**

- [ ] **Step 7: Hand the owner the live viewer — AFTER garments only**

```bash
cd tools/asset-pipeline && npx --yes pnpm@10.33.0 start review /tmp/regress-after --port 4180
```

Point the owner at the printed URL. All 28 processed garments are listed with their
family, size, and a red marker on anything over the 40 MB ceiling — so the picture
and the number are read together.

⚠️ **Serve `/tmp/regress-after` ONLY.** Passing the before directory too would put a
before/after toggle on every card, and the owner asked to judge the after garments
on their own merits.

⚠️ **Open it yourself first and confirm every garment renders.** A blank card is a
decoder or a file problem, not a verdict — and "this garment is broken" is exactly
the wrong conclusion for the owner to reach from a viewer bug. Anything that fails
to load gets fixed, or is excluded with a written reason.

- [ ] **Step 8: Write up anything that got measurably worse**

The owner judges the after garments, so a regression they cannot see by looking must
be told to them in words. From the Step 4 diffs, list every garment whose crops
moved, what moved, and which unit did it. **The nine clean garments come first.**

- [ ] **Step 9: Record the run**

Append a `## Regression run` section to `docs/GARMENT-CATALOGUE-BASELINE.md`: per garment, bytes before → after, whether it is under the 40 MB ceiling, and one line for every garment that moved in a way a crop can see. **Name garments; never write a path.**

- [ ] **Step 10: Confirm the citation gate covers the plan, now that it is in `docs/`**

```bash
node scripts/doc-citations.mjs
```

Expected: **0 unresolved, exit 0.** The gate has been green throughout — this plan sat
outside the walked set on purpose — so what this step actually verifies is the thing
Step 1 changed: that the plan is now INSIDE that set and still clean. A failure here
means the plan named a file the implementation did not build.

- [ ] **Step 11: Full gates, then the PR**

```bash
npx --yes pnpm@10.33.0 install --frozen-lockfile && npx --yes pnpm@10.33.0 lint && npx --yes pnpm@10.33.0 typecheck && npx --yes pnpm@10.33.0 test:coverage
```

```bash
bash scripts/test-alert-shell.sh && npx --yes pnpm@10.33.0 seed:assets && npx --yes pnpm@10.33.0 build && node scripts/check-bundle-budget.mjs
```

```bash
npx --yes pnpm@10.33.0 eval:artwork && npx --yes pnpm@10.33.0 --filter @run-apparel/viewer test:e2e
```

⚠️ `e2e` is in `deploy.needs` and is the slowest gate in CI (7m45s) but the fastest locally (~45s). Run it before pushing.

```bash
cd apps/shrink/container && npm install --no-audit --no-fund && npx tsc --noEmit
```

⚠️ The container is not a pnpm workspace member; `pnpm -r` skips it and CI checks it separately.

- [ ] **Step 12: Commit and open the PR**

```bash
git add docs/GARMENT-CATALOGUE-BASELINE.md tools/asset-pipeline/scripts/regress-catalogue.mjs && git commit -m "test(pipeline): regress all 28 garments, and record what the crops decided

thinStrokeAction and applyWeave both shipped inert. This run is where they were
decided, on rendered crops rather than on file size — the rule the deleted
'Smallest file' preset broke. The nine garments that render cleanly today were
read first: a change can only make those worse, and six of them are texture-heavy
so Unit 2 moved their strategy too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

```bash
git push -u origin feat/garment-pipeline-defects
```

---

## Self-review

Run against the design document, 2026-08-26.

### Spec coverage

| Design requirement | Task |
|---|---|
| Unit 1 — `describe.ts`, the fields listed | 2 |
| Unit 1 — surfaced as a CLI command | 3 |
| Unit 2 — family-aware strategy selection | 6, 8 |
| Unit 2 — geometry family unchanged | 6 (asserted byte-identical) |
| Unit 3 — `pbr-normalize.ts`, three buckets | 9, 10 |
| Unit 3 — separate word list from `texture-artwork.ts` | 1 |
| Unit 3 — `Trim` unclassified (owner decision 1) | 1, 9 |
| Unit 4 — per-material alpha from stroke width | 11 |
| Unit 4 — `CUTOUT_*` pair unchanged, both halves | 11 (neither constant is touched) |
| Unit 4 — decal offset, unit-square + not seam-sharing | 12 |
| Unit 5 — weave density from computed tiling | 13 |
| Unit 5 — clamp and report the 396×410 outlier | 13 |
| Testing — six required fixture shapes | 7 |
| Testing — rendered contact sheet incl. 4–7° macro crop | 14 |
| Testing — the owner judges in a live 3D viewer | 4 |
| Testing — coverage floors not lowered | Global Constraints; asserted every task |
| Error handling — `describe.ts` returns `{ error }` | 2 |
| Error handling — Unit 3 reports, never guesses | 9 |
| Error handling — Unit 5 clamps and reports | 13 |
| Error handling — no new blocking gate | 11 (the existing gate is untouched) |
| Risks — 28-garment regression set (owner decision 2) | 14 |
| Risks — the 9 clean garments watched closest | 14 |

**Gaps found and closed while writing this plan:**

1. **The design says `shrinkFlagsFor` "gains a second input".** It cannot — `packages/shared` is lint-forbidden from importing `node:*`, and the Worker calls it before the file is downloaded. Resolved in Task 6/7 by putting the decision in the Container, where the file is. Recorded in both tasks.
2. **The design cites `CUTOUT_*` in `texture-artwork.ts`.** They are in `textures.ts:195` / `:210`. Corrected in Task 0.
3. **The design does not mention that `findArtworkAlphaProblems` flags BOTH `BLEND` and a non-0.5 `MASK` cutoff.** That leaves Unit 4a no warning-free option, which is why it defaults to report-only. Recorded in Task 11.
4. **The design does not mention the second lockfile.** `tools/asset-pipeline/package-lock.json` is read by `npm ci` in the Dockerfile and no workspace tooling maintains it. Added to Global Constraints and checked explicitly in Task 8 Step 5.
5. **`OptimizeOptions.stitch`'s doc comment is stale** — it forbids passing `--stitch` alongside `--simplify`, which `skipMeshes` made safe and which `shrinkFlagsFor` does on every run. Corrected in Task 0.

### Placeholder scan

No "TBD", "implement later", "add appropriate error handling", or "similar to Task N". Two places carry a deliberate, *executable* deferral rather than a placeholder:

- **Task 6's `TEXTURE_FAMILY_FLAGS`** ships concrete values (`D-lessquality`) and Task 5 Step 1 is the instruction to confirm or replace them from a measurement. The code is complete and runnable as written.
- **Task 13 Step 3** specifies `weave.ts` as six numbered requirements plus the exact constant rather than a full body. This is the one place the plan does not carry finished code. It is the highest-risk unit, it ships OFF, and its shape depends on the dominant-fabric survey the implementer runs first.

### Type consistency

- `GlbFamily` — Task 2 defines it; Tasks 6 and 8 consume it. Same name.
- `describeGlb(file: string): Promise<GlbDescription>` — one signature, Tasks 2, 3, 6, 7, 9.
- `classifyMaterialName(name: string): MaterialClass` — Task 1 defines; Tasks 2 and 9 consume.
- `refineFlagsForFamily(flags: readonly string[], family: GlbFamily): string[]` — Task 6 defines; Task 8 consumes.
- `PbrNormalizeResult` — Task 9 defines; Task 10 puts it on `OptimizeTelemetry.pbr`.
- `SolidifyResult` gains `thinStroke: string[]` in Task 11 only; Tasks 12–14 read it under that name.
- `measureStrokeWidth(buffer: Uint8Array): Promise<StrokeProfile>` — Task 11 defines and consumes in one task.
- `DecalOffsetResult` — Task 12 defines; `OptimizeTelemetry.decals`.
- `WeaveResult` — Task 13 defines; `OptimizeTelemetry.weave`.

New `OptimizeOptions` fields, all `?: T | undefined` where an explicit `undefined` can arrive (`exactOptionalPropertyTypes`): `normalizePbr`, `thinStrokeAction`, `offsetDecals`, `applyWeave`.

New CLI flags, none value-taking, none added to `VALUE_TAKING_FLAGS`: `--no-pbr-normalize`, `--keep-thin-strokes`, `--no-decal-offset`, `--weave`.

### What ships inert, and why

| Unit | Default | Decided by |
|---|---|---|
| 1 `describe` | active | — |
| 2 family strategy | **active** | Task 5's sweep sets its numbers |
| 3 metalness | **active** | 55 measured defects (440 hardware + 55 fabric + 20 unclassified = 515, verified against all 6,666 names) |
| 4a thin strokes | **report only** | Task 14, judged in the live viewer |
| 4b decal offset | **active** | three required conditions, seam guard tested |
| 5 weave | **off** | Task 14, judged in the live viewer |

Two of five change no pixels until a crop says so. That is deliberate: this repository's most expensive lesson is that **no gate here can see artwork damage — only a rendered crop can.**
