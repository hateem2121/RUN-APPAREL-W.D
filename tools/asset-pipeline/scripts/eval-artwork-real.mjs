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
 * ─── PER-GARMENT CONFIG LIVES IN raw/CANONICAL.json ─────────────────────────
 * The file is identified by SHA-256, and its views, ceiling and target tolerance
 * are read from its manifest entry. The constants in this file are FALLBACKS used
 * only for an unknown file under `--calibrate` — and they are N001's, so on a
 * different garment they will frame the wrong thing and the aim guard should stop
 * you. There is no environment override for the ceiling; that was removed on
 * 2026-08-07.
 *
 * Usage:
 *   node scripts/eval-artwork-real.mjs [raw.glb]                 assert
 *   node scripts/eval-artwork-real.mjs [raw.glb] --calibrate     print the damage curve
 *   node scripts/eval-artwork-real.mjs [raw.glb] --keep <dir>    keep renders + sheets
 *   node scripts/eval-artwork-real.mjs [raw.glb] --all-variants  every colourway, not just the default
 *
 * Env:
 *   RAW_GLB   path to the raw CLO export (default: <repo>/raw/cycling-all-colours.glb)
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
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
 *
 * ⚠️ THE CEILING IS PER-GARMENT DATA AND LIVES IN raw/CANONICAL.json, not here.
 * There was an `EVAL_REAL_CEILING` environment override until 2026-08-07; it was
 * REMOVED. A ceiling that any environment variable can raise is a ceiling that can
 * be raised without touching a reviewed file, leaving no trace next to the contact
 * sheets that justify it — and "do not raise the ceiling to make it green" is the
 * single most repeated instruction in this codebase. The tuning path is
 * `--calibrate`, look at the sheets, then edit the manifest beside the evidence.
 *
 * The value below is the FALLBACK for a garment the manifest does not know, which
 * only happens under `--calibrate`, where nothing is asserted anyway.
 */
const DEFAULT_CEILING = 0.042

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
 *
 * ⚠️ THE VIEWS ARE PER-GARMENT DATA AND LIVE IN raw/CANONICAL.json. This constant
 * is the FALLBACK for an unknown file under `--calibrate`, and it is N001's, so
 * expect it to be wrong for anything else — which is exactly why the manifest
 * carries a `cameraFingerprint` that must match the calibration.
 */
const DEFAULT_ARTWORK_VIEWS = [
  { name: 'wordmark', orbit: '-0.2deg 90deg 0.445m', target: '0m 1.314m 0.069m', fieldOfView: '14deg' },
]

/**
 * A stable digest of the camera, so a changed view cannot keep an old ceiling.
 *
 * WHY THIS EXISTS. The framing guard below checks the camera is AIMED at the print.
 * It does not check the ZOOM, and it cannot: model-viewer clamps orbit radius to
 * its own framing of the bounding sphere (measured — 0.445m, 0.300m and 0.180m
 * render pixel-identically), so the distance in the orbit string is not the real
 * camera distance and any projected-size calculation from it would be fiction.
 *
 * So the zoom is pinned instead of computed. Widening `fieldOfView` from 14° to
 * 40° keeps the camera pointed at exactly the same spot — the aim guard stays
 * green — while the crop fills with fabric and the measured damage becomes a
 * statement about seams. Pinning the whole view means that edit fails loudly and
 * demands a re-calibration, which is the same trick `assertPresetMatchesShared`
 * plays on the decimation flags.
 */
function cameraFingerprint(views) {
  return createHash('sha256')
    .update(JSON.stringify(views.map((v) => [v.name, v.orbit, v.target ?? '', v.fieldOfView ?? ''])))
    .digest('hex')
    .slice(0, 16)
}

