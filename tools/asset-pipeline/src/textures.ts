import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document, Material, Texture, TextureInfo } from '@gltf-transform/core'
import {
  listTextureInfo,
  listTextureInfoByMaterial,
  listTextureSlots,
} from '@gltf-transform/functions'
import sharp, { type Metadata, type Sharp } from 'sharp'
import { readGlb } from './io'

/**
 * Texture inventory — dump every texture in a GLB to PNG, with a manifest saying
 * where each one is used and what its alpha channel actually contains.
 *
 * WHY THIS EXISTS. The first real garment shipped with its printed artwork
 * damaged, and nobody could say which pipeline stage did it, because the only
 * way to look at a logo was to open the live site on a phone. Every preset
 * change so far has been made against file-size numbers alone. This is the
 * cheapest half of fixing that: it answers two questions about a GLB without
 * processing it at all.
 *
 *   1. WHICH UV SET IS THE ARTWORK ON? Decimation used to weight TEXCOORD_0 and
 *      nothing else, so artwork on another set was decimated at zero weight
 *      while the fabric's UVs were protected — damaged on some panels, clean on
 *      others, which is exactly the reported symptom. `texCoords` per texture is
 *      that answer.
 *
 *      Read `materialsWithMultipleUvSets`, not "any texCoord != 0", for the
 *      alarm: `prune()` renumbers a lone second UV set down to TEXCOORD_0 before
 *      decimation ever sees it, so only materials sampling two or more sets
 *      actually carry the hazard into the simplifier.
 *
 *   2. DID THE ENCODER CRUSH IT? Lossy WebP is 4:2:0 chroma only, which bleeds
 *      hard saturated edges — the classic wordmark failure. Bytes-per-pixel is
 *      the tell: a 2048x2048 base-colour map stored in 13 KB is 0.003 bpp, and
 *      no amount of "it's mostly flat" explains that away.
 *
 * The alpha profile serves a third purpose: solidifyMaterials() currently forces
 * every BLEND material to OPAQUE, which is right for CLO's stray fabric opacity
 * and wrong for a decal with a real cutout. Knowing whether a texture's alpha is
 * absent, uniformly opaque, a hard binary cutout, or genuinely graded is what
 * lets that decision be made per material instead of by blanket rule.
 */

/** How a texture's alpha channel behaves — see `profileAlpha`. */
export type AlphaCharacter =
  /** No alpha channel at all. */
  | 'none'
  /** Has a channel, but every pixel is solid — the channel is dead weight. */
  | 'opaque'
  /** Hard cutout: pixels are either solid or clear, with almost nothing between. */
  | 'binary'
  /** Genuinely graded — real translucency, e.g. a mesh panel or a soft shadow. */
  | 'graded'
  /** Could not be decoded (e.g. KTX2, which sharp does not read). */
  | 'unknown'

export interface AlphaProfile {
  character: AlphaCharacter
  /** Fraction of pixels fully cut out (alpha <= 8). */
  transparentFraction: number
  /** Fraction of pixels fully solid (alpha >= 248). */
  opaqueFraction: number
  /** Fraction in between. This is what separates a cutout from real translucency. */
  midFraction: number
  /**
   * Fraction of pixels that are MORE THAN HALF see-through (alpha 9-127).
   *
   * `midFraction` counts how MANY pixels are partial; this counts how DEEP that
   * partiality goes, and only the second can tell anti-aliasing from real
   * translucency. Measured 2026-08-27: the X-MILO fabric atlas is 6.67% partial but
   * only **0.015%** of it is below alpha 128 — a thin ramp at 192-247 around panel
   * edges, visually solid. The organza-inset fixture is 2.95% partial and **all of
   * it** is at alpha 90, which is genuinely sheer. A 200x separation where
   * `midFraction` alone gives 6.67% vs 2.95% — the wrong way round.
   */
  sheerFraction: number
}

