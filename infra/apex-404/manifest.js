/**
 * The manifest: the one file that tells this Worker which page pictures exist.
 *
 * WHY IT IS VALIDATED, AND WHY HERE. `scripts/document-pages.mjs` uploads each
 * document's pictures to the private `run-assets` bucket and writes this manifest LAST.
 * The Worker never turns request text into an R2 key: it builds a key only for a part
 * and a width this manifest lists, so the bucket cannot be walked through a code — the
 * allow-list property the old two-path Worker had, carried over. The render script calls
 * this same function before uploading, so it never writes a manifest the Worker would
 * refuse.
 *
 * A manifest that fails here makes the page answer 503 "temporarily unavailable" with
 * `no-store` (see index.js): diagnosable, and never cached.
 */

export const MANIFEST_SCHEMA = 1

/** Every part is encoded at exactly these widths. */
export const WIDTHS = Object.freeze([800, 1600, 2400])

/** `<YYYYMMDD>-<first 8 hex digits of the PDF's MD5>`. */
export const VERSION_SHAPE = /^\d{8}-[0-9a-f]{8}$/

/** `p` + 3-digit page number + `a` (left half), `b` (right half) or `w` (whole page). */
export const PART_ID_SHAPE = /^p\d{3}[abw]$/

/** Three digits of page number. */
export const MAX_PAGES = 999

/**
 * @typedef {{ id: string, width: number, height: number }} ManifestPart
 * @typedef {{ number: number, parts: ManifestPart[] }} ManifestPage
 * @typedef {{
 *   schema: 1,
 *   document: string,
 *   version: string,
 *   widths: number[],
 *   pdf: { key: string, bytes: number, md5: string },
 *   pages: ManifestPage[],
 * }} Manifest
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/** @param {unknown} value */
const positiveWhole = (value) => Number.isInteger(value) && Number(value) > 0

/**
 * The part ids a page must carry, in order.
 *
 * @param {number} number page number, from 1
 * @param {number} count 2 for a split spread, 1 for a whole page
 * @returns {string[]}
 */
export function expectedPartIds(number, count) {
  const stem = `p${String(number).padStart(3, '0')}`
  return count === 2 ? [`${stem}a`, `${stem}b`] : [`${stem}w`]
}

/**
 * @param {string} id
 * @param {number} width
 * @returns {string}
 */
export function pictureFileName(id, width) {
  return `${id}-${width}.webp`
}

/**
 * @param {unknown} value parsed JSON
 * @param {{ id: string, pdfKey: string }} doc the document this host serves
 * @returns {{ ok: true, manifest: Manifest } | { ok: false, reason: string }}
 */
export function validateManifest(value, doc) {
  /** @param {string} reason */
  const fail = (reason) => /** @type {{ ok: false, reason: string }} */ ({ ok: false, reason })

  if (!isObject(value)) return fail('the manifest is not an object')
  if (value.schema !== MANIFEST_SCHEMA) return fail('schema must be 1')
  if (value.document !== doc.id) return fail(`document must be ${doc.id}`)
  if (typeof value.version !== 'string' || !VERSION_SHAPE.test(value.version)) {
    return fail('version must look like YYYYMMDD-0123abcd')
  }
  if (!Array.isArray(value.widths) || value.widths.join(',') !== WIDTHS.join(',')) {
    return fail(`widths must be exactly ${WIDTHS.join(', ')}`)
  }

  const pdf = value.pdf
  if (!isObject(pdf) || pdf.key !== doc.pdfKey) return fail(`pdf.key must be ${doc.pdfKey}`)
  if (!positiveWhole(pdf.bytes)) return fail('pdf.bytes must be a positive whole number')
  if (typeof pdf.md5 !== 'string' || !/^[0-9a-f]{32}$/.test(pdf.md5)) {
    return fail('pdf.md5 must be 32 lowercase hex digits')
  }
  if (!value.version.endsWith(`-${pdf.md5.slice(0, 8)}`)) {
    return fail('version must end with the first 8 digits of pdf.md5')
  }

  const pages = value.pages
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PAGES) {
    return fail(`pages must be a non-empty list of at most ${MAX_PAGES}`)
  }
  for (const [index, page] of pages.entries()) {
    const number = index + 1
    if (!isObject(page) || page.number !== number)
      return fail(`page ${number} must be numbered ${number}`)
    if (!Array.isArray(page.parts) || (page.parts.length !== 1 && page.parts.length !== 2)) {
      return fail(`page ${number} must have one or two parts`)
    }
    const expected = expectedPartIds(number, page.parts.length)
    for (const [i, part] of page.parts.entries()) {
      if (!isObject(part) || part.id !== expected[i]) {
        return fail(`page ${number} part ${i + 1} must be ${expected[i]}`)
      }
      if (!positiveWhole(part.width) || !positiveWhole(part.height)) {
        return fail(`part ${expected[i]} must have a positive whole width and height`)
      }
    }
  }

  return { ok: true, manifest: /** @type {Manifest} */ (value) }
}

/**
 * The R2 key for a requested picture, or null unless the manifest lists it.
 *
 * @param {Manifest} manifest
 * @param {string} version the `<version>` path segment
 * @param {string} fileName the `<part>-<width>.webp` path segment
 * @returns {string | null}
 */
export function pictureKey(manifest, version, fileName) {
  if (version !== manifest.version) return null
  const match = /^(p\d{3}[abw])-(\d{3,4})\.webp$/.exec(fileName)
  if (!match) return null
  const [, id, widthText] = match
  const width = Number(widthText)
  if (String(width) !== widthText || !WIDTHS.includes(width)) return null
  const listed = manifest.pages.some((page) => page.parts.some((part) => part.id === id))
  return listed
    ? `documents/${manifest.document}/${manifest.version}/${pictureFileName(id, width)}`
    : null
}
