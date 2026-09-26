import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createIO, readGlb } from './io'
import { PLACEHOLDER_COLOURWAYS, buildPlaceholderTee } from './placeholders'
import {
  readJsonChunk,
  repairDeadTextures,
  stripDeadTextureReferences,
} from './repair-dead-textures'

/**
 * Rebuild a GLB around a modified JSON chunk, recomputing every length.
 *
 * Only the FIXTURE needs this. The repair itself never rebuilds — it pads the
 * shortened JSON back to its original length precisely so the BIN chunk cannot
 * move. Here the JSON grows, so the container has to be reassembled.
 */
function rebuildGlb(original: Uint8Array, json: Record<string, unknown>): Uint8Array {
  const chunk = readJsonChunk(original)
  if (!chunk) throw new Error('fixture is not a GLB')
  const bin = original.subarray(chunk.start + chunk.length)
  let text = new TextEncoder().encode(JSON.stringify(json))
  if (text.byteLength % 4 !== 0) {
    const padded = new Uint8Array(text.byteLength + (4 - (text.byteLength % 4)))
    padded.fill(0x20)
    padded.set(text)
    text = padded
  }
  const out = new Uint8Array(12 + 8 + text.byteLength + bin.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, out.byteLength, true)
  view.setUint32(12, text.byteLength, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(text, 20)
  out.set(bin, 20 + text.byteLength)
  return out
}

/**
 * A garment carrying the exact defect six of the 28 raw exports carry: ONE extra
 * texture with no `source`, named CLO's default "Texture", REFERENCED as a
 * material's `metallicRoughnessTexture`.
 *
 * ⚠️ THE REFERENCE IS THE WHOLE POINT. An unreferenced source-less texture never
 * reaches `ReaderContext.setTextureInfo` and reads fine, so a fixture that merely
 * appended a dead entry would pass against completely unfixed code.
 */
async function buildGarmentWithDeadTexture(): Promise<Uint8Array> {
  const io = await createIO()
  const document = await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!)
  const bytes = await io.writeBinary(document)
  const chunk = readJsonChunk(bytes)
  if (!chunk) throw new Error('placeholder did not serialise as a GLB')
  const json = chunk.json as {
    textures?: unknown[]
    samplers?: unknown[]
    materials?: { pbrMetallicRoughness?: Record<string, unknown> }[]
  }
  // ⚠️ THE SAMPLER MUST CARRY magFilter/minFilter, AND A FIRST ATTEMPT USED `{}`.
  // With an empty sampler gltf-transform skips the filter calls and dies later on
  // `setWrapS` instead — a fixture that breaks the reader, but not the way the real
  // files break it, so the assertion pinning the real message passed against the
  // wrong failure. These are sampler 0 verbatim from ARISAN SPORTS BRA
  // (9729 = LINEAR, 9987 = LINEAR_MIPMAP_LINEAR); all six exports match.
  json.samplers ??= []
  json.samplers.push({ magFilter: 9729, minFilter: 9987 })
  const samplerIndex = json.samplers.length - 1
  json.textures ??= []
  json.textures.push({ name: 'Texture', sampler: samplerIndex })
  const deadIndex = json.textures.length - 1
  const material = json.materials?.[0]
  if (!material) throw new Error('placeholder has no materials')
  material.pbrMetallicRoughness ??= {}
  material.pbrMetallicRoughness.metallicRoughnessTexture = { index: deadIndex }
  return rebuildGlb(bytes, json as unknown as Record<string, unknown>)
}

