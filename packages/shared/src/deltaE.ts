/**
 * Colour difference, for the colour-accuracy report (scripts/colour-accuracy.mjs).
 *
 * WHY CIEDE2000, NOT A STRAIGHT DISTANCE IN RGB. A swatch is a promise that the cloth is
 * "about this colour", and how far off a pair of colours LOOKS is not how far apart their
 * RGB numbers are: two dark colours 12 RGB steps apart are hard to tell apart, two pale
 * yellows 12 steps apart are not. CIEDE2000 is the CIE's 2001 formula built to track that,
 * and a difference of about 1 is the smallest a trained eye sees (a person comparing two
 * flat patches side by side). The report flags a swatch above 10, which a buyer would
 * call "a different colour", not "a slightly different shade".
 *
 * Pure and dependency-free: no Node builtins, so it may live here (Workers import this
 * package). The formula follows Sharma, Wu and Dalal, "The CIEDE2000 Color-Difference
 * Formula: Implementation Notes, Supplementary Test Data, and Mathematical Observations",
 * Color Research and Application 30(1), 2005, and deltaE.test.ts checks all 34 of the
 * authors' own test pairs to 4 decimals.
 */

/** A colour in CIE L*a*b*: L 0 to 100, a and b roughly -128 to 127. */
export type Lab = { L: number; a: number; b: number }

/** D65 reference white, 2 degree observer (the white point sRGB is defined against). */
const WHITE_D65 = { X: 0.95047, Y: 1, Z: 1.08883 }

/** CIE's own constants for the Lab curve: epsilon = 216/24389 and kappa = 24389/27. */
const EPSILON = 216 / 24389
const KAPPA = 24389 / 27

const SIX_DIGIT_HEX = /^#?([0-9a-fA-F]{6})$/

/** sRGB 0..255 to linear light 0..1 (the sRGB transfer function, IEC 61966-2-1). */
const toLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** The Lab curve: a cube root, with a straight piece near black so it has no cliff. */
const labCurve = (t: number): number => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

/** sRGB bytes (0..255 each) to CIELAB under D65. The report calls this once per pixel. */
export function rgbToLab(red: number, green: number, blue: number): Lab {
  const r = toLinear(red)
  const g = toLinear(green)
  const b = toLinear(blue)
  // Linear sRGB to CIE XYZ (D65), the matrix printed in the sRGB standard.
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
  const fx = labCurve(X / WHITE_D65.X)
  const fy = labCurve(Y / WHITE_D65.Y)
  const fz = labCurve(Z / WHITE_D65.Z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/**
 * "#rrggbb" (the hash is optional, case does not matter) to CIELAB under D65.
 * Throws on anything else: the report must never score a malformed swatch as a colour.
 */
export function hexToLab(hex: string): Lab {
  const match = SIX_DIGIT_HEX.exec(hex)
  if (!match?.[1]) throw new Error(`not a six-digit hex colour: ${JSON.stringify(hex)}`)
  const value = Number.parseInt(match[1], 16)
  return rgbToLab((value >> 16) & 255, (value >> 8) & 255, value & 255)
}

/** The inverse of the Lab curve. */
const labCurveInverse = (f: number): number => (f ** 3 > EPSILON ? f ** 3 : (116 * f - 16) / KAPPA)

/** Linear light 0..1 back to an sRGB byte, clamped (a Lab colour can sit outside sRGB). */
const toByte = (linear: number): number => {
  const c = Math.min(1, Math.max(0, linear))
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(encoded * 255)
}

/**
 * CIELAB (D65) back to "#rrggbb", for printing a median that was worked out in Lab.
 * A colour outside the sRGB gamut is clamped to its nearest channel values.
 */
export function labToHex(lab: Lab): string {
  const fy = (lab.L + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200
  const X = labCurveInverse(fx) * WHITE_D65.X
  const Y = (lab.L > KAPPA * EPSILON ? fy ** 3 : lab.L / KAPPA) * WHITE_D65.Y
  const Z = labCurveInverse(fz) * WHITE_D65.Z
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  const hex = (channel: number) => toByte(channel).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** Hue angle in degrees, 0 to 360, with the colourless point (0, 0) given as 0. */
const hueDegrees = (b: number, aPrime: number): number => {
  if (b === 0 && aPrime === 0) return 0
  const degrees = Math.atan2(b, aPrime) * DEG
  return degrees < 0 ? degrees + 360 : degrees
}

/**
 * CIEDE2000 between two Lab colours, with the standard weights kL = kC = kH = 1.
 * Symmetric: deltaE2000(x, y) equals deltaE2000(y, x).
 */
export function deltaE2000(x: Lab, y: Lab): number {
  const C1 = Math.hypot(x.a, x.b)
  const C2 = Math.hypot(y.a, y.b)
  const meanC = (C1 + C2) / 2
  // G stretches a* for the less saturated colours, where the original Lab is least reliable.
  const G = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)))
  const a1 = (1 + G) * x.a
  const a2 = (1 + G) * y.a
  const C1p = Math.hypot(a1, x.b)
  const C2p = Math.hypot(a2, y.b)
  const h1p = hueDegrees(x.b, a1)
  const h2p = hueDegrees(y.b, a2)

  const dLp = y.L - x.L
  const dCp = C2p - C1p
  // The hue step takes the short way round the circle; a colourless side has no hue to step.
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * RAD) / 2)

  const meanLp = (x.L + y.L) / 2
  const meanCp = (C1p + C2p) / 2
  // The mean hue, again the short way round (and the plain sum when one side has no hue).
  let meanHp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) meanHp = (h1p + h2p) / 2
    else if (h1p + h2p < 360) meanHp = (h1p + h2p + 360) / 2
    else meanHp = (h1p + h2p - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos((meanHp - 30) * RAD) +
    0.24 * Math.cos(2 * meanHp * RAD) +
    0.32 * Math.cos((3 * meanHp + 6) * RAD) -
    0.2 * Math.cos((4 * meanHp - 63) * RAD)
  const dTheta = 30 * Math.exp(-(((meanHp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (meanLp - 50) ** 2) / Math.sqrt(20 + (meanLp - 50) ** 2)
  const SC = 1 + 0.045 * meanCp
  const SH = 1 + 0.015 * meanCp * T
  // The blue-region rotation term, which couples the chroma and hue differences.
  const RT = -Math.sin(2 * dTheta * RAD) * RC

  const lightness = dLp / SL
  const chroma = dCp / SC
  const hue = dHp / SH
  return Math.sqrt(lightness ** 2 + chroma ** 2 + hue ** 2 + RT * chroma * hue)
}
