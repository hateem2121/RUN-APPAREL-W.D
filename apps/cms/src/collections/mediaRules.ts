import { GLB_HARD_MAX_BYTES, SIZE_WARNING_BYTES } from '@run-apparel/shared'
import { APIError } from 'payload'

/**
 * Media upload invariants, extracted as a pure function so the security- and
 * reliability-critical rules are unit-testable without a database or Payload
 * request. The Media.beforeValidate hook is a thin adapter that resolves the
 * file facts, calls this, and logs the soft size warning.
 *
 * The size ceilings now live in @run-apparel/shared because the shrink Worker
 * must apply the same numbers *before* it POSTs a shrunk GLB here — otherwise an
 * over-size result comes back as a bare HTTP 400 minutes after the upload.
 *
 * Every rejection is an APIError with an explicit 400. A plain `new Error()`
 * thrown from a Payload hook is replaced by the generic handler with the useless
 * "Something went wrong." (payload/dist/utilities/isErrorPublic.js: an error with
 * no non-500 `status` is never shown to the user). These messages are the whole
 * point — they tell a non-technical operator exactly what to do next.
 */

export { GLB_HARD_MAX_BYTES, SIZE_WARNING_BYTES }

/**
 * What may be offered as a 3D model, and what may be offered as a picture.
 *
 * These exist so the `filterOptions` on every media picker and the Media
 * collection's own upload allow-list cannot drift apart. Both are used as a D1
 * `where … in (…)` clause, which Payload enforces **server-side** as well as in
 * the UI (`validateFilterOptions` in payload/dist/fields/validations.js), so a
 * type listed here is genuinely selectable and one that is not genuinely cannot
 * be saved.
 *
 * WHY THEY ARE NEEDED. Until 2026-08-09 `glbAsset` was an unfiltered upload
 * field, so the "Finished 3D file" picker offered every photo as well as every
 * model — a JPEG could be attached and published, because the publish gate only
 * tests that *something* is attached. At the same time the live library held
 * five GLBs whose `alt` text was byte-identical, four of them superseded, one of
 * them a pre-2026-08-05 build with the old artwork damage.
 *
 * `application/octet-stream` is in the model list on purpose: browsers commonly
 * report a hand-picked `.glb` that way, and `checkMediaUpload` below rejects an
 * octet-stream whose name does not end in `.glb` — so anything stored under that
 * type is already known to be a GLB. Leaving it out would make a hand-uploaded
 * model invisible in the picker with no explanation.
 */
export const MODEL_MIME_TYPES = ['model/gltf-binary', 'application/octet-stream'] as const

/** Poster and photo types. Mirrors what the asset pipeline writes. */
export const IMAGE_MIME_TYPES = ['image/webp', 'image/avif', 'image/jpeg', 'image/png'] as const

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
 * Throw a human-readable APIError(400) if the upload must be rejected; otherwise
 * return whether a non-fatal size warning applies. Pure — no I/O.
 */
export function checkMediaUpload(facts: MediaFileFacts): MediaCheckResult {
  const filename = facts.filename ?? ''
  const mimeType = facts.mimeType ?? ''
  const filesize = facts.filesize ?? 0
  const lower = filename.toLowerCase()
  const isGlb = lower.endsWith('.glb') || mimeType === 'model/gltf-binary'

  if (mimeType === 'application/octet-stream' && !lower.endsWith('.glb')) {
    throw new APIError(
      'Unsupported file type. Allowed: GLB models and WebP/AVIF/JPEG/PNG images.',
      400,
    )
  }
  if (lower.endsWith('.zprj')) {
    throw new APIError(
      'CLO source files (.zprj) must never be uploaded to public media. Use the admin-only "source reference" field to record where the source lives.',
      400,
    )
  }
  // Spaces (and other unsafe chars) produce fragile media URLs — a stray space
  // in a GLB filename was part of a past live media outage. Require URL-safe
  // names so the browser fetches the exact R2 key every time.
  if (filename && /[^A-Za-z0-9._-]/.test(filename)) {
    throw new APIError(
      `Filename "${filename}" contains spaces or unsafe characters. Rename it to use only letters, numbers, dot, dash and underscore (e.g. "n001-navy.glb") before uploading.`,
      400,
    )
  }
  // Hard ceiling for models: a file this large has not been through the asset
  // pipeline. Block it rather than shipping a broken, slow viewer.
  if (isGlb && filesize > GLB_HARD_MAX_BYTES) {
    throw new APIError(
      `This GLB is ${(filesize / 1024 / 1024).toFixed(1)} MB — over the ${GLB_HARD_MAX_BYTES / 1024 / 1024} MB limit. It looks like a raw CLO export. Run it through the asset pipeline (merge/optimize: WebP or KTX2 textures + Meshopt/Draco geometry) first.`,
      400,
    )
  }

  return { sizeWarning: filesize > SIZE_WARNING_BYTES }
}
