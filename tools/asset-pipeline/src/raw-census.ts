/**
 * What arrived from CLO, measured before anything touches it (fix plan Rank 13; audits
 * CLO-02, CLO-03, F1-05, F1-06, F1-07, FX-02, FAB-03, FAB-05, FAB-07, GEO-04).
 *
 * The report used to describe only what the pipeline DID. Ten audit findings were about
 * what it was GIVEN, and every one was invisible from the report: 73% of a 1.54 GB upload
 * was the same fabric picture exported once per colourway (F1-05, FX-02); textures far
 * beyond any screen (CLO-03); a garment that was 46% thread by material name while the
 * report said 0% because it only read mesh names (F1-07); cloth pieces exported with no
 * weave map (FAB-03); prints whose finish and opacity differed from what the designer set
 * on screen (FAB-05, FAB-07). The owner can fix all of these in CLO — but only if the
 * report says so, per garment, in their words.
 *
 * Runs FIRST in the optimize chain, on the raw document, so what it reports is what CLO
 * wrote. Every measurement here is a fact about the file; the warnings are advice, never
 * a refusal — an export that trips all of them still produces a garment.
 */
import { createHash } from 'node:crypto'
import type { Document, Material, Texture, Transform } from '@gltf-transform/core'
import { createTransform } from '@gltf-transform/functions'
import sharp from 'sharp'
import {
  ARTWORK_MAX_UV_SPAN,
  findArtworkTexturesByGeometry,
  isThreadOrHardwareName,
} from './artwork-geometry'
import { classifyMaterialName } from './material-class'
import { isArtworkMaterialByName } from './texture-artwork'
import { DEFAULT_STITCH_PATTERN } from './topstitch'
import { materialsOf, uvSpanInPatternSpace } from './uv-remap'

/**
 * Above this a picture is bigger than the largest cap the pipeline ships (artwork 4096;
 * the owner's export guide says 1024 trim / 2048 fabric / 4096 artwork). The robot
 * resizes it, but the upload carried every byte.
 */
export const OVERSIZED_TEXTURE_PX = 4096

/** Duplicate picture bytes above this share of all picture bytes earn a warning. */
export const DUPLICATE_WARNING_FRACTION = 0.25

/**
 * Thread BY MATERIAL NAME — `Default Topstitch_3195` on a mesh called `Cloth_mesh` is
 * thread the mesh-name pattern (`DEFAULT_STITCH_PATTERN`) never sees. ARISAN measured
 * 46.55% thread this way and 0% the other (audit F1-07).
 */
export const THREAD_MATERIAL_NAME = /(^|[^a-z])(topstitch|stitching|stitch|thread|seam)([^a-z]|$)/i

export interface RawImageCensus {
  total: number
  /** Bytes of every embedded picture. */
  bytes: number
  /** Pictures with distinct bytes. */
  unique: number
  duplicateBytes: number
  /** duplicateBytes / bytes, 0 when there are no pictures. */
  duplicateFraction: number
  /** The pictures that occur more than once: how many copies, and the bytes those copies cost. */
  duplicates: { name: string; copies: number; bytes: number }[]
}

export interface OversizedTexture {
  name: string
  width: number
  height: number
  bytes: number
  materials: string[]
}

export interface ArtworkFinish {
  material: string
  roughness: number
  metallic: number
  hasMrTexture: boolean
  /** baseColorFactor[3] — what CLO wrote for the print's opacity. */
  opacityFactor: number
  /** The picture's strongest alpha, 0..1; null when it could not be decoded; 1 without an alpha channel. */
  peakAlpha: number | null
}

export interface RawCensus {
  images: RawImageCensus
  oversized: OversizedTexture[]
  thread: {
    triangles: number
    byMesh: number
    byMaterial: number
    byMeshFraction: number
    byMaterialFraction: number
  }
  /** Garment-fabric materials drawn by a panel with no normal map: they render flat. */
  fabricWithoutWeave: string[]
  artworkFinish: ArtworkFinish[]
}

function triangleCount(prim: {
  getIndices(): { getCount(): number } | null
  getAttribute(s: string): { getCount(): number } | null
}): number {
  const indices = prim.getIndices()
  if (indices) return Math.floor(indices.getCount() / 3)
  return Math.floor((prim.getAttribute('POSITION')?.getCount() ?? 0) / 3)
}

/** Every material slot that can hold a texture, so a picture can be named by its material. */
function textureSlots(material: Material): Texture[] {
  return [
    material.getBaseColorTexture(),
    material.getNormalTexture(),
    material.getMetallicRoughnessTexture(),
    material.getOcclusionTexture(),
    material.getEmissiveTexture(),
  ].filter((t): t is Texture => t !== null)
}

async function dimensions(image: Uint8Array): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height } = await sharp(image).metadata()
    return width && height ? { width, height } : null
  } catch {
    return null
  }
}

async function peakAlphaOf(image: Uint8Array): Promise<number | null> {
  try {
    const { channels } = await sharp(image).stats()
    if (channels.length < 4) return 1
    const alpha = channels[3]
    return alpha ? alpha.max / 255 : 1
  } catch {
    return null
  }
}