/** One place a texture is used: which material, which slot, which UV set. */
export interface TextureUsage {
  material: string
  /** e.g. 'baseColorTexture', 'normalTexture'. */
  slot: string
  /** The UV set this usage samples — TEXCOORD_<texCoord>. */
  texCoord: number
  /** The material's alphaMode, since it decides how this texture is composited. */
  alphaMode: string
}

export interface TextureRecord {
  index: number
  name: string
  uri: string
  mimeType: string
  bytes: number
  width: number | null
  height: number | null
  /** Long side / short side. Wordmarks and printed strips are extreme; fabric maps are square. */
  aspectRatio: number | null
  /** Stored bytes per pixel. Below ~0.02 on a colour map means the encoder crushed it. */
  bytesPerPixel: number | null
  /** Slot names across every material using this texture. */
  slots: string[]
  /** Distinct UV sets this texture is sampled with, across all materials. */
  texCoords: number[]
  usages: TextureUsage[]
  alpha: AlphaProfile
  /** Relative path of the PNG written for this texture, or null if not written. */
  file: string | null
}

export interface TextureInventory {
  file: string
  textures: TextureRecord[]
  /** Every distinct UV set referenced by any material texture. */
  texCoordsInUse: number[]
  /** Texture usages that sample a UV set other than 0. */
  usagesOffUv0: TextureUsage[]
  /** Materials sampling two or more UV sets — see UvSummary for why only these matter. */
  materialsWithMultipleUvSets: string[]
  /** Materials by alphaMode — the input to a per-material solidify decision. */
  alphaModeCounts: Record<string, number>
  warnings: string[]
}

/**
 * Below this, a stored colour map is suspiciously small for its pixel count.
 * A clean WebP of a flat logo lands around 0.05-0.15 bpp; the damaged N001
 * textures measured 0.003.
 */
export const CRUSHED_BYTES_PER_PIXEL = 0.02

/** Above this long:short ratio a texture is almost certainly a wordmark or printed strip. */
export const ARTWORK_ASPECT_RATIO = 3

/**
 * Above this share of part-transparent pixels `character` is `graded` rather
 * than `binary`.
 *
 * DELIBERATELY LEFT AT 0.02 even though it misses the damaged wordmark (see
 * CUTOUT_MID_FRACTION below). `character` is read by `isArtworkTexture` as its
 * last-resort signal, and the artwork set feeds `findArtworkAlphaProblems`,
 * which throws `PermanentJobError` and saves nothing. Widening the shared
 * classifier to rescue one texture would widen a blocking gate for every other
 * texture in the file — and buys that rescue nothing anyway, because the
 * wordmark is 1944x121 = 16:1 and is already artwork by ARTWORK_ASPECT_RATIO.
 * Keep destructive thresholds separate from advisory ones.
 */
export const BINARY_MID_FRACTION = 0.02

