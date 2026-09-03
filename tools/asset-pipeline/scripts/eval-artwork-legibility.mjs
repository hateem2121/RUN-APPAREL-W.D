#!/usr/bin/env node
/**
 * ARTWORK LEGIBILITY EVAL — does the shipped preset still leave the letters readable?
 *
 * WHY THIS EXISTS. CLAUDE.md states the gap plainly:
 *
 *   "The three blocking gates do NOT catch decimation damage. They test
 *    alphaMode, which decimation does not change. […] Nothing in this system
 *    measures whether the letters survived; only a rendered crop does."
 *
 * That was true, and it is what deleted the `small` preset: a six-run sweep
 * rendered the chest wordmark illegible at `--simplify-error 0.005` and **every
 * run passed all three gates**. `balanced` is consequently pinned by an absolute
 * test whose only evidence is a PNG a human looked at once.
 *
 * This is that human, automated. It renders printed artwork before and after the
 * real decimation chain and measures how much of it moved.
 *
 * ─── WHY IT DOES NOT USE THE RAW EXPORT ──────────────────────────────────────
 * `sweep-size-vs-artwork.mjs` is the authority on the real garment, and must
 * stay so — but it needs `raw/cycling-all-colours.glb`, which is 382 MB and
 * gitignored. Nothing that size can run on every pull request. So this builds a
 * fixture instead, and the fixture is the whole risk: CLAUDE.md's central lesson
 * is that three production bugs survived because "the test fixtures could not
 * exhibit the failure".
 *
 * Two things make this one able to fail:
 *   1. The REAL wordmark alpha (src/__fixtures__/wordmark-alpha.png, 1944×121,
 *      66.38% transparent / 3.58% mid — the exact measurements CLAUDE.md quotes),
 *      not a synthetic band pattern. Real letterforms, so smearing is visible.
 *   2. A dense CURVED panel, not a box. Decimating a flat plane with affine UVs
 *      is free and would prove nothing; on a curved surface the simplifier must
 *      trade geometric error against UV error, which is the actual mechanism
 *      `--uv-weight` and `--simplify-error` control.
 *
 * ─── WHY THERE IS NO GOLDEN IMAGE ────────────────────────────────────────────
 * A committed reference PNG would compare renders across machines, GPU drivers
 * and Chromium versions, and would go red on a browser bump rather than on
 * damage. Every comparison here is between two renders taken by the SAME browser
 * in the SAME run, so the only variable is the decimation.
 *
 * ─── THE NEGATIVE CONTROL IS THE POINT ───────────────────────────────────────
 * The eval asserts TWO things:
 *   • the shipped preset stays under the damage threshold, and
 *   • a deliberately-too-loose budget goes OVER it.
 * The second is what stops this becoming another green test that cannot fail.
 * If someone coarsens the fixture, shrinks the render, or loosens the metric
 * until nothing can trip it, the control assertion goes red and says so. It
 * answers CLAUDE.md's question — "what would have to break for it to fail?" —
 * on every single run, instead of once when it was written.
 *
 * Usage:
 *   node scripts/eval-artwork-legibility.mjs              assert (CI mode)
 *   node scripts/eval-artwork-legibility.mjs --calibrate  print the damage curve
 *   node scripts/eval-artwork-legibility.mjs --keep <dir> keep renders for eyeballing
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { compareRenders } from '../src/compare.ts'
import { optimizeGlb, parseOptimizeArgs } from '../src/optimize.ts'
import { normalizePbr } from '../src/pbr-normalize.ts'
import { renderViews } from '../src/render.ts'
import { refineFlagsForFamily } from '../src/strategy.ts'
import sharp from 'sharp'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink.ts'

/**
 * The shipped presets — IMPORTED, not copied, since 2026-09-02. The copy was kept
 * "because this package installs with plain npm inside the container"; this script
 * only ever runs under tsx in the workspace, where the relative import resolves. The
 * real-garment eval's copy drifted for eleven days (audit C-01); an import cannot.
 *
 * Flat neutral light, shadows off: the 5.000% ceiling was calibrated in it, and the
 * harness's default became production lighting on 2026-09-02.
 */
