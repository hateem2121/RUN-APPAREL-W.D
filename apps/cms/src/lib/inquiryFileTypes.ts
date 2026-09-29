/**
 * The kinds of file a buyer may attach to an inquiry (owner, 2026-09-29: images, PDF, Office
 * and design files). One table, read by the collection's `upload.mimeTypes`, by the form's
 * `accept` list and by the byte-level check in `inquiryFiles.ts`, so the three cannot drift.
 *
 * `mime` is what we store and serve the file as. `detected` is every type Payload's own
 * second check (`file-type` 21.3.4, inside `checkFileRestrictions`) was MEASURED to report
 * for a real file of that kind on 2026-09-29 — which is not always the obvious one:
 *   - Word, Excel, PowerPoint and Keynote files are zip archives; a minimal but valid .docx
 *     read back as `application/zip`, and Keynote always does;
 *   - a modern Illustrator file is a PDF inside (`application/pdf`); an old one is
 *     PostScript (`application/postscript`).
 * Leave one out and Payload refuses a genuine file with "Invalid MIME type", which the buyer
 * would see as the whole form failing. What a file is really allowed to be is decided by
 * `inquiryFiles.ts`, which checks the extension AND the first bytes together; Payload's list
 * only has to be wide enough not to refuse what that check accepted.
 */
export type InquiryFileKind = {
  extensions: readonly string[]
  mime: string
  detected: readonly string[]
}

const ZIP = 'application/zip'
const PDF = 'application/pdf'

export const INQUIRY_FILE_KINDS: readonly InquiryFileKind[] = [
  { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', detected: ['image/jpeg'] },
  { extensions: ['png'], mime: 'image/png', detected: ['image/png'] },
  { extensions: ['webp'], mime: 'image/webp', detected: ['image/webp'] },
  { extensions: ['heic', 'heif'], mime: 'image/heic', detected: ['image/heic', 'image/heif'] },
  { extensions: ['pdf'], mime: PDF, detected: [PDF] },
  { extensions: ['ai'], mime: 'application/postscript', detected: [PDF, 'application/postscript'] },
  {
    extensions: ['psd'],
    mime: 'image/vnd.adobe.photoshop',
    detected: ['image/vnd.adobe.photoshop'],
  },
  {
    extensions: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    detected: [ZIP, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  {
    extensions: ['xlsx'],
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    detected: [ZIP, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  {
    extensions: ['pptx'],
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    detected: [ZIP, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  { extensions: ['key'], mime: 'application/vnd.apple.keynote', detected: [ZIP] },
]

/** Every type Payload may see, for the collection's `upload.mimeTypes`. */
export const INQUIRY_UPLOAD_MIME_TYPES: readonly string[] = [
  ...new Set(INQUIRY_FILE_KINDS.flatMap((kind) => [kind.mime, ...kind.detected])),
]

/** The file picker's `accept` attribute: extensions only, so every browser agrees. */
export const INQUIRY_FILE_ACCEPT = INQUIRY_FILE_KINDS.flatMap((kind) =>
  kind.extensions.map((ext) => `.${ext}`),
).join(',')
