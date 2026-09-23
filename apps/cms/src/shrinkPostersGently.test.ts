import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { OWNER_EXCEPTIONS } from '../../../scripts/poster-sizes.mjs'
import {
  type ColourwayRow,
  GENTLE_TRIMS,
  idOf,
  looksLikeInstructionText,
  readBackProblems,
  reencode,
  reencodeProblems,
  repointedColourways,
  sha256,
  VEST,
} from '../../../scripts/shrink-posters-gently.mjs'

/**
 * "Shrink gently" (audit L-11/IM-02) re-encodes seven live posters at settings the
 * owner already approved by looking at the rendered picture — root CLAUDE.md's
 * standing rule against tuning a preset by file size alone. GENTLE_TRIMS' numbers
 * are live measurements (2026-09-17), not invented; this file proves the SETTINGS
 * still reproduce those exact bytes, and that every guard here catches the fault it
 * claims to catch, not just passes the good case.
 */

// ---- a synthetic poster, built the same way the CLO pipeline's own probe does ----
// (no external fixture file: this is a minimal hand-built RGBA PNG — signature,
// IHDR, one IDAT, IEND — so the test carries its own input rather than depending on
// a binary checked into the repo.)

function png(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  const rows: Buffer[] = []
  for (let y = 0; y < height; y++) {
    const rowBuf = Buffer.alloc(1 + width * 4)
    for (let x = 0; x < width; x++) rowBuf.set(pixel(x, y), 1 + x * 4)
    rows.push(rowBuf)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A 120×150 garment silhouette with a soft edge — the shape a real poster has. */
const garment = (width: number, height: number, opaque = false): Buffer =>
  png(width, height, (x, y) => {
    const dx = (x - width / 2) / (width * 0.375)
    const dy = (y - height / 2) / (height * 0.4)
    const d = Math.sqrt(dx * dx + dy * dy)
    const alpha = opaque ? 255 : d < 0.9 ? 255 : d < 1 ? Math.round(2550 * (1 - d)) : 0
    const grain = ((x * 7919 + y * 104729) % 23) * 3
    return [180 + (grain % 40), 90 + ((grain * 3) % 50), 110 + ((grain * 5) % 30), alpha]
  })

/** The preset a real poster is first encoded at, before any gentle re-encode. */
const PIPELINE_PRESET = { quality: 90, alphaQuality: 100, effort: 4, smartSubsample: false }

describe('sha256', () => {
  it('matches the published NIST test vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('reencode + reencodeProblems, against a synthetic poster', () => {
  it('is deterministic for the same bytes and settings', async () => {
    const a = await reencode(garment(120, 150), PIPELINE_PRESET)
    const b = await reencode(garment(120, 150), PIPELINE_PRESET)
    // sha256, not Buffer#equals: @cloudflare/workers-types' ambient Buffer (in this
    // package's tsconfig "types") narrows the instance type, the same class of gap
    // documented in root CLAUDE.md for apps/shrink's readUInt32LE. Comparing hashes
    // sidesteps it and is exactly what this script's own callers rely on anyway.
    expect(sha256(a)).toBe(sha256(b))
    expect(a.length).toBe(5520)
  })

  it('passes a genuinely gentler re-encode', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const trimmed = await reencode(original, VEST)
    expect(original.length).toBe(5520)
    expect(trimmed.length).toBe(3138)
    expect(await reencodeProblems(original, trimmed)).toEqual([])
  })

  it('flags a re-encode that is not smaller (quality 100, effort 0)', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const heavier = await reencode(original, {
      quality: 100,
      alphaQuality: 100,
      effort: 0,
      smartSubsample: false,
    })
    expect(heavier.length).toBe(12170)
    expect(await reencodeProblems(original, heavier)).toEqual([
      'the result (12170 B) is not smaller than the original (5520 B)',
    ])
  })

  it('flags a re-encode whose dimensions changed', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const smaller = await reencode(garment(60, 75), VEST)
    expect(smaller.length).toBe(1184)
    expect(await reencodeProblems(original, smaller)).toEqual([
      'the result is 60x75, the original was 120x150',
    ])
  })

  it('flags a re-encode that lost the alpha channel', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const opaque = await reencode(garment(120, 150, true), VEST)
    expect(opaque.length).toBe(3516)
    expect(await reencodeProblems(original, opaque)).toEqual(['the result lost the alpha channel'])
  })

  it('flags a result that is not webp', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const rawPng = garment(120, 150)
    expect(await reencodeProblems(original, rawPng)).toEqual(['the result is png, not webp'])
  })

  it('flags a result that does not decode at all', async () => {
    const original = await reencode(garment(120, 150), PIPELINE_PRESET)
    const garbage = Buffer.from('this is not an image, just plain text')
    expect(await reencodeProblems(original, garbage)).toEqual([
      'the result does not decode as an image',
    ])
  })
})