/**
 * How far the configured target may sit from the real artwork centre, in metres,
 * before this eval refuses to run.
 *
 * This exists because of the `crop-chest` mistake above: a camera pointed at the
 * wrong part of the garment produces a NUMBER, not an error, and the number looks
 * fine. If a re-exported garment moves the print, this must fail loudly rather
 * than quietly start measuring fabric. 0.05 m ≈ half the wordmark's height.
 */
const DEFAULT_TARGET_TOLERANCE_M = 0.05

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

/** Stream the file through sha256. Measured on the 382 MB N001 export: 0.8 s. */
async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Refuse to run on a file this eval has not been calibrated against.
 *
 * WHY A CHECKSUM AND NOT A FILENAME. The raw export is gitignored and, since the
 * ingest bucket grew an `expire-raw-uploads` rule (14 days, all prefixes), it is
 * not re-downloadable either — so `raw/cycling-all-colours.glb` is whatever
 * happens to be sitting at that path on one laptop. A re-export from CLO, or a
 * different upload, lands at the SAME path with the SAME name and a different
 * geometry, and every threshold in this file was calibrated against one specific
 * 382,107,380-byte file.
 *
 * The failure that would produce is not a crash. It is a plausible number for the
 * wrong garment — exactly the shape of the `crop-chest` mistake documented above,
 * where a mis-aimed camera measured fabric and reported a healthy-looking result.
 * That one was caught by a human opening a PNG. This one would not be, because
 * nothing about the output would look unusual.
 *
 * ⚠️ AN UNKNOWN FILE IS NOT AN ERROR IN `--calibrate` MODE. Calibrating a new
 * garment is precisely when you legitimately hold a file the manifest does not
 * know, so that path prints the checksum to paste in rather than refusing. The
 * asserting path requires a known file; the calibrating path is how a file
 * becomes known. Do not "fix" a mismatch by editing the checksum — that discards
 * the only evidence that the ceiling applies to this garment.
 */
async function identifyGarment(raw, { calibrate }) {
  const manifestPath = join(REPO_ROOT, 'raw', 'CANONICAL.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Could not read the canonical manifest at ${manifestPath}: ${error.message}\n\n` +
        `  It is committed (raw/* is gitignored, raw/CANONICAL.json is negated), so a\n` +
        `  missing one means the checkout is broken rather than the garment.`,
    )
  }

  const actual = await sha256Of(raw)
  const entry = Object.entries(manifest.garments ?? {}).find(([, g]) => g.sha256 === actual)

  if (entry) {
    const [id, garment] = entry
    const views = garment.views ?? DEFAULT_ARTWORK_VIEWS
    const ceiling = garment.calibration?.ceiling ?? DEFAULT_CEILING
    const tolerance = garment.targetToleranceM ?? DEFAULT_TARGET_TOLERANCE_M

    // The camera that produced `ceiling` must be the camera about to be used. See
    // cameraFingerprint() for why the zoom is pinned rather than measured.
    const recorded = garment.calibration?.cameraFingerprint
    const actual = cameraFingerprint(views)
    if (recorded && recorded !== actual) {
      throw new Error(
        `The camera for ${garment.productCode} has changed since its ceiling was calibrated.\n\n` +
          `    calibrated with : ${recorded}\n` +
          `    configured now  : ${actual}\n\n` +
          `  The aim guard cannot catch this. Widening fieldOfView keeps the camera pointed at\n` +
          `  exactly the same spot while the crop fills with fabric, so the damage number stays\n` +
          `  plausible and starts describing seams instead of letters.\n\n` +
          `  Re-calibrate: --calibrate, LOOK at the contact sheets, then update ceiling AND\n` +
          `  cameraFingerprint in raw/CANONICAL.json together.`,
      )
    }

    console.log(`garment:  ${garment.productCode} (${id}) — checksum matches the manifest`)
    console.log(`views:    ${views.map((v) => v.name).join(', ')}   ceiling ${(ceiling * 100).toFixed(3)}%`)
    return { id, garment, views, ceiling, tolerance }
  }

  const known = Object.entries(manifest.garments ?? {})
    .map(([id, g]) => `    ${id.padEnd(8)} ${g.sha256}  (${g.bytes} bytes)`)
    .join('\n')

  if (calibrate) {
    console.log(
      `\n⚠️  This file is NOT in raw/CANONICAL.json.\n\n` +
        `    sha256             ${actual}\n` +
        `    cameraFingerprint  ${cameraFingerprint(DEFAULT_ARTWORK_VIEWS)}  (from the N001 fallback views)\n\n` +
        `  That is fine in --calibrate mode — calibrating is how a file becomes known.\n` +
        `  ⚠️ The fallback views are N001's. For a differently-shaped garment they will\n` +
        `  frame the wrong part of it, and the aim guard below is what should stop you.\n` +
        `  Re-frame first, then calibrate, then LOOK at the contact sheets, and only then\n` +
        `  add an entry to raw/CANONICAL.json with the checksum, views, ceiling and the\n` +
        `  cameraFingerprint those numbers were measured with.\n`,
    )
    return {
      id: null,
      garment: null,
      views: DEFAULT_ARTWORK_VIEWS,
      ceiling: DEFAULT_CEILING,
      tolerance: DEFAULT_TARGET_TOLERANCE_M,
    }
  }

  throw new Error(
    `The raw export at ${raw} is not the file this eval was calibrated against.\n\n` +
      `    expected one of:\n${known}\n` +
      `    got:      ${actual}\n\n` +
      `  Every threshold — the ceiling, the camera views, the target tolerance — is recorded\n` +
      `  per garment and was derived from one specific export. Run against a different file\n` +
      `  and\n` +
      `  this reports a perfectly plausible number for a garment nobody calibrated it on.\n\n` +
      `  If this IS a new garment, calibrate it: re-run with --calibrate, LOOK at the\n` +
      `  contact sheets, then add it to raw/CANONICAL.json. Do NOT edit the checksum of an\n` +
      `  existing entry to make this pass.`,
  )
}

