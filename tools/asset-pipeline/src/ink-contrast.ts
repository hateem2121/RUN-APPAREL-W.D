/**
 * Does the printed ink come out the colour of the cloth it sits on? (fix plan Rank 9;
 * audit A-02, A-03, C-04, HG-04, LIVE-12)
 *
 * glTF renders a material as base-colour TEXTURE × base-colour FACTOR. This catalogue's
 * artwork textures are near-white stencils (ink rgb 230–255), so the FACTOR is the ink
 * colour — and CLO writes the colourway's FABRIC colour into the print's factor on 13 of
 * 16 garments. White stencil × cloth colour = a print you cannot see: the live skinsuit's
 * chest slogan measures 1.22–1.38 : 1 against its cloth on three of five colourways
 * (blank fabric reads 1.05–1.20), 3.10 and 6.12 on the two that work.
 *
 * REPORT, NEVER GUESS. Two automatic fixes were tried and both painted the wrong prints
 * white (see docs/SESSION-2026-08-28.md): a white stencil × a dark factor is exactly how a
 * COLOURED print is authored, and "matches a cloth colour" is only wrong when it matches
 * the cloth BENEATH — Minecut's slogan sits on a white band and matches the grey skirt.
 * So this measures each print against the cloth immediately behind it, which only the
 * pipeline can see (`overlay-depth.ts` measures the support primitive), and the owner
 * rules per print. The dominant fabric is the fallback when nothing sits behind a print,
 * and the row says so.
 *
 * The contrast number is the WCAG luminance ratio of the two rendered colours (texture
 * mean over its opaque pixels × factor, both in linear light). Lines: below
 * INVISIBLE_CONTRAST the print reads as blank cloth (the live measurements above);
 * below WEAK_CONTRAST it is there but faint.
 */
import {
  type Document,
  type Material,
  MathUtils,
  type Primitive,
  type Texture,
} from '@gltf-transform/core'
import sharp from 'sharp'
import { findArtworkTexturesByGeometry, isThreadOrHardwareName } from './artwork-geometry'
import { linearRgbToHex } from './colour-name'
import type { PrimitiveReading } from './overlay-depth'
import { isArtworkMaterialByName } from './texture-artwork'
import { dominantFabricByVariant, variantBindings } from './variant-colour'

/**
 * Below this the print reads as bare cloth. Measured on the live skinsuit (audit LIVE-12):
 * the three invisible colourways 1.22 / 1.32 / 1.32, blank-fabric controls 1.05–1.20, the
 * two visible colourways 3.10 and 6.12; on Mantra Ray Colorway 3 all three prints 1.02–1.38
 * against a bare-cloth control of 1.01–1.06 (A-02). Nothing visible measured under 2.0.
 */
export const INVISIBLE_CONTRAST = 1.5
/** Below this a print is present but faint; WCAG's own floor for large text is 3:1. */
export const WEAK_CONTRAST = 3

export type InkVerdict = 'invisible' | 'weak' | 'clear'

export interface InkContrastRow {
  /** The KHR_materials_variants name, or 'default' for a file with none. */
  variantId: string
  /** The print material bound for that colourway. */
  print: string
  meshIndex: number
  primitiveIndex: number
  /** The cloth material the ink was judged against, and how it was chosen. */
  cloth: string | null
  clothSource: 'beneath' | 'dominant' | 'none'
  /** sRGB hexes of what actually renders: ink = texture × factor, cloth likewise. */
  inkHex: string
  factorHex: string
  clothHex: string | null
  contrastRatio: number | null
  /**
   * The print's colour factor is byte-for-byte the cloth material's — CLO's export
   * copied the colourway colour into the print (audit C-04: identical to eight decimals).
   */
  inkMatchesCloth: boolean
  /**
   * A fabric material of the SAME colourway whose factor the print's equals exactly,
   * whichever panel the print sits on — the audit's structural finding (C-04: the live
   * skinsuit's logos carry FABRIC 5's value to eight decimals while sitting on FABRIC 3).
   * Informational: which panel it sits on decides visibility, so this never flags alone.
   */
  matchesFabric: string | null
  verdict: InkVerdict | 'unmeasured'
}

export interface InkContrastReport {
  rows: InkContrastRow[]
  /** Rows the owner must rule on: invisible, or the factor copied from the cloth. */
  flagged: InkContrastRow[]
  colourways: string[]
  prints: number
}

