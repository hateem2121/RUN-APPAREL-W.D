import type { Document, Material, Primitive } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import { type ColourName, linearRgbToHex, nameColour } from './colour-name'
import { isArtworkTextureByName } from './texture-artwork'

/**
 * Read the actual colour of every KHR_materials_variants variant in a GLB.
 *
 * WHY. The owner typed colour names into the CMS by hand and mapped them by hand
 * to whatever CLO called each variant. On 2026-08-03 production was serving a
 * maroon garment labelled "Navy", a blush one labelled "Black" and a powder blue
 * one labelled "Crimson", with two more colourways in the file that were never
 * mapped and no buyer could reach. The file knew all five the whole time.
 *
 * WHAT IT DOES NOT DO. It never renames anything. The output is a *suggestion*
 * carried alongside the verbatim variant id, because a colourway slug is printed
 * on physical QR tags and an automated process must never touch one.
 */

export interface VariantColour extends ColourName {
  /** The KHR_materials_variants name, verbatim — e.g. "Colorway 2". */
  variantId: string
  /** sRGB hex of the dominant fabric, e.g. "#502626". */
  hex: string
  /** Which material the colour came from, so a wrong answer is diagnosable. */
  sampledMaterial: string
}

/**
 * Materials that are on the garment but are not its colour.
 *
 * Separate from the artwork regex in texture-artwork.ts on purpose: that one
 * answers "must this survive decimation?", this one answers "is this the
 * garment's colour?". They overlap but are not the same question, and merging
 * them would mean a change for one silently altering the other.
 *
 * Names here are the ones a real CLO export produced — `Zipper 2_Slider_3402`,
 * `Zipper 2_TapeFabric_3314`. The slider is #000000 on all five of N001's
 * colourways, so sampling trim would have named every colourway "Black".
 */
const TRIM_NAME =
  /(zip|zipper|slider|puller|tape|button|snap|eyelet|elastic|binding|trim|piping|drawcord|cord|velcro|thread|stitch|seam|label|tag)/i

/** Object-space surface area of a primitive's triangles. */
function primitiveArea(prim: Primitive): number {
  const position = prim.getAttribute('POSITION')
  const indices = prim.getIndices()
  if (!position) return 0
  const count = indices ? indices.getCount() : position.getCount()
  const at = (i: number): [number, number, number] => {
    const index = indices ? indices.getScalar(i) : i
    const out = [0, 0, 0]
    position.getElement(index, out)
    return out as [number, number, number]
  }
  let area = 0
  for (let i = 0; i + 2 < count; i += 3) {
    const [a, b, c] = [at(i), at(i + 1), at(i + 2)]
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    area +=
      0.5 *
      Math.hypot(
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      )
  }
  return area
}

/**
 * Is this material the garment's colour, or is it hardware/graphics sitting on
 * top of it? Deliberately conservative: excluding a fabric costs us a fallback
 * to the next-largest one, while including a zip names the whole colourway black.
 */
function isGarmentFabric(material: Material): boolean {
  if (TRIM_NAME.test(material.getName())) return false
  for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
    if (texture && isArtworkTextureByName(texture)) return false
  }
  return true
}

/** Every (variant name → material) binding on a primitive. */
function variantBindings(prim: Primitive): { variant: string; material: Material }[] {
  const list = prim.getExtension<MappingList>('KHR_materials_variants')
  if (!list) return []
  const out: { variant: string; material: Material }[] = []
  for (const mapping of list.listMappings()) {
    const material = mapping.getMaterial()
    if (!material) continue
    for (const variant of mapping.listVariants()) {
      const name = variant.getName()
      if (name) out.push({ variant: name, material })
    }
  }
  return out
}

/**
 * How close to 1.0 every linear baseColorFactor channel must be to count as "white
 * enough that the real colour is probably in the texture".
 *
 * Not an exact 1.0 comparison: CLO writes values a hair under, and an exact test
 * would miss every real case it is meant to catch.
 */
