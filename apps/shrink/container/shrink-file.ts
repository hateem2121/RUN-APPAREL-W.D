/**
 * The robot's processing body, from a raw GLB on disk to the finished GLB and its report.
 *
 * ⚠️ SPLIT OUT OF server.ts ON 2026-09-27 SO A SECOND CALLER RUNS THE SAME CODE. The owner
 * chose to process garments on their own Mac rather than in the Cloudflare Container
 * ($0), and `scripts/process-local.mjs` must produce exactly what the robot would: the same
 * flag refinement per garment family and size, the same pipeline, the same overlay and
 * ink scans, the same report. A copy would drift the first time either changed — the
 * shape `review-server.ts` and the viewer have already paid for three times. server.ts
 * cannot be imported for this: it calls `server.listen()` at import time.
 *
 * Nothing here downloads, uploads or touches R2: the caller owns where the bytes come
 * from and go. Everything below the "2." comment was moved from server.ts word for word.
 */
import { readFile, writeFile } from 'node:fs/promises'
import {
  assertFlagsOnly,
  optimizeGlb,
  parseOptimizeArgs,
} from '../../../tools/asset-pipeline/src/optimize'
import { describeGlb, readGltfJson } from '../../../tools/asset-pipeline/src/describe'
import { positionGrid } from '../../../tools/asset-pipeline/src/precision'
import { readGlb } from '../../../tools/asset-pipeline/src/io'
import { annotateGlbOverlays } from '../../../tools/asset-pipeline/src/overlay-annotate'
import { measureOverlays } from '../../../tools/asset-pipeline/src/overlay-depth'
import {
  describeInkRow,
  type InkContrastRow,
  measureInkContrast,
} from '../../../tools/asset-pipeline/src/ink-contrast'
import { refineFlags } from '../../../tools/asset-pipeline/src/strategy'
import {
  attributeBytes,
  formatAttributeBytes,
} from '../../../tools/asset-pipeline/src/attribute-bytes'
import { describeSpecIssues } from '../../../tools/asset-pipeline/src/gltf-spec'
import { inspectGlb } from '../../../tools/asset-pipeline/src/validate'
import { buildReportText, suggestedFilename } from './report'

export type InkScan =
  | {
      prints: number
      colourways: number
      rows: number
      flagged: number
      /** The flagged rows, at most 24, in the owner's words. */
      lines: string[]
      /** The flagged rows themselves, bounded, for the CMS record. */
      flaggedRows: InkContrastRow[]
    }
  | { error: string }

export type OverlayScan =
  | {
      measured: number
      overlayReadings: number
      flagged: number
      review: number
      clones: number
      threadIgnored: number
      written: boolean
      /** The coarsest position grid step in the file, mm (fix plan Rank 13, GEO-05). */
      gridMm: number
      /** The closest measured print-to-cloth gap, mm; null when no print was read. */
      minGapMm: number | null
    }
  | { error: string }

/**
 * Measure the finished file for printed layers stacked on cloth and write the
 * depth-bias records the viewer obeys (tools/asset-pipeline/src/overlay-depth.ts).
 * Never throws: a failed scan is reported, not a failed job.
 */
/**
 * Does the ink come out the colour of the cloth it sits on? (fix plan Rank 9). Report,
 * never a change: two automatic fixes painted the wrong prints white. The owner rules
 * per print from the report and `pipeline ink --strip`.
 */
