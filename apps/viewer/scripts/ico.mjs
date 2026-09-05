/**
 * Wrap a PNG in a single-image `.ico` container.
 *
 * Split out of gen-favicon.mjs for the reason csp.mjs is split out of
 * gen-headers.mjs: this is the only part with a decision in it, and it is a
 * byte-layout decision — a wrong offset or a wrong length produces a file that
 * every browser silently refuses to draw, with no error anywhere. The generator
 * around it is I/O and is excluded from coverage; this is counted.
 *
 * The format: a 6-byte ICONDIR, then one 16-byte ICONDIRENTRY, then the image.
 * A PNG payload has been legal inside an .ico since Windows Vista and every
 * browser this site supports reads it, so no BMP encoding is needed.
 */

/** ICONDIR (6) + one ICONDIRENTRY (16). The image starts immediately after. */
export const ICO_HEADER_BYTES = 22

/**
 * @param {Uint8Array} png   A PNG, already at the target size.
 * @param {number} [size]    Edge length in pixels. 256 is encoded as 0 by the spec.
 * @returns {Buffer}
 */
export function icoFromPng(png, size = 32) {
  if (!png || png.length === 0) throw new Error('icoFromPng: empty PNG')
  if (!Number.isInteger(size) || size < 1 || size > 256) {
    throw new Error(`icoFromPng: size must be 1-256, got ${size}`)
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(1, 4) // one image in this file
  const entry = Buffer.alloc(16)
  // 256 is written as 0 — the field is one byte, so 256 does not fit.
  entry.writeUInt8(size === 256 ? 0 : size, 0)
  entry.writeUInt8(size === 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2) // palette entries; 0 for truecolour
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(ICO_HEADER_BYTES, 12)
  return Buffer.concat([header, entry, Buffer.from(png)])
}
