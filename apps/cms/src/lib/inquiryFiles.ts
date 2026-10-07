import { INQUIRY_FILE_KINDS, type InquiryFileKind } from './inquiryFileTypes'

/**
 * The files a buyer attaches, checked before a byte is stored (owner, 2026-09-29: up to 5
 * files, 25 MB in total; images, PDF, Office and design files). Pure: a `File` in, a verdict
 * out, so every hostile case is a unit test rather than a hope.
 *
 * ⚠️ THE NAME IS A CLAIM AND THE FIRST BYTES ARE EVIDENCE; BOTH MUST AGREE. A program renamed
 * `pack.pdf` has the right extension and the wrong bytes; a real PDF renamed `pack.png` has
 * the reverse. Either is refused. The browser's `type` is ignored entirely — it is derived
 * from the extension on the buyer's machine and proves nothing.
 *
 * ⚠️ WHAT THIS CANNOT PROVE, WRITTEN DOWN SO NOBODY ASSUMES IT: Word, Excel, PowerPoint and
 * Keynote files are zip archives, and a zip's first bytes say only "zip". A zip of anything,
 * named `.docx`, passes here. It is then stored privately and only ever DOWNLOADED
 * (`InquiryFiles.modifyResponseHeaders`), and the program that opens it refuses a file that
 * is not what it claims. That is the whole defence for those four types, and it is enough
 * for a form whose worst realistic abuse is spam.
 */
export const MAX_FILES = 5
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024
const MAX_NAME_LENGTH = 120

/**
 * A file that passed: its clean name, its type, and the File itself — NOT a copy of its bytes.
 * ⚠️ Measured 2026-09-29 on a local Workers runtime: storing one 24 MB PDF raised its memory by
 * 124 MB against a Worker's 128 MB, partly because every file was copied whole here and kept
 * until the upload. The check now reads only the ends, and the route reads each file once, only
 * while it stores it.
 */
export type CheckedFile = { name: string; type: string; size: number; file: File }
export type FileRefusal = 'too-many' | 'too-big' | 'type' | 'empty'
export type FileCheck =
  | { ok: true; files: CheckedFile[] }
  | { ok: false; reason: FileRefusal; name?: string }

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))
const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte)

const HEIF_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'heif']

/**
 * ⚠️ A PDF MUST END LIKE ONE, BECAUSE PAYLOAD CHECKS THAT TOO. Payload's own `validatePDF`
 * (payload 3.90.2) refuses a PDF whose last 1,024 bytes lack `%%EOF` or `xref`; measured
 * 2026-09-29, when a PDF without `xref` was refused with "Invalid PDF file". Checking the
 * same thing here turns that into the clear "this file could not be read" message instead
 * of a stored inquiry with a silent `filesError`. Every normal PDF ends `startxref … %%EOF`.
 */
const isWholePdf = (head: Uint8Array, tail: Uint8Array) => {
  if (ascii(head, 0, 5) !== '%PDF-') return false
  const end = ascii(tail, 0, tail.length)
  return end.includes('%%EOF') && end.includes('xref')
}
const isZip = (bytes: Uint8Array) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])

/** Does the file's beginning (and a PDF's end) match what its extension claims? */
function bytesMatch(extension: string, bytes: Uint8Array, tail: Uint8Array): boolean {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
    case 'heic':
    case 'heif':
      return ascii(bytes, 4, 4) === 'ftyp' && HEIF_BRANDS.includes(ascii(bytes, 8, 4))
    case 'pdf':
      return isWholePdf(bytes, tail)
    case 'ai':
      // Illustrator saves a PDF inside since CS; files older than that are PostScript.
      return isWholePdf(bytes, tail) || ascii(bytes, 0, 4) === '%!PS'
    case 'psd':
      return ascii(bytes, 0, 4) === '8BPS'
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'key':
      return isZip(bytes)
    default:
      return false
  }
}

/**
 * A name safe to store and to show: the last path segment only, NFC, no control or
 * direction-override characters (U+202E makes `cod.exe` display as `exe.doc`), no leading
 * dots, whitespace collapsed, at most 120 characters with the extension kept.
 */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .normalize('NFC')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  const dot = cleaned.lastIndexOf('.')
  const extension = dot > 0 ? cleaned.slice(dot) : ''
  const stem = (dot > 0 ? cleaned.slice(0, dot) : cleaned).trim()
  if (!stem) return extension ? `file${extension.toLowerCase()}` : 'file'
  return `${stem.slice(0, MAX_NAME_LENGTH - extension.length)}${extension}`
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}
/**
 * What one form allows. The contact form's are the defaults; the careers form passes its own
 * (one CV, 10 MB, four kinds — `applicationFileTypes.ts`) through the SAME byte check, so the
 * two forms can never disagree about what a PDF looks like.
 */
export type FileRules = {
  maxFiles: number
  maxTotalBytes: number
  kinds: readonly InquiryFileKind[]
}

export const INQUIRY_FILE_RULES: FileRules = {
  maxFiles: MAX_FILES,
  maxTotalBytes: MAX_TOTAL_BYTES,
  kinds: INQUIRY_FILE_KINDS,
}

/**
 * Check everything the form's `files` field sent. `entries` is `formData.getAll('files')`.
 *
 * ⚠️ AN EMPTY PICKER STILL SENDS ONE PART. A browser submitting a form whose file input was
 * left empty sends a `File` with name "" and size 0 (HTML's form-data algorithm), and
 * without JavaScript that is every inquiry sent with no attachment. It is ignored, not
 * refused — refusing it would break the plain form for everyone.
 */
export async function checkFiles(
  entries: readonly unknown[],
  rules: FileRules = INQUIRY_FILE_RULES,
): Promise<FileCheck> {
  const files = entries.filter(
    (entry): entry is File => entry instanceof File && !(entry.name === '' && entry.size === 0),
  )
  if (files.length > rules.maxFiles) return { ok: false, reason: 'too-many' }
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > rules.maxTotalBytes) return { ok: false, reason: 'too-big' }

  const checked: CheckedFile[] = []
  for (const file of files) {
    const name = cleanFileName(file.name)
    if (file.size === 0) return { ok: false, reason: 'empty', name }
    const extension = extensionOf(name)
    const kind = rules.kinds.find((candidate) => candidate.extensions.includes(extension))
    // Only the ends: 16 bytes carry every signature, the last 1,024 a PDF's ending.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 1024)).arrayBuffer())
    if (!kind || !bytesMatch(extension, head, tail)) return { ok: false, reason: 'type', name }
    checked.push({ name, type: kind.mime, size: file.size, file })
  }
  return { ok: true, files: checked }
}

/** "2.4 MB", "830 KB" — for the notification email and the form's file list. */
export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
