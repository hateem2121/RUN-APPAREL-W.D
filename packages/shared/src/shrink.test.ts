import { describe, expect, it } from 'vitest'
import { GLB_HARD_MAX_BYTES, formatMb } from './media'
import {
  DEFAULT_SHRINK_DETAIL,
  SHRINK_DETAIL_LEVELS,
  type ShrinkDetailLevel,
  nextDetailAdvice,
  shrinkFlagsFor,
  AUTO_FIDELITY_MAX_RAW_BYTES,
  autoDetailFor,
} from './shrink'

const LEVELS: ShrinkDetailLevel[] = ['fidelity', 'balanced']

/** Read a numeric flag value out of a CLI argv array. */
function flagValue(args: string[], flag: string): number {
  const i = args.indexOf(flag)
  expect(i).toBeGreaterThanOrEqual(0)
  return Number(args[i + 1])
}

describe('shrinkFlagsFor', () => {
  it('covers every level offered in the CMS, and defaults to one of them', () => {
    expect(SHRINK_DETAIL_LEVELS.map((l) => l.value).sort()).toEqual([...LEVELS].sort())
    expect(LEVELS).toContain(DEFAULT_SHRINK_DETAIL)
  })

  it('falls back to the default for a missing level (older queued messages)', () => {
    expect(shrinkFlagsFor(undefined)).toEqual(shrinkFlagsFor(DEFAULT_SHRINK_DETAIL))
  })

  // Was `--meshopt` until 2026-08-21. Draco replaced it on measurement, not
  // preference: matched builds differing only in codec, CPU-throttled in
  // model-viewer, gave draco 20.6 MB / 908 ms against meshopt 31.0 MB / 1168 ms at
  // 4x throttle -- smaller AND faster, inverting the older "draco decodes slower"
  // assumption this repo's CLI help still repeats.
  // ⛔ Back to `--meshopt` on 2026-08-21 after a draco model FAILED TO LOAD in
  // production: the live viewer resolves the draco decoder to www.gstatic.com and
  // the CSP blocks it, so the garment rendered nothing. Draco is smaller and
  // measurably faster and is worth reclaiming — but only once the live page proves
  // `ModelViewerElement.dracoDecoderLocation === '/draco/'` after a cold load.
  it('always asks for meshopt geometry and some decimation', () => {
    for (const level of LEVELS) {
      const args = shrinkFlagsFor(level)
      expect(args).toContain('--meshopt')
      expect(args).not.toContain('--draco')
      expect(flagValue(args, '--simplify')).toBeGreaterThan(0)
      expect(flagValue(args, '--simplify')).toBeLessThan(1)
    }
  })

  // The topstitch pass is what makes a 1.3 GB export shippable at all: on the
  // measured file 99.97% of the triangles were `Topstitch_*` and 0.03% was the
  // garment. Losing these flags silently returns every garment to the 57 MB floor.
  it('always reduces topstitch on its own tight budget', () => {
    for (const level of LEVELS) {
      const args = shrinkFlagsFor(level)
      expect(flagValue(args, '--stitch')).toBeGreaterThan(0)
      expect(flagValue(args, '--stitch')).toBeLessThan(1)
      // Tight. A 20x looser 0.01 is what frayed the cord into spikes.
      expect(flagValue(args, '--stitch-error')).toBeLessThanOrEqual(0.001)
    }
  })

  // Shading maps carry no artwork and measured 9.63 MB against the artwork's
  // 7.03 MB purely from running at colour-map resolution. Half, never a quarter --
  // quartering visibly flattens the fabric weave.
  it('caps shading maps at half the colour cap', () => {
    for (const level of LEVELS) {
      const args = shrinkFlagsFor(level)
      const colour = flagValue(args, '--max-texture') as number
      const data = flagValue(args, '--data-max-texture') as number
      expect(data).toBe(colour / 2)
    }
  })

  // The error budget is THE aggression dial: it must grow strictly as the levels
  // get smaller, because that is what actually removes triangles. `--simplify`
  // does not — the simplifier stops early once the budget binds.
  it('loosens the error budget strictly as the levels get smaller', () => {
    const err = LEVELS.map((l) => flagValue(shrinkFlagsFor(l), '--simplify-error') as number)
    for (let i = 1; i < err.length; i++) expect(err[i - 1]).toBeLessThan(err[i] as number)
  })

  // UV weight is NOT an aggression dial — it is the artwork guard. It may only
  // ever be relaxed to buy *extra* quality at the top end, never to buy a smaller
  // file at the bottom.
  //
  // This assertion used to require uv weight to fall strictly across all three
  // levels, which baked in the very bug it was meant to prevent: "small" shipped
  // at 0.5, half of "balanced", so asking for a smaller file silently halved the
  // protection on printed logos. The measured table in
  // tools/asset-pipeline/src/simplify-textured.test.ts shows the two knobs are
  // independent — at uv weight 1, a 10x looser error budget removes 5x more
  // triangles with the artwork guard untouched. So: never increasing, and never
  // below what "balanced" uses.
  it('never trades away artwork protection to get a smaller file', () => {
    const uv = LEVELS.map((l) => flagValue(shrinkFlagsFor(l), '--uv-weight') as number)
    for (let i = 1; i < uv.length; i++) expect(uv[i - 1]).toBeGreaterThanOrEqual(uv[i] as number)
    // The floor: no offered level may guard artwork less hard than the
    // recommended default does.
    const balanced = flagValue(shrinkFlagsFor('balanced'), '--uv-weight') as number
    for (const level of LEVELS) {
      expect(flagValue(shrinkFlagsFor(level), '--uv-weight')).toBeGreaterThanOrEqual(balanced)
    }
  })

  it('offers no level looser than balanced — the reason `small` was removed', () => {
    // 2026-08-05: `small` (--simplify-error 0.002) rendered the chest wordmark
    // with MILE breaking apart, and passed all three blocking gates while doing
    // it, because they test alphaMode and decimation does not change alphaMode.
    // Every offered level must now be at least as tight as balanced.
    const budget = (l: ShrinkDetailLevel) =>
      flagValue(shrinkFlagsFor(l), '--simplify-error') as number
    const balanced = budget('balanced')
    for (const level of LEVELS) expect(budget(level)).toBeLessThanOrEqual(balanced)
  })

  // Every other assertion in this file is RELATIVE — fidelity ≤ balanced, uv weight
  // never below balanced. That is the right shape for an invariant, and it is why
  // this suite survived `small` being deleted without a rewrite. But a relative
  // assertion cannot pin a value: 0.001 and 0.005 both satisfy every one of them,
  // and 0.005 renders the chest wordmark destroyed.
  //
  // So this is the one absolute assertion, and it exists because the three blocking
  // gates CANNOT catch decimation damage — they test alphaMode, which decimation
  // does not change. A six-run sweep on 2026-08-05 produced an illegible wordmark
  // that passed all three. Nothing in this system measures whether the lettering
  // survived; only a rendered crop does.
  it('pins the balanced error budget to the value that was actually rendered', () => {
    // 0.001 is not a tuning preference. It is the loosest budget whose OUTPUT was
    // rendered and compared logo-by-logo against the file it replaced: mean |Δ| of
    // 0.06/255 on the chest wordmark, 0.11% of pixels differing by more than 8/255,
    // across two colourways and all three logos.
    // Evidence: docs/images/2026-08-05-A-vs-C-all-logos.png.
    //
    // Changing this number means producing a new rendered crop, not editing this
    // line. Tuning it against file size is how "Smallest file" shipped.
    expect(flagValue(shrinkFlagsFor('balanced'), '--simplify-error')).toBe(0.001)
  })

  it('falls back to balanced for a stored level that no longer exists', () => {
    // RawUploads rows written before 2026-08-05 can still carry `small`. They must
    // not crash and must not be honoured — balanced is strictly safer than what
    // they asked for.
    expect(shrinkFlagsFor('small' as ShrinkDetailLevel)).toEqual(shrinkFlagsFor('balanced'))
  })

  it('never passes --uv-weight 0, which would disable texture-aware decimation', () => {
    for (const level of LEVELS) {
      expect(flagValue(shrinkFlagsFor(level), '--uv-weight')).toBeGreaterThan(0)
    }
  })
})

