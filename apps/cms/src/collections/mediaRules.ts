/**
 * Media upload invariants, extracted as a pure function so the security- and
 * reliability-critical rules are unit-testable without a database or Payload
 * request. The Media.beforeValidate hook is a thin adapter that resolves the
 * file facts, calls this, and logs the soft size warning.
 */

/** Above this size, warn — QR-scan visitors are mobile-first. */
export const SIZE_WARNING_BYTES = 8 * 1024 * 1024
/**
 * Hard ceiling for model uploads. Above this a file is almost certainly a raw,
 * uncompressed CLO export (the kind that caused the 66 MB live incident) — block
 * it and point the uploader at the asset pipeline. Well clear of any legitimate
 * pipeline-processed GLB, which should sit under the 8 MB guideline.
 */
export const GLB_HARD_MAX_BYTES = 40 * 1024 * 1024

export interface MediaFileFacts {
  filename: string
  mimeType: string
  filesize: number
}

export interface MediaCheckResult {
  /** True when the file is over the soft mobile guideline (caller logs a warning). */
  sizeWarning: boolean
}

/**
 * Throw a human-readable Error if the upload must be rejected; otherwise return
 * whether a non-fatal size warning applies. Pure — no I/O.
 */
export function checkMediaUpload(facts: MediaFileFacts): MediaCheckResult {
  const filename = facts.filename ?? ''
  const mimeType = facts.mimeType ?? ''
  const filesize = facts.filesize ?? 0
  const lower = filename.toLowerCase()
  const isGlb = lower.endsWith('.glb') || mimeType === 'model/gltf-binary'

  if (mimeType === 'application/octet-stream' && !lower.endsWith('.glb')) {
    throw new Error('Unsupported file type. Allowed: GLB models and WebP/AVIF/JPEG/PNG images.')
  }
  if (lower.endsWith('.zprj')) {
    throw new Error(
      'CLO source files (.zprj) must never be uploaded to public media. Use the admin-only "source reference" field to record where the source lives.',
    )
  }
  // Spaces (and other unsafe chars) produce fragile media URLs — a stray space
  // in a GLB filename was part of a past live media outage. Require URL-safe
  // names so the browser fetches the exact R2 key every time.
  if (filename && /[^A-Za-z0-9._-]/.test(filename)) {
    throw new Error(
      `Filename "${filename}" contains spaces or unsafe characters. Rename it to use only letters, numbers, dot, dash and underscore (e.g. "n001-navy.glb") before uploading.`,
    )
  }
  // Hard ceiling for models: a file this large has not been through the asset
  // pipeline. Block it rather than shipping a broken, slow viewer.
  if (isGlb && filesize > GLB_HARD_MAX_BYTES) {
    throw new Error(
      `This GLB is ${(filesize / 1024 / 1024).toFixed(1)} MB — over the ${GLB_HARD_MAX_BYTES / 1024 / 1024} MB limit. It looks like a raw CLO export. Run it through the asset pipeline (merge/optimize: WebP or KTX2 textures + Meshopt/Draco geometry) first.`,
    )
  }

  return { sizeWarning: filesize > SIZE_WARNING_BYTES }
}