describe('stripDeadTextureReferences', () => {
  it('removes the reference and leaves every index alone', () => {
    // Renumbering is the danger: delete textures[1] and a material pointing at 2
    // silently acquires the picture from 3 — wrong artwork across the garment.
    const json = {
      textures: [{ source: 0 }, { name: 'Texture', sampler: 0 }, { source: 1 }],
      materials: [
        {
          pbrMetallicRoughness: {
            metallicRoughnessTexture: { index: 1 },
            baseColorTexture: { index: 2 },
          },
        },
      ],
    }
    const repair = stripDeadTextureReferences(json)
    expect(repair.deadTextures).toEqual([1])
    expect(repair.referencesRemoved).toBe(1)
    expect(repair.slots).toEqual(['metallicRoughnessTexture'])
    expect(json.textures).toHaveLength(3)
    expect(json.materials[0]!.pbrMetallicRoughness.baseColorTexture).toEqual({ index: 2 })
    expect(json.materials[0]!.pbrMetallicRoughness.metallicRoughnessTexture).toBeUndefined()
  })

  it('leaves a healthy document completely untouched', () => {
    const json = {
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    }
    const before = JSON.stringify(json)
    const repair = stripDeadTextureReferences(json)
    expect(repair.referencesRemoved).toBe(0)
    expect(JSON.stringify(json)).toBe(before)
  })

  it('accepts a texture whose image comes from a codec extension', () => {
    // KHR_texture_basisu and EXT_texture_webp carry `source` inside the extension,
    // so reading only the top-level key would condemn every KTX2/WebP texture.
    const json = {
      textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    }
    expect(stripDeadTextureReferences(json).deadTextures).toEqual([])
  })
})

describe('repairDeadTextures', () => {
  it('keeps the JSON chunk the same length, so no binary offset moves', async () => {
    const broken = await buildGarmentWithDeadTexture()
    const before = readJsonChunk(broken)!
    const { bytes, repair } = repairDeadTextures(broken)
    const after = readJsonChunk(bytes)!
    expect(repair.referencesRemoved).toBe(1)
    // The container is byte-identical in size; only JSON bytes changed.
    expect(bytes.byteLength).toBe(broken.byteLength)
    expect(after.length).toBe(before.length)
    expect(after.start).toBe(before.start)
    // And the BIN chunk really is untouched.
    const binBefore = broken.subarray(before.start + before.length)
    const binAfter = bytes.subarray(after.start + after.length)
    expect(Buffer.from(binAfter).equals(Buffer.from(binBefore))).toBe(true)
    // 60s, like the other tests here that run a real encoder. Measured on CI on
    // 2026-09-26: 1.2-2.1 s under pnpm 10, 2.5-5.0 s under pnpm 12, whose `pnpm -r`
    // no longer holds apps/cms and apps/viewer back until this package finishes, so
    // all three share one runner. Two of these timed out on the 5 s default.
  }, 60_000)
})

describe('readGlb', () => {
  it('⚠️ NEGATIVE CONTROL — the unrepaired file genuinely breaks the reader', async () => {
    /*
     * Without this the whole suite could pass against a file the reader never had
     * trouble with. The message is the one six real exports produce, and it names
     * neither the garment nor the texture: `Cannot read properties of null
     * (reading 'setMagFilter')` from ReaderContext.setTextureInfo.
     */
    const io = await createIO()
    const broken = await buildGarmentWithDeadTexture()
    await expect(io.readBinary(broken)).rejects.toThrow(/setMagFilter/)
  })

  it('reads a garment that the raw reader cannot, and reports what it removed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repair-'))
    const file = join(dir, 'ARISAN-like.glb')
    await writeFile(file, await buildGarmentWithDeadTexture())

    const { document, repair } = await readGlb(file)
    expect(repair.referencesRemoved).toBe(1)
    // Every one of the six real cases is this slot and only this slot. It matters:
    // the material keeps its own metallicFactor/roughnessFactor, so nothing about
    // the render changes — which would NOT be true of baseColorTexture.
    expect(repair.slots).toEqual(['metallicRoughnessTexture'])
    expect(document.getRoot().listMaterials().length).toBeGreaterThan(0)
  })

  it('leaves a healthy garment alone and reports no repair', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repair-ok-'))
    const file = join(dir, 'healthy.glb')
    const io = await createIO()
    await io.write(file, await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!))

    const { document, repair } = await readGlb(file)
    expect(repair.referencesRemoved).toBe(0)
    expect(repair.deadTextures).toEqual([])
    expect(document.getRoot().listMaterials().length).toBeGreaterThan(0)
  })
})