/**
 * The threshold `solidifyMaterials` uses to resolve BLEND → MASK, as opposed to
 * the stricter `binary` classification above.
 *
 * Measured on the wordmark that shipped damaged — `THE EXTRA MILE (Slogan)`,
 * 1944x121, the texture whose letters a customer photographed as missing:
 *
 *     transparent (<=8)   66.38%     the background around the letters
 *     opaque      (>=248) 30.04%     the letters
 *     mid                  3.58%     anti-aliasing on the letter edges
 *
 * 96.42% of pixels sit at one extreme or the other — a cutout by any reading —
 * yet 0.02 called it `graded`, i.e. "sheer fabric, leave it on BLEND", missing
 * by 1.6 points. It is high INK COVERAGE that puts it there: 30% of the strip
 * is ink, so there is a lot of edge. (Do not restate this as "thin strokes have
 * a high perimeter-to-area ratio" — rendered wordmarks of ordinary weight at
 * this size measure 1.2-2.3% mid and were never affected.)
 *
 * WHY THIS IS NOT SIMPLY A WIDER BAND. Raising the mid ceiling alone is unsafe,
 * and a review caught it before it shipped: a uniformly translucent inset
 * covering 2-6% of a map measures 1.95-6.06% mid and would be swept up. It
 * would then be MASKed at 0.5, and since its alpha is ~0.35 EVERY fragment
 * fails the test — the region is not hardened, it is deleted. Pinned by
 * "does NOT hard-discard a small uniformly translucent inset" in
 * pipeline.test.ts.
 *
 * So a cutout must also actually CUT SOMETHING OUT — see
 * CUTOUT_MIN_TRANSPARENT. That is the property that distinguishes the two, and
 * it separates them by a wide margin rather than a fine one.
 *
 * ⚠️ RAISED 0.05 → 0.08 on 2026-08-21, and the owner found the reason by looking at
 * the garment, not by any gate firing: the Cycling-Bib's all-over HALFTONE print
 * measures **6.94% mid**, just past the old ceiling, so it stayed BLEND. With no
 * order-independent transparency in <model-viewer> that print then sorted badly
 * against the geometry behind it, and the reported symptom was
 * *"sometimes it feels like the stitches are see through"* — a strap reading as
 * semi-transparent from some angles. Flipping it to MASK@0.5 fixed it, verified by
 * A/B screenshots at the same camera.
 *
 * A halftone is thousands of small dots, so it has far more edge per unit area
 * than the wordmark this ceiling was last calibrated against (3.58%). 0.08 is the
 * measured 6.94% plus a modest margin — not a round number chosen for comfort.
 *
 * The three measured neighbours, and why this is still safe:
 *
 *     halftone print (a real cutout)   73.33% transparent,  6.94% mid  -> MASK
 *     dobby fabric (genuinely sheer)    0.00% transparent, 21.19% mid  -> BLEND
 *     care label                       77.30% transparent,  8.43% mid  -> BLEND
 *
 * Note the dobby is rejected by CUTOUT_MIN_TRANSPARENT, not by this number — the
 * translucent-inset hazard above is guarded by the OTHER half of the pair, exactly
 * as that paragraph says. This ceiling only decides how much soft edge a genuine
 * cutout may carry.
 */
export const CUTOUT_MID_FRACTION = 0.08

/**
 * A cutout must have real holes in it, not merely soft edges.
 *
 * The distinguishing measurement, and the reason the pair above is safe:
 *
 *     damaged wordmark (a real cutout)     66.38% fully transparent
 *     uniformly translucent inset          0.000%
 *     soft feathered hem                   0.098%
 *
 * Three orders of magnitude, not a judgement call. Anything translucent
 * everywhere and cut out nowhere is sheer material, whatever its mid fraction,
 * and MASK is never the right answer for it.
 */
export const CUTOUT_MIN_TRANSPARENT = 0.05

/** Core PBR texture slots. Extension slots are still counted via `listTextureSlots`. */
const CORE_SLOTS: {
  slot: string
  texture: (material: Material) => Texture | null
  info: (material: Material) => TextureInfo | null
}[] = [
  {
    slot: 'baseColorTexture',
    texture: (m) => m.getBaseColorTexture(),
    info: (m) => m.getBaseColorTextureInfo(),
  },
  {
    slot: 'metallicRoughnessTexture',
    texture: (m) => m.getMetallicRoughnessTexture(),
    info: (m) => m.getMetallicRoughnessTextureInfo(),
  },
  {
    slot: 'normalTexture',
    texture: (m) => m.getNormalTexture(),
    info: (m) => m.getNormalTextureInfo(),
  },
  {
    slot: 'occlusionTexture',
    texture: (m) => m.getOcclusionTexture(),
    info: (m) => m.getOcclusionTextureInfo(),
  },
  {
    slot: 'emissiveTexture',
    texture: (m) => m.getEmissiveTexture(),
    info: (m) => m.getEmissiveTextureInfo(),
  },
]

/**
 * Classify a texture's alpha channel from its actual pixels.
 *
 * Deliberately reads the decoded alpha rather than trusting the material's
 * alphaMode: CLO writes BLEND onto fabric whose texture has no meaningful alpha
 * at all, which is the whole reason solidifyMaterials exists. The bands are
 * generous at both ends (<=8 and >=248) so that anti-aliased decal edges — a
 * few thousand pixels around an outline — do not read as "graded".
 */
