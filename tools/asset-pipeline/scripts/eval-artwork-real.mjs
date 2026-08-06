#!/usr/bin/env node
/**
 * REAL-GARMENT ARTWORK EVAL — does the shipped preset keep N001's printed
 * letters readable, on the actual CLO export rather than a fixture?
 *
 * ─── WHY THIS EXISTS, GIVEN `eval:artwork` ALREADY DOES THIS ────────────────
 * `eval-artwork-legibility.mjs` runs on a SYNTHETIC fixture — a generated curved
 * panel carrying the real wordmark alpha. CLAUDE.md is explicit about the limit:
 *
 *   "it runs on a synthetic fixture, not on a production garment, so it catches a
 *    preset or simplifier regression and would still miss damage specific to a
 *    particular CLO export. The sweep remains the authority on a real garment."
 *
 * And the sweep — `sweep-size-vs-artwork.mjs` — **does not render anything**. It
 * measures file size, `artworkAtRisk`, `findArtworkAlphaProblems` and the alpha
 * census. Read its own recorded output from 2026-08-05 (`output/sweep/sweep.json`):
 * all six runs report `wouldShip: true`, INCLUDING run F at `--simplify-error
 * 0.005`, which CLAUDE.md records as rendering the chest wordmark illegible.
 *
 * So the authority on the real garment was a human opening a contact sheet. This
 * is that human, automated — the same method as the synthetic eval, pointed at the
 * real file.
 *
 * ─── WHY MEASURING A DIFF ACROSS MACHINES IS SAFE HERE ──────────────────────
 * There is no golden image, for the reason the synthetic eval gives: a committed
 * reference PNG would go red on a Chromium bump rather than on damage. Every
 * comparison here is between two renders taken by the SAME browser in the SAME
 * run, so the rasteriser appears on both sides of the subtraction and cancels.
 *
 * That was a design argument until 2026-08-06, when it was measured: the synthetic
 * eval produced 1.650% / 3.070% / 9.370% on a developer Mac and on three CI runs
 * across two runner images — identical to three decimal places. Decimation is
 * deterministic; the rasteriser cancels. That is why this can gate.
 *
 * ─── WHAT THE BASELINE IS, AND WHY IT IS NOT THE RAW FILE ───────────────────
 * The baseline is the FULL PIPELINE MINUS DECIMATION: same texture compression,
 * same alpha resolution, same meshopt, `--simplify` simply omitted (optimize.ts
 * only decimates when `options.simplify` is a number in (0,1)).
 *
 * Rendering the 382 MB raw export directly would measure texture compression and
 * decimation together and blame whichever you already suspected. Isolating
 * decimation is the point: it is the one stage no gate can see, because the three
 * blocking gates test `alphaMode`, which decimation does not change.
 *
 * Measured 2026-08-06: the baseline is 66 MB and takes 20s to build. The whole
 * eval is ~4 minutes.
 *
 * ─── WHAT THIS STILL DOES NOT COVER ─────────────────────────────────────────
 * One garment, N001. A second CLO export with different UV packing could fail in a
 * way this never sees. It narrows the gap; it does not close it.
 *
 * Usage:
 *   node scripts/eval-artwork-real.mjs [raw.glb]              assert (CI mode)
 *   node scripts/eval-artwork-real.mjs [raw.glb] --calibrate  print the damage curve
 *   node scripts/eval-artwork-real.mjs [raw.glb] --keep <dir> keep renders + sheets
 *
 * Env:
 *   RAW_GLB   path to the raw CLO export (default: <repo>/raw/cycling-all-colours.glb)
 */
import { mkdtemp, mkdir, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareRenders } from '../src/compare.ts'
import { createIO } from '../src/io.ts'
import { optimizeGlb, parseOptimizeArgs } from '../src/optimize.ts'
import { renderViews } from '../src/render.ts'
import { isArtworkTexture } from '../src/texture-artwork.ts'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')

/**
 * The baseline: everything except decimation.
 *
 * `--meshopt` is on BOTH sides deliberately. It quantizes vertex attributes, so
 * leaving it off the baseline would make the diff show quantization plus
 * decimation. Trap #1 in CLAUDE.md is about re-running the pipeline on its own
 * OUTPUT across two passes; within a single run optimize.ts decimates before it
 * encodes, so this is the ordinary path, not the trap.
 */
