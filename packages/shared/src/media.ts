/**
 * Size invariants for published media, shared by the CMS and the shrink service.
 *
 * These live here — not in the CMS — because the shrink Worker has to know the
 * ceiling *before* it POSTs a shrunk GLB to `/api/media`. Previously it did not,
 * so an over-size result surfaced as an opaque HTTP 400 from Payload minutes
 * after the upload, with no hint of which knob to turn. Two copies of the number
 * would drift; one copy cannot.
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

/** Human-readable megabytes, for error messages on both sides of the queue. */
export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
