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
 *   node scripts/eval-artwork-real.mjs [raw.glb] --find-views    locate the prints, propose cameras
 *   node scripts/eval-artwork-real.mjs [raw.glb] --calibrate     print the damage curve
 *   node scripts/eval-artwork-real.mjs [raw.glb] --keep <dir>    keep renders + sheets
 *   node scripts/eval-artwork-real.mjs [raw.glb] --all-variants  every colourway, not just the default
 *
 * For a garment that has never been calibrated, the order is --find-views, then add
 * the manifest entry, then --calibrate. See RUNBOOK → "Replacing or adding a garment".
 *
 * Env:
 *   RAW_GLB   path to the raw CLO export (default: <repo>/raw/cycling-all-colours.glb)
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import sharp from 'sharp'
import { compareRenders } from '../src/compare.ts'
import { createIO } from '../src/io.ts'
import { optimizeGlb, parseOptimizeArgs } from '../src/optimize.ts'
import { renderViews } from '../src/render.ts'
import { isThreadOrHardwareName } from '../src/artwork-geometry.ts'
import { isArtworkTexture } from '../src/texture-artwork.ts'
import { shrinkFlagsFor } from '../../../packages/shared/src/shrink.ts'

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
 * The shipped presets — IMPORTED, not copied, since 2026-09-02.
 *
 * This file kept a hand copy "because this package installs with plain npm inside
 * the container, where workspace:* cannot resolve". True of the container; false of
 * this script, which only ever runs under tsx in the workspace, where a relative
 * import of the shared source resolves fine (scripts/robot-flags.mjs does the same).
 * The copy drifted on 2026-08-21 when --stitch and the texture flags were added, its
 * own guard refused to start, and the repository's only real-garment artwork check
 * was dead for eleven days (audit C-01, S1). An import cannot drift.
 */
const BALANCED_FLAGS = shrinkFlagsFor('balanced')
const FIDELITY_FLAGS = shrinkFlagsFor('fidelity')

/** Replace one flag's value inside a preset, so a control tracks the preset it controls. */
function withFlag(flags, name, value) {
  const out = [...flags]
  const at = out.indexOf(name)
  if (at === -1) throw new Error(`preset carries no ${name}; the control cannot be derived from it`)
  out[at + 1] = value
  return out
}

/**
 * The negative control: the shipped preset with UV protection switched off.
 * Same axis as the synthetic eval, and for the same reason — parseOptimizeArgs
 * leaves the UV weight unset by default, so a caller that stops passing the flag
 * loses artwork protection silently. A realistic regression, not a contrived one.
 */
// ⚠️ SINCE 2026-09-02 A PRINT PIECE IS NEVER DECIMATED (fix plan Rank 3). Neither
// control could reach the label any more — both read the shipped number and the eval
// reported itself blind, correctly. Both now also pass `--decimate-artwork`, the
// negative-control flag that lets decimation reach the print as every run did
// before, so the damage is still produced and still measured. The shipped presets
// never carry it (strategy.test.ts).
const CONTROL_FLAGS = [...withFlag(BALANCED_FLAGS, '--uv-weight', '0'), '--decimate-artwork']

/** Run F from the 2026-08-05 sweep: known to render the wordmark illegible. */
const KNOWN_BAD_FLAGS = [
  ...withFlag(BALANCED_FLAGS, '--simplify-error', '0.005'),
  '--decimate-artwork',
]

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
  {
    name: 'wordmark',
    orbit: '-0.2deg 90deg 0.445m',
    target: '0m 1.314m 0.069m',
    fieldOfView: '14deg',
  },
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
 * demands a re-calibration, which is the same trick the old preset drift guard
 * plays on the decimation flags.
 */