export async function profileAlpha(buffer: Uint8Array): Promise<AlphaProfile> {
  const empty = { transparentFraction: 0, opaqueFraction: 0, midFraction: 0, sheerFraction: 0 }
  let image: Sharp
  let metadata: Metadata
  try {
    image = sharp(buffer)
    metadata = await image.metadata()
  } catch {
    return { character: 'unknown', ...empty }
  }
  if (!metadata.hasAlpha) return { character: 'none', ...empty }

  let alpha: Buffer
  try {
    alpha = await image.ensureAlpha().extractChannel(3).raw().toBuffer()
  } catch {
    return { character: 'unknown', ...empty }
  }
  if (alpha.length === 0) return { character: 'none', ...empty }

  let transparent = 0
  let opaque = 0
  // More than half see-through. See `sheerFraction` — this is the measurement that
  // separates an anti-aliased edge from a genuinely translucent panel.
  let sheer = 0
  for (const value of alpha) {
    if (value <= 8) transparent++
    else if (value >= 248) opaque++
    else if (value < 128) sheer++
  }
  const total = alpha.length
  const mid = total - transparent - opaque
  const profile = {
    transparentFraction: transparent / total,
    opaqueFraction: opaque / total,
    midFraction: mid / total,
    sheerFraction: sheer / total,
  }

  // Everything solid: the channel exists but carries nothing. This is the CLO
  // stray-opacity case that BLEND -> OPAQUE is the correct fix for.
  if (profile.opaqueFraction >= 0.999) return { character: 'opaque', ...profile }
  // Almost nothing between the extremes: a hard cutout. BLEND -> MASK preserves
  // it and stays order-independent; BLEND -> OPAQUE would fill the cutout in.
  if (profile.midFraction <= BINARY_MID_FRACTION) return { character: 'binary', ...profile }
  return { character: 'graded', ...profile }
}

/** Filesystem-safe stem for a texture, so dumped PNGs are recognisable. */
function safeStem(index: number, texture: Texture): string {
  const raw = texture.getName() || texture.getURI() || `texture-${index}`
  const stem = raw
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${String(index).padStart(3, '0')}-${stem || 'texture'}`
}

/**
 * Which UV sets a document's materials actually sample, and how its materials
 * are split by alphaMode. Decodes no pixels, so `validate` can report it on
 * every shrink job without paying to decompress a few dozen 2048px textures.
 */
export interface UvSummary {
  /** Every distinct UV set referenced by any material texture, including extension slots. */
  texCoordsInUse: number[]
  /** Core-slot usages sampling a UV set other than 0. */
  usagesOffUv0: TextureUsage[]
  /**
   * Materials sampling TWO OR MORE distinct UV sets — the ones that actually
   * carry the decimation hazard.
   *
   * MEASURED, and it is not what it first looks like. `prune()` runs before
   * decimation and calls `shiftTexCoords`: when a primitive's material samples
   * only ONE UV set, the unused sets are dropped and the survivor is renumbered
   * down to TEXCOORD_0. So a lone `texCoord: 1` in a raw CLO export is
   * self-correcting and harmless.
   *
   * It is when a material samples more than one set — a fabric AO or normal map
   * on UV0 plus a printed graphic on UV1, which is exactly how CLO exports an
   * applied graphic onto a mapped fabric — that prune keeps both, `texCoord: 1`
   * survives into the simplifier, and artwork weighted at zero gets smeared.
   */
  materialsWithMultipleUvSets: string[]
  alphaModeCounts: Record<string, number>
  /** Core-slot usages keyed by texture, for callers that need per-texture rows. */
  usagesByTexture: Map<Texture, TextureUsage[]>
}

/**
 * Walk materials and textures for UV-set and alphaMode facts.
 *
 * `texCoordsInUse` comes from `listTextureInfo`, which sees extension slots
 * (clearcoat, sheen, transmission) as well as core PBR ones, so it stays the
 * authority on "is anything sampling TEXCOORD_1". The per-material rows use the
 * core slots only, because those are the ones that need a material name attached
 * and the ones CLO actually writes.
 */
export function summariseUvSets(document: Document): UvSummary {
  const root = document.getRoot()
  const usagesByTexture = new Map<Texture, TextureUsage[]>()
  const alphaModeCounts: Record<string, number> = {}

  root.listMaterials().forEach((material, materialIndex) => {
    const alphaMode = material.getAlphaMode()
    alphaModeCounts[alphaMode] = (alphaModeCounts[alphaMode] ?? 0) + 1
    const name = material.getName() || `(unnamed material #${materialIndex})`
    for (const { slot, texture: get, info: getInfo } of CORE_SLOTS) {
      const texture = get(material)
      if (!texture) continue
      const usages = usagesByTexture.get(texture) ?? []
      usages.push({
        material: name,
        slot,
        texCoord: getInfo(material)?.getTexCoord() ?? 0,
        alphaMode,
      })
      usagesByTexture.set(texture, usages)
    }
  })

  const texCoordsInUse = [
    ...new Set(
      root.listTextures().flatMap((t) => listTextureInfo(t).map((info) => info.getTexCoord())),
    ),
  ].sort((a, b) => a - b)
  const usagesOffUv0 = [...usagesByTexture.values()].flat().filter((usage) => usage.texCoord !== 0)

  // Per material, across every slot including extensions.
  const materialsWithMultipleUvSets = root
    .listMaterials()
    .filter(
      (material) =>
        new Set(listTextureInfoByMaterial(material).map((i) => i.getTexCoord())).size > 1,
    )
    .map((material, index) => material.getName() || `(unnamed material #${index})`)

  return {
    texCoordsInUse,
    usagesOffUv0,
    materialsWithMultipleUvSets,
    alphaModeCounts,
    usagesByTexture,
  }
}