const BALANCED_FLAGS = shrinkFlagsFor('balanced')
const FIDELITY_FLAGS = shrinkFlagsFor('fidelity')
/**
 * The texture-family flags the robot substitutes for a picture-heavy export (S2, fix plan
 * Rank 13): until 2026-09-03 no gate ever rendered them. A fourth row, with its own
 * control, so a regression in `--max-texture 2048 --quality 70 --artwork-quality 95` is
 * seen here and not on a customer's garment.
 */
const TEXTURE_FLAGS = refineFlagsForFamily(BALANCED_FLAGS, 'texture')
const EVAL_LIGHTING = 'diagnostic'

/**
 * The negative control: the balanced preset with UV protection switched OFF.
 *
 * WHY THIS AXIS AND NOT THE ERROR BUDGET. The obvious control was run F of the
 * 2026-08-05 sweep (`--simplify-error 0.005`, the one that rendered the real
 * wordmark illegible). Measured on this fixture it is indistinguishable from
 * `balanced` — 3.070% for both — because at `--simplify 0.05` on a mesh this
 * simple the RATIO binds before the budget does, so 0.001, 0.002 and 0.005 all
 * produce byte-identical geometry. shrink.ts records the same effect from the
 * other side: "ratio is a target, not a promise". A control that cannot move is
 * not a control.
 *
 * `--uv-weight 0` is the right axis because it disables the actual protective
 * mechanism — CLAUDE.md: "--uv-weight feeds TEXCOORD_0 into the simplifier's
 * error metric, which is what protects printed graphics" — and it is a REALISTIC
 * regression rather than a contrived one: `parseOptimizeArgs` leaves the UV
 * weight **unset by default**, so any caller that stops passing the flag loses
 * artwork protection silently. That is the same shape as the `opaque` default
 * mismatch CLAUDE.md already warns about.
 *
 * Measured: 9.370% versus 3.070% — 3× the damage, on the same fixture, same run.
 *
 * ⚠️ SINCE 2026-09-02 A PRINT PIECE IS NEVER DECIMATED (fix plan Rank 3), so
 * `--uv-weight 0` alone can no longer touch the wordmark: on 2026-09-02 all three
 * runs read 0.130% and this eval reported itself blind — correctly. The control now
 * also passes `--decimate-artwork`, the negative-control flag that lets decimation
 * reach the print exactly as every run did before, so the damage this eval exists
 * to catch is still produced and still measured. The shipped presets do NOT carry
 * it (strategy.test.ts pins that), which is why they now read ~0.1%: what remains is
 * the texture re-encode.
 */
const CONTROL_FLAGS = [
  '--simplify',
  '0.05',
  '--meshopt',
  '--simplify-error',
  '0.001',
  '--uv-weight',
  '0',
  '--decimate-artwork',
]
/** The texture row's own control: the same family flags with the artwork protection off. */
const TEXTURE_CONTROL_FLAGS = [...TEXTURE_FLAGS, '--uv-weight', '0', '--decimate-artwork']

/**
 * Damage ceiling: fraction of pixels in the wordmark view differing by more than
 * `DIFF_THRESHOLD` (8/255) from the undecimated render.
 *
 * CALIBRATED, not chosen. Full grid from `--calibrate` on 2026-08-06, 28,000-triangle
 * fixture, 900×900 render:
 *
 *   | ratio | error  | uv | changed % |
 *   |-------|--------|----|-----------|
 *   | 0.05  | 0.0002 | 2  |    1.650% |  ← fidelity (shipped)
 *   | 0.05  | 0.001  | 1  |    3.070% |  ← balanced (shipped)
 *   | 0.05  | 0.002  | 1  |    3.070% |
 *   | 0.05  | 0.005  | 1  |    3.070% |
 *   | 0.05  | 0.001  | 0  |    9.370% |  ← negative control
 *   | 0.05  | 0.005  | 0  |    9.370% |
 *   | 0.005 | 0.02   | 0  |   13.970% |
 *
 * 5% sits 1.6× above the shipped preset and 1.9× below the control, so neither a
 * rendering wobble nor an argument about the threshold decides the outcome.
 */
