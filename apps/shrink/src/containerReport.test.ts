import { describe, expect, it } from 'vitest'
import { buildReportText, objectUrl, suggestedFilename } from '../container/report'
import type { GlbReport } from '../../../tools/asset-pipeline/src/validate'
import type { OptimizeResult } from '../../../tools/asset-pipeline/src/optimize'

/**
 * The shrink container had NO tests.
 *
 * ~10 KB of code that every real garment passes through, guarded by a CI
 * typecheck and nothing else, because `container/server.ts` calls
 * `server.listen()` at import time — so importing it from a test would start an
 * HTTP server. The pure half now lives in `container/report.ts` and this covers
 * it.
 *
 * The import below is a RELATIVE path into another package's source, the same
 * arrangement `tools/asset-pipeline/src/validate.test.ts` uses for
 * SIZE_WARNING_BYTES and for the same reason: `apps/shrink/container` is not a
 * pnpm workspace member (it installs with plain `npm` inside Docker, where
 * `workspace:*` cannot resolve), so it cannot be imported as a package. The path
 * works in the monorepo, where tests run, and is never reached inside the image,
 * where they do not.
 *
 * WHAT IS WORTH ASSERTING HERE. Not the numbers — the WORDS. The audience is one
 * non-technical person deciding whether to publish a garment, and every incident
 * in this repo's history ended with them being told something unactionable, or
 * nothing at all.
 */

const EIGHT_MB = 8 * 1024 * 1024

const glb = (over: Partial<GlbReport> = {}): GlbReport => ({
  file: 'out.glb',
  bytes: 1_000_000,
  variants: ['Colorway 2', 'Colorway 3'],
  variantsInFileOrder: ['Colorway 2', 'Colorway 3'],
  meshCount: 1,
  primitiveCount: 4,
  materialCount: 7,
  textureCount: 3,
  generator: 'glTF-Transform',
  uncompressedTextureCount: 0,
  translucentMaterialCount: 0,
  texCoordsInUse: [0],
  alphaModeCounts: { OPAQUE: 7 },
  crushedArtwork: [],
  artworkAlphaProblems: [],
  variantColours: [],
  warnings: [],
  ...over,
})

const opt = (over: Partial<OptimizeResult> = {}): OptimizeResult => ({
  outputFile: 'out.glb',
  bytesBefore: 380 * 1024 * 1024,
  bytesAfter: 6 * 1024 * 1024,
  textureCount: 3,
  textureFormats: ['image/webp'],
  geometry: 'meshopt',
  opaque: true,
  ...over,
})

describe('suggestedFilename', () => {
  it('makes a URL-safe .glb name from a messy CLO filename', () => {
    // Payload sanitises filenames inconsistently across a chunked client upload,
    // which is a documented cause of a document existing with no object behind it.
    expect(suggestedFilename('raw/2026/cycling all colours.glb')).toBe(
      'cycling-all-colours-optimized.glb',
    )
    expect(suggestedFilename('Ladies’ Tee (v2).glb')).toBe('Ladies-Tee-v2-optimized.glb')
  })

  it('never produces an empty name', () => {
    expect(suggestedFilename('###.glb')).toBe('garment-optimized.glb')
    expect(suggestedFilename('')).toBe('garment-optimized.glb')
  })
})

describe('objectUrl', () => {
  it('encodes each segment but keeps the path separators', () => {
    expect(objectUrl('https://r2.example.com', 'ingest', 'raw/cycling all colours.glb')).toBe(
      'https://r2.example.com/ingest/raw/cycling%20all%20colours.glb',
    )
  })

  it('tolerates a trailing slash on the endpoint', () => {
    expect(objectUrl('https://r2.example.com/', 'ingest', 'a.glb')).toBe(
      'https://r2.example.com/ingest/a.glb',
    )
  })
})

