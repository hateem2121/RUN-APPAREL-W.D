/**
 * Give a colour a name a buyer would recognise.
 *
 * WHY THIS EXISTS. Colour names were typed by hand into the CMS and mapped by
 * hand to whatever CLO called each variant — two independent chances to be
 * wrong, with no feedback loop anywhere. On 2026-08-03 the live site was serving
 * a maroon garment labelled "Navy", a blush one labelled "Black", and a powder
 * blue one labelled "Crimson", while two further colourways in the same file
 * were never mapped and no buyer could see them. Nothing in the system could
 * have noticed: every check passed.
 *
 * The file already knows its colours. This module reads them.
 *
 * WHY IT LIVES HERE and not in @run-apparel/shared: this package is installed
 * with plain `npm install` inside the shrink container's Docker image, where a
 * `workspace:*` dependency does not resolve — the same constraint documented on
 * SIZE_WARNING_BYTES in validate.ts. The CMS only ever receives finished
 * strings, so nothing needs to be shared.
 */

export type Lab = [number, number, number]

export interface ColourName {
  /** Human-facing, e.g. "Powder Blue". */
  name: string
  /** URL-safe form of the same, e.g. "powder-blue". */
  slug: string
  /** CIEDE2000 distance to the matched palette entry. */
  deltaE: number
  /**
   * `low` means "show the swatch and ask" rather than "offer this name".
   * Guessing loudly is precisely how a maroon garment came to be called Navy.
   */
  confidence: 'high' | 'low'
}

/**
 * Above this the match is too far to put words in the owner's mouth. Roughly:
 * ΔE00 under 1 is imperceptible, 2-3 is a careful side-by-side, 10 is plainly a
 * different colour — so a suggestion beyond 10 is a guess.
 */
const CONFIDENT_DELTA_E = 10

/**
 * Below this Lab chroma a colour is a neutral and must be named from the grey
 * ramp. Without the guard, #5B6666 (chroma ≈ 3.4) lands on a desaturated teal,
 * which reads as an obvious bug next to the swatch.
 */
const NEUTRAL_CHROMA = 8

/**
 * Neutrals, light to dark.
 *
 * These are CANONICAL values, deliberately not copied from any garment this
 * repo has processed. An earlier draft seeded the palette with the five hexes
 * measured off N001, which made every test report ΔE 0 — proving only that the
 * lookup can find a value it was handed, and nothing about a colour it has not
 * seen. The measured table in colour-name.test.ts is the real check.
 */
const GREY_RAMP: { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Off White', hex: '#F4F1EC' },
  { name: 'Light Grey', hex: '#C8CCCC' },
  { name: 'Grey', hex: '#8C9191' },
  { name: 'Slate', hex: '#5F6A6A' },
  { name: 'Charcoal', hex: '#3A3D3F' },
  { name: 'Black', hex: '#121212' },
]

/**
 * Chromatic apparel colours. Chosen for B2B sportswear rather than a generic
 * web palette: these are the words a buyer and a merchandiser both use.
 *
 * Entries are deliberately spread — two names closer together than the
 * measurement error would make naming unstable, flipping between them on
 * near-identical garments.
 */
