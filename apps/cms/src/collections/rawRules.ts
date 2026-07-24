/**
 * Validation for the private RAW-upload inbox (the RawUploads collection).
 *
 * Unlike the public Media collection (see mediaRules.ts), this area exists to
 * RECEIVE UNPROCESSED CLO exports — large (~350 MB) files with messy names — so
 * the asset pipeline can shrink them server-side before anything is published.
 * It therefore deliberately RELAXES two of the Media rules:
 *   - NO 40 MB cap (accepting the big raw file is the whole point), and
 *   - NO safe-filename requirement (CLO names have spaces/brackets; Payload
 *     sanitises the R2 object key itself, and the shrunk output is renamed by
 *     the pipeline before it ever reaches the public Media collection).
 *
 * It KEEPS the safety rules that still matter here:
 *   - the upload must be a GLB (this pipeline only shrinks GLB geometry),
 *   - never a .zprj CLO *source* file, and
 *   - an absolute sanity ceiling, so a wildly-wrong upload is rejected before it
 *     burns container time.
 *
 * The raw file is NEVER buyer-facing: it lands in a private ingest bucket with
 * no public domain, and RawUploads is admin/editor-only. The 40 MB guardrail on
 * published Media (mediaRules.ts) is untouched — only the *shrunk* output ever
 * re-enters that path.
 *
 * Extracted as a pure function so the security-critical rules are unit-testable
 * without a database or Payload request. The RawUploads.beforeValidate hook is a
 * thin adapter that resolves the file facts and calls this.
 */

/**
 * Absolute ceiling for a raw ingest upload. Above this a file is almost
 * certainly not a single garment export (e.g. an entire CLO project), so reject
 * it rather than spend container CPU/RAM on something that can't publish. Sized
 * well above a real CLO combined export (~350–400 MB observed for 5 colourways).
 */
export const RAW_HARD_MAX_BYTES = 600 * 1024 * 1024

export interface RawFileFacts {
  filename: string
  mimeType: string
  filesize: number
}

/**
 * Throw a human-readable Error if the raw upload must be rejected; otherwise
 * return normally. Pure — no I/O.
 */
export function checkRawUpload(facts: RawFileFacts): void {
  const filename = facts.filename ?? ''
  const mimeType = facts.mimeType ?? ''
  const filesize = facts.filesize ?? 0
  const lower = filename.toLowerCase()
  // Browsers frequently send .glb as a generic octet-stream, so trust the
  // extension as well as the model MIME type.
  const isGlb = lower.endsWith('.glb') || mimeType === 'model/gltf-binary'

  if (lower.endsWith('.zprj')) {
    throw new Error(
      'CLO source files (.zprj) are never processed here. Export a GLB from CLO and upload that instead; record the .zprj location in the product’s admin-only source reference.',
    )
  }
  if (!isGlb) {
    throw new Error(
      'Raw uploads must be GLB models exported from CLO (.glb). This inbox shrinks GLB geometry — it cannot process other file types.',
    )
  }
  if (filesize > RAW_HARD_MAX_BYTES) {
    throw new Error(
      `This file is ${(filesize / 1024 / 1024).toFixed(0)} MB — over the ${RAW_HARD_MAX_BYTES / 1024 / 1024} MB raw ceiling. A single garment export should be well under this; check you exported one product, not a whole project.`,
    )
  }
}