// Exported so `eval-artwork-legibility.test.ts` can PIN it (fix plan Rank 13, audit HE-04):
// until 2026-09-03 this number could be raised 80% and no test would notice. Changing it
// means producing a new calibration table and a contact sheet somebody looked at.
export const MAX_CHANGED_FRACTION = 0.05

/** Straight-on view of the panel, framed so the wordmark fills it. */
const WORDMARK_VIEW = [{ name: 'wordmark', orbit: '0deg 90deg 40%', fieldOfView: '20deg' }]

const RENDER_SIZE = 900

/**
 * A dense curved panel carrying the real wordmark, MASK at cutoff 0.5 — the
 * alpha mode the three gates insist on, so this fixture is already in the state
 * they call correct. Whatever this measures is therefore damage they cannot see.
 *
 * ─── WHY THE UVs ARE WARPED ──────────────────────────────────────────────────
 * The first version of this fixture mapped UV affinely (u,v straight from the
 * grid parameters) and produced a COMPLETELY FLAT damage curve: 0.150% changed
 * at every budget from 0.0002 to 0.02, measured. It was useless, and it is worth
 * recording why, because the reason is not obvious:
 *
 *   With an affine UV mapping, linear interpolation across a triangle is EXACT
 *   no matter how few triangles remain. Decimation cannot smear such a texture.
 *   The mesh went 28,000 → 1,399 triangles and the wordmark was untouched.
 *
 * Real CLO exports are not like that. Their UVs come from a flat 2D pattern
 * sewn onto a doubly-curved body, so the mapping is non-affine — UV density
 * varies across the surface — and a coarse triangle interpolating it linearly
 * mis-samples the texture. THAT is what tears the letters.
 *
 * So the warp below is not a trick to make the test fail; it is the property
 * that makes the fixture a fixture at all, in exactly the sense CLAUDE.md means
 * by "seed a print if production prints". The negative control is what stops it
 * from being over-tuned: warp this too hard and the SHIPPED preset breaches the
 * ceiling too, which fails the eval and says so.
 *
 * (Measured second cause, same run: at `--simplify 0.05` the RATIO binds before
 * the error budget on a mesh this simple, which is why 0.001 and 0.02 produced
 * byte-identical geometry. shrink.ts records the same effect in the opposite
 * direction — "ratio is a target, not a promise" — so the fixture has to be
 * sensitive through UV error, not through triangle count.)
 */
