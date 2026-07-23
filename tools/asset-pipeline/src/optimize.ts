import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Document, Transform } from '@gltf-transform/core'
import { dedup, draco, meshopt, prune, textureCompress } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { createIO } from './io'

/**
 * Shared optimisation transforms for production GLBs. Both `merge` (multi-
 * colourway) and the single-file `optimize` command build their transform
 * chain here, so the compression policy lives in one tested place.
 *
 * Texture compression is the dominant win for CLO exports — raw CLO GLBs are
 * mostly uncompressed PNG/JPEG maps. WebP (via sharp, already a dependency)
 * shrinks those dramatically with no new native binary and no GPU-format
 * caveats. Geometry compression (Draco or Meshopt) is opt-in and evaluated
 * per product, per the performance brief.
 */

/** 'none' keeps original formats; 'webp' re-encodes every texture to WebP. */
export type TextureCodec = 'none' | 'webp'
/** Geometry codec: Meshopt decodes far faster on low-end mobile; Draco is smaller. */
export type GeometryCodec = 'none' | 'draco' | 'meshopt'

export interface OptimizeOptions {
  /** Texture re-encoding. Default 'none' (callers opt in; the CLI defaults to 'webp'). */
  texture?: TextureCodec
  /** Max texture width/height in px, aspect preserved. Applied only when texture !== 'none'. Default 2048. */
  maxTextureSize?: number
  /** WebP quality 1–100. Default 82. */
  textureQuality?: number
  /** Geometry codec. Default 'none'. */
  geometry?: GeometryCodec
  /** Legacy alias for `geometry: 'draco'`, kept for the existing merge API/tests. */
  draco?: boolean
}

export const DEFAULT_MAX_TEXTURE = 2048
export const DEFAULT_TEXTURE_QUALITY = 82

/** Resolve the geometry codec from the (possibly legacy) options. */
export function resolveGeometry(options: OptimizeOptions): GeometryCodec {
  if (options.geometry) return options.geometry
  return options.draco ? 'draco' : 'none'
}

/**
 * Build the ordered transform chain. Always dedups + prunes; conditionally
 * compresses textures and geometry. Async because Meshopt's encoder must be
 * awaited to ready before use.
 */
export async function buildOptimizeTransforms(options: OptimizeOptions): Promise<Transform[]> {
  const transforms: Transform[] = [dedup(), prune({ keepExtras: true })]

  if (options.texture === 'webp') {
    const max = options.maxTextureSize ?? DEFAULT_MAX_TEXTURE
    transforms.push(
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [max, max],
        quality: options.textureQuality ?? DEFAULT_TEXTURE_QUALITY,
      }),
    )
  }

  const geometry = resolveGeometry(options)
  if (geometry === 'draco') {
    transforms.push(draco())
  } else if (geometry === 'meshopt') {
    await MeshoptEncoder.ready
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }))
  }

  return transforms
}

/** Apply the optimisation chain to an in-memory document (mutates + returns it). */
export async function optimizeDocument(document: Document, options: OptimizeOptions): Promise<Document> {
  const transforms = await buildOptimizeTransforms(options)
  await document.transform(...transforms)
  return document
}

export interface OptimizeResult {
  outputFile: string
  bytesBefore: number
  bytesAfter: number
  textureCount: number
  /** Distinct image mime-types remaining in the output, e.g. ['image/webp']. */
  textureFormats: string[]
  geometry: GeometryCodec
}

/**
 * Optimise a single GLB file → GLB file. Used by the `optimize` CLI command so
 * separate-glb-per-colour products (and any single production GLB) get the same
 * compression as merged ones.
 */
export async function optimizeGlb(
  inputFile: string,
  outputFile: string,
  options: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const io = await createIO()
  const bytesBefore = (await stat(inputFile)).size
  const document = await io.read(inputFile)
  await optimizeDocument(document, options)

  await mkdir(dirname(outputFile), { recursive: true })
  await io.write(outputFile, document)
  const bytesAfter = (await stat(outputFile)).size

  const textures = document.getRoot().listTextures()
  const textureFormats = [...new Set(textures.map((t) => t.getMimeType()).filter(Boolean))].sort()

  return {
    outputFile,
    bytesBefore,
    bytesAfter,
    textureCount: textures.length,
    textureFormats,
    geometry: resolveGeometry(options),
  }
}

export interface ParsedOptimizeArgs {
  input: string | null
  out: string | null
  options: OptimizeOptions
}

/**
 * Parse `optimize` arguments. Pure + exported so the CLI contract is testable.
 * Defaults reflect best practice: WebP textures capped at 2048 px. Geometry
 * compression stays opt-in (`--draco` / `--meshopt`).
 */
export function parseOptimizeArgs(rest: string[]): ParsedOptimizeArgs {
  let input: string | null = null
  let out: string | null = null
  let texture: TextureCodec = 'webp'
  let geometry: GeometryCodec = 'none'
  let maxTextureSize = DEFAULT_MAX_TEXTURE
  let textureQuality = DEFAULT_TEXTURE_QUALITY

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!
    if (arg === '--out') out = rest[++i] ?? null
    else if (arg === '--no-webp' || arg === '--no-textures') texture = 'none'
    else if (arg === '--webp') texture = 'webp'
    else if (arg === '--draco') geometry = 'draco'
    else if (arg === '--meshopt') geometry = 'meshopt'
    else if (arg === '--max-texture') maxTextureSize = Number(rest[++i] ?? DEFAULT_MAX_TEXTURE)
    else if (arg === '--quality') textureQuality = Number(rest[++i] ?? DEFAULT_TEXTURE_QUALITY)
    else if (!arg.startsWith('--')) input = arg
  }

  return { input, out, options: { texture, geometry, maxTextureSize, textureQuality } }
}