function cameraFingerprint(views) {
  return createHash('sha256')
    .update(
      JSON.stringify(views.map((v) => [v.name, v.orbit, v.target ?? '', v.fieldOfView ?? ''])),
    )
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

/**
 * Flat neutral light, shadows off — the harness's OLD default and the light every
 * ceiling in raw/CANONICAL.json was calibrated in. Specular highlights move when
 * geometry changes, so a lit diff lights up everywhere; the flat mode isolates the
 * texture and the UVs beneath it. The harness's default became production lighting
 * on 2026-09-02, so this eval now asks for the flat mode by name. Its instruments
 * (near plane, decal bias) are on in both modes, as they are for a customer.
 */
const EVAL_LIGHTING = 'diagnostic'

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
    //
    // ⚠️ EXEMPT UNDER --calibrate, for the same reason an unknown checksum is, and
    // this was NOT exempt until 2026-08-09. The guard refused the very command its
    // own error message told you to run: adding a view to a KNOWN garment changed
    // the fingerprint, so `--calibrate` — the command whose entire purpose is to
    // produce a new fingerprint — threw before rendering anything. Following
    // docs/RUNBOOK.md → "Replacing or adding a garment" step 4 hit it head-on. The
    // only way out was to hand-edit the recorded fingerprint to a value you had
    // not measured yet, which is exactly the move this guard exists to prevent.
    const recorded = garment.calibration?.cameraFingerprint
    const configured = cameraFingerprint(views)
    if (recorded && recorded !== configured) {
      if (!calibrate) {
        throw new Error(
          `The camera for ${garment.productCode} has changed since its ceiling was calibrated.\n\n` +
            `    calibrated with : ${recorded}\n` +
            `    configured now  : ${configured}\n\n` +
            `  The aim guard cannot catch this. Widening fieldOfView keeps the camera pointed at\n` +
            `  exactly the same spot while the crop fills with fabric, so the damage number stays\n` +
            `  plausible and starts describing seams instead of letters.\n\n` +
            `  Re-calibrate: --calibrate, LOOK at the contact sheets, then update ceiling AND\n` +
            `  cameraFingerprint in raw/CANONICAL.json together.`,
        )
      }
      // Loud rather than silent: the run that follows measures a DIFFERENT camera
      // from the one the recorded ceiling describes, so that ceiling means nothing
      // until both values are replaced together.
      console.log(
        `\n⚠️  camera CHANGED since the last calibration\n` +
          `      calibrated with : ${recorded}\n` +
          `      configured now  : ${configured}\n` +
          `    Expected here — calibrating is how a new camera becomes recorded. The\n` +
          `    recorded ceiling does NOT describe this camera: LOOK at the sheets, then\n` +
          `    update ceiling AND cameraFingerprint together.\n`,
      )
    }

    console.log(`garment:  ${garment.productCode} (${id}) — checksum matches the manifest`)
    console.log(
      `views:    ${views.map((v) => v.name).join(', ')}   ceiling ${(ceiling * 100).toFixed(3)}%`,
    )
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
/**
 * Every artwork primitive in a built GLB, with its world-space bounds.
 *
 * ⚠️ THIS IS THE SINGLE DEFINITION OF "WHERE THE PRINTS ARE", used by BOTH the aim
 * guard below and `--find-views`. Keep it that way. If discovery could disagree
 * with the guard about which primitives count as artwork, `--find-views` would
 * cheerfully suggest a camera the guard then rejects, and the operator would be
 * bounced between two tools that each believe they are right — which is precisely
 * the dead end `--find-views` was added to remove. The reason it is called on the
 * BUILT BASELINE rather than the raw export is the same one: `isArtworkTexture`
 * inspects decoded pixels and aspect ratios, so raw and processed textures can
 * classify differently, and the guard's answer is the one that has to win.
 *
 * Also returns the whole model's bounds, which `--find-views` needs to decide
 * which SIDE of the garment a print is on. Those come from each accessor's
 * declared min/max rather than a vertex walk: it is an order of magnitude cheaper
 * on a 66 MB baseline and only ever feeds a front/back decision, whereas the
 * artwork bounds below are walked per-vertex because a print's centre is what the
 * tolerance check is measured against.
 */
async function findArtworkPrints(glbPath) {
  const io = await createIO()
  const doc = await io.read(glbPath)
  const root = doc.getRoot()

  const artworkMats = new Set()
  for (const material of root.listMaterials()) {
    // Thread and hardware are never prints, whatever their picture looks like — the
    // same rule the blocking gate applies since Rank 2 (CLO's 236x39 topstitch strip
    // reads as a wordmark by shape). Without this, APEX's --find-views offered
    // "Topstitch 1" and "Zipper 1_TapeFabric" as two of its four frames (2026-09-02).
    if (isThreadOrHardwareName(material.getName() ?? '')) continue
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
  const modelMin = [Infinity, Infinity, Infinity]
  const modelMax = [-Infinity, -Infinity, -Infinity]

  for (const mesh of root.listMeshes()) {
    const node = nodeForMesh.get(mesh)
    const matrix = node ? node.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION')
      if (!position) continue

      // Whole-garment bounds from the declared accessor AABB, transformed corner by
      // corner. Every primitive contributes, artwork or not — the front of a garment
      // is decided by the body, not by the decals stuck to it.
      const localMin = position.getMin([0, 0, 0])
      const localMax = position.getMax([0, 0, 0])
      for (let corner = 0; corner < 8; corner++) {
        const w = toWorld(matrix, [
          corner & 1 ? localMax[0] : localMin[0],
          corner & 2 ? localMax[1] : localMin[1],
          corner & 4 ? localMax[2] : localMin[2],
        ])
        for (let k = 0; k < 3; k++) {
          if (w[k] < modelMin[k]) modelMin[k] = w[k]
          if (w[k] > modelMax[k]) modelMax[k] = w[k]
        }
      }

      if (!artworkMats.has(prim.getMaterial())) continue
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
        min,
        max,
        span: [0, 1, 2].map((k) => max[k] - min[k]),
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
  return { prints, modelMin, modelMax }
}

async function assertViewFramesArtwork(glbPath, views, toleranceM) {
  const { prints } = await findArtworkPrints(glbPath)

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
        .map(
          ({ p, d }) =>
            `      ${d.toFixed(3)} m  "${p.name}" at ${p.centre.map((n) => n.toFixed(3)).join(', ')}`,
        )
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

/**
 * The zoom ladder for `--find-views`, as multiples of a size-scaled estimate.
 *
 * ⚠️ A LADDER RATHER THAN ONE COMPUTED VALUE, ON PURPOSE. The obvious move is to
 * solve for the fieldOfView that makes a print fill some fraction of the frame.
 * It cannot be done from first principles here, and the attempt would be fiction:
 * model-viewer clamps orbit radius to its own framing of the bounding sphere —
 * measured 2026-08-06, 0.445m / 0.300m / 0.180m render pixel-identically on N001 —
 * so the camera distance that calculation needs is neither set nor readable by this
 * script. The zoom is therefore chosen the way N001's was: render several and LOOK.
 *
 * ⚠️ AND IT IS SCALED PER PRINT, WHICH THE FIRST VERSION GOT WRONG. A fixed ladder
 * of [10, 14, 20, 28]° was tried against the real N001 export on 2026-08-08 and the
 * contact sheet showed why it fails: the wordmark spans 0.202 m and framed
 * correctly, while `TEAM WEAR FRONT LABEL` (0.039 m) and `Teamwear Logo` (0.030 m)
 * were unreadable specks at every rung including the tightest. One garment holds a
 * 6× range of print sizes, so one ladder cannot serve them — and the failure is the
 * quiet kind, because a speck in frame still yields a plausible damage number that
 * is mostly fabric.
 */
const FOV_LADDER_MULTIPLIERS = [0.7, 1.0, 1.5, 2.2]

/**
 * The empirical anchor the ladder scales from: N001's chest wordmark spans 0.202 m
 * and is correctly framed at 14°.
 *
 * This is a MEASUREMENT, not a constant of nature. 14° is the value hand-derived
 * for N001 and calibrated against contact sheets on 2026-08-06; 0.202 m is that
 * print's largest world-space dimension as read out of the built baseline on
 * 2026-08-08. Angular size is roughly linear in object size at a fixed camera
 * distance, and the distance IS fixed here (model-viewer clamps it), so scaling off
 * the one known-good pair is better grounded than any formula this script could
 * derive — and it reproduces [9.8, 14, 21, 30.8]° for the wordmark itself, i.e. the
 * ladder that was already confirmed by eye.
 *
 * It remains an ESTIMATE that positions a ladder. The person still looks.
 */
const FOV_ANCHOR = { degrees: 14, spanM: 0.202 }

/** model-viewer gets unstable at extreme fields of view; keep the ladder sane. */
const FOV_RANGE = { min: 1, max: 45 }

/** The four candidate zooms for one print, tight to loose, scaled to its size. */
function fovLadderFor(print) {
  const estimate = FOV_ANCHOR.degrees * (Math.max(...print.span) / FOV_ANCHOR.spanM)
  return FOV_LADDER_MULTIPLIERS.map((m) =>
    Number(Math.min(FOV_RANGE.max, Math.max(FOV_RANGE.min, estimate * m)).toFixed(1)),
  )
}

/**
 * How many prints `--find-views` will render a ladder for.
 *
 * A garment can carry a dozen artwork primitives (N001 has six) and each costs
 * FOV_LADDER.length renders under swiftshader. Capped so discovery stays a
 * few-minute step. The cap is LOGGED rather than silent — this repo's rule, earned
 * when the eval read `availableVariants`, printed them, and measured one.
 */
const FIND_VIEWS_MAX_PRINTS = 4

/**
 * Propose a camera for a print: aim at its centre, stand off whichever side of the
 * garment it faces.
 *
 * `orbit` is model-viewer's "theta phi radius". Theta 0° looks from +Z, so the
 * azimuth is the print's bearing from the garment's own centre — that is what makes
 * a back print orbit round to ~180° instead of being photographed through the
 * fabric. Phi is held at 90° (level with the target) because `target` re-centres the
 * orbit on the print itself, which is exactly how N001's view is built.
 *
 * Sanity check against the one hand-derived camera in the repo: N001's wordmark
 * centres at (0, 1.314, 0.069) on a body centred near x=0, z=0, giving
 * atan2(0, 0.069) = 0.0°. The hand-derived value is -0.2°.
 *
 * ⚠️ THE RADIUS IS INERT AND IS EMITTED AS A CONSTANT. See FOV_LADDER: model-viewer
 * overrides it. It is kept in the string because `orbit` is a three-part format and
 * because the cameraFingerprint hashes what is written down, not what the renderer
 * did with it. Do not read it as a measurement.
 */
function suggestViewFor(print, modelMin, modelMax, fieldOfView) {
  const modelCentre = [0, 1, 2].map((k) => (modelMin[k] + modelMax[k]) / 2)
  const theta =
    (Math.atan2(print.centre[0] - modelCentre[0], print.centre[2] - modelCentre[2]) * 180) / Math.PI
  return {
    name: slugForPrint(print),
    orbit: `${theta.toFixed(1)}deg 90deg 0.45m`,
    target: print.centre.map((n) => `${n.toFixed(3)}m`).join(' '),
    fieldOfView: `${fieldOfView}deg`,
  }
}

/** Material names carry spaces, brackets and IDs; view names become filenames. */
function slugForPrint(print) {
  const slug = print.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'artwork'
}

/**
 * Tile the ladder renders into one PNG, labelled, so the choice is made by looking
 * at them side by side rather than by opening sixteen files in turn.
 *
 * Deliberately NOT `compareRenders` — that diffs two directories and its whole
 * output is a subtraction. Nothing is being compared here; this is a contact sheet
 * of candidates.
 */
async function montage(cells, outFile, columns, cell = 384) {
  const rows = Math.ceil(cells.length / columns)
  const label = 22
  const layers = []

  for (const [i, { file, caption }] of cells.entries()) {
    const x = (i % columns) * cell
    const y = Math.floor(i / columns) * (cell + label)
    const text = caption.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
    layers.push({
      input: Buffer.from(
        `<svg width="${cell}" height="${label}"><rect width="${cell}" height="${label}" fill="#111"/>` +
          `<text x="6" y="15" font-family="monospace" font-size="12" fill="#eee">${text}</text></svg>`,
      ),
      top: y,
      left: x,
    })
    layers.push({
      input: await sharp(file).resize(cell, cell, { fit: 'contain' }).toBuffer(),
      top: y + label,
      left: x,
    })
  }

  await sharp({
    create: {
      width: columns * cell,
      height: rows * (cell + label),
      channels: 3,
      background: { r: 17, g: 17, b: 17 },
    },
  })
    .composite(layers)
    .png()
    .toFile(outFile)
}

/**
 * `--find-views`: answer "where are this garment's prints, and what camera sees
 * them?" for a file nobody has calibrated yet.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Until 2026-08-08 the documented procedure for garment #2 (RUNBOOK → "Replacing
 * or adding a garment") dead-ended at its own step 3. It said to run `--calibrate`
 * on the new export — but `views` falls back to N001's, the aim guard correctly
 * refuses a camera pointed at a different body's chest, and NOTHING told you where
 * the new garment's prints actually were. N001's own numbers were derived by hand
 * from primitive world-space bounds and then checked by eye; that derivation was
 * never a tool, so every garment after the first inherited a research task
 * disguised as a five-step list.
 *
 * The data was already being computed — `assertViewFramesArtwork` has always known
 * every print's world-space centre. It only ever printed it inside a failure
 * message, listing the five nearest to a target you do not have yet. This turns
 * that into the first step instead of the error you hit at the third.
 *
 * It does NOT choose the camera for you. It narrows sixteen unknowns to a labelled
 * contact sheet and a paste-ready block, and the person still looks.
 */
async function findViews(raw, workDir) {
  const baseGlb = join(workDir, 'baseline.glb')
  console.log('building the baseline (full chain minus decimation) — this is the slow part\n')
  const { options } = parseOptimizeArgs([raw, '--out', baseGlb, ...BASELINE_FLAGS])
  await optimizeGlb(raw, baseGlb, options)

  const { prints, modelMin, modelMax } = await findArtworkPrints(baseGlb)

  console.log(
    `${prints.length} artwork primitive${prints.length === 1 ? '' : 's'}, largest first:\n`,
  )
  console.log('    #   area m²   centre x, y, z              span w×h m      material')
  for (const [i, p] of prints.entries()) {
    console.log(
      `    ${String(i + 1).padStart(2)}  ${p.area.toFixed(5).padStart(8)}  ` +
        `${p.centre.map((n) => n.toFixed(3).padStart(7)).join(', ')}  ` +
        `${p.span[0].toFixed(3)}×${p.span[1].toFixed(3)}   ${p.name}`,
    )
  }
  console.log()

  // ONE FRAME PER DISTINCT MATERIAL, largest primitive of each — not the largest
  // primitives outright. On the tennis suit the 41 largest artwork primitives were
  // all one printed-stitching material, so the four proposed cameras looked at
  // stitching and both real prints (#42 and #44 by area) were listed as not rendered
  // (audit C-05). A print is a material; a primitive is a piece of one.
  const byMaterial = new Map()
  for (const print of prints) {
    const key = print.name.replace(/_\d+$/, '')
    if (!byMaterial.has(key)) byMaterial.set(key, print)
  }
  const distinct = [...byMaterial.values()]
  const chosen = distinct.slice(0, FIND_VIEWS_MAX_PRINTS)
  console.log(
    `${distinct.length} distinct artwork material(s); proposing one view each for the first ${chosen.length}: ` +
      `${chosen.map((p) => `"${p.name}"`).join(', ')}\n`,
  )
  if (distinct.length > chosen.length) {
    // Say what was dropped. A capped run that reads as a complete one is the
    // failure mode this file exists to prevent.
    console.log(
      `⚠️  NOT rendered (beyond the first ${chosen.length} materials): ` +
        `${distinct
          .slice(chosen.length)
          .map((p) => `"${p.name}"`)
          .join(', ')}.\n` +
        `    Their centres are in the table above — a view can be written by hand from one.\n`,
    )
  }

  // A "rung" is a column of the contact sheet: the same tightness for every print,
  // but a DIFFERENT number of degrees for each, because each is scaled to its own
  // size. So the sheet stays readable left-to-right as tight→loose while a 0.030 m
  // logo and a 0.202 m wordmark are both actually in frame.
  const rungs = FOV_LADDER_MULTIPLIERS.map((_, rung) =>
    chosen.map((print) => {
      const view = suggestViewFor(print, modelMin, modelMax, fovLadderFor(print)[rung])
      return { print, view }
    }),
  )

  // Render names are DECORATED COPIES, never the config objects themselves. The
  // first version mutated `view.name` in place to make a unique filename, and the
  // paste-ready block below then emitted `"name": "p1-the-extra-mile-slogan-3161-r2"`
  // — a render-directory artifact offered as manifest config. Harmless-looking, and
  // it would have gone straight into raw/CANONICAL.json.
  const views = []
  const cellsFor = new Map()
  for (const [rung, entries] of rungs.entries()) {
    for (const [i, { print, view }] of entries.entries()) {
      const renderName = `p${i + 1}-${view.name}-r${rung + 1}`
      entries[i].renderName = renderName
      views.push({ ...view, name: renderName })
      cellsFor.set(renderName, `#${i + 1} ${view.fieldOfView} — ${print.name}`.slice(0, 58))
    }
  }

  console.log(
    `rendering ${views.length} candidate frames ` +
      `(${chosen.length} prints × ${FOV_LADDER_MULTIPLIERS.length} zooms, each scaled to its print)…`,
  )
  const renderDir = join(workDir, 'find-views')
  await renderViews(baseGlb, renderDir, {
    views,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    lighting: EVAL_LIGHTING,
  })

  // One row per print, tight→loose across the row.
  const cells = []
  for (let i = 0; i < chosen.length; i++) {
    for (const entries of rungs) {
      const { renderName } = entries[i]
      cells.push({ file: join(renderDir, `${renderName}.png`), caption: cellsFor.get(renderName) })
    }
  }
  const sheet = join(workDir, 'candidate-views.png')
  await montage(cells, sheet, FOV_LADDER_MULTIPLIERS.length)

  // ABSOLUTE, not the relative string that was passed in. `--keep output/views`
  // is resolved against the CWD, and `pnpm` runs this with the CWD set to
  // tools/asset-pipeline — so printing it back verbatim told the reader to open
  // `output/views/candidate-views.png` at the repo root, where there is nothing.
  // docs/RUNBOOK.md step 3 said exactly that, and it is the third time this
  // package-vs-repo-root confusion has cost someone time (see CLAUDE.md on the
  // `--` separator). An absolute path cannot be read the wrong way.
  console.log(`\n  contact sheet: ${resolve(sheet)}`)
  console.log(`  full-size frames: ${resolve(renderDir)}\n`)

  // The paste-ready block uses the 1.0× rung — the size-scaled estimate itself —
  // because something concrete beats a template. The whole point is that the
  // operator swaps in the zoom they picked off the sheet, so a fingerprint is
  // printed for every rung rather than only for this one.
  const anchorRung = FOV_LADDER_MULTIPLIERS.indexOf(1.0)
  const suggested = rungs[anchorRung].map(({ view }) => view)
  console.log('Paste into raw/CANONICAL.json → garments.<id>, once you have LOOKED at the sheet:\n')
  console.log(`  "views": ${JSON.stringify(suggested, null, 2).split('\n').join('\n  ')},`)
  console.log(`  "targetToleranceM": ${DEFAULT_TARGET_TOLERANCE_M},\n`)

  console.log('  cameraFingerprint per rung — use the one matching the frames you chose:')
  for (const [rung, entries] of rungs.entries()) {
    const degrees = entries.map(({ view }) => view.fieldOfView.replace('deg', '')).join('/')
    console.log(
      `    rung ${rung + 1} (${`${FOV_LADDER_MULTIPLIERS[rung]}×`.padEnd(5)})  ` +
        `${degrees.padEnd(26)} ${cameraFingerprint(entries.map((e) => e.view))}`,
    )
  }
  console.log(
    `\n  ⚠️ Those fingerprints assume you keep ALL ${chosen.length} views. Drop any, and the\n` +
      `     fingerprint changes — take it from the --calibrate run instead, which sees your\n` +
      `     final list.`,
  )

  console.log(
    `\nNext:\n` +
      `  1. Open the contact sheet. Pick the zoom that holds the print with a little margin.\n` +
      `     Too tight and decimation at the edges reads as damage; too wide and the number\n` +
      `     starts describing fabric and seams instead of letters.\n` +
      `  2. Keep only the views you actually want guarded, at the zoom you picked.\n` +
      `  3. Add the entry to raw/CANONICAL.json (checksum, bytes, views, targetToleranceM).\n` +
      `  4. Run --calibrate to get the damage curve, LOOK at those sheets too, then record\n` +
      `     ceiling and cameraFingerprint together.\n`,
  )
}

/** Optimise the raw export with `flags`, render the artwork crops, diff vs baseline. */
async function damageFor(raw, baselineDir, workDir, label, flags, views, variant) {
  const out = join(workDir, `${label}.glb`)
  const { options } = parseOptimizeArgs([raw, '--out', out, ...flags])
  await optimizeGlb(raw, out, options)

  const renderDir = join(workDir, `render-${label}`)
  await renderViews(out, renderDir, {
    views,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    variant,
    lighting: EVAL_LIGHTING,
  })

  const { diffs } = await compareRenders(
    baselineDir,
    renderDir,
    join(workDir, `sheet-${label}.png`),
  )
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

/**
 * Resolve a positional path against the caller's cwd first, then the repo root.
 *
 * ⚠️ THE DOCUMENTED COMMAND DID NOT WORK, and this is why. RUNBOOK → "Replacing or
 * adding a garment" says `pnpm eval:artwork:real -- raw/<name>.glb --calibrate`,
 * but the root script delegates through `pnpm --filter`, which runs the child with
 * cwd set to `tools/asset-pipeline/`. So `raw/<name>.glb` resolved to
 * `tools/asset-pipeline/raw/<name>.glb`, which does not exist, and step 3 of a
 * five-step procedure failed for everyone who copied it verbatim. Found 2026-08-08
 * by running the documented line rather than reading it.
 *
 * cwd is tried FIRST so an explicit relative path still means what the shell means
 * by it — `node scripts/eval-artwork-real.mjs ../../raw/x.glb` from inside the
 * package keeps working. The repo root is a fallback, not an override.
 */
async function resolveRawPath(candidate) {
  if (isAbsolute(candidate)) return candidate
  try {
    await access(candidate)
    return candidate
  } catch {
    return join(REPO_ROOT, candidate)
  }
}

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
  // `--` is skipped by the startsWith('--') test, which is load-bearing rather than
  // incidental: `pnpm eval:artwork:real -- raw/x.glb` forwards the separator itself
  // into argv, so argv[0] here is a literal '--'.
  const positional = args.find((a, i) => !a.startsWith('--') && i !== keepValueIndex)
  const raw = positional
    ? await resolveRawPath(positional)
    : (process.env.RAW_GLB ?? join(REPO_ROOT, 'raw', 'cycling-all-colours.glb'))

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

  console.log(`raw:      ${raw}`)
  console.log(`work dir: ${workDir}`)
  console.log()

  // Discovery runs BEFORE identifyGarment, and that ordering is the point: the file
  // this mode is for is precisely one the manifest does not know yet. It also skips
  // the preset import (the old drift guard), which is about decimation flags — this mode does not
  // decimate, and failing it for an unrelated preset drift would block the one tool
  // someone reaches for when they are already stuck.
  if (args.includes('--find-views')) {
    await findViews(raw, workDir)
    return
  }

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
    lighting: EVAL_LIGHTING,
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
    await renderViews(baseGlb, dir, {
      views,
      width: RENDER_SIZE,
      height: RENDER_SIZE,
      variant,
      lighting: EVAL_LIGHTING,
    })
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
      const r = await damageFor(
        raw,
        baselineFor.get(variant),
        workDir,
        `${slug}${suffix}`,
        flags,
        views,
        variant,
      )
      r.variant = variant
      if (!worstOverall || r.worst > worstOverall.worst) worstOverall = r
      if (measured.length > 1) {
        console.log(
          `    ${(variant ?? 'default').padEnd(32)} worst ${pct(r.worst).padStart(8)} (${r.worstView})`,
        )
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
    console.log(`Artifacts in ${resolve(workDir)}`)
    console.log(
      '\nPick a ceiling ABOVE `balanced` and BELOW both `known-bad` and `control`.\n' +
        'If those do not separate, this metric cannot tell damage from decimation and must not gate.',
    )
    return
  }

  const shipped = results.balanced
  const fidelity = results.fidelity
  const control = results.control

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
      `The NEGATIVE CONTROL did not register as damage: --decimate-artwork --uv-weight 0 changed only ${pct(control.worst)}, ` +
        `at or under the ${pct(ceiling)} ceiling.\n` +
        `  Decimating the print with UV weighting off is the damage this eval exists to catch, so it must show up.\n` +
        `  This eval has gone BLIND. Fix the eval; do NOT relax the ceiling.`,
    )
  }

  if (failures.length) {
    console.error(`\n✗ real-garment artwork eval FAILED\n\n${failures.join('\n\n')}\n`)
    console.error(`Artifacts: ${workDir}`)
    process.exit(1)
  }

  const margin = control.worst / Math.max(shipped.worst, 1e-9)
  console.log(
    `\n✓ real-garment artwork eval passed — the control does ${margin.toFixed(1)}× the shipped preset's damage`,
  )
}

/**
 * Only run when invoked as a command, so the pure helpers above can be imported
 * and tested. Without this guard, `import` of this file executes a four-minute
 * render — and the FOV-clamp bug found on 2026-08-08 is exactly the kind that a
 * unit test should have caught years before a contact sheet did.
 */
export { fovLadderFor, suggestViewFor, slugForPrint, resolveRawPath, cameraFingerprint, REPO_ROOT }

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  await main()
}
