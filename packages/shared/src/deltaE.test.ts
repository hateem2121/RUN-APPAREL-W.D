import { describe, expect, it } from 'vitest'
import { deltaE2000, hexToLab, type Lab, labToHex, rgbToLab } from './deltaE.ts'

/*
 * WHY THIS TEST EXISTS. A colour-difference formula that is a little wrong still prints
 * plausible numbers, and the colour-accuracy report (scripts/colour-accuracy.mjs) would then
 * flag the wrong garments. CIEDE2000 has several well-known ways to be wrong (the hue
 * rotation term at the +-180 degree wrap, the a-prime stretch, the mean-hue branches), and
 * the authors published a table made to catch each of them.
 *
 * THE DATA: all 34 pairs of Sharma, Wu and Dalal, "The CIEDE2000 Color-Difference Formula:
 * Implementation Notes, Supplementary Test Data, and Mathematical Observations", Color
 * Research and Application 30(1), 2005. The rows below were copied by a script from the
 * authors' own file, never typed:
 *   https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
 * (linked from https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/, both read
 * 2026-10-26). Columns: L1, a1, b1, L2, a2, b2, then the published CIEDE2000 difference.
 * Rows 1-6 test the blue region, 7-8 the achromatic case, 9-16 the hue wrap, 17-24 the
 * large differences and the reduced-weight cases, 25-34 the paper's measured data.
 */
// biome-ignore-start lint/suspicious/noApproximativeNumericConstant: numbers like 0.6931 in the authors' table are Lab values, not ln 2
// biome-ignore format: the rows are the authors' table, kept one pair per line
const SHARMA_2005: [number, number, number, number, number, number, number][] = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
]
// biome-ignore-end lint/suspicious/noApproximativeNumericConstant: the table ends here

const lab = (L: number, a: number, b: number): Lab => ({ L, a, b })

describe('deltaE2000 against the published CIEDE2000 test data', () => {
  it('holds all 34 pairs of the 2005 table', () => {
    expect(SHARMA_2005).toHaveLength(34)
  })

  it.each(SHARMA_2005.map((row, index) => [index + 1, ...row] as const))(
    'pair %i matches to 4 decimals',
    (_n, L1, a1, b1, L2, a2, b2, expected) => {
      // toBeCloseTo(x, 4) means |difference| < 0.00005: the table is printed to 4 decimals.
      expect(deltaE2000(lab(L1, a1, b1), lab(L2, a2, b2))).toBeCloseTo(expected, 4)
    },
  )

  it('is symmetric (the formula is, and the report relies on it)', () => {
    for (const [L1, a1, b1, L2, a2, b2] of SHARMA_2005) {
      const forward = deltaE2000(lab(L1, a1, b1), lab(L2, a2, b2))
      const backward = deltaE2000(lab(L2, a2, b2), lab(L1, a1, b1))
      expect(backward).toBeCloseTo(forward, 10)
    }
  })

  it('is 0 for the same colour', () => {
    expect(deltaE2000(lab(50, 20, -30), lab(50, 20, -30))).toBe(0)
  })
})

describe('labToHex', () => {
  it('round-trips every colour on a 17-step grid of sRGB exactly', () => {
    // The report prints a median it worked out in Lab as a hex; a drifting inverse would make
    // the printed "cloth hex" disagree with the number beside it.
    const steps = [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 255]
    let checked = 0
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
          expect(labToHex(hexToLab(hex))).toBe(hex)
          checked += 1
        }
      }
    }
    expect(checked).toBe(17 ** 3)
  })

  it('clamps a colour outside sRGB instead of printing a broken hex', () => {
    expect(labToHex({ L: 50, a: 128, b: -128 })).toMatch(/^#[0-9a-f]{6}$/)
    expect(labToHex({ L: 100, a: 0, b: 0 })).toBe('#ffffff')
    expect(labToHex({ L: 0, a: 0, b: 0 })).toBe('#000000')
  })
})

describe('hexToLab', () => {
  it('maps white to L 100 with no chroma (D65 white)', () => {
    const white = hexToLab('#ffffff')
    expect(white.L).toBeCloseTo(100, 3)
    expect(white.a).toBeCloseTo(0, 2)
    expect(white.b).toBeCloseTo(0, 2)
  })

  it('maps black to L 0', () => {
    const black = hexToLab('#000000')
    expect(black.L).toBeCloseTo(0, 6)
    expect(black.a).toBeCloseTo(0, 6)
    expect(black.b).toBeCloseTo(0, 6)
  })

  it('accepts upper case and a missing hash', () => {
    expect(hexToLab('825353')).toEqual(hexToLab('#825353'))
    expect(hexToLab('#ABCDEF')).toEqual(hexToLab('#abcdef'))
  })

  it('reproduces the sRGB red and blue primaries in CIELAB under D65', () => {
    // Reference values from Bruce Lindbloom's published sRGB D65 conversion; checked to 1
    // decimal because sources round differently.
    const red = hexToLab('#ff0000')
    expect(red.L).toBeCloseTo(53.24, 1)
    expect(red.a).toBeCloseTo(80.09, 1)
    expect(red.b).toBeCloseTo(67.2, 1)
    const blue = hexToLab('#0000ff')
    expect(blue.L).toBeCloseTo(32.3, 1)
    expect(blue.a).toBeCloseTo(79.19, 1)
    expect(blue.b).toBeCloseTo(-107.86, 1)
  })

  it('rgbToLab gives the same answer as hexToLab for the same colour', () => {
    expect(rgbToLab(130, 83, 83)).toEqual(hexToLab('#825353'))
  })

  it('rejects anything that is not a six-digit hex', () => {
    expect(() => hexToLab('#fff')).toThrow()
    expect(() => hexToLab('red')).toThrow()
    expect(() => hexToLab('')).toThrow()
  })
})
