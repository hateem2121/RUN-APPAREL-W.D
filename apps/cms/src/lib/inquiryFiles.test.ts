import { describe, expect, it } from 'vitest'
import { checkFiles, cleanFileName, formatBytes, MAX_TOTAL_BYTES } from './inquiryFiles'

/**
 * Every hostile or odd file the plan's review focus names (#3), as a real `File` built from
 * real leading bytes — the same object `request.formData()` hands the route in a Worker.
 */
const bytes = (...parts: (string | number[])[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  )
const file = (name: string, content: Uint8Array<ArrayBuffer>) => new File([content], name)

const PDF = bytes('%PDF-1.7\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n')
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF')
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const WEBP = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')
const HEIC = bytes([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0], 'mif1heic')
const PSD = bytes('8BPS', [0, 1])
const ZIP = bytes([0x50, 0x4b, 0x03, 0x04], [0, 0, 0, 0])
const EXE = bytes([0x4d, 0x5a, 0x90, 0x00])
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

describe('checkFiles accepts what buyers really send', () => {
  it.each([
    ['pack.pdf', PDF, 'application/pdf'],
    ['photo.JPG', JPEG, 'image/jpeg'],
    ['photo.jpeg', JPEG, 'image/jpeg'],
    ['swatch.png', PNG, 'image/png'],
    ['swatch.webp', WEBP, 'image/webp'],
    ['iphone.heic', HEIC, 'image/heic'],
    ['layers.psd', PSD, 'image/vnd.adobe.photoshop'],
    ['artwork.ai', PDF, 'application/postscript'],
    ['old-artwork.ai', bytes('%!PS-Adobe-3.0'), 'application/postscript'],
    ['spec.docx', ZIP, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sizes.xlsx', ZIP, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['deck.pptx', ZIP, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['deck.key', ZIP, 'application/vnd.apple.keynote'],
  ])('%s', async (name, content, type) => {
    const result = await checkFiles([file(name, content)])
    expect(result).toMatchObject({ ok: true, files: [{ type, size: content.byteLength }] })
  })

  it('ignores the empty part a browser sends when nothing was picked', async () => {
    // Without JavaScript this is every inquiry with no attachment; refusing it breaks the form.
    expect(await checkFiles([new File([], '')])).toEqual({ ok: true, files: [] })
    expect(await checkFiles([])).toEqual({ ok: true, files: [] })
  })

  it('ignores text parts under the files name', async () => {
    expect(await checkFiles(['not a file'])).toEqual({ ok: true, files: [] })
  })

  it('hands on the very file it checked, so the route stores exactly what passed', async () => {
    const result = await checkFiles([file('pack.pdf', PDF)])
    if (!result.ok) throw new Error('refused')
    const stored = new Uint8Array((await result.files[0]?.file.arrayBuffer()) ?? new ArrayBuffer(0))
    expect([...stored]).toEqual([...PDF])
  })
})

describe('checkFiles refuses', () => {
  it('a program renamed .pdf', async () => {
    expect(await checkFiles([file('pack.pdf', EXE)])).toEqual({
      ok: false,
      reason: 'type',
      name: 'pack.pdf',
    })
  })

  it('a real PDF renamed .png — extension and bytes must agree', async () => {
    expect(await checkFiles([file('photo.png', PDF)])).toMatchObject({ ok: false, reason: 'type' })
  })

  it('SVG, even a harmless-looking name', async () => {
    expect(await checkFiles([file('logo.svg', SVG)])).toMatchObject({ ok: false, reason: 'type' })
  })

  it('a PDF Payload would refuse: no xref near the end (measured 2026-09-29)', async () => {
    const truncated = bytes('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
    expect(await checkFiles([file('pack.pdf', truncated)])).toMatchObject({ reason: 'type' })
  })

  it('a file with no extension', async () => {
    expect(await checkFiles([file('pack', PDF)])).toMatchObject({ ok: false, reason: 'type' })
  })

  it('a 6th file', async () => {
    const six = Array.from({ length: 6 }, (_, i) => file(`p${i}.pdf`, PDF))
    expect(await checkFiles(six)).toEqual({ ok: false, reason: 'too-many' })
    // Control: five is fine.
    expect((await checkFiles(six.slice(0, 5))).ok).toBe(true)
  })

  it('25 MB + 1 byte in total, and accepts exactly 25 MB', async () => {
    const half = MAX_TOTAL_BYTES / 2
    const padded = (extra: number) => {
      const content = new Uint8Array(half + extra)
      content.set(PDF, 0)
      content.set(PDF.subarray(PDF.length - 30), content.length - 30)
      return content
    }
    expect(await checkFiles([file('a.pdf', padded(0)), file('b.pdf', padded(1))])).toEqual({
      ok: false,
      reason: 'too-big',
    })
    expect((await checkFiles([file('a.pdf', padded(0)), file('b.pdf', padded(0))])).ok).toBe(true)
  })

  it('a 0-byte file that has a name', async () => {
    expect(await checkFiles([new File([], 'empty.pdf')])).toEqual({
      ok: false,
      reason: 'empty',
      name: 'empty.pdf',
    })
  })
})

describe('cleanFileName', () => {
  it('strips paths and control characters: "../../a\\u0000.pdf" → "a.pdf"', () => {
    expect(cleanFileName('../../a\u0000.pdf')).toBe('a.pdf')
    expect(cleanFileName('C:\\Users\\me\\Desktop\\pack.pdf')).toBe('pack.pdf')
  })

  it('removes the direction override that disguises a name', () => {
    // U+202E makes "pack\u202Egpj.exe" display as "packexe.jpg": a program posing as a photo.
    expect(cleanFileName('pack\u202Egpj.exe')).toBe('packgpj.exe')
  })

  it('keeps unicode names, normalised', () => {
    expect(cleanFileName('Café Tech Pack.pdf')).toBe('Café Tech Pack.pdf'.normalize('NFC'))
    expect(cleanFileName('Cafe\u0301.pdf')).toBe('Café.pdf'.normalize('NFC'))
  })

  it('never leaves an empty or dot-only name', () => {
    expect(cleanFileName('.pdf')).toBe('pdf')
    expect(cleanFileName('...')).toBe('file')
    expect(cleanFileName('   .PDF')).toBe('PDF')
  })

  it('caps the length and keeps the extension', () => {
    const long = cleanFileName(`${'a'.repeat(300)}.pdf`)
    expect(long.length).toBe(120)
    expect(long.endsWith('.pdf')).toBe(true)
  })
})

describe('formatBytes', () => {
  it('reads like a person would say it', () => {
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB')
    expect(formatBytes(830 * 1024)).toBe('830 KB')
    expect(formatBytes(12)).toBe('1 KB')
  })
})

/*
 * ⚠️ MEMORY AT THE 25 MB LIMIT (final review, 2026-09-29). Measured on a local Workers runtime:
 * storing one 24 MB PDF raised its memory by 124 MB, against a Worker's 128 MB. One cause was
 * here — every file was copied whole to look at its first and last bytes, and the copies were
 * kept until the upload. The check now reads only those ends, and hands the File itself on, so
 * the route copies one file at a time, only when it stores it.
 */
describe('checkFiles reads only the ends of each file', () => {
  class WholeReadForbidden extends File {
    override arrayBuffer(): Promise<ArrayBuffer> {
      throw new Error('checkFiles read the whole file')
    }
  }
  const big = new Uint8Array(3 * 1024 * 1024)
  big.set(bytes('%PDF-1.7\n'), 0)
  big.set(bytes('\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n'), big.length - 40)

  it('checks a PDF by its first and last bytes, never the whole file', async () => {
    const check = await checkFiles([new WholeReadForbidden([big], 'pack.pdf')])
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.files[0]?.file.size).toBe(big.length)
  })

  // NEGATIVE CONTROL: the ends really are read — break the ending and it is refused.
  it('still refuses a PDF whose last bytes lack its ending', async () => {
    const cut = big.slice(0, big.length - 40)
    expect(await checkFiles([new WholeReadForbidden([cut], 'pack.pdf')])).toMatchObject({
      ok: false,
      reason: 'type',
    })
  })
})
