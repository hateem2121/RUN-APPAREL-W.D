/**
 * The maths of the site's colour change: a new colour soaks into the garment from the dot that
 * chose it, like dye (owner, 2026-10-19 for №03; every colour change on the site and the garment
 * pages since 2026-10-26). `dyePlayer.ts` draws it; this file only decides where it starts, how
 * long it takes, what colour its wet edge is, and when each part of the picture is reached.
 *
 * ⚠️ NOT A PERFECT CIRCLE (owner, 2026-10-26: "organic dye edge"). Until then the front was a CSS
 * `radial-gradient` mask, recorded on the live site that day as a clean geometric ring: it read as a
 * screen wipe. Dye wicks along a knit's wales, so the front here is the distance from the dot plus
 * value noise stretched 3:1 upright, which no CSS gradient can express.
 */

/** Where a dye starts in its picture's box (px from its top-left), and how far it must travel. */
export type DyeOrigin = { x: number; y: number; reach: number }

/** The three duration tokens, in ms (`--dye-min`, `--dye-max`, `--dye-short` in tokens.css). */
export type DyeTiming = { min: number; max: number; short: number }

/**
 * The dye's start: the chosen dot's centre pulled onto the box's nearest edge (the dots sit beside
 * the garment from 900px and under it on a phone), and the distance to the farthest corner. No dot
 * to read (a keyboard pick before the row is measured): the middle of the foot.
 */
export function dyeOrigin(
  box: { width: number; height: number },
  point: { x: number; y: number } | null,
): DyeOrigin {
  const x = point ? Math.min(Math.max(point.x, 0), box.width) : box.width / 2
  const y = point ? Math.min(Math.max(point.y, 0), box.height) : box.height
  const reach = Math.max(
    Math.hypot(x, y),
    Math.hypot(box.width - x, y),
    Math.hypot(x, box.height - y),
    Math.hypot(box.width - x, box.height - y),
  )
  return { x, y, reach }
}

/** The reach at which a full dye takes `max`: a 1440px screen's garment, corner to corner. */
const FULL_REACH_PX = 1200

/**
 * How long a dye runs. A full one scales with how far it travels, so a small card does not take as
 * long as the 3D garment (owner, 2026-10-26: "snappier timing scaled by distance"); a hover's short
 * one is the same length whatever the distance, because it previews rather than chooses.
 */
export function dyeDuration(reach: number, kind: 'full' | 'short', timing: DyeTiming): number {
  if (kind === 'short') return timing.short
  const share = Math.min(Math.max(reach, 0), FULL_REACH_PX) / FULL_REACH_PX
  return Math.round(timing.min + (timing.max - timing.min) * share)
}

/** How much darker the wet edge is than the dye itself: OKLab lightness × 0.82. */
const WET_LIGHTNESS = 0.82

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
const byte = (c: number) =>
  Math.round(Math.min(Math.max(toGamma(c), 0), 1) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * The wet edge's colour: the dye, darker, in OKLab, so the hue holds as it darkens (sRGB darkening
 * shifts a red towards brown). Björn Ottosson's matrices, "A perceptual color space for image
 * processing" (published 2020-12-23, read 2026-10-26, public domain / MIT). `'transparent'` for
 * anything that is not `#rrggbb`, so a colour with no swatch draws no edge.
 */
export function wetShade(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'transparent'
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!)
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!)
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!)
  const L = (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s) * WET_LIGHTNESS
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m2 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return `#${byte(4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2)}${byte(
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
  )}${byte(-0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2)}`
}

/** How far the noise moves the front, as a share of the whole trip. */
const NOISE_AMPLITUDE = 0.08
/** The noise's grain across the cloth, in px; upright it is three times longer (the wales). */
const GRAIN_PX = 64
const WALE_STRETCH = 3

/** A lattice point's value in [0, 1): an integer hash, so a seed always draws the same field. */
function lattice(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise at a point, in [0, 1). */
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const top = lattice(x0, y0, seed) * (1 - sx) + lattice(x0 + 1, y0, seed) * sx
  const bottom = lattice(x0, y0 + 1, seed) * (1 - sx) + lattice(x0 + 1, y0 + 1, seed) * sx
  return top * (1 - sy) + bottom * sy
}

/**
 * When the dye reaches each cell of a `cols` × `rows` grid of `cell`-px cells, from 0 (at once) to
 * 1 (last): the cell's distance from the origin over the reach, moved by up to ±`NOISE_AMPLITUDE`
 * of two octaves of value noise. Row by row from the top, as `ImageData` is laid out.
 */
export function arrivalField(
  cols: number,
  rows: number,
  origin: DyeOrigin,
  cell: number,
  seed: number,
): Float32Array {
  const field = new Float32Array(cols * rows)
  const reach = origin.reach || 1
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cell
      const y = (row + 0.5) * cell
      const nx = x / GRAIN_PX
      const ny = y / (GRAIN_PX * WALE_STRETCH)
      const noise = 0.65 * valueNoise(nx, ny, seed) + 0.35 * valueNoise(nx * 2, ny * 2, seed + 1)
      const arrival =
        Math.hypot(x - origin.x, y - origin.y) / reach + (noise - 0.5) * 2 * NOISE_AMPLITUDE
      field[row * cols + col] = Math.min(Math.max(arrival, 0), 1)
    }
  }
  return field
}

/**
 * How much of the OLD colour still covers a cell reached at `arrival` when the front is at `t`:
 * 1 ahead of the front, 0 once it has passed by `soft`, and a smooth step between, so the edge
 * soaks rather than cuts.
 */
export function coverAt(arrival: number, t: number, soft = 0.06): number {
  const k = Math.min(Math.max((arrival - (t - soft)) / soft, 0), 1)
  return k * k * (3 - 2 * k)
}

/**
 * Where a picture is actually drawn inside its box under `object-fit: contain` (centred, the default
 * `object-position`), inside its padding: the gallery cards inset their pictures by padding (VA-55),
 * so the dye's layer lies on the drawn picture, not on the card. In px from the box's top-left;
 * `null` for a picture with no size yet.
 */
export function containedBox(
  box: { width: number; height: number },
  padding: { top: number; right: number; bottom: number; left: number },
  natural: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const inner = {
    width: box.width - padding.left - padding.right,
    height: box.height - padding.top - padding.bottom,
  }
  if (!(natural.width > 0 && natural.height > 0 && inner.width > 0 && inner.height > 0)) return null
  const scale = Math.min(inner.width / natural.width, inner.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return {
    x: padding.left + (inner.width - width) / 2,
    y: padding.top + (inner.height - height) / 2,
    width,
    height,
  }
}