async function buildArtworkPanel({ segments = 200, rings = 70 } = {}) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = []
  const normals = []
  const uvs = []
  const ARC = Math.PI * 0.7 // ~126° of curvature, chest-like
  const HALF_HEIGHT = 0.16 // panel aspect ≈ the wordmark's 16:1
  /** Amplitude of the non-affine UV warp. See the note above. */
  const WARP = 0.05
  /**
   * The warp is applied INSIDE an inset base range so every UV stays within
   * [0,1]. Not cosmetic: a UV outside [0,1] makes glTF-Transform's `quantize`
   * skip TEXCOORD_0 entirely ("Skipping TEXCOORD_0; out of [0,1] range" —
   * observed while building this), so the fixture would be exercising a
   * different code path from the one production takes, which is the whole
   * failure mode this eval exists to avoid.
   */
  const INSET = WARP * 1.5

  for (let j = 0; j <= rings; j++) {
    const v = j / rings
    for (let i = 0; i <= segments; i++) {
      const u = i / segments
      const angle = (u - 0.5) * ARC
      positions.push(Math.sin(angle), (0.5 - v) * HALF_HEIGHT * 2, Math.cos(angle))
      normals.push(Math.sin(angle), 0, Math.cos(angle))
      // Non-affine: UV density varies along both axes, so linear interpolation
      // across a decimated triangle no longer lands where the texel does.
      const uBase = INSET + u * (1 - 2 * INSET)
      const vBase = INSET + v * (1 - 2 * INSET)
      uvs.push(
        uBase + WARP * Math.sin(u * Math.PI * 6) * Math.cos(v * Math.PI * 2),
        vBase + WARP * 0.5 * Math.sin(u * Math.PI * 4),
      )
    }
  }

  const indices = []
  const at = (i, j) => j * (segments + 1) + i
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segments; i++) {
      indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1))
      indices.push(at(i, j), at(i + 1, j + 1), at(i, j + 1))
    }
  }

  const png = new Uint8Array(
    await readFile(join(import.meta.dirname, '..', 'src', '__fixtures__', 'wordmark-alpha.png')),
  )
  const texture = doc.createTexture('WORDMARK').setImage(png).setMimeType('image/png')

  const material = doc
    .createMaterial('ARTWORK-WORDMARK')
    .setBaseColorTexture(texture)
    .setBaseColorFactor([0.04, 0.05, 0.03, 1])
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.5)
    .setDoubleSided(true)

  const primitive = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer),
    )
    .setMaterial(material)

  const scene = doc.createScene('scene')
  scene.addChild(doc.createNode('panel').setMesh(doc.createMesh('panel').addPrimitive(primitive)))

  /*
   * EVERY SHIPPED FLAG MUST ACT HERE (fix plan Rank 13, audit HE-05). The shipped
   * preset is `--stitch … --simplify … --max-texture 4096 --data-max-texture 2048
   * --quality 75`; on the wordmark panel alone only `--simplify` and `--quality` did
   * anything, so half the preset could break and this eval would not know. A fabric
   * panel behind the print carries a weave past the 4096 cap and a normal map past
   * the 2048 data cap, and a Topstitch_* band gives `--stitch` its thread. `probeFlags`
   * below reads what each pass reported and the eval fails if a shipped flag was inert.
   */
  const fabricPanel = doc.createMesh('Cloth_mesh_fabric')
  const back = -0.02 // behind the print, so the wordmark view still frames the print
  const fabricPositions = [-1.2, -0.5, back, 1.2, -0.5, back, 1.2, 0.5, back, -1.2, 0.5, back]
  const weave = doc
    .createTexture('fabric-weave')
    // 144-px cells: the fold pass reads a 256-px thumbnail, and a fine checker averages flat there.
    .setImage(await twoTonePng(4608, 144))
    .setMimeType('image/png')
  const normal = doc
    .createTexture('fabric-normal')
    .setImage(await gradientNormalPng(2304))
    .setMimeType('image/png')
  const fabric = doc
    .createMaterial('FABRIC 1')
    .setBaseColorTexture(weave)
    .setNormalTexture(normal)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.85)
  // Pattern-space UVs with the CLO-style transform, as every real export carries.
  const fabricPrim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array(fabricPositions))
        .setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      doc
        .createAccessor()
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer),
    )
    .setAttribute(
      'TEXCOORD_0',
      doc
        .createAccessor()
        .setType('VEC2')
        .setArray(new Float32Array([-20, -20, 20, -20, 20, 20, -20, 20]))
        .setBuffer(buffer),
    )
    .setIndices(
      doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
        .setBuffer(buffer),
    )
    .setMaterial(fabric)
  fabricPanel.addPrimitive(fabricPrim)
  scene.addChild(doc.createNode('Cloth_mesh_fabric').setMesh(fabricPanel))

  const stitchMesh = doc.createMesh('Topstitch_1')
  const stitchSegments = 600
  const sp = []
  const sn = []
  const su = []
  const si = []
  for (let i = 0; i <= stitchSegments; i++) {
    const t = i / stitchSegments
    const x = -1 + 2 * t
    sp.push(x, -0.3, back + 0.001, x, -0.296, back + 0.001)
    sn.push(0, 0, 1, 0, 0, 1)
    su.push(t, 0, t, 1)
    if (i < stitchSegments) {
      const a = i * 2
      si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  stitchMesh.addPrimitive(
    doc
      .createPrimitive()
      .setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(sp)).setBuffer(buffer),
      )
      .setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(new Float32Array(sn)).setBuffer(buffer),
      )
      .setAttribute(
        'TEXCOORD_0',
        doc.createAccessor().setType('VEC2').setArray(new Float32Array(su)).setBuffer(buffer),
      )
      .setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(si)).setBuffer(buffer),
      )
      .setMaterial(
        doc
          .createMaterial('Default Topstitch')
          .setBaseColorFactor([0.35, 0.35, 0.35, 1])
          .setMetallicFactor(0),
      ),
  )
  scene.addChild(doc.createNode('Topstitch_1').setMesh(stitchMesh))
  return { doc, triangles: indices.length / 3 }
}