type Linear = [number, number, number]

const srgbByteToLinear = (v: number): number => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: Linear): number => 0.2126 * r + 0.7152 * g + 0.0722 * b
/** WCAG 2.x contrast ratio of two linear colours. */
export function contrastRatio(a: Linear, b: Linear): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Mean linear colour of a texture's opaque pixels (alpha ≥ 200), at most 256 px wide.
 * The stencil's ink is what multiplies the factor; the clear pixels around it are not.
 */
async function textureMeanLinear(
  texture: Texture,
  cache: Map<Texture, Promise<Linear | null>>,
): Promise<Linear | null> {
  let pending = cache.get(texture)
  if (!pending) {
    pending = (async () => {
      const image = texture.getImage()
      if (!image) return null
      try {
        const { data } = await sharp(image)
          .resize({ width: 256, height: 256, fit: 'inside' })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        let n = 0
        let r = 0
        let g = 0
        let b = 0
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i + 3] ?? 0) < 200) continue
          r += srgbByteToLinear(data[i] ?? 0)
          g += srgbByteToLinear(data[i + 1] ?? 0)
          b += srgbByteToLinear(data[i + 2] ?? 0)
          n++
        }
        return n ? [r / n, g / n, b / n] : null
      } catch {
        return null
      }
    })()
    cache.set(texture, pending)
  }
  return pending
}

/** What a material renders as: its texture's ink × its factor, linear; null if unreadable. */
async function renderedColour(
  material: Material,
  cache: Map<Texture, Promise<Linear | null>>,
): Promise<Linear | null> {
  const [fr, fg, fb] = material.getBaseColorFactor()
  const factor: Linear = [fr ?? 1, fg ?? 1, fb ?? 1]
  const texture = material.getBaseColorTexture()
  if (!texture) return factor
  const mean = await textureMeanLinear(texture, cache)
  if (!mean) return null
  return [mean[0] * factor[0], mean[1] * factor[1], mean[2] * factor[2]]
}

const factorOf = (material: Material): Linear => {
  const [r, g, b] = material.getBaseColorFactor()
  return [r ?? 1, g ?? 1, b ?? 1]
}
const sameFactor = (a: Linear, b: Linear): boolean =>
  a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 1e-4)
const isWhite = (f: Linear): boolean => f.every((v) => v >= 0.99)

function materialFor(prim: Primitive, variantId: string | null): Material | null {
  if (variantId !== null) {
    const bound = variantBindings(prim).find((b) => b.variant === variantId)
    if (bound) return bound.material
  }
  return prim.getMaterial()
}

/**
 * Measure every print against the cloth beneath it, for every colourway.
 *
 * `readings` are `measureOverlays(document)` — the container already has them. A print
 * whose reading names a support primitive is judged against THAT primitive's material
 * for the colourway; one with no support falls back to the colourway's dominant fabric.
 */
