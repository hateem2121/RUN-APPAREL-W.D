import type { Document, Material, Primitive, Texture } from '@gltf-transform/core'
import type { MappingList } from '@gltf-transform/extensions'
import sharp, { type Stats } from 'sharp'
import { findArtworkTexturesByGeometry } from './artwork-geometry'
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
  /**
   * Where the colour was read. `factor` is CLO's colourway colour in
   * `baseColorFactor`; `texture` means the factor was white and the fabric picture
   * was sampled instead (readVariantColoursSampled).
   */
  sampledFrom: 'factor' | 'texture'
  /** Why a colourway stayed unnamed when the FILE is the reason, in the owner's words. */
  note?: string
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

/**
 * Printed graphics sitting ON the fabric. Not its colour either.
 *
 * ⚠️ ADDED 2026-08-21 after a real regression. `isGarmentFabric` excluded artwork
 * only by TEXTURE name, and a CLO export leaves textures anonymous — **0 of 24 had
 * a name or URI** on the Cycling-Bib file — so nothing was ever excluded. It went
 * unnoticed only because the fabric happened to win on surface area. When the
 * all-over halftone print moved from BLEND to MASK, the area ranking flipped and
 * every colourway was named from the PRINT's dark ink instead of the cloth:
 *
 *     fabric-sampled (right)   Wine  Slate  Lilac  White  Turquoise
 *     print-sampled  (wrong)   Brown Sage   Denim  Navy   Teal
 *
 * This is the same failure mode as 2026-08-03, when every published colour name on
 * the live site was wrong. Excluding by MATERIAL name closes it whatever the
 * alphaMode does next.
 *
 * Deliberately this module's OWN list, not an import from texture-artwork.ts — see
 * the note on TRIM_NAME above. These answer different questions and merging them
 * would let a change to one silently alter the other. Token-boundary matched, so
 * `Material_Graphic` matches while a fabric called `Textured_Knit` does not.
 */
const GRAPHIC_NAME = /(^|[^a-z])(graphic|print|logo|artwork|decal|wordmark|slogan)([^a-z]|$)/i

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
function isGarmentFabric(material: Material, artworkByGeometry: Set<Texture>): boolean {
  const name = material.getName()
  if (TRIM_NAME.test(name)) return false
  if (GRAPHIC_NAME.test(name)) return false
  // A translucent overlay is never the cloth. Geovent Tennis Dress Colorway 6 (audit
  // CG-05, 2026-09-02): the print is a material called "Asset 2_3089" — no artwork
  // word — on BLEND at baseColorFactor[3] = 0.16, a 16%-opacity overlay, and it named
  // the colourway Navy over white cloth. Alpha authored under 0.5 cannot be a garment.
  if ((material.getBaseColorFactor()[3] ?? 1) < OVERLAY_ALPHA_MAX) return false
  for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
    if (!texture) continue
    if (isArtworkTextureByName(texture)) return false
    // CLO names real artwork materials "Asset 2", "ZZ00000ZZZZ0", "01"; the UV span
    // separates a print from cloth where no word can (artwork-geometry.ts).
    if (artworkByGeometry.has(texture)) return false
  }
  return true
}

/** Below this authored alpha a material is an overlay, not the garment (see above). */
const OVERLAY_ALPHA_MAX = 0.5

/** Every (variant name → material) binding on a primitive. */
export function variantBindings(prim: Primitive): { variant: string; material: Material }[] {
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
/**
 * The dominant fabric of every variant, in file order.
 *
 * ⚠️ AGGREGATED BY NAME AND COLOUR, NOT BY MATERIAL OBJECT — since 2026-09-02 (audit
 * CG-05). CLO emits one Material object per PANEL, all carrying the cloth's name, so a
 * map keyed on the object did the opposite of what the comment promised: on Geovent
 * Tennis Dress Colorway 6 the cloth "Cotton_Stretch_Sateen" totalled 60.85% of the
 * surface and the print "Asset 2_3089" 34.23%, yet no single object exceeded 4.36%,
 * and the winner was decided between a print panel at 4.36% and a cloth panel at
 * 4.35% — a 0.01-point coin flip that named white cloth Navy. Across 46 variants in
 * nine exports that was the only disagreement, and it was the one wrong answer.
 */
export function dominantFabricByVariant(
  document: Document,
): { variantId: string; material: Material }[] {
  const areaByVariant = new Map<string, Map<string, { material: Material; area: number }>>()
  const order: string[] = []
  const artworkByGeometry = findArtworkTexturesByGeometry(document)

  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const bindings = variantBindings(prim)
      if (bindings.length === 0) continue
      const area = primitiveArea(prim)
      if (area <= 0) continue
      for (const { variant, material } of bindings) {
        let byCloth = areaByVariant.get(variant)
        if (!byCloth) {
          byCloth = new Map()
          areaByVariant.set(variant, byCloth)
          order.push(variant)
        }
        // Name + factor: every panel of one cloth adds up; two cloths that happen to
        // share a name but not a colour stay apart.
        const key = `${material.getName()}\u0000${material.getBaseColorFactor().join(',')}`
        const entry = byCloth.get(key)
        if (entry) entry.area += area
        else byCloth.set(key, { material, area })
      }
    }
  }

  const out: { variantId: string; material: Material }[] = []
  for (const variantId of order) {
    const byCloth = [...areaByVariant.get(variantId)!.values()]
    // Fabric first. If a garment is somehow all trim and graphics, fall back to
    // the largest material of any kind rather than reporting nothing at all.
    const fabric = byCloth.filter(({ material }) => isGarmentFabric(material, artworkByGeometry))
    const candidates = fabric.length > 0 ? fabric : byCloth
    const dominant = candidates.sort((a, b) => b.area - a.area)[0]
    if (dominant) out.push({ variantId, material: dominant.material })
  }
  return out
}