/** A two-tone checker PNG of `size` px with `cell`-px cells — busy enough to keep, cheap to store. */
async function twoTonePng(size, cell) {
  const raw = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0
      raw[i] = raw[i + 1] = raw[i + 2] = dark ? 228 : 255
    }
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer(),
  )
}

/** A slow-gradient normal map: R and G sway ±20 around 128, B 255. */
async function gradientNormalPng(size) {
  const raw = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    const g = Math.round(128 + 20 * Math.sin(y / 40))
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3
      raw[i] = Math.round(128 + 20 * Math.sin(x / 40))
      raw[i + 1] = g
      raw[i + 2] = 255
    }
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer(),
  )
}

/**
 * Which shipped flags acted on the fixture, read from what each pass reported (HE-05).
 * Returns the flags that were INERT; the eval fails on any for a shipped row.
 */
export function inertFlags(flags, result) {
  const inert = []
  const has = (flag) => flags.includes(flag)
  if (
    has('--stitch') &&
    !(
      result.stitch &&
      result.stitch.meshes > 0 &&
      result.stitch.trianglesAfter < result.stitch.trianglesBefore
    )
  ) {
    inert.push('--stitch')
  }
  if (
    has('--simplify') &&
    !(result.simplify && result.simplify.attributeAware + result.simplify.fallback > 0)
  ) {
    inert.push('--simplify')
  }
  if (
    has('--max-texture') &&
    !(result.textures?.standardResized && result.textures.standardResized.length > 0)
  ) {
    inert.push('--max-texture')
  }
  if (
    has('--data-max-texture') &&
    !(result.textures?.dataResized && result.textures.dataResized.length > 0)
  ) {
    inert.push('--data-max-texture')
  }
  if (
    has('--quality') &&
    !(result.textures && result.textures.standard + result.textures.artwork > 0)
  ) {
    inert.push('--quality')
  }
  return inert
}

/** Optimise the fixture with `flags`, render it, and diff against the baseline. */
// `io` used to be threaded in here and was never read — removed 2026-08-08 when
// the linter flagged it. It is still built in main() for the baseline render.
async function damageFor(srcGlb, baselineDir, workDir, label, flags) {
  const out = join(workDir, `${label}.glb`)
  const { options } = parseOptimizeArgs([srcGlb, '--out', out, ...flags])
  const result = await optimizeGlb(srcGlb, out, options)
  const renderDir = join(workDir, `render-${label}`)
  await renderViews(out, renderDir, {
    views: WORDMARK_VIEW,
    lighting: EVAL_LIGHTING,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
  })
  const { diffs } = await compareRenders(
    baselineDir,
    renderDir,
    join(workDir, `sheet-${label}.png`),
  )
  const diff = diffs.find((d) => d.view === 'wordmark')
  return {
    label,
    changedFraction: diff.changedFraction,
    meanDelta: diff.meanDelta,
    maxDelta: diff.maxDelta,
    artworkAtRisk: result.simplify?.artworkAtRisk ?? [],
    inert: inertFlags(flags, result),
    sheet: join(workDir, `sheet-${label}.png`),
    renderDir,
  }
}

