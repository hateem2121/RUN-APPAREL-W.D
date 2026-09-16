import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCUMENTS } from '../../../infra/apex-404/documents.js'
import {
  WIDTHS,
  expectedPartIds,
  pictureFileName,
  pictureKey,
  validateManifest,
} from '../../../infra/apex-404/manifest.js'
import {
  REPO_ROOT,
  buildManifest,
  isInside,
  pageCountArgs,
  parsePageList,
  partsForPage,
  postScriptString,
  renderArgs,
  versionFor,
} from '../../../scripts/document-pages.mjs'

/**
 * The manifest is the Worker's allow-list: it builds an R2 key only for a part and a
 * width the manifest lists, so the private bucket cannot be walked through a code. These
 * tests are the security property, not bookkeeping — a validator that let a stray field
 * through would let request text reach R2.
 */
const part = (id: string, width = 2400, height = 1350) => ({ id, width, height })

/** A valid catalogue manifest: two split spreads and one whole spread. */
const catalogue = () => ({
  schema: 1,
  document: 'catalogue',
  version: '20260911-e8698731',
  widths: [800, 1600, 2400],
  pdf: {
    key: 'RUN PRODUCT CATALOUGE.pdf',
    bytes: 54_336_461,
    md5: 'e8698731ac2348595c3268dfd6d466c6',
  },
  pages: [
    { number: 1, parts: [part('p001a'), part('p001b')] },
    { number: 2, parts: [part('p002a'), part('p002b')] },
    { number: 3, parts: [part('p003w', 4800)] },
  ],
})
type CatalogueManifest = ReturnType<typeof catalogue>

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest(catalogue(), DOCUMENTS.catalogue)).toEqual({
      ok: true,
      manifest: catalogue(),
    })
  })

  const cases: [string, (m: CatalogueManifest) => unknown, string][] = [
    ['something that is not an object', () => 'nope', 'not an object'],
    ['another schema', (m) => ({ ...m, schema: 2 }), 'schema must be 1'],
    [
      "the other document's manifest",
      (m) => ({ ...m, document: 'profile' }),
      'document must be catalogue',
    ],
    ['a malformed version', (m) => ({ ...m, version: '2026-09-11' }), 'version must look like'],
    ['other widths', (m) => ({ ...m, widths: [800, 1600] }), 'widths must be exactly'],
    ['another PDF key', (m) => ({ ...m, pdf: { ...m.pdf, key: 'other.pdf' } }), 'pdf.key must be'],
    ['a zero byte count', (m) => ({ ...m, pdf: { ...m.pdf, bytes: 0 } }), 'pdf.bytes'],
    [
      'an upper-case MD5',
      (m) => ({ ...m, pdf: { ...m.pdf, md5: m.pdf.md5.toUpperCase() } }),
      'pdf.md5',
    ],
    [
      'a version made from another file',
      (m) => ({ ...m, version: '20260911-00000000' }),
      'first 8 digits',
    ],
    ['no pages', (m) => ({ ...m, pages: [] }), 'non-empty'],
    [
      'pages out of order',
      (m) => ({ ...m, pages: [m.pages[1], m.pages[0], m.pages[2]] }),
      'must be numbered 1',
    ],
    [
      'three parts on a page',
      (m) => ({
        ...m,
        pages: [{ number: 1, parts: [part('p001a'), part('p001b'), part('p001w')] }],
      }),
      'one or two parts',
    ],
    [
      'a part id from another page',
      (m) => ({ ...m, pages: [{ number: 1, parts: [part('p002w')] }] }),
      'must be p001w',
    ],
    [
      'a split page with a whole-page id',
      (m) => ({ ...m, pages: [{ number: 1, parts: [part('p001w'), part('p001b')] }] }),
      'must be p001a',
    ],
    [
      'a part with no height',
      (m) => ({ ...m, pages: [{ number: 1, parts: [{ id: 'p001w', width: 2400, height: 0 }] }] }),
      'positive whole width and height',
    ],
  ]

  it.each(cases)('rejects %s', (_label, mutate, reason) => {
    const result = validateManifest(mutate(catalogue()), DOCUMENTS.catalogue)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toContain(reason)
  })
})

describe('part ids and file names', () => {
  it('names split halves a and b, and a whole page w', () => {
    expect(expectedPartIds(3, 2)).toEqual(['p003a', 'p003b'])
    expect(expectedPartIds(12, 1)).toEqual(['p012w'])
  })

  it('names a picture file after its part and width', () => {
    expect(pictureFileName('p003a', 800)).toBe('p003a-800.webp')
    expect([...WIDTHS]).toEqual([800, 1600, 2400])
  })
})

describe('pictureKey', () => {
  const manifest = catalogue() as Parameters<typeof pictureKey>[0]

  it('builds the R2 key for a listed part and width', () => {
    expect(pictureKey(manifest, '20260911-e8698731', 'p002b-2400.webp')).toBe(
      'documents/catalogue/20260911-e8698731/p002b-2400.webp',
    )
  })

  it.each([
    ['an older version', '20260101-e8698731', 'p001a-1600.webp'],
    ['an unlisted part', '20260911-e8698731', 'p004a-1600.webp'],
    ['an unlisted width', '20260911-e8698731', 'p001a-1200.webp'],
    ['a zero-padded width', '20260911-e8698731', 'p001a-01600.webp'],
    ['another format', '20260911-e8698731', 'p001a-1600.png'],
    ['the manifest itself', '20260911-e8698731', 'manifest.json'],
    ['a parent-directory name', '20260911-e8698731', '..'],
  ])('refuses %s', (_label, version, fileName) => {
    expect(pictureKey(manifest, version, fileName)).toBeNull()
  })
})