const BASELINE_FLAGS = ['--meshopt']

/**
 * The shipped presets. DELIBERATELY A SECOND COPY of `shrinkFlagsFor()` in
 * `packages/shared/src/shrink.ts`, for the same reason the synthetic eval keeps
 * one: this package installs with plain `npm ci` inside the shrink container's
 * Docker image, where `workspace:*` cannot resolve. Pinned by
 * `assertPresetMatchesShared()` below.
 */
const BALANCED_FLAGS = ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.001', '--uv-weight', '1']
const FIDELITY_FLAGS = ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.0002', '--uv-weight', '2']

/**
 * The negative control: the shipped preset with UV protection switched off.
 *
 * Same axis as the synthetic eval, and for the same reason — `parseOptimizeArgs`
 * leaves the UV weight unset by default, so a caller that stops passing the flag
 * loses artwork protection silently. A realistic regression, not a contrived one.
 */
const CONTROL_FLAGS = ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.001', '--uv-weight', '0']

/** Run F from the 2026-08-05 sweep: known to render the wordmark illegible. */
const KNOWN_BAD_FLAGS = ['--simplify', '0.05', '--meshopt', '--simplify-error', '0.005', '--uv-weight', '1']

/**
 * Damage ceiling: fraction of pixels in the wordmark crop differing from the
 * undecimated render.
 *
 * CALIBRATED ON THE REAL N001 EXPORT, 2026-08-06 (`--calibrate`, 145 s):
 *
 *   | preset                              | changed |
 *   |-------------------------------------|---------|
 *   | fidelity  (err 0.0002, uv 2)        |  0.980% |  ← shipped, strictest
 *   | balanced  (err 0.001,  uv 1)        |  2.990% |  ← shipped
 *   | known-bad (err 0.005,  uv 1)        |  5.770% |  ← sweep run F
 *   | control   (err 0.001,  uv 0)        |  5.810% |  ← UV protection off
 *
 * 4.2% sits 1.40× above the shipped preset and 1.37× below both failure cases.
 *
 * ⚠️ THE MARGINS ARE TIGHTER THAN THE SYNTHETIC EVAL'S (1.63× / 1.87×) and that is
 * inherent, not sloppy: this crop necessarily contains fabric and seams around the
 * print, and decimation legitimately moves those, so the floor under `balanced` is
 * higher. The separation is 1.93× rather than the fixture's 3.05×.
 *
 * THE KNOWN-BAD ROW IS THE POINT. `--simplify-error 0.005` is sweep run F, which
 * CLAUDE.md records as rendering the wordmark illegible and which the sweep
 * reported as `wouldShip: true`. Confirmed by eye on the 2026-08-06 contact sheet:
 * "THE EXTRA MILE" breaks up and the RUN logo mangles. A ceiling anywhere in
 * (2.990%, 5.770%) catches the file the three blocking gates wave through.
 */
const MAX_CHANGED_FRACTION = Number(process.env.EVAL_REAL_CEILING ?? 0.042)

/**
 * The artwork crop — and it is NOT one of render.ts's DEFAULT_VIEWS.
 *
 * ⚠️ THE OBVIOUS CHOICE IS WRONG, AND WRONG SILENTLY. The first version of this
 * eval used `crop-chest` (`0deg 82deg 45%`, fov 18°) because the name says chest.
 * Rendered on N001 it frames the torso and hips: seams, panels, a zip — and the
 * wordmark clipped off the top edge entirely. `crop-back` shows a zipper. Those
 * defaults were framed for a t-shirt; N001 is a skinsuit and the print sits higher.
 *
 * An eval calibrated on that crop would have measured how decimation moves FABRIC,
 * produced a plausible number, gone green, and told nobody anything — the exact
 * failure mode CLAUDE.md opens with. It was caught by opening the PNG.
 *
 * These values were derived from the artwork primitives' own world-space bounds
 * (`THE EXTRA MILE (Slogan)_3161` centres at y=1.314) and then checked by eye. At
 * 14° the frame holds the full wordmark with margin plus the RUN arrow and
 * wordmark logos — three of the six artwork primitives, including the only one
 * that has ever failed.
 *
 * `radius` is nearly inert: model-viewer clamps orbit radius to its own framing of
 * the bounding sphere, so 0.445m, 0.300m and 0.180m render pixel-identically.
 * **`fieldOfView` is the zoom control here.** Measured 2026-08-06.
 *
 * NOT COVERED: `TEAM WEAR FRONT LABEL` at the hem and the two `Zipper 3_TapeFabric`
 * strips. The zips are not print, and the hem label is 0.039m across — it needs its
 * own much narrower framing, and half-framing it would add noise without signal.
 */