/**
 * The warning `validate` and `textures` both emit about multi-UV materials.
 * One sentence, one place, so the two commands cannot drift apart.
 *
 * Deliberately keyed on `materialsWithMultipleUvSets` rather than on "any
 * texCoord != 0", because the latter over-reports: `prune()` renumbers a lone
 * second UV set down to TEXCOORD_0 before decimation ever sees it. Warning on
 * that would send the next person chasing a hazard the pipeline already fixes
 * for itself.
 */
export function offUv0Warning(
  materialsWithMultipleUvSets: string[],
  usagesOffUv0: TextureUsage[],
): string | null {
  if (materialsWithMultipleUvSets.length === 0) return null
  const detail = usagesOffUv0.length
    ? ` (${[...new Set(usagesOffUv0.map((u) => `${u.slot}@TEXCOORD_${u.texCoord}`))].sort().join(', ')})`
    : ''
  return (
    `${materialsWithMultipleUvSets.length} material(s) sample more than one UV set${detail}: ` +
    `${materialsWithMultipleUvSets.join(', ')}. Those extra UV sets survive prune() into decimation. ` +
    'Confirm the simplify pass reports every one of them as weighted — an unweighted set means the ' +
    'artwork on it is decimated with no protection. See docs/OPEN-ISSUE-ARTWORK.md (H4).'
  )
}