describe('buildReportText — the artwork block', () => {
  // THE line that matters. A published garment with a torn logo is worse than no
  // garment, and until 2026-08-03 the only signal was a soft "⚠️ most parts"
  // count that named nothing and blocked nothing.
  it('names the materials whose printed artwork lost protection, and says the file was not saved', () => {
    const text = buildReportText(
      opt({
        simplify: {
          attributeAware: 40,
          fallback: 4,
          skipped: 0,
          ownedElsewhere: 0,
          uvSetsWeighted: [0],
          artworkAtRisk: ['Teamwear Logo_3139', 'RUN LOGO_3183'],
        },
      }),
      glb(),
      'x.glb',
    )
    expect(text).toContain(
      'PRINTED ARTWORK WAS NOT PROTECTED on: Teamwear Logo_3139, RUN LOGO_3183',
    )
    expect(text).toContain('has NOT been saved')
    expect(text).toContain('Highest quality')
  })

  it('stays silent about artwork when none was at risk', () => {
    const text = buildReportText(
      opt({
        simplify: {
          attributeAware: 44,
          fallback: 0,
          skipped: 0,
          ownedElsewhere: 0,
          uvSetsWeighted: [0],
          artworkAtRisk: [],
        },
      }),
      glb(),
      'x.glb',
    )
    expect(text).not.toContain('PRINTED ARTWORK WAS NOT PROTECTED')
  })
})

describe('buildReportText — colours', () => {
  it('shows what colour each CLO variant actually is', () => {
    // The whole reason this exists: production shipped a maroon garment labelled
    // "Navy" because the report listed bare strings like "Colorway 2".
    const text = buildReportText(
      opt(),
      glb({
        variantColours: [
          {
            variantId: 'Colorway 2',
            hex: '#502626',
            name: 'Maroon',
            slug: 'maroon',
            deltaE: 6.32,
            confidence: 'high',
            sampledMaterial: 'FABRIC 5_3068',
          },
        ],
      }),
      'x.glb',
    )
    expect(text).toContain('1. Colorway 2 — looks like Maroon (#502626)')
  })

  it('says it is unsure rather than asserting a name it does not trust', () => {
    const text = buildReportText(
      opt(),
      glb({
        variantColours: [
          {
            variantId: 'Colorway 2',
            hex: '#7CFC00',
            name: 'Lime',
            slug: 'lime',
            deltaE: 21.4,
            confidence: 'low',
            sampledMaterial: 'FABRIC 5',
          },
        ],
      }),
      'x.glb',
    )
    expect(text).toContain('closest match Lime, but not a confident one — check the swatch')
  })

  it('tells a single-colour garment what to do instead of showing an empty list', () => {
    const text = buildReportText(opt(), glb({ variants: [], variantsInFileOrder: [] }), 'x.glb')
    expect(text).toContain('No colours are stored inside this file')
    expect(text).toContain('A separate file for each colour')
  })
})

describe('buildReportText — the mobile size guideline', () => {
  it('warns when the output is over the guideline, with the lever to pull', () => {
    const text = buildReportText(opt({ bytesAfter: EIGHT_MB + 1 }), glb(), 'x.glb')
    expect(text).toContain('Still over the 8 MB mobile guideline')
    expect(text).toContain('lower Detail setting')
  })

  it('confirms when it is within it', () => {
    const text = buildReportText(opt({ bytesAfter: EIGHT_MB }), glb(), 'x.glb')
    expect(text).toContain('Within the 8 MB mobile guideline')
    expect(text).not.toContain('Still over')
  })

  it('reports the before/after in MB', () => {
    const text = buildReportText(
      opt({ bytesBefore: 380 * 1024 * 1024, bytesAfter: 19 * 1024 * 1024 }),
      glb(),
      'x.glb',
    )
    expect(text).toContain('Shrunk 380.0 MB → 19.0 MB.')
  })
})

describe('buildReportText — warnings pass through', () => {
  it('surfaces every validator warning, including crushed artwork', () => {
    const text = buildReportText(
      opt(),
      glb({
        warnings: [
          '1 printed-artwork texture(s) are stored below 0.02 bytes/pixel — logo 2048x2048 at 0.003',
        ],
      }),
      'x.glb',
    )
    expect(text).toContain('Warnings:')
    expect(text).toContain('0.003')
  })

  it('says so plainly when there are none', () => {
    expect(buildReportText(opt(), glb(), 'x.glb')).toContain('No warnings.')
  })
})