const PALETTE: { name: string; hex: string }[] = [
  { name: 'Navy', hex: '#1B2A4A' },
  { name: 'Royal Blue', hex: '#1F4FD8' },
  { name: 'Sky', hex: '#6FB7E0' },
  { name: 'Powder Blue', hex: '#B0E0E6' },
  { name: 'Teal', hex: '#0E6E6E' },
  { name: 'Petrol', hex: '#17414B' },
  { name: 'Forest Green', hex: '#0B5D2E' },
  { name: 'Olive', hex: '#5A5F2C' },
  { name: 'Sage', hex: '#9CAF88' },
  { name: 'Lime', hex: '#A4D65E' },
  { name: 'Maroon', hex: '#6B2F2F' },
  { name: 'Burgundy', hex: '#6B1F35' },
  { name: 'Crimson', hex: '#B3222F' },
  { name: 'Red', hex: '#C62828' },
  { name: 'Rust', hex: '#A8452A' },
  // Coral was #E2725B until 2026-08-10, which is in fact the canonical
  // Terracotta value (see below) — the two would have tied on any hex
  // equidistant from both, with the winner decided by array order, exactly
  // the silent arbitrariness this module exists to remove. Corrected to
  // Coral's own canonical #FF7F50.
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'Blush', hex: '#E8B4B8' },
  { name: 'Pink', hex: '#E75480' },
  { name: 'Purple', hex: '#5B3B8C' },
  { name: 'Lilac', hex: '#B9A7D8' },
  { name: 'Mustard', hex: '#C9A227' },
  { name: 'Gold', hex: '#B58A2B' },
  { name: 'Orange', hex: '#E06A1B' },
  { name: 'Peach', hex: '#F2B08A' },
  { name: 'Sand', hex: '#D9C9A3' },
  { name: 'Tan', hex: '#B58A5F' },
  { name: 'Brown', hex: '#4E342E' },
  { name: 'Cream', hex: '#F3E9D2' },
  // Added 2026-08-10. Two of N001's own five live colourways — Wine and
  // Butter — had no entry: their canonical hexes matched nearest to Maroon and
  // Sand respectively (measured against the palette below, before this
  // change). Confirmed N001 ships exactly wine, blush, butter, lime, black —
  // no coral — three ways: docs/FIRST-GARMENT-UPLOAD.md (corrected
  // 2026-08-08), docs/SESSION-2026-08-05.md, and a live fetch of
  // `GET /api/public/viewer/n001/wine`, which all agree. At a 100+ garment
  // catalogue an unmapped colour is the common case, not the edge. These are
  // canonical published values, per the note on GREY_RAMP above — not hexes
  // measured off any garment this repo has processed.
  { name: 'Wine', hex: '#722F37' },
  { name: 'Butter', hex: '#F3E5AB' },
  { name: 'Mint', hex: '#3EB489' },
  { name: 'Turquoise', hex: '#40E0D0' },
  { name: 'Khaki', hex: '#C3B091' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Ivory', hex: '#FFFFF0' },
  { name: 'Plum', hex: '#8E4585' },
  { name: 'Magenta', hex: '#C2185B' },
  { name: 'Emerald', hex: '#046307' },
  { name: 'Cobalt', hex: '#0047AB' },
  { name: 'Indigo', hex: '#4B0082' },
  // Terracotta takes the hex Coral used to hold before the correction above.
  { name: 'Terracotta', hex: '#E2725B' },
  // Added 2026-09-02 (audit CG-07). Mustard, Gold, Butter and Cream were here and
  // plain Yellow was not, so the two yellow colourways in the catalogue could never
  // be named: tennis suit Colorway 10 (#FFD900) landed on Mustard at ΔE 14.95 and
  // X-Milo Training Vest Colorway 4 (#FFFF22) on Butter at 17.43 — both past the
  // confidence line, both blank for the owner to type. Process Yellow (#FFEF00, the
  // published CMYK primary) names both with confidence (6.6 / 4.4) and sits 16.6+
  // from every neighbour, where CSS yellow #FFFF00 would leave the first at 10.9 and
  // gold #FFD700 the second at 11.6.
  { name: 'Yellow', hex: '#FFEF00' },
  { name: 'Mauve', hex: '#C8A2C8' },
  { name: 'Camel', hex: '#C19A6B' },
  { name: 'Mocha', hex: '#3B2F2F' },
  { name: 'Bottle Green', hex: '#006A4E' },
  { name: 'Denim', hex: '#3D5A80' },
]