const ARTWORK_VIEWS = [
  { name: 'wordmark', orbit: '-0.2deg 90deg 0.445m', target: '0m 1.314m 0.069m', fieldOfView: '14deg' },
]

/**
 * How far the configured target may sit from the real artwork centre, in metres,
 * before this eval refuses to run.
 *
 * This exists because of the `crop-chest` mistake above: a camera pointed at the
 * wrong part of the garment produces a NUMBER, not an error, and the number looks
 * fine. If a re-exported garment moves the print, this must fail loudly rather
 * than quietly start measuring fabric. 0.05 m ≈ half the wordmark's height.
 */
const TARGET_TOLERANCE_M = 0.05

const RENDER_SIZE = 1024

async function assertPresetMatchesShared() {
  const source = await readFile(join(REPO_ROOT, 'packages', 'shared', 'src', 'shrink.ts'), 'utf8')
  const expected = BALANCED_FLAGS.map((f) => `'${f}'`).join(', ')
  if (!source.includes(expected)) {
    throw new Error(
      `BALANCED_FLAGS has drifted from packages/shared/src/shrink.ts.\n` +
        `  this file expects: [${expected}]\n` +
        `  Re-calibrate this eval against the new preset (--calibrate) rather than editing the constant.`,
    )
  }
}

/**
 * Refuse to run if the camera is not actually pointed at the artwork.
 *
 * Reads the artwork primitives out of the built baseline, transforms each into
 * world space, takes the largest by frontal area, and checks the configured
 * `target` lands on it. See TARGET_TOLERANCE_M for why this is a hard failure.
 */
async function assertViewFramesArtwork(glbPath) {
  const io = await createIO()
  const doc = await io.read(glbPath)
  const root = doc.getRoot()

  const artworkMats = new Set()
  for (const material of root.listMaterials()) {
    const texture = material.getBaseColorTexture()
    if (texture && (await isArtworkTexture(texture))) artworkMats.add(material)
  }

  const nodeForMesh = new Map()
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (mesh && !nodeForMesh.has(mesh)) nodeForMesh.set(mesh, node)
  }
  const toWorld = (m, p) => [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]

  const prints = []
  for (const mesh of root.listMeshes()) {
    const node = nodeForMesh.get(mesh)
    const matrix = node ? node.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for (const prim of mesh.listPrimitives()) {
      if (!artworkMats.has(prim.getMaterial())) continue
      const position = prim.getAttribute('POSITION')
      if (!position) continue
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      const element = [0, 0, 0]
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, element)
        const w = toWorld(matrix, element)
        for (let k = 0; k < 3; k++) {
          if (w[k] < min[k]) min[k] = w[k]
          if (w[k] > max[k]) max[k] = w[k]
        }
      }
      prints.push({
        name: prim.getMaterial()?.getName() ?? '(unnamed)',
        centre: [0, 1, 2].map((k) => (min[k] + max[k]) / 2),
        area: (max[0] - min[0]) * (max[1] - min[1]),
      })
    }
  }

  if (prints.length === 0) {
    throw new Error(
      'No artwork primitives found in the built baseline, so there is nothing for this eval to measure.\n' +
        '  `isArtworkTexture` matched no material. Either the export lost its prints, or the heuristic no\n' +
        '  longer recognises them — both are findings, neither is a pass.',
    )
  }

  prints.sort((a, b) => b.area - a.area)
  const biggest = prints[0]
  const target = ARTWORK_VIEWS[0].target.split(/\s+/).map((v) => Number.parseFloat(v))
  const distance = Math.hypot(...[0, 1, 2].map((k) => target[k] - biggest.centre[k]))

  if (distance > TARGET_TOLERANCE_M) {
    throw new Error(
      `The camera is not pointed at the artwork any more.\n\n` +
        `  configured target : ${target.map((n) => n.toFixed(3)).join(', ')}\n` +
        `  largest print     : "${biggest.name}" centred at ${biggest.centre.map((n) => n.toFixed(3)).join(', ')}\n` +
        `  distance          : ${distance.toFixed(3)} m (tolerance ${TARGET_TOLERANCE_M} m)\n\n` +
        `  This is a HARD FAILURE on purpose. A mis-aimed camera still produces a perfectly\n` +
        `  plausible damage number — it just measures fabric. That is how render.ts's own\n` +
        `  \`crop-chest\` view was found to miss this garment's wordmark entirely.\n\n` +
        `  Re-frame ARTWORK_VIEWS against the new geometry, LOOK at the render, and re-calibrate.`,
    )
  }
  console.log(`framing ok — "${biggest.name}" is ${(distance * 1000).toFixed(0)} mm from the camera target\n`)
}

