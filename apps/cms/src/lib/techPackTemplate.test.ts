import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_LICENCE,
  TEMPLATE_PAGES,
  TEMPLATE_SHEETS,
  techPackTemplate,
} from './techPackTemplate'
import { buildXlsx, crc32, escapeXml, workbookParts } from './xlsxWriter'

/** The zip's entries, read back from its central directory (the way an unzip tool reads it). */
function readZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true), 'no end-of-directory record').toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const entries: { name: string; data: Uint8Array; crc: number }[] = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true), `entry ${i}: no central header`).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    expect(view.getUint32(offset, true), `${name}: no local header`).toBe(0x04034b50)
    expect(view.getUint16(offset + 8, true), `${name}: not stored`).toBe(0)
    const localNameLength = view.getUint16(offset + 26, true)
    const start = offset + 30 + localNameLength
    entries.push({ name, data: bytes.subarray(start, start + size), crc })
    at += 46 + nameLength
  }
  return entries
}

describe('the tech-pack template file', () => {
  it('has the twelve pages the guide lists, in its order', () => {
    expect(TEMPLATE_PAGES).toHaveLength(12)
    expect(TEMPLATE_SHEETS.map((sheet) => sheet.name)).toEqual(
      TEMPLATE_PAGES.map((name, i) => `${i + 1} ${name}`),
    )
    for (const sheet of TEMPLATE_SHEETS) {
      // Excel's own limits on a tab's name.
      expect(sheet.name.length).toBeLessThanOrEqual(31)
      expect(sheet.name).not.toMatch(/[\\/?*[\]:]/)
    }
  })

  it('is a zip every entry of which checks out, with the content types first', () => {
    const entries = readZip(techPackTemplate())
    expect(entries.map((e) => e.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      ...TEMPLATE_SHEETS.map((_, i) => `xl/worksheets/sheet${i + 1}.xml`),
    ])
    for (const entry of entries) expect(crc32(entry.data), entry.name).toBe(entry.crc)
  })

  it('gives the same bytes every time, so it never drifts with the clock', () => {
    const book = {
      title: 'Tech pack template',
      creator: 'RUN APPAREL',
      created: '2026-11-06T00:00:00Z',
    }
    const a = buildXlsx({ ...book, sheets: TEMPLATE_SHEETS })
    const b = buildXlsx({ ...book, sheets: TEMPLATE_SHEETS })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    expect(Buffer.from(techPackTemplate()).equals(Buffer.from(a))).toBe(true)
  })

  it('names the garment and the licence on every page', () => {
    const parts = workbookParts({
      title: 't',
      creator: 'RUN APPAREL',
      created: '2026-11-06T00:00:00Z',
      sheets: TEMPLATE_SHEETS,
    })
    const sheets = parts.filter(([name]) => name.startsWith('xl/worksheets/'))
    expect(sheets).toHaveLength(12)
    for (const [name, xml] of sheets) {
      expect(xml, name).toContain('Style name and number')
      expect(xml, name).toContain('Revision number and date')
      // The footer carries the owner's licence on every printed page.
      expect(xml, name).toContain(escapeXml(TEMPLATE_LICENCE))
      expect(xml, name).toContain('state="frozen"')
    }
    // The tolerance is agreed per order: no figure is printed (approved editorial call).
    const measurements = sheets[5]?.[1] ?? ''
    expect(measurements).toContain('Agreed for your order')
    expect(measurements).not.toMatch(/±\s*\d/)
  })

  it('the zip checksum is the standard one (and sees a changed byte)', () => {
    const encoder = new TextEncoder()
    // The CRC-32 check value every implementation publishes for "123456789".
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
    // NEGATIVE CONTROL: one character different, a different sum.
    expect(crc32(encoder.encode('123456780'))).not.toBe(0xcbf43926)
  })

  it('escapes what XML refuses, and keeps the rest', () => {
    expect(escapeXml('Tom & Jerry <tee> "A"')).toBe('Tom &amp; Jerry &lt;tee&gt; &quot;A&quot;')
    expect(escapeXml('a\u0001b\tc')).toBe('ab\tc')
    expect(escapeXml('Colorway 1 · ©')).toBe('Colorway 1 · ©')
  })
})
