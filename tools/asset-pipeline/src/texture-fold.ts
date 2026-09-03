/**
 * Phone graphics memory: fold what is constant, count what is left (fix plan Rank 10;
 * audit TEX-04, TEX-05, TEX-06, TEX-07, F1-12, F2-05, LIVE-07).
 *
 * A picture is compressed on the wire and UNCOMPRESSED on the GPU: 4 bytes per pixel
 * plus a third for mipmaps, whatever the file weighs. The live skinsuit's 2.4 MB of
 * textures become 203 MB; the bib's 11.6 MB become 245 MB; the browser measured 255 MB
 * and 317 MB uploaded before the customer touched anything, and iOS Safari drops the
 * WebGL context past roughly 256 MB. Two of the skinsuit's textures were near-constant
 * — a 2048² roughness map holding eight values and an 853×142 normal map that is one
 * colour — and cost 22 MB for two numbers a material factor already expresses.
 *
 * FOLD, THEN COUNT, THEN SAY IT. A map whose every channel is constant within a
 * measured band becomes the equivalent factor on each material that used it and is
 * dropped; the estimate after encoding is printed beside the file size, split by what
 * the memory buys (artwork / fabric / shading maps); and a garment over the phone budget
 * gets a warning, never a silent publish.
 */
import type { Document, Material, Texture } from '@gltf-transform/core'
import { createTransform } from '@gltf-transform/functions'
import sharp from 'sharp'
import { findArtworkTexturesByGeometry } from './artwork-geometry'
import { srgbToLinear } from './colour-name'
import { isArtworkMaterialByName, isArtworkTexture } from './texture-artwork'

/**
 * The band inside which a channel counts as constant. Measured 2026-08-28 on the live
 * skinsuit (audit TEX-06): the roughness map t9 spans G 213–221 with stdev 0.80 and B
 * 0–3 with stdev 0.48 — eight values in 4 million pixels; the flat normal map t13 is one
 * colour, stdev 0. The map that DOES carry detail (t16) reads stdev 49.9. A weave sits
 * far above 1.0; a genuinely flat map sits far below it.
 */
export const CONSTANT_TEXTURE_MAX_STDEV = 1.0
/** And no channel may swing more than this many levels, whatever the stdev says. */
export const CONSTANT_TEXTURE_MAX_RANGE = 8
/**
 * Where iOS Safari lets go of the WebGL context. The audit's figure (fix plan Group 9);
 * a garment past it is reported, not refused — the number is an estimate and the real
 * test is a phone.
 */
export const PHONE_GPU_BUDGET_BYTES = 256 * 1024 * 1024
/** Uncompressed RGBA plus a full mip chain: what a decoded picture costs on the GPU. */
export const gpuBytesFor = (width: number, height: number): number =>
  Math.round(width * height * 4 * (4 / 3))

export interface FoldedTexture {
  index: number
  name: string
  width: number
  height: number
  gpuBytes: number
  /** Which slots it was folded out of, and what carries the value now. */
  into: string[]
}

export interface FoldResult {
  folded: FoldedTexture[]
  /** Constant maps left in place because no factor can express them (with the reason). */
  kept: { name: string; reason: string }[]
  measured: number
}

interface ChannelStats {
  mean: number
  min: number
  max: number
  stdev: number
}