/** Build the inventory for an already-loaded document. Exported for tests. */
export async function inventoryTextures(
  document: Document,
  file: string,
): Promise<TextureInventory> {
  const root = document.getRoot()
  const textures = root.listTextures()
  const {
    texCoordsInUse,
    usagesOffUv0,
    materialsWithMultipleUvSets,
    alphaModeCounts,
    usagesByTexture,
  } = summariseUvSets(document)

  const records: TextureRecord[] = []
  for (const [index, texture] of textures.entries()) {
    const image = texture.getImage()
    const bytes = image?.byteLength ?? 0
    let width: number | null = null
    let height: number | null = null
    if (image) {
      try {
        const metadata = await sharp(image).metadata()
        width = metadata.width ?? null
        height = metadata.height ?? null
      } catch {
        const size = texture.getSize()
        if (size) [width, height] = size
      }
    }
    const pixels = width && height ? width * height : null

    records.push({
      index,
      name: texture.getName() || '',
      uri: texture.getURI() || '',
      mimeType: texture.getMimeType() || '',
      bytes,
      width,
      height,
      aspectRatio:
        width && height
          ? Math.round((Math.max(width, height) / Math.min(width, height)) * 100) / 100
          : null,
      bytesPerPixel: pixels ? Math.round((bytes / pixels) * 10000) / 10000 : null,
      // `listTextureSlots` sees extension slots too, so it stays the authority on
      // "what is this texture for"; CORE_SLOTS only drives the per-material rows.
      slots: listTextureSlots(texture),
      texCoords: [...new Set(listTextureInfo(texture).map((info) => info.getTexCoord()))].sort(
        (a, b) => a - b,
      ),
      usages: usagesByTexture.get(texture) ?? [],
      alpha: image
        ? await profileAlpha(image)
        : {
            character: 'unknown',
            transparentFraction: 0,
            opaqueFraction: 0,
            midFraction: 0,
            sheerFraction: 0,
          },
      file: null,
    })
  }

  const warnings: string[] = []
  const offUv0 = offUv0Warning(materialsWithMultipleUvSets, usagesOffUv0)
  if (offUv0) warnings.push(offUv0)
  const crushed = records.filter(
    (record) =>
      record.bytesPerPixel !== null &&
      record.bytesPerPixel < CRUSHED_BYTES_PER_PIXEL &&
      record.slots.some((slot) => /baseColor|emissive/i.test(slot)),
  )
  if (crushed.length > 0) {
    warnings.push(
      `${crushed.length}/${records.length} colour texture(s) are stored below ${CRUSHED_BYTES_PER_PIXEL} bytes/pixel ` +
        `(${crushed.map((r) => `#${r.index} ${r.bytesPerPixel}`).join(', ')}) — far past what a clean encode of flat ` +
        'artwork produces. Lossy WebP is 4:2:0 chroma only, which bleeds saturated edges; compare against the raw file.',
    )
  }
  const gradedUnderBlend = records.filter(
    (record) =>
      record.alpha.character === 'binary' && record.usages.some((u) => u.alphaMode === 'BLEND'),
  )
  if (gradedUnderBlend.length > 0) {
    warnings.push(
      `${gradedUnderBlend.length} texture(s) with a hard binary cutout are used by BLEND materials. ` +
        'Forcing those to OPAQUE fills the cutout in; MASK (alphaCutoff 0.5) keeps it and is still order-independent.',
    )
  }

  return {
    file,
    textures: records,
    texCoordsInUse,
    usagesOffUv0,
    materialsWithMultipleUvSets,
    alphaModeCounts,
    warnings,
  }
}

export interface DumpTexturesOptions {
  /** Write each texture out as a PNG alongside the manifest. Default true. */
  images?: boolean
}

/**
 * Read a GLB, write `manifest.json` plus one PNG per texture into `outDir`.
 * Re-encoding to PNG (rather than copying the stored bytes) means every texture
 * opens in any image viewer and two runs can be diffed pixel-for-pixel, which is
 * the point — the stored formats differ between raw and processed files.
 */
export async function dumpTextures(
  file: string,
  outDir: string,
  options: DumpTexturesOptions = {},
): Promise<TextureInventory> {
  const { document } = await readGlb(file)
  const inventory = await inventoryTextures(document, file)

  await mkdir(join(outDir, 'textures'), { recursive: true })
  if (options.images !== false) {
    const textures = document.getRoot().listTextures()
    for (const record of inventory.textures) {
      const image = textures[record.index]?.getImage()
      if (!image) continue
      const relative = join('textures', `${safeStem(record.index, textures[record.index]!)}.png`)
      try {
        await sharp(image).png().toFile(join(outDir, relative))
        record.file = relative
      } catch {
        // KTX2 and other GPU formats are not readable by sharp. The manifest row
        // still carries everything that does not need pixels.
      }
    }
  }

  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  return inventory
}