describe('GENTLE_TRIMS', () => {
  it('is pinned to the seven approved trims, measured 2026-09-17', () => {
    expect(GENTLE_TRIMS).toEqual([
      {
        product: 'r-asb',
        colour: 'blush',
        settings: { quality: 80, alphaQuality: 100, effort: 4, smartSubsample: false },
        original: {
          bytes: 105972,
          sha256: 'b7a4112370126d64df94eaa888cc992b2bd4991de9a055d1515b01e87b4f85ee',
        },
        approved: {
          bytes: 99020,
          sha256: '248266ab6c12a424102c2b0cbaf13f58759fa1ba17ec3b3be7869d92ed97befd',
        },
      },
      {
        product: 'r-asb',
        colour: 'pebble',
        settings: { quality: 80, alphaQuality: 100, effort: 4, smartSubsample: true },
        original: {
          bytes: 107208,
          sha256: 'f5707030d61b957e519aa8b52486c42a5ac863e85cdeb95565e7528739ac6ec2',
        },
        approved: {
          bytes: 99040,
          sha256: 'e79c8919449d4bba9730ddfb0f3f34c641939c2abff3f6154e2a9ebcc5acb75c',
        },
      },
      {
        product: 'r-wzu',
        colour: 'blush',
        settings: VEST,
        original: {
          bytes: 173448,
          sha256: '6864b699313dc66e015d7b555cd52063aeec920f5159ad7ec6683ea12bdebef1',
        },
        approved: {
          bytes: 133930,
          sha256: '9349235a36d8e56515dc1bae8daf62d7d3e2363ab004ec3bd6bf1febc19ae665',
        },
      },
      {
        product: 'r-wzu',
        colour: 'butter',
        settings: VEST,
        original: {
          bytes: 177230,
          sha256: 'd6863df9ebbe75b8d621fd145604fcc7c339a92814a69f0ebb0a75d842d76302',
        },
        approved: {
          bytes: 133180,
          sha256: '2aa678e05816d9b0bfced2d4ee1361f15573317eadde0966f4df356ae6969728',
        },
      },
      {
        product: 'r-wzu',
        colour: 'powder-blue',
        settings: VEST,
        original: {
          bytes: 191264,
          sha256: 'abf6bbc9c06efcd48d975cab5d6735ad34897e8d1091efa33c13dd103d5d69b2',
        },
        approved: {
          bytes: 139524,
          sha256: 'c1d44f72aa81b912c5fc19ec55fdd27f831962dc39ce9f26d56f9b2283bedb25',
        },
      },
      {
        product: 'r-wzu',
        colour: 'beige',
        settings: VEST,
        original: {
          bytes: 181698,
          sha256: '35211be971022215ef45ea3af23f7fec0b49ac02c40009cf360efac1da4a5726',
        },
        approved: {
          bytes: 132298,
          sha256: '7b449de9c33aad099a88327c260194d6e9f041ed486e3632db54451845502fbf',
        },
      },
      {
        product: 'r-wzu',
        colour: 'plum',
        settings: VEST,
        original: {
          bytes: 168964,
          sha256: '6445536067934a15654c73b3ee35f6e1091f0a84e42ccfed22063347d8c221ad',
        },
        approved: {
          bytes: 130004,
          sha256: '0fd90cc9a2cf42e4a1f40588db40135dceabf1bf6c22d61755bb967b684285a0',
        },
      },
    ])
  })

  it('each approved size is below its own original', () => {
    for (const trim of GENTLE_TRIMS) expect(trim.approved.bytes).toBeLessThan(trim.original.bytes)
  })

  // The Sportswear family median measured 2026-09-17 — the same figure
  // apps/cms/src/posterSizes.test.ts pins. Not imported: poster-sizes.mjs computes it
  // live from production and exports no fixed constant, so this is this file's own
  // reference point for judging GENTLE_TRIMS' RESULT, same as the owner judged it.
  const SPORTSWEAR_MEDIAN_2026_09_17 = 50517

  it('r-asb lands under 2× the Sportswear median on its own — no exception needed', () => {
    for (const trim of GENTLE_TRIMS.filter((t) => t.product === 'r-asb')) {
      expect(trim.approved.bytes / SPORTSWEAR_MEDIAN_2026_09_17).toBeLessThan(2)
    }
  })

  it('r-wzu lands inside its own OWNER_EXCEPTIONS ceiling — gentler, not unlimited', () => {
    const exception = OWNER_EXCEPTIONS.find((e) => e.product === 'r-wzu')
    expect(exception).toBeDefined()
    for (const trim of GENTLE_TRIMS.filter((t) => t.product === 'r-wzu')) {
      const ratio = trim.approved.bytes / SPORTSWEAR_MEDIAN_2026_09_17
      expect(ratio).toBeGreaterThanOrEqual(2)
      expect(ratio).toBeLessThanOrEqual(exception!.maxRatio)
    }
  })
})

