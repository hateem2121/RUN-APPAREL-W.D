import { INQUIRY_FILE_KINDS } from './inquiryFileTypes'

/**
 * The kinds of CV an applicant may attach (owner, F23, 2026-10-07: PDF, Word, JPG or PNG, one
 * file up to 10 MB). Taken FROM the contact form's table rather than retyped, so the measured
 * `detected` types (a real .docx reads as `application/zip` — see `inquiryFileTypes.ts`) cannot
 * drift between the two forms. One table, read by the collection's `upload.mimeTypes`, by the
 * form's `accept` list and by the route's byte-level check.
 */
const ALLOWED = new Set(['jpg', 'png', 'pdf', 'docx'])

export const APPLICATION_FILE_KINDS = INQUIRY_FILE_KINDS.filter((kind) =>
  kind.extensions.some((ext) => ALLOWED.has(ext)),
)

/** One file, 10 MB (owner, F23). */
export const APPLICATION_FILE_MAX_BYTES = 10 * 1024 * 1024

/** Every type Payload may see, for the collection's `upload.mimeTypes`. */
export const APPLICATION_UPLOAD_MIME_TYPES: readonly string[] = [
  ...new Set(APPLICATION_FILE_KINDS.flatMap((kind) => [kind.mime, ...kind.detected])),
]

/** The file picker's `accept` attribute: extensions only, so every browser agrees. */
export const APPLICATION_FILE_ACCEPT = APPLICATION_FILE_KINDS.flatMap((kind) =>
  kind.extensions.map((ext) => `.${ext}`),
).join(',')
