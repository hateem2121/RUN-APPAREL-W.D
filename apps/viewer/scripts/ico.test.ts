import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs beside this test, same shape as csp.mjs
import { ICO_HEADER_BYTES, icoFromPng } from './ico.mjs'

/**
 * A malformed `.ico` is not an error — it is a browser quietly drawing nothing.
 * That is why the byte layout is a tested pure function rather than four lines
 * inside the generator.
 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/**
 * Field offsets WITHIN THE FILE, not within the entry — the first version of this
 * test read them relative to the entry and reported 65536 where it wanted 8. The
 * ICONDIR occupies bytes 0-5, so every ICONDIRENTRY field is 6 bytes further along
 * than its offset in the spec's table.
 */
const AT = { width: 6, height: 7, planes: 10, bpp: 12, length: 14, offset: 18 }
const fakePng = () => new Uint8Array([...PNG_MAGIC, 1, 2, 3, 4])

describe('icoFromPng', () => {
  it('writes the ICONDIR a reader looks for first', () => {
    const ico = icoFromPng(fakePng())
    expect(ico.readUInt16LE(0), 'reserved must be 0').toBe(0)
    expect(ico.readUInt16LE(2), 'type 1 = icon (2 would be a cursor)').toBe(1)
    expect(ico.readUInt16LE(4), 'exactly one image').toBe(1)
  })

  it('points the entry at the real offset and the real length', () => {
    const png = fakePng()
    const ico = icoFromPng(png)
    // These two are the whole reason this is tested: either being wrong yields a
    // file that parses far enough to look valid and then draws nothing.
    expect(ico.readUInt32LE(AT.length), 'declared image length').toBe(png.length)
    expect(ico.readUInt32LE(AT.offset), 'declared image offset').toBe(ICO_HEADER_BYTES)
    expect(ico.length).toBe(ICO_HEADER_BYTES + png.length)
    expect([...ico.subarray(ICO_HEADER_BYTES, ICO_HEADER_BYTES + 4)]).toEqual(PNG_MAGIC)
  })

  it('records the pixel size, and encodes 256 as 0 per the spec', () => {
    expect(icoFromPng(fakePng(), 32).readUInt8(AT.width)).toBe(32)
    expect(icoFromPng(fakePng(), 48).readUInt8(AT.height)).toBe(48)
    // The width field is ONE byte, so 256 cannot be stored literally; the format
    // spells it 0. Writing 256 here would wrap to 0 by accident rather than by
    // intent, which is the same bytes for the wrong reason.
    expect(icoFromPng(fakePng(), 256).readUInt8(AT.width)).toBe(0)
  })

  it('refuses input it cannot describe honestly', () => {
    expect(() => icoFromPng(new Uint8Array())).toThrow(/empty/i)
    expect(() => icoFromPng(fakePng(), 0)).toThrow(/1-256/)
    expect(() => icoFromPng(fakePng(), 257)).toThrow(/1-256/)
    expect(() => icoFromPng(fakePng(), 32.5)).toThrow(/1-256/)
  })

  it('produces the same bytes as the committed favicon.ico (negative control)', () => {
    // Ties the function to the artefact that actually ships. If the generator ever
    // stops using this function, or the file is hand-edited, the two diverge here.
    const shipped = readFileSync(join(import.meta.dirname, '..', 'public', 'favicon.ico'))
    expect(shipped.readUInt16LE(2), 'the committed file is not an icon').toBe(1)
    const declaredLength = shipped.readUInt32LE(AT.length)
    const declaredOffset = shipped.readUInt32LE(AT.offset)
    expect(declaredOffset).toBe(ICO_HEADER_BYTES)
    expect(shipped.length).toBe(declaredOffset + declaredLength)
    const rebuilt = icoFromPng(shipped.subarray(declaredOffset), shipped.readUInt8(AT.width) || 256)
    expect(Buffer.compare(rebuilt, shipped), 'the shipped .ico is not what this builds').toBe(0)
  })
})
