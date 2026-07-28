import { APIError } from 'payload'

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
 *   - never a .zprj CLO *source* file,
 *   - an absolute sanity ceiling, so a wildly-wrong upload is rejected before it
 *     burns container time, and
 *   - no filename character that Payload sanitises DIFFERENTLY on the two sides
 *     of a client upload (see checkRawUpload).
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

/**
 * Characters that Payload sanitises INCONSISTENTLY across a client upload, so a
 * filename containing one desynchronises the R2 object key from the document.
 *
 *   - The R2 key is built at multipart-init time from the raw `file.name` by
 *     `sanitizeFilename` (payload/shared) — basename + control characters only.
 *   - The document filename is built later by `generateFileData` using
 *     `sanitize-filename`, whose `illegalRe` additionally strips  / ? < > \ : * | "
 *     and whose `windowsTrailingRe` strips trailing dots and spaces.
 *
 * So `jacket?.glb` is stored in R2 as `jacket?.glb` but recorded as `jacket.glb`.
 * The RawUploads.beforeChange guard then HEADs a key that does not exist and
 * rejects a perfectly good upload with "your file did not finish uploading" —
 * a misleading message for a problem that is really just the name.
 *
 * Reject here instead, before any of that, with an instruction the operator can
 * act on. Spaces and brackets stay allowed: tolerating messy CLO names is the
 * entire reason this inbox exists, and neither sanitiser touches them.
 */
const DESYNCING_FILENAME_CHARS = /[/?<>\\:*|"]/
/** `sanitize-filename` truncates at 255 UTF-8 bytes; past that the two names diverge too. */
const MAX_FILENAME_BYTES = 255

export interface RawFileFacts {
  filename: string
  mimeType: string
  filesize: number
}

export interface RawCheckResult {
  /**
   * True when the filename carries no extension at all. Not fatal — the pipeline
   * renames its output anyway — but worth logging, because Payload silently drops
   * the extension rather than repairing it (`generateFileData`: `ext = ''` when
   * the name has no dot) and the resulting record is confusing to read. Observed
   * live on `media.id = 7` ("Maroon", mimeType image/png): macOS supplies the
   * MIME type from the file's UTI, so validation passes with no extension present.
   */
  missingExtension: boolean
}

/**
 * Throw a human-readable APIError(400) if the raw upload must be rejected;
 * otherwise return non-fatal observations for the caller to log. Pure — no I/O.
 *
 * Every rejection must be an APIError with an explicit status: Payload's generic
 * handler replaces a plain `new Error()` with "Something went wrong."
 * (payload/dist/utilities/isErrorPublic.js), which is exactly the dead end that
 * cost a full diagnostic round-trip on 2026-07-27.
 */
export function checkRawUpload(facts: RawFileFacts): RawCheckResult {
  const filename = facts.filename ?? ''
  const mimeType = facts.mimeType ?? ''
  const filesize = facts.filesize ?? 0
  const lower = filename.toLowerCase()
  // Browsers frequently send .glb as a generic octet-stream, so trust the
  // extension as well as the model MIME type.
  const isGlb = lower.endsWith('.glb') || mimeType === 'model/gltf-binary'

  if (lower.endsWith('.zprj')) {
    throw new APIError(
      'CLO source files (.zprj) are never processed here. Export a GLB from CLO and upload that instead; record the .zprj location in the product’s admin-only source reference.',
      400,
    )
  }
  if (!isGlb) {
    throw new APIError(
      'Raw uploads must be GLB models exported from CLO (.glb). This inbox shrinks GLB geometry — it cannot process other file types.',
      400,
    )
  }
  if (DESYNCING_FILENAME_CHARS.test(filename) || /[. ]$/.test(filename)) {
    throw new APIError(
      `The file name "${filename}" contains a character this system cannot store reliably. Rename the file — spaces and brackets are fine, but remove any of  / \\ ? < > : * | "  and any dot or space at the very end — then upload it again.`,
      400,
    )
  }
  if (new TextEncoder().encode(filename).length > MAX_FILENAME_BYTES) {
    throw new APIError(
      `The file name is too long (over ${MAX_FILENAME_BYTES} characters). Give it a shorter name and upload it again.`,
      400,
    )
  }
  if (filesize > RAW_HARD_MAX_BYTES) {
    throw new APIError(
      `This file is ${(filesize / 1024 / 1024).toFixed(0)} MB — over the ${RAW_HARD_MAX_BYTES / 1024 / 1024} MB raw ceiling. A single garment export should be well under this; check you exported one product, not a whole project.`,
      400,
    )
  }

  return { missingExtension: !filename.includes('.') }
}
