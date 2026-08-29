import { readFile } from 'node:fs/promises'
import validator, { type GltfIssueMessage } from 'gltf-validator'

/**
 * Check a GLB against the glTF 2.0 specification, using Khronos's own validator.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR. It was added to name the garment and
 * texture behind `Cannot read properties of null (reading 'setMagFilter')`, and it
 * **cannot do that** — measured 2026-08-27 on ARISAN SPORTS BRA: **0 errors, 0
 * warnings**. `texture.source` is OPTIONAL in the spec (an extension may supply the
 * image), so a source-less texture is valid glTF and gltf-transform is simply
 * stricter. `repair-dead-textures.ts` handles that defect and names it in about a
 * second with no dependency at all. Do not re-add this expecting it to catch that.
 *
 * ⚠️ ITS REAL JOB IS TO POLICE *US*, NOT CLO. All 28 raw exports are spec-valid;
 * what is not guaranteed valid is what this pipeline writes. It quantises geometry,
 * re-encodes every texture, rewrites alphaMode across thousands of materials, and —
 * since 2026-08-27 — patches raw bytes into a file's JSON chunk to keep the BIN
 * chunk from moving. None of that was checked for spec conformance by anything.
 * The three existing blocking gates test artwork decisions, not file validity.
 *
 * ⚠️ SO IT MUST BE A PRODUCTION DEPENDENCY, NOT A dev ONE, and the first attempt
 * had it wrong. `apps/shrink/container` imports `inspectGlb` and `describeGlb`
 * directly and installs with `npm ci --omit=dev`, so a devDependency resolves on a
 * developer's machine and is MISSING inside the Container — passing every local
 * gate and surfacing as a failed shrink job. The container is also the only place
 * output reaches a customer unattended, which is precisely where the guard belongs.
 */

/**
 * Codes dropped before anything is counted, because every CLO export trips them in
 * bulk and none indicates a defect.
 *
 * Measured on ARISAN SPORTS BRA: leaving these in gives **8 warnings and 32 hints**
 * in the first 40 messages alone and buries everything else. Removing them leaves
 * 133 infos, of which 132 are `IMAGE_NPOT_DIMENSIONS`.
 *
 * - `BUFFER_VIEW_TARGET_MISSING` — an optional GL hint CLO never writes. Harmless.
 * - `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` — normal-mapped material with no
 *   TANGENT attribute. Every renderer generates one; model-viewer included.
 * - `IMAGE_NPOT_DIMENSIONS` — non-power-of-two images. Irrelevant to WebGL 2, and
 *   the pipeline resizes textures against its own budget anyway.
 */
export const SPEC_NOISE = [
  'BUFFER_VIEW_TARGET_MISSING',
  'MESH_PRIMITIVE_GENERATED_TANGENT_SPACE',
  'IMAGE_NPOT_DIMENSIONS',
] as const

/** Enough messages to diagnose with, without holding thousands in memory. */
const MAX_ISSUES = 200

export interface SpecCheck {
  /** The validator's own version, so a report says what judged it. */
  validatorVersion: string
  /** Severity 0. Structural, no false-positive case — safe to refuse a publish on. */
  errors: GltfIssueMessage[]
  /** Severity 1. Reported, never blocking. */
  warnings: GltfIssueMessage[]
  /** Counts after SPEC_NOISE is removed. */
  counts: { errors: number; warnings: number; infos: number; hints: number }
  /** True when MAX_ISSUES cut the list short — the counts are still complete. */
  truncated: boolean
}

/** One-line summaries, e.g. `ACCESSOR_INDEX_OOB at /accessors/3: …`. */
export function describeSpecIssues(issues: GltfIssueMessage[], limit = 5): string[] {
  return issues
    .slice(0, limit)
    .map((i) => `${i.code}${i.pointer ? ` at ${i.pointer}` : ''}: ${i.message}`)
}

/** Run the Khronos validator over GLB bytes. */
export async function checkGltfSpec(bytes: Uint8Array): Promise<SpecCheck> {
  const report = await validator.validateBytes(bytes, {
    maxIssues: MAX_ISSUES,
    ignoredIssues: [...SPEC_NOISE],
    // A GLB embeds its buffer, so this should never fire. Rejecting rather than
    // returning empty bytes keeps a genuinely external reference visible as an
    // error instead of being silently validated as an empty resource.
    externalResourceFunction: (uri: string) =>
      Promise.reject(new Error(`external resource not available: ${uri}`)),
  })
  const messages = report.issues.messages
  return {
    validatorVersion: report.validatorVersion,
    errors: messages.filter((m) => m.severity === 0),
    warnings: messages.filter((m) => m.severity === 1),
    counts: {
      errors: report.issues.numErrors,
      warnings: report.issues.numWarnings,
      infos: report.issues.numInfos,
      hints: report.issues.numHints,
    },
    truncated: report.issues.truncated,
  }
}

/** Read a file and check it. */
export async function checkGltfSpecFile(file: string): Promise<SpecCheck> {
  return checkGltfSpec(new Uint8Array(await readFile(file)))
}

/**
 * The largest file this will read into memory to validate.
 *
 * MEASURED 2026-08-27, because "it is only a few hundred milliseconds" was true
 * and beside the point — the cost that matters is RESIDENT MEMORY, and it runs
 * about 3.4x the file size:
 *
 * ```
 *  42 MB export   read  12 ms   validate 178 ms   peak RSS   234 MB
 * 573 MB export   read 132 ms   validate 805 ms   peak RSS 1,955 MB
 * ```
 *
 * ⚠️ THIS IS WHY THE CHECK IS NOT INSIDE `describeGlb`. That function is called by
 * `apps/shrink/container/server.ts` on the RAW upload, and is deliberately built to
 * read the header and JSON chunk alone so the 1.25 GB Cycling Bib costs what the
 * 5 MB PRO-PILE costs. Validating there would pull the whole export into a
 * container that has already peaked at 5.27 GB, and the failure would be an OOM
 * during a shrink job rather than anything that looks like a validation problem.
 *
 * At 768 MB, 26 of the 28 raw exports are covered; Cycling Bib (1.25 GB) and
 * X-MILO CORE OVERSIZE (1.08 GB) are skipped and SAY SO, rather than being
 * silently reported as clean.
 */
export const SPEC_MAX_BYTES = 768 * 1024 * 1024

export interface SpecFileCheck {
  file: string
  /** Null when the file was skipped; `skipped` then says why. */
  spec: SpecCheck | null
  skipped?: string
}

/** Check a file unless it is too large to hold in memory. Never throws. */
export async function checkGltfSpecFileGuarded(
  file: string,
  bytes: number,
): Promise<SpecFileCheck> {
  if (bytes > SPEC_MAX_BYTES) {
    return {
      file,
      spec: null,
      skipped: `${(bytes / 1048576).toFixed(0)} MB is over the ${SPEC_MAX_BYTES / 1048576} MB spec-check ceiling (it would need roughly ${((bytes * 3.4) / 1048576).toFixed(0)} MB of memory)`,
    }
  }
  try {
    return { file, spec: await checkGltfSpecFile(file) }
  } catch (error) {
    // A file the validator cannot even open is a finding for the reader to
    // report, not a reason to abandon a 28-garment run.
    return { file, spec: null, skipped: `could not be validated: ${(error as Error).message}` }
  }
}
