import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OWNER_EXCEPTIONS } from '../../../scripts/poster-sizes.mjs'
import {
  apply,
  candidateUploads,
  type ColourwayRow,
  dryRun,
  findExistingUpload,
  GENTLE_TRIMS,
  idOf,
  looksLikeInstructionText,
  planProductWrite,
  posterState,
  readBackProblems,
  reencode,
  reencodeProblems,
  repointedColourways,
  sha256,
  Stop,
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

// ---- fix round 1 (2026-09-23): the CURRENT poster is read through the live
// product/media relation, never a guessed filename — see posterState, which both
// dryRun() and apply() now use to classify it, and findExistingUpload(), which
// keeps a retry from uploading a duplicate. A real trim fixture (real bytes via
// reencode(), never one of the seven live GENTLE_TRIMS rows) so these tests do not
// silently start asserting production values.

/** A GentleTrim-shaped fixture with freshly-computed, real original/approved bytes. */
async function fixtureTrim(overrides: { product?: string; colour?: string } = {}) {
  const original = await reencode(garment(120, 150), PIPELINE_PRESET)
  const approved = await reencode(original, VEST)
  const trim = {
    product: overrides.product ?? 'r-test',
    colour: overrides.colour ?? 'testcolour',
    settings: VEST,
    original: { bytes: original.length, sha256: sha256(original) },
    approved: { bytes: approved.length, sha256: sha256(approved) },
  }
  return { trim, original, approved }
}

describe('posterState', () => {
  it('is done when the bytes equal the approved trim', async () => {
    const { trim, approved } = await fixtureTrim()
    expect(posterState(approved, trim)).toEqual({
      state: 'done',
      bytes: approved.length,
      sha256: sha256(approved),
    })
  })

  it('is ready when the bytes equal the known original', async () => {
    const { trim, original } = await fixtureTrim()
    expect(posterState(original, trim)).toEqual({
      state: 'ready',
      bytes: original.length,
      sha256: sha256(original),
    })
  })

  it('is changed when the bytes match neither — what a guessed URL could never see', async () => {
    const { trim } = await fixtureTrim()
    const somethingElse = await reencode(garment(60, 75), VEST)
    expect(posterState(somethingElse, trim)).toEqual({
      state: 'changed',
      bytes: somethingElse.length,
      sha256: sha256(somethingElse),
    })
  })
})

describe('planProductWrite', () => {
  // Hand-built states, not derived from posterState(): this describes ONLY the
  // planning rule (what a set of already-known states should do), independent of
  // how those states were classified.
  const a = {
    product: 'p',
    colour: 'a',
    settings: VEST,
    original: { bytes: 1, sha256: 'orig-a' },
    approved: { bytes: 1, sha256: 'appr-a' },
  }
  const b = {
    product: 'p',
    colour: 'b',
    settings: VEST,
    original: { bytes: 1, sha256: 'orig-b' },
    approved: { bytes: 1, sha256: 'appr-b' },
  }

  it('needs no write when every colour is already done — a second full run is a polite no-op', () => {
    const states = [
      { trim: a, state: 'done' as const, bytes: 1, sha256: 'appr-a' },
      { trim: b, state: 'done' as const, bytes: 1, sha256: 'appr-b' },
    ]
    const plan = planProductWrite(states)
    expect(plan.needsWrite).toBe(false)
    expect(plan.toTrim).toEqual([])
    expect(plan.alreadyDone).toEqual(states)
    expect(plan.problems).toEqual([])
  })

  it('needs a write when at least one colour is still ready, leaving done colours out of it', () => {
    const states = [
      { trim: a, state: 'done' as const, bytes: 1, sha256: 'appr-a' },
      { trim: b, state: 'ready' as const, bytes: 5, sha256: 'orig-b' },
    ]
    const plan = planProductWrite(states)
    expect(plan.needsWrite).toBe(true)
    expect(plan.toTrim).toEqual([states[1]])
    expect(plan.alreadyDone).toEqual([states[0]])
    expect(plan.problems).toEqual([])
  })

  it('a changed colour stops the whole product, naming actual vs both expected bytes and sha256', () => {
    const states = [{ trim: a, state: 'changed' as const, bytes: 999, sha256: 'unknown-hash' }]
    const plan = planProductWrite(states)
    expect(plan.needsWrite).toBe(false)
    expect(plan.toTrim).toEqual([])
    expect(plan.problems).toEqual([
      'a: current poster is 999 B (unknown-hash) — neither the approved trim (1 B, appr-a) nor ' +
        'the known original (1 B, orig-a). It changed since this was written — re-run the dry ' +
        'run first.',
    ])
  })
})

describe('candidateUploads', () => {
  it('narrows by the naming convention only, never by bytes — findExistingUpload verifies those', async () => {
    const { trim } = await fixtureTrim({ product: 'r-asb', colour: 'blush' })
    const docs = [
      {
        id: 1,
        filename: 'r-asb-blush-poster.webp',
        url: 'https://media.wear-run.help/r-asb-blush-poster.webp',
      },
      {
        id: 2,
        filename: 'r-asb-blush-poster-1.webp',
        url: 'https://media.wear-run.help/r-asb-blush-poster-1.webp',
      },
      {
        id: 3,
        filename: 'r-asb-pebble-poster.webp',
        url: 'https://media.wear-run.help/r-asb-pebble-poster.webp',
      },
      {
        id: 4,
        filename: 'r-wzu-blush-poster.webp',
        url: 'https://media.wear-run.help/r-wzu-blush-poster.webp',
      },
      { id: 5, filename: 'r-asb-blush-poster-no-url.webp' },
    ]
    expect(candidateUploads(docs, trim)).toEqual([
      { id: 1, url: 'https://media.wear-run.help/r-asb-blush-poster.webp' },
      { id: 2, url: 'https://media.wear-run.help/r-asb-blush-poster-1.webp' },
    ])
  })
})

describe('findExistingUpload', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reuses a candidate whose bytes already equal the approved trim — no re-upload needed', async () => {
    const { trim, original, approved } = await fixtureTrim({ product: 'r-asb', colour: 'blush' })
    const docs = [
      { id: 1, filename: 'r-asb-blush-poster.webp', url: 'https://example.test/original.webp' },
      { id: 2, filename: 'r-asb-blush-poster-1.webp', url: 'https://example.test/trimmed.webp' },
    ]
    // new Uint8Array(...), not the Buffer itself: @cloudflare/workers-types' ambient
    // BodyInit does not accept this package's narrowed Buffer type — same class of
    // gap as the Buffer#equals note above, sidestepped the same way, by not handing
    // it a Buffer at all.
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.test/original.webp')
        return new Response(new Uint8Array(original))
      if (url === 'https://example.test/trimmed.webp') return new Response(new Uint8Array(approved))
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(findExistingUpload(docs, trim)).resolves.toEqual({
      id: 2,
      url: 'https://example.test/trimmed.webp',
    })
  })

  it('returns null when no candidate matches the approved bytes — a fresh upload is still needed', async () => {
    const { trim, original } = await fixtureTrim({ product: 'r-asb', colour: 'blush' })
    const docs = [
      { id: 1, filename: 'r-asb-blush-poster.webp', url: 'https://example.test/original.webp' },
    ]
    // Still the ORIGINAL bytes, not the approved trim — a real "nothing to reuse yet" case.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(original))),
    )
    await expect(findExistingUpload(docs, trim)).resolves.toBeNull()
  })
})