async function scanInk(outPath: string): Promise<InkScan> {
  try {
    const { document } = await readGlb(outPath)
    const readings = measureOverlays(document)
    const report = await measureInkContrast(document, readings)
    return {
      prints: report.prints,
      colourways: report.colourways.length,
      rows: report.rows.length,
      flagged: report.flagged.length,
      lines: report.flagged.slice(0, 24).map(describeInkRow),
      flaggedRows: report.flagged.slice(0, 24),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function scanOverlays(outPath: string, filename: string): Promise<OverlayScan> {
  try {
    const { document } = await readGlb(outPath)
    const readings = measureOverlays(document)
    const grid = positionGrid(document)
    const gaps = readings.map((r) => r.gapMm).filter((g) => Number.isFinite(g) && g > 0)
    const annotated = annotateGlbOverlays(new Uint8Array(await readFile(outPath)), readings, {
      garment: filename.replace(/\.glb$/i, ''),
    })
    const written = annotated.result.binIdentical && annotated.result.flagged.length > 0
    if (written) await writeFile(outPath, annotated.bytes)
    return {
      measured: annotated.result.measured,
      overlayReadings: annotated.result.overlayReadings,
      flagged: annotated.result.flagged.length,
      review: annotated.result.review.length,
      clones: annotated.result.clones,
      threadIgnored: annotated.result.threadIgnored,
      written,
      gridMm: grid.gridMm,
      minGapMm: gaps.length ? Math.min(...gaps) : null,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Run the robot's pipeline on `rawPath`, writing the finished GLB to `outPath`.
 *
 * `requestedFlags` is `shrinkFlagsFor(detail)` from packages/shared; this refines them per
 * garment exactly as the Container always has. `key` is the upload's name, used only for
 * the suggested filename and the overlay override lookup.
 */
export async function shrinkFile(
  rawPath: string,
  outPath: string,
  requestedFlags: readonly unknown[],
  key: string,
): Promise<{ bytes: Buffer; report: Record<string, unknown> }> {
  // 2. Run the SAME pipeline the CLI uses. parseOptimizeArgs applies the exact
  //    defaults (WebP textures, opaque + double-sided fabric) plus our flags.
  //    Only `--`-prefixed flags and their values are accepted — assertFlagsOnly
  //    enforces that and throws naming the offending token.
  //
  //    ⚠️ Until 2026-08-18 this comment described a control that did not exist.
  //    The filter below checks only that a member is a string, and
  //    parseOptimizeArgs ends its loop with
  //    `else if (!arg.startsWith('--')) input = arg` — so ANY bare string here
  //    became the input path. Measured: appending '/etc/passwd' to
  //    ['in.glb', '--out', 'o.glb'] changed the input to /etc/passwd. What
  //    actually kept this safe was upstream — shrinkFlagsFor returns hardcoded
  //    literals chosen by a two-value enum — not the line the comment pointed
  //    at, which is precisely what made the comment dangerous.
  const baseFlags = requestedFlags.filter((flag): flag is string => typeof flag === 'string')

  // WHY THE FAMILY IS DECIDED HERE AND NOT IN THE WORKER. shrinkFlagsFor runs in
  // the Worker, which has an R2 key and not the file; and packages/shared is
  // lint-forbidden from importing node:*, so it can never read one. The file first
  // exists on disk at this exact point. describeGlb reads only the JSON chunk, so
  // this costs milliseconds even on a 1.2 GB export.
  //
  // Measured 2026-08-26 across all 28 raw exports: 15 are texture-heavy, and on
  // those the geometry-first budget in shrinkFlagsFor spends itself on a lever
  // that has little to pull and then compresses the textures to fit. X-MILO goes
  // from 71.0 MB — over the publish ceiling — to 24.8 MB with its artwork textures
  // byte-identical. See tools/asset-pipeline/src/strategy.ts.
  //
  // A file this cannot read falls through as 'mixed', which refineFlagsForFamily
  // returns UNCHANGED: a readout failure must never silently alter a garment's
  // compression.
  // Since 2026-09-02 this also drops general decimation for a SMALL export (see
  // SMALL_EXPORT_MAX_TRIANGLES in strategy.ts): the finished garments are two orders
  // of magnitude smaller than the exports the presets were written for, and on them
  // `--simplify` saved a few hundred KB and tore the prints (audit F1-02, A-01).
  const description = await describeGlb(rawPath)
  const family = description.error ? 'mixed' : description.family
  const flags = refineFlags(baseFlags, description)

  // Still enforced, and still the real control: assertFlagsOnly throws on any bare
  // token, and everything refineFlagsForFamily adds is a literal in strategy.ts.
  assertFlagsOnly(flags)
  const { options } = parseOptimizeArgs([rawPath, '--out', outPath, ...flags])
  const opt = await optimizeGlb(rawPath, outPath, options)

  // 2b. Depth-bias records for printed layers stacked on cloth (fix plan Rank 7C).
  //
  // ⚠️ UNTIL 2026-09-03 THIS CONTAINER NEVER RAN THE OVERLAY SCAN — the detector
  // existed, the viewer obeyed its records, and no record ever reached production
  // (audit F2-06, MAT-04, MAT-05, HG-05): Minecut's 36 OPAQUE prints sat 0.100 mm on
  // the cloth with nothing to separate them. Measured on the FINISHED file, after
  // decimation, so the geometry the record describes is the geometry that ships;
  // the BIN chunk is copied byte for byte and the write is refused if it moved.
  // Wrapped: a scan that fails must not fail a job that otherwise succeeded, and
  // the report says so instead.
  const overlays = await scanOverlays(outPath, suggestedFilename(key))
  const ink = await scanInk(outPath)

  // 3. Validate the result for the report (variants, warnings, translucency).
  const glb = await inspectGlb(outPath)
  const bytes = await readFile(outPath)

  const filename = suggestedFilename(key)
  const found = glb.variantsInFileOrder.length ? glb.variantsInFileOrder : glb.variants
  // Composition, computed from the finished file's JSON chunk only — no image decode,
  // so it costs a few milliseconds on a 1.25 GB garment exactly as on a 5 MB one.
  // Wrapped because reporting must never fail a job that otherwise succeeded.
  let composition: string[] | undefined
  try {
    composition = formatAttributeBytes(attributeBytes(await readGltfJson(outPath), opt.bytesAfter))
  } catch {
    composition = undefined
  }
  const text = buildReportText(
    opt,
    glb,
    filename,
    composition,
    overlays,
    ink,
    description.error ? undefined : description.familyReason,
  )

  const report = {
    ok: true,
    suggestedFilename: filename,
    sizeBytes: opt.bytesAfter,
    variants: glb.variants,
    variantsInFileOrder: found,
    warnings: glb.warnings,
    translucentMaterialCount: glb.translucentMaterialCount,
    texCoordsInUse: glb.texCoordsInUse,
    family,
    describe: description.error
      ? { error: description.error }
      : {
          family: description.family,
          familyReason: description.familyReason,
          textureGpuBytes: description.textureGpuBytes,
          textureFraction: Number(description.textureFraction.toFixed(4)),
          triangles: description.triangles,
          stitchFraction: Number(description.stitchFraction.toFixed(4)),
          pbrSuspects: description.pbrSuspects.map((s) => s.name),
          unclassifiedMetallic: description.unclassifiedMetallic.map((s) => s.name),
          colourways: description.colourways.count,
          fullyMapped: description.colourways.fullyMapped,
        },
    variantColours: glb.variantColours,
    /**
     * ⚠️ THE VERDICT WAS COMPUTED AND THROWN AWAY UNTIL 2026-08-29.
     *
     * `inspectGlb` above runs the official Khronos validator on every garment, and
     * this object kept SEVEN neighbouring fields from that same result while dropping
     * the one that says whether the file is valid. `report.ts` never read it either,
     * and `ShrinkReport` in the Worker had no such field at all — so the verdict was
     * structurally unable to leave this function.
     *
     * The consequence was measured: both live garments are invalid glTF (44 errors on
     * the cycling suit), from a WebP pass that wrote `image/webp` without declaring
     * `EXT_texture_webp`. Browsers sniff the bytes and render anyway, which is exactly
     * why every gate stayed green. A stricter runtime — a factory system, a
     * marketplace, someone's own 3D software — is entitled to refuse them.
     *
     * BOUNDED ON PURPOSE. Counts plus at most ten one-line summaries, not the raw
     * issue arrays: this report is JSON over the wire and then a field in D1, and a
     * badly broken file can carry hundreds of issues.
     */
    spec: {
      validatorVersion: glb.spec.validatorVersion,
      errors: glb.spec.counts.errors,
      warnings: glb.spec.counts.warnings,
      issues: describeSpecIssues(glb.spec.errors, 10),
    },
    crushedArtwork: glb.crushedArtwork,
    artworkAlphaProblems: glb.artworkAlphaProblems,
    artworkSoftOnBlend: glb.artworkSoftOnBlend,
    overlays,
    ink,
    ...(opt.simplify ? { simplify: opt.simplify } : {}),
    ...(opt.repair ? { repair: opt.repair } : {}),
    ...(opt.textures ? { textures: opt.textures } : {}),
    ...(opt.gpu ? { gpu: opt.gpu } : {}),
    ...(opt.fold ? { fold: opt.fold } : {}),
    ...(opt.solidify ? { solidify: opt.solidify } : {}),
    text,
  }
  return { bytes, report }
}