const WHITE_FACTOR_MIN = 0.99

/**
 * The effective base colour of a material, in LINEAR light.
 *
 * `baseColorFactor` is linear by the glTF spec. The base-colour *texture* is
 * sRGB-encoded, so its pixels would have to be linearised before averaging —
 * which is why texture sampling is deliberately NOT done here: it needs a decode
 * per texture, and by the time this runs in the optimize chain the images may
 * already be WebP or KTX2. The factor alone is what CLO writes the colourway
 * into, and it is what <model-viewer> multiplies by, so on a CLO export it is
 * the colour. If a garment ever ships colour purely in the texture with a white
 * factor, this returns white and `confidence` will not save us — that is the
 * known limit, recorded rather than papered over.
 */
function baseColourLinear(material: Material): [number, number, number] {
  const [r, g, b] = material.getBaseColorFactor()
  return [r!, g!, b!]
}

/**
 * Read one suggested colour per variant, in file order.
 *
 * Synchronous: everything it reads is glTF metadata, so it costs nothing beside
 * the 380 MB document the caller already has open.
 */
export function readVariantColours(document: Document): VariantColour[] {
  // area[variant][material] — accumulated so the dominant fabric wins on
  // coverage rather than on how many separate panels it happens to be cut into.
  const areaByVariant = new Map<string, Map<Material, number>>()
  const order: string[] = []

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const bindings = variantBindings(prim)
      if (bindings.length === 0) continue
      const area = primitiveArea(prim)
      if (area <= 0) continue
      for (const { variant, material } of bindings) {
        let byMaterial = areaByVariant.get(variant)
        if (!byMaterial) {
          byMaterial = new Map()
          areaByVariant.set(variant, byMaterial)
          order.push(variant)
        }
        byMaterial.set(material, (byMaterial.get(material) ?? 0) + area)
      }
    }
  }

  const colours: VariantColour[] = []
  for (const variantId of order) {
    const byMaterial = areaByVariant.get(variantId)!
    // Fabric first. If a garment is somehow all trim and graphics, fall back to
    // the largest material of any kind rather than reporting nothing at all.
    const fabric = [...byMaterial].filter(([material]) => isGarmentFabric(material))
    const candidates = fabric.length > 0 ? fabric : [...byMaterial]
    const dominant = candidates.sort((a, b) => b[1] - a[1])[0]
    if (!dominant) continue
    const [material] = dominant
    const linear = baseColourLinear(material)
    const hex = linearRgbToHex(linear)
    const named = nameColour(hex)

    // L9, 2026-08-18. The comment on baseColourLinear has always recorded that a
    // garment shipping colour purely in the TEXTURE with a white factor "returns
    // white and `confidence` will not save us". It cannot save us because #FFFFFF
    // matches GREY_RAMP's White at deltaE ~ 0 — so the verdict is confidently
    // WRONG rather than uncertain, and the blanking at importColours.ts, which
    // exists to stop a guessed name reaching a colour button, only fires on
    // uncertainty. That is the 2026-08-03 incident shape reached by another route.
    //
    // Narrow deliberately: a white factor AND a base-colour texture present. A
    // genuinely white garment with no texture keeps its name; widening this to
    // every white factor would blank real colourways.
    //
    // Closed now rather than when it fires: the CMS holds 66 model-less drafts
    // awaiting CLO files whose authoring conventions nobody has seen yet.
    const factorIsWhite = linear.every((channel) => channel >= WHITE_FACTOR_MIN)
    const colourMayLiveInTexture = factorIsWhite && material.getBaseColorTexture() !== null

    colours.push({
      variantId,
      hex,
      sampledMaterial: material.getName() || '(unnamed material)',
      ...named,
      ...(colourMayLiveInTexture ? { confidence: 'low' as const } : {}),
    })
  }
  return colours
}