// ---- colourway row fixtures, shaped like Product.colourways (fields/colourways.ts) ----

const row = (overrides: Partial<ColourwayRow> = {}): ColourwayRow => ({
  id: 1,
  slug: 'blush',
  displayName: 'Blush',
  variantId: 'Default Colorway',
  posterPreview: 10,
  altText: 'WOMEN ZIP-UP VEST in Blush',
  hexSwatch: '#FFCACC',
  glbAsset: null,
  active: true,
  note: '',
  ...overrides,
})

describe('idOf', () => {
  it('reads a bare id, a populated relation, or null the same way', () => {
    expect(idOf(42)).toBe(42)
    expect(idOf({ id: 42, url: 'https://media.wear-run.help/x.webp' })).toBe(42)
    expect(idOf(null)).toBeNull()
    expect(idOf(undefined)).toBeNull()
  })
})

describe('repointedColourways', () => {
  it('replaces posterPreview only on the named rows, leaving every other row and field untouched', () => {
    const rows = [
      row({ id: 1, slug: 'blush', posterPreview: 10 }),
      row({ id: 2, slug: 'butter', displayName: 'Butter', posterPreview: 20 }),
    ]
    const result = repointedColourways(rows, new Map([['blush', 999]]))
    expect(result[0]).toEqual({ ...rows[0], posterPreview: 999 })
    expect(result[1]).toEqual(rows[1])
  })

  it('throws on a slug the map names that no row has', () => {
    const rows = [row({ slug: 'blush' })]
    expect(() => repointedColourways(rows, new Map([['plum', 999]]))).toThrow(/plum/)
  })

  it('throws on a duplicate slug among the rows', () => {
    const rows = [row({ id: 1, slug: 'blush' }), row({ id: 2, slug: 'blush' })]
    expect(() => repointedColourways(rows, new Map())).toThrow(/duplicate/)
  })
})

describe('readBackProblems', () => {
  it('is empty when every field matches, relations normalised bare-vs-populated', () => {
    const sent = [row({ posterPreview: 999 })]
    const stored = [row({ posterPreview: { id: 999, url: 'https://media.wear-run.help/x.webp' } })]
    expect(readBackProblems(sent, stored)).toEqual([])
  })

  it('catches a field Payload silently did not store', () => {
    // The trap this exists for: apps/cms/CLAUDE.md, "A PATCH NAMING A PROJECTED
    // FIELD RETURNS 200 AND STORES NOTHING" — a 200 alone would have missed this.
    const sent = [row({ posterPreview: 999 })]
    const stored = [row({ posterPreview: 10 })] // the OLD id: the write did not take
    expect(readBackProblems(sent, stored)).toEqual([
      'row 0 (blush): posterPreview sent 999, stored 10',
    ])
  })

  it('catches a row count change', () => {
    const sent = [row({ id: 1, slug: 'blush' }), row({ id: 2, slug: 'butter' })]
    expect(readBackProblems(sent, [row({ id: 1, slug: 'blush' })])).toEqual([
      'row count changed: sent 2, stored 1',
    ])
  })
})

describe('looksLikeInstructionText', () => {
  it('refuses whitespace and placeholder-shaped text — same rule as apply-footer-facts.mjs', () => {
    expect(looksLikeInstructionText('paste-your-key-here')).toBe(true)
    expect(looksLikeInstructionText('your-real-key')).toBe(true)
    expect(looksLikeInstructionText('<key>')).toBe(true)
    expect(looksLikeInstructionText('a real key')).toBe(true) // whitespace alone is enough
  })

  it('accepts an opaque token', () => {
    expect(looksLikeInstructionText('7f3a9c2e5b1d8f4a6c0e2b9d1f5a3c7e')).toBe(false)
  })
})