export async function measureRawDocument(document: Document): Promise<RawCensus> {
  const root = document.getRoot()

  // Pictures: bytes, and which are the same bytes.
  const textures = root.listTextures()
  const materialsByTexture = new Map<Texture, string[]>()
  for (const material of root.listMaterials()) {
    for (const texture of textureSlots(material)) {
      const list = materialsByTexture.get(texture) ?? []
      list.push(material.getName() || '(unnamed)')
      materialsByTexture.set(texture, list)
    }
  }
  const byHash = new Map<string, { name: string; copies: number; bytes: number }>()
  const images: RawImageCensus = {
    total: 0,
    bytes: 0,
    unique: 0,
    duplicateBytes: 0,
    duplicateFraction: 0,
    duplicates: [],
  }
  const oversized: OversizedTexture[] = []
  for (const [index, texture] of textures.entries()) {
    const image = texture.getImage()
    if (!image) continue
    images.total++
    images.bytes += image.byteLength
    const label =
      texture.getName() || texture.getURI() || materialsByTexture.get(texture)?.[0] || `#${index}`
    const hash = createHash('sha256').update(image).digest('hex')
    const seen = byHash.get(hash)
    if (seen) {
      seen.copies++
      seen.bytes += image.byteLength
      images.duplicateBytes += image.byteLength
    } else {
      byHash.set(hash, { name: label, copies: 1, bytes: 0 })
      images.unique++
    }
    const size = await dimensions(image)
    if (size && Math.max(size.width, size.height) > OVERSIZED_TEXTURE_PX) {
      oversized.push({
        name: label,
        width: size.width,
        height: size.height,
        bytes: image.byteLength,
        materials: [...new Set(materialsByTexture.get(texture) ?? [])],
      })
    }
  }
  images.duplicateFraction = images.bytes > 0 ? images.duplicateBytes / images.bytes : 0
  images.duplicates = [...byHash.values()]
    .filter((d) => d.copies > 1)
    .sort((a, b) => b.bytes - a.bytes)
  oversized.sort((a, b) => b.bytes - a.bytes)

  // Thread, both ways.
  const thread = {
    triangles: 0,
    byMesh: 0,
    byMaterial: 0,
    byMeshFraction: 0,
    byMaterialFraction: 0,
  }
  const drawn = new Set<Material>()
  const panelSpan = new Map<Material, number>()
  for (const mesh of root.listMeshes()) {
    const meshIsStitch = DEFAULT_STITCH_PATTERN.test(mesh.getName() || '')
    for (const prim of mesh.listPrimitives()) {
      const tris = triangleCount(prim)
      thread.triangles += tris
      if (meshIsStitch) thread.byMesh += tris
      const materials = materialsOf(prim)
      if (materials.some((m) => THREAD_MATERIAL_NAME.test(m.getName() || ''))) {
        thread.byMaterial += tris
      }
      const span = uvSpanInPatternSpace(prim)
      for (const material of materials) {
        drawn.add(material)
        if (span !== null) panelSpan.set(material, Math.max(panelSpan.get(material) ?? 0, span))
      }
    }
  }
  thread.byMeshFraction = thread.triangles > 0 ? thread.byMesh / thread.triangles : 0
  thread.byMaterialFraction = thread.triangles > 0 ? thread.byMaterial / thread.triangles : 0

  // Cloth without a weave map, and every print's finish.
  const artworkByGeometry = findArtworkTexturesByGeometry(document)
  const fabricWithoutWeave: string[] = []
  const artworkFinish: ArtworkFinish[] = []
  const peakCache = new Map<Texture, number | null>()
  for (const material of drawn) {
    const name = material.getName() || '(unnamed)'
    const baseColor = material.getBaseColorTexture()
    const isArtwork =
      isArtworkMaterialByName(material) || (baseColor !== null && artworkByGeometry.has(baseColor))
    if (isArtwork) {
      let peakAlpha: number | null = null
      if (baseColor) {
        if (!peakCache.has(baseColor)) {
          const image = baseColor.getImage()
          peakCache.set(baseColor, image ? await peakAlphaOf(image) : null)
        }
        peakAlpha = peakCache.get(baseColor) ?? null
      }
      artworkFinish.push({
        material: name,
        roughness: material.getRoughnessFactor(),
        metallic: material.getMetallicFactor(),
        hasMrTexture: material.getMetallicRoughnessTexture() !== null,
        opacityFactor: material.getBaseColorFactor()[3] ?? 1,
        peakAlpha,
      })
      continue
    }
    if (isThreadOrHardwareName(name) || classifyMaterialName(name) === 'hardware') continue
    // Cloth: a fabric by name, or a panel-sized mapping (a print spans ≤ ARTWORK_MAX_UV_SPAN).
    const span = panelSpan.get(material) ?? 0
    const isCloth = classifyMaterialName(name) === 'fabric' || span > ARTWORK_MAX_UV_SPAN
    if (isCloth && !material.getNormalTexture()) fabricWithoutWeave.push(name)
  }
  artworkFinish.sort((a, b) => a.material.localeCompare(b.material))
  fabricWithoutWeave.sort()

  return { images, oversized, thread, fabricWithoutWeave, artworkFinish }
}

