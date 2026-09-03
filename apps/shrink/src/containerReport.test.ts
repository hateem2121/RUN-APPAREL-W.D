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
  artworkSoftOnBlend: [],
  variantColours: [],
  // A clean spec verdict is the DEFAULT here on purpose: every test below is about
  // what the owner is told for some OTHER reason, and a fixture that quietly
  // carried spec errors would change which message they get.
  //
  // ⚠️ THAT SENTENCE WAS FALSE WHEN IT WAS WRITTEN, and is true only since
  // 2026-08-29. `buildReportText` did not read `glb.spec` at all — the container
  // computed the Khronos verdict on every garment and dropped it, so a fixture full of
  // spec errors changed nothing about any message. It is now read, reported, and
  // refused in the Worker; the tests at the bottom of this file are what hold that.
  spec: {
    validatorVersion: '2.0.0-dev.3.10',
    errors: [],
    warnings: [],
    counts: { errors: 0, warnings: 0, infos: 0, hints: 0 },
    truncated: false,
  },
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
          artworkUntouched: 0,
          artworkUntouchedMaterials: [],
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

  // The other half of the artwork story, since 2026-09-02. A soft print the pipeline
  // chose to keep translucent used to REFUSE the whole garment (audit F2-01, B-01);
  // now it is the loudest non-blocking line in the report, and it must say the file
  // was saved, because the owner reads "see-through" as "it failed".
  it('names soft prints kept see-through, says why, and says the file WAS saved', () => {
    const text = buildReportText(
      opt(),
      glb({
        artworkSoftOnBlend: [
          { material: 'RUN BRUSH LOGO_3183', reason: 'graded', factor: 1, midFraction: 0.51 },
          { material: 'ルン ろご。_57892', reason: 'sheer-factor', factor: 0.4, midFraction: 0.01 },
        ],
      }),
      'x.glb',
    )
    expect(text).toContain(
      'SOFT PRINTED ARTWORK KEPT SEE-THROUGH on: RUN BRUSH LOGO_3183 (soft edges — 51% of pixels part-transparent); ルン ろご。_57892 (declared 40% opaque in CLO)',
    )
    expect(text).toContain('The file HAS been saved')
    expect(text).not.toContain('has NOT been saved')
  })

  it('stays silent about soft prints when there are none, and on a report from an older container', () => {
    expect(buildReportText(opt(), glb(), 'x.glb')).not.toContain('SOFT PRINTED ARTWORK')
    // A report from a container built before the field existed simply lacks it.
    const older: Partial<GlbReport> = { ...glb() }
    delete older.artworkSoftOnBlend
    expect(buildReportText(opt(), older as GlbReport, 'x.glb')).not.toContain(
      'SOFT PRINTED ARTWORK',
    )
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
          artworkUntouched: 0,
          artworkUntouchedMaterials: [],
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
            sampledFrom: 'factor',
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
            sampledFrom: 'factor',
          },
        ],
      }),
      'x.glb',
    )
    expect(text).toContain('closest match Lime, but not a confident one — check the swatch')
  })

  it('says WHY a name is blank when the file itself is the reason (CG-06, 2026-09-02)', () => {
    // Eleven of eleven raw exports bind one fabric picture to every colourway behind a
    // white colour. Without this line the owner types five names the next export blanks.
    const text = buildReportText(
      opt(),
      glb({
        variants: ['Colorway 1', 'Colorway 2'],
        variantsInFileOrder: ['Colorway 1', 'Colorway 2'],
        variantColours: [
          {
            variantId: 'Colorway 1',
            hex: '#FFFFFF',
            name: 'White',
            slug: 'white',
            deltaE: 0,
            confidence: 'low',
            sampledMaterial: 'Bull Leather_3040',
            sampledFrom: 'factor',
            note: 'every colourway binds the same fabric picture behind a white colour, so this export carries no colourway colours — set each colourway’s colour in CLO and re-export',
          },
          {
            variantId: 'Colorway 2',
            hex: '#1B2A4A',
            name: 'Navy',
            slug: 'navy',
            deltaE: 0,
            confidence: 'high',
            sampledMaterial: 'FABRIC 1',
            sampledFrom: 'texture',
          },
        ],
      }),
      'x.glb',
    )
    expect(text).toContain(
      '1. Colorway 1 — closest match White, but not a confident one — check the swatch (#FFFFFF) — every colourway binds the same fabric picture',
    )
    expect(text).toContain(
      '2. Colorway 2 — looks like Navy (read from the fabric picture) (#1B2A4A)',
    )
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

describe('the glTF specification verdict', () => {
  /*
   * ⚠️ NONE OF THIS WAS REACHABLE BEFORE 2026-08-29. `inspectGlb` ran the official
   * Khronos validator on every garment and the container's report object kept SEVEN
   * neighbouring fields from that same result while dropping the verdict. `report.ts`
   * never read it, and `ShrinkReport` in the Worker had no such field, so it could not
   * have crossed the boundary even if it had been sent.
   *
   * The measured cost: both live garments are invalid glTF — 44 errors on the cycling
   * suit, all IMAGE_NON_ENABLED_MIME_TYPE / TEXTURE_INVALID_IMAGE_MIME_TYPE from a WebP
   * pass that wrote the mime type without declaring EXT_texture_webp. Browsers sniff the
   * bytes and render anyway, which is exactly why every gate stayed green for weeks.
   */
  const withErrors = (count: number) =>
    glb({
      spec: {
        validatorVersion: '2.0.0-dev.3.10',
        errors: Array.from({ length: count }, (_, i) => ({
          code: 'IMAGE_NON_ENABLED_MIME_TYPE',
          message: "'image/webp' MIME type requires an extension.",
          severity: 0,
          pointer: `/images/${i}`,
        })),
        warnings: [],
        counts: { errors: count, warnings: 0, infos: 0, hints: 0 },
        truncated: false,
      },
    } as unknown as Partial<GlbReport>)

  it('says plainly that an invalid file was NOT saved', () => {
    const text = buildReportText(opt(), withErrors(44), 'out.glb')

    expect(text).toContain('NOT A VALID 3D FILE')
    expect(text).toContain('44 error(s)')
    expect(text).toContain('has NOT been saved')
    // The honest nuance, or the owner will think the garment is fine because it renders.
    expect(text).toContain('other 3D software is entitled to refuse it')
  })

  it('names the actual problems rather than only a count', () => {
    // A number the owner cannot act on is the failure mode this whole file exists for.
    const text = buildReportText(opt(), withErrors(44), 'out.glb')
    expect(text).toContain('IMAGE_NON_ENABLED_MIME_TYPE')
  })

  it('caps the listed problems, because a broken file can carry hundreds', () => {
    const text = buildReportText(opt(), withErrors(300), 'out.glb')
    expect(text).toContain('300 error(s)')
    expect(text.match(/IMAGE_NON_ENABLED_MIME_TYPE/g)?.length ?? 0).toBeLessThanOrEqual(5)
  })

  it('confirms a clean file IS valid, rather than staying silent about it', () => {
    /*
     * Silence is what let this run undetected. A green report that says nothing about
     * validity is indistinguishable from one where the check never ran — which was
     * literally the case here for as long as the WebP pass existed.
     */
    const text = buildReportText(opt(), glb(), 'out.glb')

    expect(text).toContain('Valid 3D file')
    expect(text).toContain('2.0.0-dev.3.10')
    expect(text).not.toContain('NOT A VALID 3D FILE')
  })

  it('reports non-blocking warnings without calling the file invalid', () => {
    const text = buildReportText(
      opt(),
      glb({
        spec: {
          validatorVersion: '2.0.0-dev.3.10',
          errors: [],
          warnings: [{ code: 'UNUSED_OBJECT', message: 'unused', severity: 1, pointer: '/x' }],
          counts: { errors: 0, warnings: 1, infos: 0, hints: 0 },
          truncated: false,
        },
      } as unknown as Partial<GlbReport>),
      'out.glb',
    )

    expect(text).toContain('Valid 3D file')
    expect(text).toContain('1 non-blocking warning(s)')
    expect(text).not.toContain('NOT A VALID 3D FILE')
  })
})

describe('the composition block reaches the owner', () => {
  /*
   * ⚠️ ADDED 2026-08-29 AFTER AN INDEPENDENT CHECK CAUGHT A HALF-CHANGE IN THIS VERY
   * REMEDIATION.
   *
   * `attributeBytes` was written, tested with mutation-proof controls, and then wired
   * into `cli.ts` ONLY. Nothing in CI runs `pipeline optimize` (seed:assets runs
   * placeholders/merge/validate; both evals import optimizeGlb directly), cli.ts is
   * excluded from coverage, and the production path — container/server.ts calling
   * optimizeGlb — never touched it. So the instrument built to stop a size figure hiding
   * the truth was itself invisible to every garment and every gate.
   *
   * That is the exact "built, tested, never connected" shape this whole plan exists to
   * close, committed by the session closing it. These tests are the wire.
   */
  it('prints what the garment is made of', () => {
    const text = buildReportText(opt(), glb(), 'out.glb', [
      'Made of: 24.23 MB geometry, 1.71 MB images.',
      '  TEXCOORD        11.20 MB   46.2% of geometry',
    ])

    expect(text).toContain('Made of:')
    expect(text).toContain('TEXCOORD')
    expect(text).toContain('46.2%')
  })

  it('still produces a valid report when the composition could not be computed', () => {
    /*
     * The container wraps the computation, because a reporting failure must never fail a
     * job that otherwise succeeded. This pins that the absent case degrades rather than
     * throws or prints "undefined".
     */
    const text = buildReportText(opt(), glb(), 'out.glb')

    expect(text).toContain('Suggested filename')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('Made of:')
  })

  it('keeps the composition and the validity verdict in the same report', () => {
    // Both were added this session and both are about "is this file actually good?".
    // A future edit that drops one should be visible here.
    const text = buildReportText(opt(), glb(), 'out.glb', [
      'Made of: 1.00 MB geometry, 2.00 MB images.',
    ])
    expect(text).toContain('Made of:')
    expect(text).toContain('Valid 3D file')
  })
})

/**
 * THE ANTI-FLICKER RECORDS (fix plan Rank 7C, 2026-09-03). Until then no robot run ever
 * wrote a depth-bias record — the detector existed and the viewer obeyed it, and the
 * container never called it. The line is the proof it did, or the honest reason it
 * could not.
 */
describe('buildReportText — anti-flicker records', () => {
  it('says how many printed layers were recorded', () => {
    const text = buildReportText(opt(), glb(), 'x.glb', undefined, {
      measured: 70,
      overlayReadings: 12,
      flagged: 36,
      review: 1,
      clones: 2,
      threadIgnored: 0,
      written: true,
    })
    expect(text).toContain(
      "Anti-flicker: 70 part(s) measured, 12 read as a printed layer on cloth, 36 material(s) recorded for the viewer's depth nudge, 1 held for review, 2 material(s) cloned so the cloth beneath is not nudged.",
    )
  })

  it('says so when the scan failed rather than pretending it ran', () => {
    const text = buildReportText(opt(), glb(), 'x.glb', undefined, { error: 'boom' })
    expect(text).toContain('⚠️ Anti-flicker: the overlay scan failed (boom)')
  })

  it('warns when records were found but the file could not be rewritten', () => {
    const text = buildReportText(opt(), glb(), 'x.glb', undefined, {
      measured: 3,
      overlayReadings: 1,
      flagged: 1,
      review: 0,
      clones: 0,
      threadIgnored: 0,
      written: false,
    })
    expect(text).toContain('NOT WRITTEN: the binary chunk moved')
  })

  it('says the scan was not run for an older container', () => {
    expect(buildReportText(opt(), glb(), 'x.glb')).toContain(
      'Anti-flicker: overlay scan not run for this job.',
    )
  })
})

/** INK VS CLOTH (fix plan Rank 9, 2026-09-03): the report asks, the owner rules. */
describe('buildReportText — ink vs cloth', () => {
  it('names each flagged print and colourway', () => {
    const text = buildReportText(opt(), glb(), 'x.glb', undefined, undefined, {
      prints: 4,
      colourways: 5,
      rows: 20,
      flagged: 3,
      lines: [
        'THE EXTRA MILE (Slogan)_3157 @ Colorway 3: 1.32:1 against FABRIC 3_3032 — the print carries the cloth’s own colour value',
      ],
    })
    expect(text).toContain('⚠️ Ink vs cloth: 3 of 20 print-colourway pairs')
    expect(text).toContain('THE EXTRA MILE (Slogan)_3157 @ Colorway 3: 1.32:1')
  })

  it('says every print stands out when nothing is flagged', () => {
    const text = buildReportText(opt(), glb(), 'x.glb', undefined, undefined, {
      prints: 2,
      colourways: 5,
      rows: 10,
      flagged: 0,
      lines: [],
    })
    expect(text).toContain('every print stands out from the cloth beneath it')
  })

  it('says so when the measurement failed', () => {
    expect(
      buildReportText(opt(), glb(), 'x.glb', undefined, undefined, { error: 'boom' }),
    ).toContain('Ink vs cloth: not measured (boom)')
  })
})