async function channelStats(image: Uint8Array): Promise<ChannelStats[] | null> {
  try {
    const { data, info } = await sharp(image)
      .resize({ width: 256, height: 256, fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const n = info.width * info.height
    const out: ChannelStats[] = []
    for (let c = 0; c < 4; c++) {
      let sum = 0
      let min = 255
      let max = 0
      for (let i = c; i < data.length; i += 4) {
        const v = data[i] ?? 0
        sum += v
        if (v < min) min = v
        if (v > max) max = v
      }
      const mean = sum / n
      let sq = 0
      for (let i = c; i < data.length; i += 4) sq += ((data[i] ?? 0) - mean) ** 2
      out.push({ mean, min, max, stdev: Math.sqrt(sq / n) })
    }
    return out
  } catch {
    return null
  }
}

const isConstant = (s: ChannelStats): boolean =>
  s.stdev <= CONSTANT_TEXTURE_MAX_STDEV && s.max - s.min <= CONSTANT_TEXTURE_MAX_RANGE

/** Every (material, slot) binding of a texture. Explicit getters, no symbol walking. */
function bindingsOf(document: Document, texture: Texture): { material: Material; slot: string }[] {
  const out: { material: Material; slot: string }[] = []
  for (const material of document.getRoot().listMaterials()) {
    if (material.getBaseColorTexture() === texture) out.push({ material, slot: 'baseColorTexture' })
    if (material.getMetallicRoughnessTexture() === texture)
      out.push({ material, slot: 'metallicRoughnessTexture' })
    if (material.getNormalTexture() === texture) out.push({ material, slot: 'normalTexture' })
    if (material.getOcclusionTexture() === texture) out.push({ material, slot: 'occlusionTexture' })
    if (material.getEmissiveTexture() === texture) out.push({ material, slot: 'emissiveTexture' })
  }
  return out
}

/**
 * Fold every near-constant texture into the factors of the materials that use it.
 *
 * What each slot can express without a picture: baseColor and emissive carry a colour
 * factor (the texture is sRGB, the factor linear — converted); metallicRoughness carries
 * roughness in G and metal in B as plain factors; a normal map that is FLAT (128,128,255)
 * says nothing and goes; a constant occlusion of 1 says nothing and goes. A constant
 * tilted normal or a constant partial occlusion has no factor to fold into and is KEPT,
 * named, with the reason — folding it would change the shading.
 *
 * Printed artwork is never folded, whatever it measures: a print is never constant, and
 * the classifier that says so is the one the compression budget trusts.
 */
export function foldConstantTextures(options: { onResult?: (result: FoldResult) => void } = {}) {
  return createTransform('foldConstantTextures', async (document: Document): Promise<void> => {
    const result: FoldResult = { folded: [], kept: [], measured: 0 }
    const artworkByGeometry = findArtworkTexturesByGeometry(document)
    const textures = document.getRoot().listTextures()
    for (const [index, texture] of textures.entries()) {
      const image = texture.getImage()
      if (!image) continue
      const bindings = bindingsOf(document, texture)
      if (bindings.length === 0) continue
      // Three ways a texture is a print, none of them optional: the material's name
      // (CLO names materials, never textures), the UV span, and the picture itself.
      if (
        bindings.some((b) => isArtworkMaterialByName(b.material)) ||
        artworkByGeometry.has(texture) ||
        (await isArtworkTexture(texture))
      )
        continue
      const stats = await channelStats(image)
      if (!stats) continue
      result.measured++
      const [r, g, b, a] = stats as [ChannelStats, ChannelStats, ChannelStats, ChannelStats]
      const rgbConstant = isConstant(r) && isConstant(g) && isConstant(b)
      if (!rgbConstant) continue
      const name = texture.getName() || texture.getURI() || `#${index}`
      const { width = 0, height = 0 } = await sharp(image)
        .metadata()
        .catch(() => ({}) as { width?: number; height?: number })
      const into: string[] = []
      let blocked: string | null = null
      for (const { material, slot } of bindings) {
        switch (slot) {
          case 'baseColorTexture': {
            if (!isConstant(a)) {
              blocked = 'base colour with a varying alpha'
              break
            }
            const factor = material.getBaseColorFactor()
            material.setBaseColorFactor([
              (factor[0] ?? 1) * srgbToLinear(r.mean / 255),
              (factor[1] ?? 1) * srgbToLinear(g.mean / 255),
              (factor[2] ?? 1) * srgbToLinear(b.mean / 255),
              (factor[3] ?? 1) * (a.mean / 255),
            ])
            material.setBaseColorTexture(null)
            into.push(`${material.getName() || '(unnamed)'}.baseColorFactor`)
            break
          }
          case 'metallicRoughnessTexture': {
            material.setRoughnessFactor(material.getRoughnessFactor() * (g.mean / 255))
            material.setMetallicFactor(material.getMetallicFactor() * (b.mean / 255))
            material.setMetallicRoughnessTexture(null)
            into.push(`${material.getName() || '(unnamed)'}.roughness/metallicFactor`)
            break
          }
          case 'normalTexture': {
            const flat = Math.abs(r.mean - 128) <= 2 && Math.abs(g.mean - 128) <= 2 && b.mean >= 250
            if (!flat) {
              blocked = 'a constant but tilted normal map — no factor expresses it'
              break
            }
            material.setNormalTexture(null)
            into.push(`${material.getName() || '(unnamed)'} (flat normal map removed)`)
            break
          }
          case 'occlusionTexture': {
            if (r.mean < 250) {
              blocked = 'a constant partial occlusion — no factor expresses it'
              break
            }
            material.setOcclusionTexture(null)
            into.push(`${material.getName() || '(unnamed)'} (white occlusion removed)`)
            break
          }
          case 'emissiveTexture': {
            const factor = material.getEmissiveFactor()
            material.setEmissiveFactor([
              (factor[0] ?? 1) * srgbToLinear(r.mean / 255),
              (factor[1] ?? 1) * srgbToLinear(g.mean / 255),
              (factor[2] ?? 1) * srgbToLinear(b.mean / 255),
            ])
            material.setEmissiveTexture(null)
            into.push(`${material.getName() || '(unnamed)'}.emissiveFactor`)
            break
          }
        }
        if (blocked) break
      }
      if (blocked) {
        result.kept.push({ name, reason: blocked })
        continue
      }
      // Every binding is gone: the texture and its image can go (prune drops the bytes).
      if (bindingsOf(document, texture).length === 0) texture.dispose()
      result.folded.push({ index, name, width, height, gpuBytes: gpuBytesFor(width, height), into })
    }
    options.onResult?.(result)
  })
}

export interface GpuTexture {
  name: string
  width: number
  height: number
  bytes: number
  kind: 'artwork' | 'fabric' | 'shading'
}

export interface GpuEstimate {
  totalBytes: number
  artworkBytes: number
  fabricBytes: number
  shadingBytes: number
  overBudget: boolean
  textures: GpuTexture[]
}

/**
 * What the finished file will cost a phone's GPU, per texture and in total — from the
 * encoded images' dimensions, which is all that decides it. Runs LAST, after every pass
 * that resizes, folds or de-duplicates, so it counts what ships.
 */
export function estimateGpuTextures(options: { onResult?: (result: GpuEstimate) => void } = {}) {
  return createTransform('estimateGpuTextures', async (document: Document): Promise<void> => {
    const artworkByGeometry = findArtworkTexturesByGeometry(document)
    const seen = new Set<Uint8Array>()
    const estimate: GpuEstimate = {
      totalBytes: 0,
      artworkBytes: 0,
      fabricBytes: 0,
      shadingBytes: 0,
      overBudget: false,
      textures: [],
    }
    for (const [index, texture] of document.getRoot().listTextures().entries()) {
      const image = texture.getImage()
      if (!image || seen.has(image)) continue
      seen.add(image)
      let width = 0
      let height = 0
      try {
        ;({ width = 0, height = 0 } = await sharp(image).metadata())
      } catch {
        continue
      }
      const bindings = bindingsOf(document, texture)
      const shading =
        bindings.length > 0 &&
        bindings.every((b) => b.slot !== 'baseColorTexture' && b.slot !== 'emissiveTexture')
      const artwork =
        !shading &&
        (bindings.some((b) => isArtworkMaterialByName(b.material)) ||
          artworkByGeometry.has(texture) ||
          (await isArtworkTexture(texture)))
      const kind: GpuTexture['kind'] = artwork ? 'artwork' : shading ? 'shading' : 'fabric'
      const bytes = gpuBytesFor(width, height)
      estimate.textures.push({
        name: texture.getName() || texture.getURI() || `#${index}`,
        width,
        height,
        bytes,
        kind,
      })
      estimate.totalBytes += bytes
      if (kind === 'artwork') estimate.artworkBytes += bytes
      else if (kind === 'shading') estimate.shadingBytes += bytes
      else estimate.fabricBytes += bytes
    }
    estimate.overBudget = estimate.totalBytes > PHONE_GPU_BUDGET_BYTES
    options.onResult?.(estimate)
  })
}

export const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`