describe('versionFor', () => {
  it('joins the date and the first 8 digits of the MD5', () => {
    expect(versionFor('20260911', 'e8698731ac2348595c3268dfd6d466c6')).toBe('20260911-e8698731')
  })

  it.each([
    ['2026-09-11', 'e8698731ac2348595c3268dfd6d466c6', 'YYYYMMDD'],
    ['20260911', 'E8698731AC2348595C3268DFD6D466C6', '32 lowercase hex'],
  ])('refuses date %j with MD5 %j', (date, md5, message) => {
    expect(() => versionFor(date, md5)).toThrow(message)
  })
})

describe('parsePageList', () => {
  it('reads a comma-separated list of page numbers', () => {
    expect([...parsePageList('5, 17')]).toEqual([5, 17])
    expect(parsePageList(undefined).size).toBe(0)
    expect(parsePageList('').size).toBe(0)
  })

  it.each(['0', 'five', '5-7', '1000'])('refuses %j', (text) => {
    expect(() => parsePageList(text)).toThrow('page numbers like 5,17')
  })
})

describe('partsForPage', () => {
  it('splits a spread into two equal halves, left then right', () => {
    expect(partsForPage({ split: true, number: 3, width: 4800, height: 1350 })).toEqual([
      { id: 'p003a', left: 0, top: 0, width: 2400, height: 1350 },
      { id: 'p003b', left: 2400, top: 0, width: 2400, height: 1350 },
    ])
  })

  it('keeps a page whole when asked', () => {
    expect(partsForPage({ split: false, number: 12, width: 2400, height: 1350 })).toEqual([
      { id: 'p012w', left: 0, top: 0, width: 2400, height: 1350 },
    ])
  })

  it('refuses an odd width, which cannot split into equal halves', () => {
    expect(() => partsForPage({ split: true, number: 1, width: 4801, height: 1350 })).toThrow(
      'two equal halves',
    )
  })

  it('refuses a part narrower than the widest picture, which would need enlarging', () => {
    expect(() => partsForPage({ split: true, number: 1, width: 3000, height: 1350 })).toThrow(
      'narrower than 2400',
    )
  })
})

describe('buildManifest', () => {
  it('builds a manifest the Worker accepts, for both documents', () => {
    const catalogue = buildManifest({
      doc: DOCUMENTS.catalogue,
      version: '20260911-e8698731',
      pdf: { bytes: 54_336_461, md5: 'e8698731ac2348595c3268dfd6d466c6' },
      pages: [{ number: 1, parts: [part('p001a'), part('p001b')] }],
    })
    const profile = buildManifest({
      doc: DOCUMENTS.profile,
      version: '20260911-ea7936d5',
      pdf: { bytes: 16_891_515, md5: 'ea7936d585961a06d1e83c4cd8d02b14' },
      pages: [{ number: 1, parts: [part('p001w')] }],
    })
    expect(validateManifest(catalogue, DOCUMENTS.catalogue).ok).toBe(true)
    expect(validateManifest(profile, DOCUMENTS.profile).ok).toBe(true)
    expect(catalogue.pdf.key).toBe('RUN PRODUCT CATALOUGE.pdf')
  })
})

describe('Ghostscript arguments', () => {
  it('renders at the design resolution, with text and graphics anti-aliasing', () => {
    expect(renderArgs('/tmp/a.pdf', '/tmp/out/page-%03d.png')).toEqual([
      '-q',
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=png16m',
      '-r120',
      '-dTextAlphaBits=4',
      '-dGraphicsAlphaBits=4',
      '-sOutputFile=/tmp/out/page-%03d.png',
      '/tmp/a.pdf',
    ])
  })

  it('counts pages with the command measured on the real PDFs (2026-09-11)', () => {
    expect(pageCountArgs('/tmp/a.pdf')).toEqual([
      '-q',
      '-dNODISPLAY',
      '-dNOSAFER',
      '-c',
      '(/tmp/a.pdf) (r) file runpdfbegin pdfpagecount = quit',
    ])
  })

  it('escapes brackets and backslashes inside a PostScript string', () => {
    expect(postScriptString('/a (b)\\c.pdf')).toBe('(/a \\(b\\)\\\\c.pdf)')
  })
})

describe('isInside', () => {
  it('refuses to write pictures into the public repository', () => {
    expect(isInside(join(REPO_ROOT, 'output'), REPO_ROOT)).toBe(true)
    expect(isInside(REPO_ROOT, REPO_ROOT)).toBe(true)
    expect(isInside(join(tmpdir(), 'document-pages'), REPO_ROOT)).toBe(false)
    expect(isInside(`${REPO_ROOT.replace(/\/$/, '')}-sibling`, REPO_ROOT)).toBe(false)
  })
})