export async function measureInkContrast(
  document: Document,
  readings: readonly PrimitiveReading[],
): Promise<InkContrastReport> {
  const root = document.getRoot()
  const meshes = root.listMeshes()
  const artworkByGeometry = findArtworkTexturesByGeometry(document)
  const cache = new Map<Texture, Promise<Linear | null>>()

  const isPrint = (material: Material): boolean => {
    const name = material.getName()
    if (isThreadOrHardwareName(name)) return false
    const texture = material.getBaseColorTexture()
    return isArtworkMaterialByName(material) || (texture !== null && artworkByGeometry.has(texture))
  }

  // Colourways in file order (as readVariantColours does), or one 'default'.
  const colourways: string[] = []
  for (const mesh of meshes)
    for (const prim of mesh.listPrimitives())
      for (const { variant } of variantBindings(prim))
        if (!colourways.includes(variant)) colourways.push(variant)
  const variantIds: (string | null)[] = colourways.length ? colourways : [null]

  const dominant = new Map(dominantFabricByVariant(document).map((d) => [d.variantId, d.material]))

  // Every fabric factor per colourway, so a print can be matched to ANY panel's colour.
  const fabricsByVariant = new Map<string, Material[]>()
  for (const mesh of meshes)
    for (const prim of mesh.listPrimitives()) {
      const bindings = variantBindings(prim)
      const seen = bindings.length
        ? bindings
        : prim.getMaterial()
          ? [{ variant: 'default', material: prim.getMaterial() as Material }]
          : []
      for (const { variant, material } of seen) {
        if (isPrint(material) || isThreadOrHardwareName(material.getName())) continue
        const list = fabricsByVariant.get(variant) ?? []
        if (!list.includes(material)) list.push(material)
        fabricsByVariant.set(variant, list)
      }
    }
  const supportOf = new Map<string, PrimitiveReading>()
  for (const reading of readings)
    supportOf.set(`${reading.meshIndex}/${reading.primitiveIndex}`, reading)

  const rows: InkContrastRow[] = []
  const prints = new Set<string>()
  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primitiveIndex, prim] of mesh.listPrimitives().entries()) {
      for (const variantId of variantIds) {
        const print = materialFor(prim, variantId)
        if (!print || !isPrint(print)) continue
        prints.add(`${meshIndex}/${primitiveIndex}`)
        const reading = supportOf.get(`${meshIndex}/${primitiveIndex}`)
        let cloth: Material | null = null
        let clothSource: InkContrastRow['clothSource'] = 'none'
        if (
          reading &&
          reading.supportMeshIndex !== null &&
          reading.supportMeshIndex !== undefined &&
          reading.supportPrimitiveIndex !== null &&
          reading.supportPrimitiveIndex !== undefined
        ) {
          const supportPrim =
            meshes[reading.supportMeshIndex]?.listPrimitives()[reading.supportPrimitiveIndex]
          const candidate = supportPrim ? materialFor(supportPrim, variantId) : null
          // A print stacked on another print is judged against the cloth, not the print.
          if (candidate && !isPrint(candidate)) {
            cloth = candidate
            clothSource = 'beneath'
          }
        }
        if (!cloth && variantId !== null) {
          const fallback = dominant.get(variantId)
          if (fallback) {
            cloth = fallback
            clothSource = 'dominant'
          }
        }
        const ink = await renderedColour(print, cache)
        const clothColour = cloth ? await renderedColour(cloth, cache) : null
        const factor = factorOf(print)
        const ratio = ink && clothColour ? contrastRatio(ink, clothColour) : null
        const inkMatchesCloth =
          cloth !== null && !isWhite(factor) && sameFactor(factor, factorOf(cloth))
        const twin = isWhite(factor)
          ? undefined
          : (fabricsByVariant.get(variantId ?? 'default') ?? []).find((f) =>
              sameFactor(factor, factorOf(f)),
            )
        const matchesFabric = twin ? twin.getName() || '(unnamed material)' : null
        const verdict: InkContrastRow['verdict'] =
          ratio === null
            ? 'unmeasured'
            : ratio < INVISIBLE_CONTRAST
              ? 'invisible'
              : ratio < WEAK_CONTRAST
                ? 'weak'
                : 'clear'
        rows.push({
          variantId: variantId ?? 'default',
          print: print.getName() || '(unnamed material)',
          meshIndex,
          primitiveIndex,
          cloth: cloth ? cloth.getName() || '(unnamed material)' : null,
          clothSource,
          inkHex: ink ? linearRgbToHex(ink) : '#000000',
          factorHex: linearRgbToHex(factor),
          clothHex: clothColour ? linearRgbToHex(clothColour) : null,
          contrastRatio: ratio === null ? null : Number(ratio.toFixed(2)),
          inkMatchesCloth,
          matchesFabric,
          verdict,
        })
      }
    }
  }
  return {
    rows,
    flagged: rows.filter((r) => r.verdict === 'invisible' || r.inkMatchesCloth),
    colourways: variantIds.map((v) => v ?? 'default'),
    prints: prints.size,
  }
}

/** One line per flagged print, in the owner's words, for the robot's report. */
export function describeInkRow(row: InkContrastRow): string {
  const ratio = row.contrastRatio === null ? 'unmeasured' : `${row.contrastRatio.toFixed(2)}:1`
  const why = row.inkMatchesCloth
    ? 'the print carries the cloth’s own colour value'
    : row.verdict === 'invisible'
      ? 'the ink reads as bare cloth'
      : 'faint'
  const against = row.cloth
    ? ` against ${row.cloth}${row.clothSource === 'dominant' ? ' (dominant fabric — nothing measured beneath)' : ''}`
    : ''
  const twinNote =
    row.matchesFabric && row.matchesFabric !== row.cloth
      ? `; its colour value is ${row.matchesFabric}'s`
      : ''
  return `${row.print} @ ${row.variantId}: ${ratio}${against} — ${why}${twinNote}`
}