/** Optimise the raw export with `flags`, render the artwork crops, diff vs baseline. */
async function damageFor(raw, baselineDir, workDir, label, flags) {
  const out = join(workDir, `${label}.glb`)
  const { options } = parseOptimizeArgs([raw, '--out', out, ...flags])
  await optimizeGlb(raw, out, options)

  const renderDir = join(workDir, `render-${label}`)
  await renderViews(out, renderDir, { views: ARTWORK_VIEWS, width: RENDER_SIZE, height: RENDER_SIZE })

  const { diffs } = await compareRenders(baselineDir, renderDir, join(workDir, `sheet-${label}.png`))
  const perView = {}
  for (const view of ARTWORK_VIEWS) {
    perView[view.name] = diffs.find((d) => d.view === view.name)?.changedFraction ?? 0
  }
  const worstView = Object.entries(perView).sort((a, b) => b[1] - a[1])[0]
  return {
    label,
    perView,
    worst: worstView[1],
    worstView: worstView[0],
    sheet: join(workDir, `sheet-${label}.png`),
  }
}

const pct = (v) => `${(v * 100).toFixed(3)}%`

async function main() {
  const args = process.argv.slice(2)
  const calibrate = args.includes('--calibrate')
  const keepAt = args.indexOf('--keep')
  // `keepAt + 1` is NOT safe as "the index to skip": with no `--keep`, keepAt is -1
  // and keepAt + 1 is 0, which skips the first argument — so `eval-artwork-real.mjs
  // /path/to/raw.glb` silently ignored the path and measured the default garment
  // instead. Reporting a pass for a file nobody asked about is the one outcome this
  // eval must never have, so the -1 case is handled explicitly.
  const keepValueIndex = keepAt === -1 ? -1 : keepAt + 1
  const positional = args.find((a, i) => !a.startsWith('--') && i !== keepValueIndex)
  const raw = positional ?? process.env.RAW_GLB ?? join(REPO_ROOT, 'raw', 'cycling-all-colours.glb')

  try {
    await access(raw)
  } catch {
    // Not a silent skip. A missing raw export means this eval measured NOTHING,
    // and a run that measures nothing must never read as a pass.
    throw new Error(
      `The raw CLO export is not at ${raw}.\n\n` +
        `  It is 382 MB and gitignored, so it is not in a fresh clone. Pull it from the R2\n` +
        `  ingest bucket (the same command .gitignore documents):\n\n` +
        `    wrangler r2 object get "run-apparel-viewer-ingest/cycling-all-colours.glb" \\\n` +
        `      --file raw/cycling-all-colours.glb --remote\n\n` +
        `  Or pass a path: node scripts/eval-artwork-real.mjs /path/to/raw.glb`,
    )
  }

  const workDir = keepAt !== -1 ? args[keepAt + 1] : await mkdtemp(join(tmpdir(), 'artwork-real-'))
  await mkdir(workDir, { recursive: true })
  await assertPresetMatchesShared()

  console.log(`raw:      ${raw}`)
  console.log(`work dir: ${workDir}\n`)

  // Baseline: the full chain with decimation omitted.
  const baseGlb = join(workDir, 'baseline.glb')
  const { options: baseOptions } = parseOptimizeArgs([raw, '--out', baseGlb, ...BASELINE_FLAGS])
  await optimizeGlb(raw, baseGlb, baseOptions)

  // Before rendering anything: is the camera even looking at the print?
  await assertViewFramesArtwork(baseGlb)

  const baselineDir = join(workDir, 'render-baseline')
  const baseRender = await renderViews(baseGlb, baselineDir, {
    views: ARTWORK_VIEWS,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
  })
  console.log(`baseline rendered — variants: ${baseRender.availableVariants.join(', ') || '(none)'}\n`)

  const cases = calibrate
    ? [
        ['fidelity', FIDELITY_FLAGS],
        ['balanced', BALANCED_FLAGS],
        ['known-bad (sweep run F, err 0.005)', KNOWN_BAD_FLAGS],
        ['control (uv 0)', CONTROL_FLAGS],
      ]
    : [
        ['fidelity', FIDELITY_FLAGS],
        ['balanced', BALANCED_FLAGS],
        ['control', CONTROL_FLAGS],
      ]

  const results = {}
  for (const [label, flags] of cases) {
    const r = await damageFor(raw, baselineDir, workDir, label.replace(/[^a-z0-9]+/gi, '-'), flags)
    results[label] = r
    console.log(
      `  ${label.padEnd(36)} worst ${pct(r.worst).padStart(8)} (${r.worstView})   ` +
        ARTWORK_VIEWS.map((v) => `${v.name}=${pct(r.perView[v.name])}`).join(' '),
    )
  }

  if (calibrate) {
    console.log(`\nceiling currently ${pct(MAX_CHANGED_FRACTION)}`)
    console.log(`Artifacts in ${workDir}`)
    console.log(
      '\nPick a ceiling ABOVE `balanced` and BELOW both `known-bad` and `control`.\n' +
        'If those do not separate, this metric cannot tell damage from decimation and must not gate.',
    )
    return
  }

  const shipped = results['balanced']
  const fidelity = results['fidelity']
  const control = results['control']

  console.log(`\n  ceiling ${pct(MAX_CHANGED_FRACTION)}`)

  const failures = []
  if (shipped.worst > MAX_CHANGED_FRACTION) {
    failures.push(
      `The SHIPPED preset damaged N001's artwork: ${pct(shipped.worst)} of ${shipped.worstView} moved, ` +
        `over the ${pct(MAX_CHANGED_FRACTION)} ceiling.\n` +
        `  Open ${shipped.sheet} before touching the threshold. The three blocking gates cannot see this —\n` +
        `  the 2026-08-05 sweep passed all three on a run that rendered the wordmark illegible.`,
    )
  }
  if (fidelity.worst > shipped.worst) {
    failures.push(
      `fidelity damaged MORE than balanced (${pct(fidelity.worst)} vs ${pct(shipped.worst)}).\n` +
        `  fidelity is the stricter preset; if it is now the worse one, shrink.ts's ordering claim is false.`,
    )
  }
  if (control.worst <= MAX_CHANGED_FRACTION) {
    failures.push(
      `The NEGATIVE CONTROL did not register as damage: --uv-weight 0 changed only ${pct(control.worst)}, ` +
        `at or under the ${pct(MAX_CHANGED_FRACTION)} ceiling.\n` +
        `  Switching UV weighting off REMOVES the protection for printed graphics, so it must show up.\n` +
        `  This eval has gone BLIND. Fix the eval; do NOT relax the ceiling.`,
    )
  }

  if (failures.length) {
    console.error(`\n✗ real-garment artwork eval FAILED\n\n${failures.join('\n\n')}\n`)
    console.error(`Artifacts: ${workDir}`)
    process.exit(1)
  }

  const margin = control.worst / Math.max(shipped.worst, 1e-9)
  console.log(`\n✓ real-garment artwork eval passed — the control does ${margin.toFixed(1)}× the shipped preset's damage`)
}

await main()