export function readVariantColours(document: Document): VariantColour[] {
  const colours: VariantColour[] = []
  for (const { variantId, material } of dominantFabricByVariant(document)) {
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
      sampledFrom: 'factor',
      ...named,
      ...(colourMayLiveInTexture ? { confidence: 'low' as const } : {}),
    })
  }
  return colours
}

/**
 * Plain fabric pictures in the owner's catalogue read a mean channel stdev of
 * 1.8–15.9 (scripts/fabric-texture-census.mjs over eleven exports, 2026-09-02); a
 * print or halftone is far busier. Above this the picture's dominant colour may be
 * ink rather than cloth — the 2026-08-21 incident shape — so the name stays blank.
 */
export const BUSY_TEXTURE_STDEV = 32

export const SHARED_TEXTURE_NOTE =
  'every colourway binds the same fabric picture behind a white colour, so this export carries no colourway colours — set each colourway\u2019s colour in CLO and re-export'
export const BUSY_TEXTURE_NOTE =
  'the fabric picture is busy (a print or a halftone), so its dominant colour may be ink rather than cloth'

/**
 * readVariantColours, then the fabric PICTURE for any colourway whose factor is white.
 *
 * WHY. Four of the five FIXED GLBs and eleven of eleven raw exports censused on
 * 2026-09-02 carry a white baseColorFactor with the colour in the texture (audit
 * CG-06, F1-03, F2-04) — 23 of 25 colourway names arrived blank. sharp's stats()
 * gives the dominant sRGB colour from a 4096-bin histogram, which is the cloth for a
 * plain weave.
 *
 * WHAT IT REFUSES TO DO. On every one of those exports the SAME picture is bound to
 * all five colourways, so sampling it would name all five identically — five
 * confident, identical, wrong tags. A shared picture stays low-confidence and says
 * why (SHARED_TEXTURE_NOTE); so does a busy one. This only names a colourway when the
 * export actually carries a different picture per colourway, which is the owner's
 * CLO setting to fix (fix plan Group 5), not this module's to guess.
 *
 * Async because it decodes at most one texture per variant; readVariantColours stays
 * synchronous for callers that have no images to read.
 */
export async function readVariantColoursSampled(document: Document): Promise<VariantColour[]> {
  const picked = dominantFabricByVariant(document)
  const colours = readVariantColours(document)
  const textures = picked.map(({ material }) => material.getBaseColorTexture())
  const shared = colours.length > 1 && new Set(textures.filter(Boolean)).size === 1
  const stats = new Map<Texture, Promise<Stats | null>>()
  const statsOf = (texture: Texture) => {
    let pending = stats.get(texture)
    if (!pending) {
      const image = texture.getImage()
      pending = image
        ? sharp(image)
            .stats()
            .catch(() => null)
        : Promise.resolve(null)
      stats.set(texture, pending)
    }
    return pending
  }

  const out: VariantColour[] = []
  for (const [i, colour] of colours.entries()) {
    const texture = textures[i] ?? null
    const factorIsWhite = colour.hex.toUpperCase() === '#FFFFFF'
    if (colour.confidence === 'high' || !factorIsWhite || !texture) {
      out.push(colour)
      continue
    }
    if (shared) {
      out.push({ ...colour, note: SHARED_TEXTURE_NOTE })
      continue
    }
    const st = await statsOf(texture)
    if (!st) {
      out.push({ ...colour, note: 'the fabric picture could not be read' })
      continue
    }
    const busyness = st.channels.slice(0, 3).reduce((sum: number, c) => sum + c.stdev, 0) / 3
    if (busyness > BUSY_TEXTURE_STDEV) {
      out.push({ ...colour, note: BUSY_TEXTURE_NOTE })
      continue
    }
    const { r, g, b } = st.dominant
    const hex =
      `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    out.push({ ...colour, hex, ...nameColour(hex), sampledFrom: 'texture' })
  }
  return out
}
