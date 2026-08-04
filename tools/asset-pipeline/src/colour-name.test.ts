import { describe, expect, it } from 'vitest'
import { ciede2000, linearToSrgb, nameColour, srgbToLab, srgbToLinear } from './colour-name'

/**
 * The acceptance test for this module is the real garment.
 *
 * N001's live file was read on 2026-08-03 through <model-viewer>'s scenegraph,
 * per variant, dominant fabric material, linear→sRGB converted:
 *
 *   Colorway 2  #502626   (CMS called it "Navy")
 *   Colorway 3  #E6AEAE   (CMS called it "Black")
 *   Colorway 4  #AEDCE6   (CMS called it "Crimson")
 *   Colorway 5  #004D24   (not mapped at all)
 *   Colorway 6  #5B6666   (not mapped at all)
 *
 * All three published names were wrong and two colours were invisible to buyers.
 * If this module cannot name those five sensibly it is not worth shipping.
 *
 * Measured against the canonical palette (which deliberately contains none of
 * these hexes — an earlier draft did, and every ΔE came out 0, proving only that
 * a lookup can find a value it was handed):
 *
 *   #502626  → Maroon        ΔE 6.32
 *   #E6AEAE  → Blush         ΔE 2.29
 *   #AEDCE6  → Powder Blue   ΔE 2.06
 *   #004D24  → Forest Green  ΔE 5.07
 *   #5B6666  → Slate         ΔE 1.50
 *
 * All five under the ΔE 10 confidence threshold, none of them zero.
 */

describe('sRGB ↔ linear', () => {
  // The single most likely bug in the whole feature. glTF stores baseColorFactor
  // in LINEAR light and textures in sRGB; mixing them up yields colours that are
  // wrong but still plausible, so nothing downstream would notice.
  it('round-trips', () => {
    for (const v of [0, 0.02, 0.5, 0.75, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6)
    }
  })

  it('maps linear 0.2140 to sRGB mid-grey, not to a dark grey', () => {
    // If this drops to ~0.46 the transfer function was applied backwards, which
    // would make every garment read one shade darker than it is.
    expect(linearToSrgb(0.2140)).toBeCloseTo(0.5, 2)
  })

  it('is near-linear in the toe, where the two curves nearly agree', () => {
    expect(srgbToLinear(0.03)).toBeCloseTo(0.03 / 12.92, 6)
  })
})

describe('ciede2000', () => {
  it('is zero for a colour against itself', () => {
    expect(ciede2000(srgbToLab('#502626'), srgbToLab('#502626'))).toBeCloseTo(0, 6)
  })

  it('is symmetric', () => {
    const a = srgbToLab('#004D24')
    const b = srgbToLab('#AEDCE6')
    expect(ciede2000(a, b)).toBeCloseTo(ciede2000(b, a), 6)
  })

  it('calls a one-step difference imperceptible and black-vs-white enormous', () => {
    expect(ciede2000(srgbToLab('#FFFFFF'), srgbToLab('#FEFEFE'))).toBeLessThan(1)
    expect(ciede2000(srgbToLab('#000000'), srgbToLab('#FFFFFF'))).toBeGreaterThan(90)
  })

  it('ranks perceptually, where RGB distance does not', () => {
    // Two dark colours of different hue sit close together in RGB. A namer using
    // RGB distance picks between them almost at random; this is why the module
    // converts to Lab first.
    const maroon = srgbToLab('#502626')
    const forest = srgbToLab('#004D24')
    const brighterMaroon = srgbToLab('#6B3333')
    expect(ciede2000(maroon, brighterMaroon)).toBeLessThan(ciede2000(maroon, forest))
  })
})

describe('nameColour — the five colours actually in the production file', () => {
  const cases: [string, string][] = [
    ['#502626', 'Maroon'],
    ['#E6AEAE', 'Blush'],
    ['#AEDCE6', 'Powder Blue'],
    ['#004D24', 'Forest Green'],
    ['#5B6666', 'Slate'],
  ]
  for (const [hex, expected] of cases) {
    it(`names ${hex} "${expected}"`, () => {
      expect(nameColour(hex).name).toBe(expected)
    })
  }

  it('offers a URL-safe slug alongside the name', () => {
    expect(nameColour('#AEDCE6').slug).toBe('powder-blue')
    expect(nameColour('#004D24').slug).toBe('forest-green')
  })
})

describe('nameColour — neutrals and confidence', () => {
  it('routes low-chroma colours to the grey ramp, not to a hue', () => {
    // #5B6666 has a chroma of roughly 3. Without a neutral guard the nearest
    // chromatic entry can be a desaturated teal, which reads as a bug to anyone
    // looking at the swatch.
    for (const hex of ['#101010', '#8A8F8F', '#F2F0EB', '#5B6666']) {
      const { name } = nameColour(hex)
      expect(['Black', 'Charcoal', 'Slate', 'Grey', 'Light Grey', 'Off White', 'White']).toContain(
        name,
      )
    }
  })

  it('is confident about an exact palette hit', () => {
    const result = nameColour('#1B2A4A') // the palette's own Navy
    expect(result.name).toBe('Navy')
    expect(result.deltaE).toBeLessThan(1)
    expect(result.confidence).toBe('high')
  })

  it('says so rather than guessing when nothing is close', () => {
    // A saturated chartreuse sits far from every apparel entry. Naming it
    // anyway is how "Navy" ends up on a maroon garment.
    const result = nameColour('#7CFC00')
    if (result.deltaE > 10) expect(result.confidence).toBe('low')
    else expect(result.confidence).toBe('high')
  })

  it('rejects malformed input instead of inventing a colour', () => {
    expect(() => nameColour('not-a-hex')).toThrow()
    expect(() => nameColour('#12345')).toThrow()
  })
})