/** sRGB electro-optical transfer function, channel in 0..1. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

/** Inverse of `srgbToLinear`. */
export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Linear RGB (0..1) → "#RRGGBB". */
export function linearRgbToHex(rgb: [number, number, number]): string {
  const hex = rgb
    .map((c) => Math.round(clamp01(linearToSrgb(clamp01(c))) * 255))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
  return `#${hex.toUpperCase()}`
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Not a six-digit hex colour: ${JSON.stringify(hex)}`)
  const int = Number.parseInt(match[1]!, 16)
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
}

/** sRGB hex → CIELAB under D65, the illuminant glTF and every browser assume. */
export function srgbToLab(hex: string): Lab {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number]
  // Linear sRGB → XYZ (D65), then XYZ → Lab.
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const deg = (rad: number) => (rad * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

/**
 * CIEDE2000 colour difference (Sharma et al. 2005 formulation).
 *
 * Euclidean RGB distance is not usable here: it is perceptually non-uniform, so
 * two obviously different dark colours can sit closer together than two shades
 * of the same hue, and the nearest-name lookup becomes close to arbitrary in
 * exactly the dark, saturated region most sportswear lives in.
 */
export function ciede2000(a: Lab, b: Lab): number {
  const [l1, a1, b1] = a
  const [l2, a2, b2] = b
  const kL = 1
  const kC = 1
  const kH = 1

  const c1 = Math.hypot(a1, b1)
  const c2 = Math.hypot(a2, b2)
  const cBar = (c1 + c2) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))

  const a1p = (1 + g) * a1
  const a2p = (1 + g) * a2
  const c1p = Math.hypot(a1p, b1)
  const c2p = Math.hypot(a2p, b2)

  const h1p = c1p === 0 ? 0 : (deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2p = c2p === 0 ? 0 : (deg(Math.atan2(b2, a2p)) + 360) % 360

  const dLp = l2 - l1
  const dCp = c2p - c1p

  let dhp = 0
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p
    if (Math.abs(diff) <= 180) dhp = diff
    else if (diff > 180) dhp = diff - 360
    else dhp = diff + 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp) / 2)

  const lBarP = (l1 + l2) / 2
  const cBarP = (c1p + c2p) / 2

  let hBarP: number
  if (c1p * c2p === 0) hBarP = h1p + h2p
  else if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2
  else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2
  else hBarP = (h1p + h2p - 360) / 2

  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63))

  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2))
  const rC = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7))
  const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2)
  const sC = 1 + 0.045 * cBarP
  const sH = 1 + 0.015 * cBarP * t
  const rT = -Math.sin(rad(2 * dTheta)) * rC

  return Math.sqrt(
    (dLp / (kL * sL)) ** 2 +
      (dCp / (kC * sC)) ** 2 +
      (dHp / (kH * sH)) ** 2 +
      rT * (dCp / (kC * sC)) * (dHp / (kH * sH)),
  )
}

export function toColourSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Nearest entry in a list, by CIEDE2000. */
function nearest(
  lab: Lab,
  entries: { name: string; hex: string }[],
): { name: string; deltaE: number } {
  let best = { name: entries[0]!.name, deltaE: Number.POSITIVE_INFINITY }
  for (const entry of entries) {
    const deltaE = ciede2000(lab, srgbToLab(entry.hex))
    if (deltaE < best.deltaE) best = { name: entry.name, deltaE }
  }
  return best
}

/**
 * Name an sRGB hex colour.
 *
 * Neutrals are matched against the grey ramp only. Mixing them into one lookup
 * lets a near-grey land on a washed-out hue name whose ΔE happens to be a shade
 * smaller, which is technically the nearest match and obviously wrong to anyone
 * looking at the swatch.
 */
export function nameColour(hex: string): ColourName {
  const lab = srgbToLab(hex)
  const chroma = Math.hypot(lab[1], lab[2])
  const { name, deltaE } = nearest(lab, chroma < NEUTRAL_CHROMA ? GREY_RAMP : PALETTE)
  return {
    name,
    slug: toColourSlug(name),
    deltaE: Math.round(deltaE * 100) / 100,
    confidence: deltaE <= CONFIDENT_DELTA_E ? 'high' : 'low',
  }
}