describe('nextDetailAdvice', () => {
  it('sends the owner to the CLO export, never to a smaller Detail level', () => {
    // There is no longer a smaller level to point at, and inventing one would be
    // the exact trade `small` made: a smaller file bought with damaged artwork.
    for (const level of LEVELS) {
      expect(nextDetailAdvice(level)).toMatch(/re-exported from CLO/)
      expect(nextDetailAdvice(level)).not.toMatch(/Smallest file — softer detail/)
    }
  })
})

describe('media constants', () => {
  it('formats sizes the way both the CMS and the shrink worker report them', () => {
    expect(formatMb(GLB_HARD_MAX_BYTES)).toBe('40.0 MB')
    expect(formatMb(58.3 * 1024 * 1024)).toBe('58.3 MB')
  })
})

describe('autoDetailFor — small garments get the best setting automatically', () => {
  const MB = 1024 * 1024

  it('upgrades a small garment to the highest quality', () => {
    /*
     * Measured 2026-08-29: AERO-TECH WINDBREAKER is 16.19 MB raw and comes out at
     * 3.39 MB on fidelity versus 3.11 MB on balanced — 33,000 more triangles kept for
     * 280 KB. On a garment this size the decimation barely fires anyway (the quality
     * budget stops it, not the size target), so the aggressive setting buys almost
     * nothing and costs real geometry.
     */
    expect(autoDetailFor('balanced', 16 * MB)).toBe('fidelity')
    expect(autoDetailFor(undefined, 16 * MB)).toBe('fidelity')
  })

  it('leaves a large garment on whatever it was given', () => {
    /*
     * The old-settings exports are the risk: 373 MB and 1.25 GB raw, landing at 67% and
     * 83% of the 40 MB ceiling on the LOWER setting. Raising quality there could breach
     * it, and a refused garment is worse than a slightly coarser one.
     */
    expect(autoDetailFor('balanced', 400 * MB)).toBe('balanced')
    expect(autoDetailFor(undefined, 1200 * MB)).toBe('balanced')
  })

  it('⚠️ ONLY EVER UPGRADES — it can never lower what the owner picked', () => {
    /*
     * THE PROPERTY THAT MAKES THIS SAFE TO APPLY ON TOP OF A STORED CHOICE. The CMS field
     * has defaultValue: DEFAULT_SHRINK_DETAIL, so a stored 'balanced' is indistinguishable
     * from "never touched". Honouring an explicit Balanced would mean refusing to help
     * everyone who left the default. Upgrading resolves that safely: nobody picks a lower
     * setting HOPING for worse artwork.
     */
    expect(autoDetailFor('fidelity', 16 * MB)).toBe('fidelity')
    expect(autoDetailFor('fidelity', 1200 * MB)).toBe('fidelity')
  })

  it('⚠️ treats an unknown size as too big, rather than guessing', () => {
    /*
     * Fails safe. A missing filesize must not silently opt a 1.25 GB export into the
     * higher setting and push it through the ceiling.
     */
    expect(autoDetailFor('balanced', undefined)).toBe('balanced')
    expect(autoDetailFor('balanced', 0)).toBe('balanced')
    expect(autoDetailFor('balanced', Number.NaN)).toBe('balanced')
    expect(autoDetailFor('balanced', -1)).toBe('balanced')
  })

  it('is measured against a real garment at the boundary', () => {
    /*
     * Minecut Motion: 45.59 MB raw -> 5.76 MB at fidelity, a SEVENTH of the 40 MB
     * ceiling. That is the largest garment the threshold admits, and the margin it
     * leaves is why 50 MB is the number.
     */
    expect(autoDetailFor('balanced', 45.59 * MB)).toBe('fidelity')
    expect(autoDetailFor('balanced', AUTO_FIDELITY_MAX_RAW_BYTES)).toBe('fidelity')
    expect(autoDetailFor('balanced', AUTO_FIDELITY_MAX_RAW_BYTES + 1)).toBe('balanced')
  })
})