export interface RawCensusOptions {
  onResult?: (census: RawCensus) => void
}

/** The transform form, for the optimize chain: measures, reports, changes nothing. */
export function censusRawDocument(options: RawCensusOptions = {}): Transform {
  return createTransform('censusRawDocument', async (document: Document): Promise<void> => {
    options.onResult?.(await measureRawDocument(document))
  })
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`

/**
 * The owner-facing lines. `stitchMeshesMatched` is what the `--stitch` pass actually
 * matched this run, so the thread line says both what the file holds and what the
 * dial reached (audit GEO-04: the dial matched nothing and said nothing).
 */
export function describeRawCensus(
  census: RawCensus,
  stitchMeshesMatched: number | null = null,
): string[] {
  const lines: string[] = []
  const { images, oversized, thread } = census

  if (images.total > 0) {
    const dup =
      images.duplicateFraction >= DUPLICATE_WARNING_FRACTION
        ? ` ⚠️ ${pct(images.duplicateFraction)} of the picture bytes are DUPLICATES (${mb(images.duplicateBytes)}): ` +
          'CLO wrote the same picture once per colourway. Export with one shared picture per fabric ' +
          `(the export guide) and the upload shrinks by about that much. Largest: ${images.duplicates
            .slice(0, 3)
            .map((d) => `${d.name} ×${d.copies} (${mb(d.bytes)} extra)`)
            .join(', ')}.`
        : images.duplicateBytes > 0
          ? ` ${images.duplicates.length} picture(s) appear more than once (${mb(images.duplicateBytes)} of duplicates).`
          : ''
    lines.push(
      `Raw export pictures: ${images.total} (${images.unique} distinct), ${mb(images.bytes)} on disk.${dup}`,
    )
  }
  if (oversized.length) {
    lines.push(
      `⚠️ Pictures beyond ${OVERSIZED_TEXTURE_PX} px in the export: ${oversized
        .slice(0, 6)
        .map(
          (o) =>
            `${o.name} ${o.width}×${o.height} (${mb(o.bytes)}) on ${o.materials.slice(0, 2).join(', ') || 'no material'}`,
        )
        .join('; ')}${oversized.length > 6 ? `; +${oversized.length - 6} more` : ''}. ` +
        'The robot resizes them (fabric to 2048, artwork to 4096), but the upload carried every byte — ' +
        'the guide sizes are 1024 for trim, 2048 for fabric, 4096 for artwork.',
    )
  }
  if (thread.triangles > 0) {
    const matched =
      stitchMeshesMatched === null
        ? ''
        : stitchMeshesMatched > 0
          ? ` The --stitch pass matched ${stitchMeshesMatched} mesh(es).`
          : thread.byMaterialFraction > 0.05
            ? ' ⚠️ The --stitch pass matched NO mesh: this thread lives on ordinary meshes under a stitch MATERIAL, so it took the garment budget.'
            : ' The --stitch pass matched no mesh (nothing to match).'
    lines.push(
      `Thread: ${pct(thread.byMeshFraction)} of the triangles by mesh name (Topstitch_*), ` +
        `${pct(thread.byMaterialFraction)} by material name.${matched}`,
    )
  }
  if (census.fabricWithoutWeave.length) {
    lines.push(
      `Cloth pieces with no weave (normal) map, so they render flat: ${census.fabricWithoutWeave
        .slice(0, 8)
        .join(
          ', ',
        )}${census.fabricWithoutWeave.length > 8 ? ` +${census.fabricWithoutWeave.length - 8} more` : ''}. ` +
        'Add the fabric’s normal map in CLO if the weave should show.',
    )
  }
  if (census.artworkFinish.length) {
    const finish = (f: ArtworkFinish) => {
      const gloss = f.hasMrTexture
        ? 'finish from its own map'
        : `roughness ${f.roughness.toFixed(2)}`
      const opacity = `opacity ${pct(f.opacityFactor)}`
      const alpha = f.peakAlpha === null ? 'alpha unreadable' : `ink to ${pct(f.peakAlpha)} alpha`
      const flag = f.opacityFactor < 0.99 ? ' ⚠️ translucent as exported' : ''
      return `${f.material}: ${gloss}, ${opacity}, ${alpha}${flag}`
    }
    lines.push(
      `Print finishes as exported (what the viewer will show, not what CLO showed): ${census.artworkFinish
        .slice(0, 12)
        .map(finish)
        .join(
          '; ',
        )}${census.artworkFinish.length > 12 ? `; +${census.artworkFinish.length - 12} more` : ''}. ` +
        'A faint print must be baked into the PNG — CLO does not export a graphic’s opacity map.',
    )
  }
  return lines
}