async function main() {
  const calibrate = process.argv.includes('--calibrate')
  const keepAt = process.argv.indexOf('--keep')
  const workDir =
    keepAt !== -1 ? process.argv[keepAt + 1] : await mkdtemp(join(tmpdir(), 'artwork-eval-'))
  await mkdir(workDir, { recursive: true })

  const io = new NodeIO()
  const { doc, triangles } = await buildArtworkPanel()

  /*
   * ⚠️ THE BASELINE MUST CARRY EVERY NON-DECIMATION STEP THE OPTIMIZED RUNS DO, AND
   * THIS EVAL WENT RED FOR A WHOLE BRANCH BECAUSE IT DID NOT.
   *
   * The header above promises "the only variable is the decimation". `normalizePbr`
   * joined `optimizeGlb` on 2026-08-28 — the metalness fix, correcting materials that
   * are metallic 1.0 with nothing to override them — and it runs on the optimized side
   * ONLY. So every row measured "decimation damage PLUS a legitimate shading
   * correction" and all three jumped together:
   *
   *     fidelity 1.650 -> 15.290    balanced 3.070 -> 16.070    CONTROL 9.370 -> 18.760
   *
   * That reads as catastrophic artwork damage and is not: rendered and looked at
   * 2026-08-28, the letterforms are INTACT — same strokes, no holes, no smearing —
   * and merely lighter, because a wrongly-metallic surface renders dark and a
   * corrected one does not. The `control` sheet from the same run shows what real
   * damage looks like: letters torn into shards.
   *
   * ⚠️ It is the `opaque`-default trap one module along. `normalizePbr` defaults ON
   * inside `optimizeGlb` and there is no equivalent default on a hand-built baseline,
   * so the two sides drifted silently. Any FUTURE non-decimation pass added to
   * `optimizeGlb` must be added here too, or this eval will report it as damage.
   */
  await doc.transform(normalizePbr())

  const srcGlb = join(workDir, 'fixture.glb')
  await writeFile(srcGlb, await io.writeBinary(doc))
  console.log(`fixture: ${triangles.toLocaleString()} triangles, real wordmark alpha, MASK @ 0.5`)

  // Baseline: the undecimated fixture, PBR-normalised exactly as the optimized runs
  // are. Everything is measured against this.
  const baselineDir = join(workDir, 'render-baseline')
  await renderViews(srcGlb, baselineDir, {
    views: WORDMARK_VIEW,
    lighting: EVAL_LIGHTING,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
  })

  if (calibrate) {
    const grid = [
      { ratio: '0.05', error: '0.0002', uv: '2' }, // fidelity (shipped)
      { ratio: '0.05', error: '0.001', uv: '1' }, // balanced (shipped)
      { ratio: '0.05', error: '0.002', uv: '1' }, // the deleted `small`
      { ratio: '0.05', error: '0.005', uv: '1' }, // sweep run F
      { ratio: '0.05', error: '0.001', uv: '0' }, // UV protection OFF
      { ratio: '0.05', error: '0.005', uv: '0' },
      { ratio: '0.005', error: '0.02', uv: '0' }, // brutal
    ]
    console.log('\n| ratio | error | uv-weight | mean Δ | max Δ | changed % |')
    console.log('|---|---|---|---|---|---|')
    const rows = []
    for (const g of grid) {
      const flags = [
        '--simplify',
        g.ratio,
        '--meshopt',
        '--simplify-error',
        g.error,
        '--uv-weight',
        g.uv,
      ]
      const d = await damageFor(
        srcGlb,
        baselineDir,
        workDir,
        `r${g.ratio}-e${g.error}-uv${g.uv}`,
        flags,
      )
      rows.push({ ...g, ...d })
      console.log(
        `| ${g.ratio} | ${g.error} | ${g.uv} | ${d.meanDelta} | ${d.maxDelta} | ${(d.changedFraction * 100).toFixed(3)}% |`,
      )
    }
    await writeFile(join(workDir, 'calibration.json'), JSON.stringify(rows, null, 2))
    console.log(`\nArtifacts in ${workDir}`)
    return
  }

  const shipped = await damageFor(srcGlb, baselineDir, workDir, 'balanced', BALANCED_FLAGS)
  const fidelity = await damageFor(srcGlb, baselineDir, workDir, 'fidelity', FIDELITY_FLAGS)
  const control = await damageFor(srcGlb, baselineDir, workDir, 'control', CONTROL_FLAGS)
  const texture = await damageFor(srcGlb, baselineDir, workDir, 'texture', TEXTURE_FLAGS)
  const textureControl = await damageFor(
    srcGlb,
    baselineDir,
    workDir,
    'texture-control',
    TEXTURE_CONTROL_FLAGS,
  )

  const pct = (v) => `${(v * 100).toFixed(3)}%`
  console.log(
    `\n  fidelity  (err 0.0002, uv 2)     changed ${pct(fidelity.changedFraction)}  mean ${fidelity.meanDelta}`,
  )
  console.log(
    `  balanced  (err 0.001,  uv 1)     changed ${pct(shipped.changedFraction)}  mean ${shipped.meanDelta}`,
  )
  console.log(
    `  CONTROL   (uv 0 — expect DAMAGE) changed ${pct(control.changedFraction)}  mean ${control.meanDelta}`,
  )
  console.log(
    `  texture   (family flags)         changed ${pct(texture.changedFraction)}  mean ${texture.meanDelta}`,
  )
  console.log(
    `  T-CONTROL (texture, uv 0)        changed ${pct(textureControl.changedFraction)}  mean ${textureControl.meanDelta}`,
  )
  console.log(`  ceiling                          ${pct(MAX_CHANGED_FRACTION)}`)
  for (const row of [shipped, fidelity, texture]) {
    console.log(
      `  flags acting (${row.label}): ${row.inert.length ? `⚠️ INERT ${row.inert.join(', ')}` : 'every shipped flag did something'}`,
    )
  }

  const failures = []
  for (const row of [shipped, fidelity, texture]) {
    if (row.inert.length) {
      failures.push(
        `The ${row.label} preset carries flags that did NOTHING on this fixture: ${row.inert.join(', ')}.\n` +
          '  A flag that acts on nothing here can regress unseen. Give the fixture something for it to act on;\n' +
          '  do not drop the flag from the check.',
      )
    }
  }
  if (texture.changedFraction > MAX_CHANGED_FRACTION) {
    failures.push(
      `The TEXTURE-FAMILY preset damaged the artwork: ${pct(texture.changedFraction)} of the wordmark moved, ` +
        `over the ${pct(MAX_CHANGED_FRACTION)} ceiling. Look at ${texture.sheet}.`,
    )
  }
  if (textureControl.changedFraction <= MAX_CHANGED_FRACTION) {
    failures.push(
      `The texture row's NEGATIVE CONTROL did not register as damage (${pct(textureControl.changedFraction)}). ` +
        'The fourth row has gone blind; fix the fixture, never the ceiling.',
    )
  }
  if (shipped.changedFraction > MAX_CHANGED_FRACTION) {
    failures.push(
      `The SHIPPED preset damaged the artwork: ${pct(shipped.changedFraction)} of the wordmark moved, ` +
        `over the ${pct(MAX_CHANGED_FRACTION)} ceiling.\n` +
        `  Look at ${shipped.sheet} before touching the threshold — the three blocking gates cannot see this,\n` +
        `  which is the entire reason this eval exists.`,
    )
  }
  if (fidelity.changedFraction > shipped.changedFraction) {
    failures.push(
      `fidelity damaged MORE than balanced (${pct(fidelity.changedFraction)} vs ${pct(shipped.changedFraction)}).\n` +
        `  fidelity is the stricter preset; if it is now the worse one, the presets or the simplifier have\n` +
        `  regressed and shrink.ts's ordering claim is no longer true.`,
    )
  }
  if (control.changedFraction <= MAX_CHANGED_FRACTION) {
    failures.push(
      `The NEGATIVE CONTROL did not register as damage: --decimate-artwork --uv-weight 0 changed only ` +
        `${pct(control.changedFraction)}, at or under the ${pct(MAX_CHANGED_FRACTION)} ceiling.\n` +
        `  Decimating the print with UV weighting off is the damage this eval exists to catch, so it must show up.\n` +
        `  This eval has gone BLIND — the fixture, the render size or the metric no longer exhibits the failure.\n` +
        `  Fix the eval; do NOT relax the ceiling. A green run means nothing until this control is red again.`,
    )
  }

  if (failures.length) {
    console.error(`\n✗ artwork legibility eval FAILED\n\n${failures.join('\n\n')}\n`)
    console.error(`Artifacts: ${workDir}`)
    process.exit(1)
  }

  const margin = control.changedFraction / Math.max(shipped.changedFraction, 1e-9)
  console.log(
    `\n✓ artwork legibility eval passed — the control does ${margin.toFixed(1)}× the shipped preset's damage`,
  )
}

// Run only as a script: the test imports the ceiling without starting a two-minute eval.
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  await main()
}