// ---- fix round 2 (2026-09-23): orchestration tests for dryRun()/apply()
// themselves, not just their helpers — three promises made to the owner when
// they chose "Fix it first": the check can say "already done"; a second full
// run is a polite no-op; a retry after a half-finished run does not upload
// twice. Every fetch here is stubbed; nothing reaches production. A test never
// supplies GENTLE_TRIMS' own live entries — dryRun()/apply() now take `trims`
// as a parameter for exactly this reason (see their doc comments in the .mjs).

const CMS = 'https://cms.wear-run.help'

/** One CMS request this batch of tests recorded — method + path, never the body,
 * so "no POST happened" is a fact about the request LIST, not an inference from
 * a return value. */
type Recorded = { method: string; path: string }

afterEach(() => vi.unstubAllGlobals())

describe('dryRun()', () => {
  it('reports done for a colour already at the approved bytes, and ready for one still at the original', async () => {
    const done = await fixtureTrim({ product: 'r-fix', colour: 'done-colour' })
    const ready = await fixtureTrim({ product: 'r-fix', colour: 'ready-colour' })
    const trims = [done.trim, ready.trim]
    const posterUrl = (t: { product: string; colour: string }) =>
      `https://media.wear-run.help/${t.product}-${t.colour}-poster.webp`
    // Every request dryRun() makes — method, path (the full URL: this test spans
    // two hosts, CMS and media) and whether it carried a key. The dry run is
    // read-only and needs no key at all, so this is a fact about the REQUESTS it
    // sent, not an inference from the rows it returned.
    const requests: (Recorded & { hasAuthHeader: boolean })[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? 'GET',
          path: url,
          hasAuthHeader: new Headers(init?.headers).has('Authorization'),
        })
        if (url === `${CMS}/api/public/viewer/r-fix`) {
          return new Response(
            JSON.stringify({
              colourways: [
                { slug: 'done-colour', poster: { url: posterUrl(done.trim) } },
                { slug: 'ready-colour', poster: { url: posterUrl(ready.trim) } },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          )
        }
        if (url === posterUrl(done.trim)) {
          return new Response(new Uint8Array(done.approved), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        if (url === posterUrl(ready.trim)) {
          return new Response(new Uint8Array(ready.original), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const rows = await dryRun(trims)
    expect(rows.find((r) => r.trim.colour === 'done-colour')?.status).toBe('done')
    expect(rows.find((r) => r.trim.colour === 'ready-colour')?.status).toBe('ready')

    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((r) => r.method === 'GET')).toBe(true)
    expect(requests.some((r) => r.method === 'POST' || r.method === 'PATCH')).toBe(false)
    expect(requests.every((r) => !r.hasAuthHeader)).toBe(true)
  })
})

describe('apply()', () => {
  // Console-spy teardown (2026-09-23): every test below spies on console.log
  // and/or console.error via vi.spyOn(...).mockImplementation(...) inline, with
  // no per-test cleanup — unlike findExistingUpload()'s own local afterEach above
  // and this file's root-level afterEach, neither of which touches a console spy.
  // Confirmed by planting a fault (deleting the afterEach below) and red-running:
  // the SECOND test's beforeEach guard fails because console.log/console.error
  // are still the mock objects the first test installed — vi.spyOn does not scope
  // a mock to the test that created it, so its .mock.calls accumulate across the
  // whole file's run until something restores it.
  //
  // restoreAllMocks(), not clearAllMocks()/resetAllMocks(): per the INSTALLED
  // vitest's own docs (node_modules/vitest/dist/index.d.ts and
  // @vitest/spy/dist/index.d.ts), only restoreAllMocks "restore[s] original
  // descriptors of spied-on objects" — i.e. actually undoes vi.spyOn back to the
  // real console.log/console.error. clearAllMocks only empties `.mock` state and
  // leaves the mock installed; resetAllMocks resets the implementation but still
  // does not restore the descriptor — either would leave console silently mocked
  // (and, after a reset, permanently silenced) for the rest of the file's run.
  beforeEach(() => {
    // Durable guard: if the afterEach below is ever removed, THIS goes red on the
    // next test that runs after one which spied on console, instead of passing
    // silently with leaked mock state.
    expect(vi.isMockFunction(console.log)).toBe(false)
    expect(vi.isMockFunction(console.error)).toBe(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('with every colour already done, makes no POST and no PATCH, and says so', async () => {
    const a = await fixtureTrim({ product: 'r-fix', colour: 'a' })
    const b = await fixtureTrim({ product: 'r-fix', colour: 'b' })
    const trims = [a.trim, b.trim]
    const posterUrlA = 'https://media.wear-run.help/r-fix-a-poster.webp'
    const posterUrlB = 'https://media.wear-run.help/r-fix-b-poster.webp'
    const productDoc = {
      id: 999,
      colourways: [
        row({ id: 1, slug: 'a', displayName: 'A', posterPreview: 10 }),
        row({ id: 2, slug: 'b', displayName: 'B', posterPreview: 20 }),
      ],
    }
    const requests: Recorded[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.startsWith(CMS)) {
          const path = url.slice(CMS.length)
          requests.push({ method, path })
          if (path.startsWith('/api/products?where')) {
            return new Response(JSON.stringify({ docs: [productDoc] }))
          }
          if (path === '/api/media/10?depth=0')
            return new Response(JSON.stringify({ id: 10, url: posterUrlA }))
          if (path === '/api/media/20?depth=0')
            return new Response(JSON.stringify({ id: 20, url: posterUrlB }))
          throw new Error(`unexpected CMS path ${method} ${path}`)
        }
        // M1: apply() now checks the current-poster fetch's content-type too, the
        // same as dryRun() always has — a real poster serves image/webp.
        if (url === posterUrlA) {
          return new Response(new Uint8Array(a.approved), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        if (url === posterUrlB) {
          return new Response(new Uint8Array(b.approved), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        throw new Error(`unexpected fetch ${method} ${url}`)
      }),
    )
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await apply('fake-test-key-not-real-1234', trims)

    expect(requests.some((r) => r.method === 'POST')).toBe(false)
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes('nothing to write'))).toBe(
      true,
    )
  })

  it('a retry with an already-uploaded trim in the media listing reuses it — no POST, one PATCH with only that colour repointed', async () => {
    const { trim, original, approved } = await fixtureTrim({ product: 'r-fix', colour: 'x' })
    const originalUrl = 'https://media.wear-run.help/r-fix-x-poster.webp'
    const reuseUrl = 'https://media.wear-run.help/r-fix-x-poster-1.webp'
    const rowX = row({ id: 1, slug: 'x', displayName: 'X', posterPreview: 10 })
    const rowY = row({ id: 2, slug: 'y', displayName: 'Y', posterPreview: 99 }) // untouched decoy
    const productDoc = { id: 999, colourways: [rowX, rowY] }
    const requests: Recorded[] = []
    // An object property, not a bare `let`: TypeScript narrows a closure-reassigned
    // `let` back to `never` at the read site here, since the only assignment it can
    // see is the `= null` initialiser — a property on an object typed up front has
    // no such narrowing to fight.
    const captured: { patchBody: { colourways: ColourwayRow[] } | null } = { patchBody: null }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.startsWith(CMS)) {
          const path = url.slice(CMS.length)
          requests.push({ method, path })
          if (path.startsWith('/api/products?where')) {
            return new Response(JSON.stringify({ docs: [productDoc] }))
          }
          if (path === '/api/media/10?depth=0')
            return new Response(JSON.stringify({ id: 10, url: originalUrl }))
          if (path === '/api/media?limit=100&depth=0&page=1') {
            return new Response(
              JSON.stringify({
                docs: [
                  { id: 10, filename: 'r-fix-x-poster.webp', url: originalUrl },
                  { id: 11, filename: 'r-fix-x-poster-1.webp', url: reuseUrl },
                ],
                hasNextPage: false,
              }),
            )
          }
          if (path === '/api/products/999' && method === 'PATCH') {
            captured.patchBody = JSON.parse(String(init?.body))
            return new Response(JSON.stringify({ ok: true }))
          }
          if (path === '/api/products/999?depth=0') {
            return new Response(
              JSON.stringify({ colourways: [{ ...rowX, posterPreview: 11 }, rowY] }),
            )
          }
          if (path === '/api/public/viewer/r-fix') {
            return new Response(
              JSON.stringify({ colourways: [{ slug: 'x', poster: { url: reuseUrl } }] }),
            )
          }
          throw new Error(`unexpected CMS path ${method} ${path}`)
        }
        // M1: apply()'s current-poster fetch (the posterPreview relation, id 10)
        // now checks content-type — a real poster serves image/webp.
        if (url === originalUrl) {
          return new Response(new Uint8Array(original), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        if (url === reuseUrl) return new Response(new Uint8Array(approved))
        throw new Error(`unexpected fetch ${method} ${url}`)
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await apply('fake-test-key-not-real-1234', [trim])

    expect(requests.filter((r) => r.method === 'POST')).toEqual([])
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(1)
    expect(captured.patchBody).not.toBeNull()
    expect(captured.patchBody?.colourways).toEqual([{ ...rowX, posterPreview: 11 }, rowY])
  })

  it('a failed media listing stops the run with its message — no POST, no PATCH', async () => {
    const { trim, original } = await fixtureTrim({ product: 'r-fix', colour: 'x' })
    const originalUrl = 'https://media.wear-run.help/r-fix-x-poster.webp'
    const productDoc = { id: 999, colourways: [row({ id: 1, slug: 'x', posterPreview: 10 })] }
    const requests: Recorded[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.startsWith(CMS)) {
          const path = url.slice(CMS.length)
          requests.push({ method, path })
          if (path.startsWith('/api/products?where')) {
            return new Response(JSON.stringify({ docs: [productDoc] }))
          }
          if (path === '/api/media/10?depth=0')
            return new Response(JSON.stringify({ id: 10, url: originalUrl }))
          if (path.startsWith('/api/media?limit=100')) {
            return new Response('service unavailable', { status: 503 })
          }
          throw new Error(`unexpected CMS path ${method} ${path}`)
        }
        // M1: apply()'s current-poster fetch now checks content-type too — a real
        // poster serves image/webp.
        if (url === originalUrl) {
          return new Response(new Uint8Array(original), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        throw new Error(`unexpected fetch ${method} ${url}`)
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(apply('fake-test-key-not-real-1234', [trim])).rejects.toBeInstanceOf(Stop)

    expect(requests.some((r) => r.method === 'POST')).toBe(false)
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
    expect(
      errorSpy.mock.calls.some((call) => String(call[0]).includes('The reuse check could not run')),
    ).toBe(true)
  })

  /**
   * M1 (2026-09-23). Before this, a fetch failure on the CURRENT poster (a 403,
   * 404 or 5xx body, or a challenge page whose content-type is not image/webp)
   * fell straight into posterState(), whose sha256 could not match either known
   * hash — so it was classified 'changed' and reported with changedNote()'s
   * wording ("It changed since this was written — re-run the dry run first."),
   * naming a poster's bytes and sha256 that were really an error body. Safe
   * either way (both stop before any write), but the wrong story. Name the
   * status/content-type instead, and never route through 'changed' at all.
   */
  it.each([
    [
      'a non-ok status',
      () => new Response('service unavailable', { status: 503 }),
      'the current poster answered 503',
    ],
    [
      'the wrong content-type',
      // A byte body with no headers carries NO content-type at all (a string body
      // would auto-default to text/plain, which is a different — and less
      // representative — case: some real challenge/error responses omit the
      // header entirely).
      () => new Response(new TextEncoder().encode('<html>cloudflare challenge</html>')),
      'content-type is "", not image/webp',
    ],
  ])(
    'names the problem and stops before any write on %s — never "changed"',
    async (_label, badResponse, expectedMessage) => {
      const { trim } = await fixtureTrim({ product: 'r-fix', colour: 'x' })
      const currentUrl = 'https://media.wear-run.help/r-fix-x-poster.webp'
      const productDoc = { id: 999, colourways: [row({ id: 1, slug: 'x', posterPreview: 10 })] }
      const requests: Recorded[] = []

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          const method = init?.method ?? 'GET'
          if (url.startsWith(CMS)) {
            const path = url.slice(CMS.length)
            requests.push({ method, path })
            if (path.startsWith('/api/products?where')) {
              return new Response(JSON.stringify({ docs: [productDoc] }))
            }
            if (path === '/api/media/10?depth=0') {
              return new Response(JSON.stringify({ id: 10, url: currentUrl }))
            }
            throw new Error(`unexpected CMS path ${method} ${path}`)
          }
          if (url === currentUrl) return badResponse()
          throw new Error(`unexpected fetch ${method} ${url}`)
        }),
      )
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(apply('fake-test-key-not-real-1234', [trim])).rejects.toBeInstanceOf(Stop)

      expect(requests.some((r) => r.method === 'POST')).toBe(false)
      expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
      const text = errorSpy.mock.calls.map((call) => String(call[0])).join(' ')
      expect(text).toContain(expectedMessage)
      expect(text).not.toContain('changed since this was written')
    },
  )

  /**
   * M2 (2026-09-23): the FRESH-UPLOAD path — the one every one of the owner's
   * seven posters takes on their FIRST `--apply` — had no orchestration test at
   * this level. "all done", "reuse" and "listing failed" above cover the other
   * three branches; none of them ever POSTs.
   */
  it('a fresh upload: one POST per ready colour, multipart with the file and the _payload alt, then one PATCH, then the read-back', async () => {
    const { trim, original, approved } = await fixtureTrim({ product: 'r-fix', colour: 'x' })
    const currentUrl = 'https://media.wear-run.help/r-fix-x-poster.webp'
    const uploadedUrl = 'https://media.wear-run.help/r-fix-x-poster-2.webp'
    const rowX = row({
      id: 1,
      slug: 'x',
      displayName: 'X',
      posterPreview: 10,
      altText: 'X alt text',
    })
    const productDoc = { id: 999, colourways: [rowX] }
    const requests: Recorded[] = []
    const uploads: FormData[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.startsWith(CMS)) {
          const path = url.slice(CMS.length)
          requests.push({ method, path })
          if (path.startsWith('/api/products?where')) {
            return new Response(JSON.stringify({ docs: [productDoc] }))
          }
          if (path === '/api/media/10?depth=0') {
            return new Response(JSON.stringify({ id: 10, url: currentUrl }))
          }
          // An empty listing: no previous run left anything to reuse.
          if (path === '/api/media?limit=100&depth=0&page=1') {
            return new Response(JSON.stringify({ docs: [], hasNextPage: false }))
          }
          if (path === '/api/media' && method === 'POST') {
            uploads.push(init?.body as FormData)
            return new Response(JSON.stringify({ doc: { id: 12, url: uploadedUrl } }))
          }
          if (path === '/api/products/999' && method === 'PATCH') {
            return new Response(JSON.stringify({ ok: true }))
          }
          if (path === '/api/products/999?depth=0') {
            return new Response(JSON.stringify({ colourways: [{ ...rowX, posterPreview: 12 }] }))
          }
          if (path === '/api/public/viewer/r-fix') {
            return new Response(
              JSON.stringify({ colourways: [{ slug: 'x', poster: { url: uploadedUrl } }] }),
            )
          }
          throw new Error(`unexpected CMS path ${method} ${path}`)
        }
        if (url === currentUrl) {
          return new Response(new Uint8Array(original), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        if (url === uploadedUrl) return new Response(new Uint8Array(approved))
        throw new Error(`unexpected fetch ${method} ${url}`)
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await apply('fake-test-key-not-real-1234', [trim])

    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1)
    expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(1)
    expect(requests.some((r) => r.path === '/api/products/999?depth=0')).toBe(true)

    // The multipart body: the re-encoded FILE, and the _payload alt — not just
    // that a POST happened.
    expect(uploads).toHaveLength(1)
    const alt = JSON.parse(String(uploads[0]!.get('_payload')))
    expect(alt).toEqual({ alt: rowX.altText })
    const file = uploads[0]!.get('file') as File
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('r-fix-x-poster.webp')
    expect(file.type).toBe('image/webp')
    expect(sha256(Buffer.from(await file.arrayBuffer()))).toBe(trim.approved.sha256)
  })

  it('served bytes differ after the upload — a Stop, NOT patched, no PATCH', async () => {
    const { trim, original } = await fixtureTrim({ product: 'r-fix', colour: 'x' })
    const currentUrl = 'https://media.wear-run.help/r-fix-x-poster.webp'
    const uploadedUrl = 'https://media.wear-run.help/r-fix-x-poster-2.webp'
    const rowX = row({ id: 1, slug: 'x', displayName: 'X', posterPreview: 10 })
    const productDoc = { id: 999, colourways: [rowX] }
    const requests: Recorded[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (url.startsWith(CMS)) {
          const path = url.slice(CMS.length)
          requests.push({ method, path })
          if (path.startsWith('/api/products?where')) {
            return new Response(JSON.stringify({ docs: [productDoc] }))
          }
          if (path === '/api/media/10?depth=0') {
            return new Response(JSON.stringify({ id: 10, url: currentUrl }))
          }
          if (path === '/api/media?limit=100&depth=0&page=1') {
            return new Response(JSON.stringify({ docs: [], hasNextPage: false }))
          }
          if (path === '/api/media' && method === 'POST') {
            return new Response(JSON.stringify({ doc: { id: 12, url: uploadedUrl } }))
          }
          throw new Error(`unexpected CMS path ${method} ${path}`)
        }
        if (url === currentUrl) {
          return new Response(new Uint8Array(original), {
            headers: { 'content-type': 'image/webp' },
          })
        }
        // The served bytes do not match what was uploaded — a corrupted or
        // truncated round trip through R2/Payload. Reusing `original` guarantees
        // a mismatch against trim.approved without inventing a third byte string.
        if (url === uploadedUrl) return new Response(new Uint8Array(original))
        throw new Error(`unexpected fetch ${method} ${url}`)
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(apply('fake-test-key-not-real-1234', [trim])).rejects.toBeInstanceOf(Stop)

    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1)
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
    expect(
      errorSpy.mock.calls.some((call) => String(call[0]).includes('served bytes do not match')),
    ).toBe(true)
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes('NOT patched'))).toBe(true)
  })
})