/**
 * A camera that frames one print for the contact strip: aim at its centre, stand off
 * the side of the garment it faces, zoom from its size. The same construction as
 * `eval-artwork-real.mjs --find-views` (theta = the print's bearing from the garment's
 * centre; the radius is inert — model-viewer clamps it — and the zoom scales from N001's
 * hand-calibrated 14° for a 0.202 m print). One rung, ×1.5, so the cloth around the
 * print is in frame: the question is the print AGAINST the cloth.
 */
export function framePrint(
  document: Document,
  meshIndex: number,
  primitiveIndex: number,
): { name: string; orbit: string; target: string; fieldOfView: string } | null {
  const root = document.getRoot()
  const meshes = root.listMeshes()
  const target = meshes[meshIndex]?.listPrimitives()[primitiveIndex]
  if (!target) return null

  const nodeFor = new Map<object, number[]>()
  for (const node of root.listNodes()) {
    const m = node.getMesh()
    if (m && !nodeFor.has(m)) nodeFor.set(m, node.getWorldMatrix() as unknown as number[])
  }
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const world = (m: number[], p: number[]): [number, number, number] => [
    m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!,
    m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!,
    m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!,
  ]
  const model = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  const print = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  const grow = (box: typeof model, v: [number, number, number]) => {
    for (let k = 0; k < 3; k++) {
      if (v[k]! < box.min[k]!) box.min[k] = v[k]!
      if (v[k]! > box.max[k]!) box.max[k] = v[k]!
    }
  }
  for (const [mi, m] of meshes.entries()) {
    const matrix = nodeFor.get(m) ?? identity
    for (const [pi, p] of m.listPrimitives().entries()) {
      const position = p.getAttribute('POSITION')
      if (!position) continue
      // ⚠️ A meshopt-quantized position accessor is a NORMALIZED int16 — getMin/getMax
      // return the RAW integers (-8745..8577 on the live skinsuit) while the node's
      // scale expects [-1, 1]. Read raw, this aimed the camera 6,116 m above the garment
      // and the strip came back flat grey (2026-09-03). Decode as three.js would.
      const decode = (v: number) =>
        position.getNormalized() ? MathUtils.decodeNormalizedInt(v, position.getComponentType()) : v
      const lo = (position.getMin([0, 0, 0]) as number[]).map(decode)
      const hi = (position.getMax([0, 0, 0]) as number[]).map(decode)
      const isPrint = mi === meshIndex && pi === primitiveIndex
      for (let corner = 0; corner < 8; corner++) {
        const w = world(matrix, [
          corner & 1 ? hi[0]! : lo[0]!,
          corner & 2 ? hi[1]! : lo[1]!,
          corner & 4 ? hi[2]! : lo[2]!,
        ])
        grow(model, w)
        if (isPrint) grow(print, w)
      }
    }
  }
  if (!Number.isFinite(print.min[0]!)) return null
  const centre = [0, 1, 2].map((k) => (print.min[k]! + print.max[k]!) / 2)
  const modelCentre = [0, 1, 2].map((k) => (model.min[k]! + model.max[k]!) / 2)
  // Theta 0° looks from +Z; the azimuth is the print's bearing from the garment's centre,
  // so a back print orbits round to ~180° instead of being shot through the fabric.
  const theta =
    (Math.atan2(centre[0]! - modelCentre[0]!, centre[2]! - modelCentre[2]!) * 180) / Math.PI
  const span = Math.max(...[0, 1, 2].map((k) => print.max[k]! - print.min[k]!))
  const fov = Math.min(45, Math.max(1, 14 * (span / 0.202) * 1.5))
  const name = (target.getMaterial()?.getName() || `mesh-${meshIndex}-${primitiveIndex}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return {
    name: name || `print-${meshIndex}-${primitiveIndex}`,
    orbit: `${theta.toFixed(1)}deg 90deg 0.45m`,
    target: centre.map((n) => `${n.toFixed(3)}m`).join(' '),
    fieldOfView: `${fov.toFixed(1)}deg`,
  }
}