/**
 * Refuse to run if a camera is not actually pointed at any artwork.
 *
 * Reads the artwork primitives out of the built baseline, transforms each into
 * world space, and checks EVERY configured view's `target` lands on one of them.
 * See DEFAULT_TARGET_TOLERANCE_M for why this is a hard failure.
 *
 * ⚠️ EVERY view, and against ANY print — not `views[0]` against the largest.
 * Until 2026-08-07 this checked only the first view against the single biggest
 * print, which had two consequences. Adding a second view left it completely
 * unguarded, silently. And "biggest" is measured by XY bounding box, so a print
 * wrapped around the body inflates its box and outranks a small flat one — on a
 * garment whose fragile print is not its largest, aiming correctly at the fragile
 * one would have been reported as a MISS. Matching each view to its nearest print
 * is both stricter (all views checked) and correct (no assumption that the biggest
 * print is the interesting one).
 */
async function assertViewFramesArtwork(glbPath, views, toleranceM) {
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

  for (const view of views) {
    if (!view.target) {
      throw new Error(
        `View "${view.name}" has no \`target\`, so nothing can verify what it is pointed at.\n` +
          `  model-viewer would fall back to 'auto' (the bounding-box centre), which on a garment\n` +
          `  is its middle — fabric. Give every artwork view an explicit target.`,
      )
    }
    const target = view.target.split(/\s+/).map((v) => Number.parseFloat(v))

    // Nearest print, not the biggest one. See the note above the function.
    let nearest = null
    for (const print of prints) {
      const distance = Math.hypot(...[0, 1, 2].map((k) => target[k] - print.centre[k]))
      if (!nearest || distance < nearest.distance) nearest = { print, distance }
    }

    if (nearest.distance > toleranceM) {
      const nearby = prints
        .map((p) => ({ p, d: Math.hypot(...[0, 1, 2].map((k) => target[k] - p.centre[k])) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5)
        .map(({ p, d }) => `      ${d.toFixed(3)} m  "${p.name}" at ${p.centre.map((n) => n.toFixed(3)).join(', ')}`)
        .join('\n')

      throw new Error(
        `View "${view.name}" is not pointed at any artwork.\n\n` +
          `  configured target : ${target.map((n) => n.toFixed(3)).join(', ')}\n` +
          `  nearest print     : "${nearest.print.name}" at ${nearest.distance.toFixed(3)} m ` +
          `(tolerance ${toleranceM} m)\n\n` +
          `  closest prints:\n${nearby}\n\n` +
          `  This is a HARD FAILURE on purpose. A mis-aimed camera still produces a perfectly\n` +
          `  plausible damage number — it just measures fabric. That is how render.ts's own\n` +
          `  \`crop-chest\` view was found to miss this garment's wordmark entirely.\n\n` +
          `  Re-frame the view in raw/CANONICAL.json against the new geometry, LOOK at the\n` +
          `  render, and re-calibrate — updating ceiling and cameraFingerprint together.`,
      )
    }
    console.log(
      `framing ok — "${view.name}" → "${nearest.print.name}", ${(nearest.distance * 1000).toFixed(0)} mm from target`,
    )
  }
  console.log()
}

/** Optimise the raw export with `flags`, render the artwork crops, diff vs baseline. */
async function damageFor(raw, baselineDir, workDir, label, flags, views, variant) {
  const out = join(workDir, `${label}.glb`)
  const { options } = parseOptimizeArgs([raw, '--out', out, ...flags])
  await optimizeGlb(raw, out, options)

  const renderDir = join(workDir, `render-${label}`)
  await renderViews(out, renderDir, { views, width: RENDER_SIZE, height: RENDER_SIZE, variant })

  const { diffs } = await compareRenders(baselineDir, renderDir, join(workDir, `sheet-${label}.png`))
  const perView = {}
  for (const view of views) {
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
        `  It is 382 MB and gitignored, so it is not in a fresh clone — and it is NOT\n` +
        `  reliably in R2 either. The ingest bucket expires every object after 14 days\n` +
        `  (\`expire-raw-uploads\`, all prefixes), so the N001 export expired around\n` +
        `  2026-08-19. The canonical copy is a LOCAL one; see raw/CANONICAL.json for its\n` +
        `  size and SHA-256, and docs/RUNBOOK.md → "The canonical raw garment".\n\n` +
        `  If the object does still exist, note the key has SPACES — the hyphenated name\n` +
        `  is the local filename, not the key:\n\n` +
        `    wrangler r2 object get "run-apparel-viewer-ingest/cycling all colours.glb" \\\n` +
        `      --file raw/cycling-all-colours.glb --remote\n\n` +
        `  Or pass a path: node scripts/eval-artwork-real.mjs /path/to/raw.glb`,
    )
  }

  const workDir = keepAt !== -1 ? args[keepAt + 1] : await mkdtemp(join(tmpdir(), 'artwork-real-'))
  await mkdir(workDir, { recursive: true })
  await assertPresetMatchesShared()

  console.log(`raw:      ${raw}`)
  console.log(`work dir: ${workDir}`)

  // Before anything expensive: is this even the garment the numbers below describe?
  // Cheap (0.8 s on 382 MB) and it runs first, so a wrong file costs a second rather
  // than the four minutes it takes to reach a meaningless result.
  const { views, ceiling, tolerance } = await identifyGarment(raw, { calibrate })
  console.log()

  // Baseline: the full chain with decimation omitted.
  const baseGlb = join(workDir, 'baseline.glb')
  const { options: baseOptions } = parseOptimizeArgs([raw, '--out', baseGlb, ...BASELINE_FLAGS])
  await optimizeGlb(raw, baseGlb, baseOptions)

  // Before rendering anything: is the camera even looking at the print?
  await assertViewFramesArtwork(baseGlb, views, tolerance)

  // Probe render, primarily to learn which colourways the file exposes.
  const baselineDir = join(workDir, 'render-baseline')
  const baseRender = await renderViews(baseGlb, baselineDir, {
    views,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
  })
  const available = baseRender.availableVariants ?? []

  /**
   * Which colourways to measure.
   *
   * Decimation changes GEOMETRY, and geometry is shared across KHR_materials_variants
   * — so the default variant is a fair proxy for the others in most cases. What it is
   * NOT a proxy for is per-variant artwork: a colourway whose print sits at lower
   * contrast against its fabric can show damage the default one hides.
   *
   * Measuring all five multiplies the render count by five for a manual eval that
   * already takes four minutes, so it is opt-in. What is NOT optional is SAYING SO:
   * this repo's own rule is that a bounded scope must be logged, because silent
   * truncation reads as "covered everything" when it did not. Until 2026-08-07 this
   * eval read `availableVariants`, printed it, and discarded it — measuring exactly
   * one colourway while looking like it had considered them.
   */
  const measured = args.includes('--all-variants') && available.length ? available : [null]

  console.log(`baseline rendered — variants in file: ${available.join(', ') || '(none)'}`)
  if (measured[0] === null) {
    console.log(
      `⚠️  measuring the DEFAULT variant only.` +
        (available.length > 1
          ? ` NOT measured: ${available.slice(1).join(', ')}. Pass --all-variants to include them.`
          : ''),
    )
  } else {
    console.log(`measuring all ${measured.length} variants: ${measured.join(', ')}`)
  }
  console.log()

  // One baseline render per measured variant, so each diff compares like with like.
  const baselineFor = new Map([[null, baselineDir]])
  for (const variant of measured) {
    if (variant === null) continue
    const dir = join(workDir, `render-baseline-${variant.replace(/[^a-z0-9]+/gi, '-')}`)
    await renderViews(baseGlb, dir, { views, width: RENDER_SIZE, height: RENDER_SIZE, variant })
    baselineFor.set(variant, dir)
  }

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
    const slug = label.replace(/[^a-z0-9]+/gi, '-')
    // Worst across every measured colourway — a preset is only as good as its
    // weakest variant, so averaging here would hide exactly what this looks for.
    let worstOverall = null
    for (const variant of measured) {
      const suffix = variant === null ? '' : `-${variant.replace(/[^a-z0-9]+/gi, '-')}`
      const r = await damageFor(raw, baselineFor.get(variant), workDir, `${slug}${suffix}`, flags, views, variant)
      r.variant = variant
      if (!worstOverall || r.worst > worstOverall.worst) worstOverall = r
      if (measured.length > 1) {
        console.log(`    ${(variant ?? 'default').padEnd(32)} worst ${pct(r.worst).padStart(8)} (${r.worstView})`)
      }
    }
    results[label] = worstOverall
    console.log(
      `  ${label.padEnd(36)} worst ${pct(worstOverall.worst).padStart(8)} (${worstOverall.worstView}` +
        `${worstOverall.variant ? `, ${worstOverall.variant}` : ''})   ` +
        views.map((v) => `${v.name}=${pct(worstOverall.perView[v.name])}`).join(' '),
    )
  }

  if (calibrate) {
    console.log(`\nceiling currently ${pct(ceiling)}`)
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

  console.log(`\n  ceiling ${pct(ceiling)}`)

  const failures = []
  if (shipped.worst > ceiling) {
    failures.push(
      `The SHIPPED preset damaged N001's artwork: ${pct(shipped.worst)} of ${shipped.worstView} moved, ` +
        `over the ${pct(ceiling)} ceiling.\n` +
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
  if (control.worst <= ceiling) {
    failures.push(
      `The NEGATIVE CONTROL did not register as damage: --uv-weight 0 changed only ${pct(control.worst)}, ` +
        `at or under the ${pct(ceiling)} ceiling.\n` +
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
