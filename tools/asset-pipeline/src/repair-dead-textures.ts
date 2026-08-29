import { open, readFile } from 'node:fs/promises'

/**
 * Make a CLO export readable when it declares a texture that points at no image.
 *
 * THE DEFECT, measured 2026-08-27 across all 28 raw exports. **Six of them carry
 * exactly one texture entry with no `source`** — `{"name":"Texture","sampler":0}`,
 * CLO's default placeholder name — and in every one `textures === images + 1`:
 *
 * ```
 * ARISAN SPORTS BRA        textures 133  images 132   texture[5]
 * CAPSULE CORE HOODIE      textures 115  images 114   texture[2]
 * KINETIC SPLATTER BRA     textures  87  images  86   texture[5]
 * Minecut Motion           textures 125  images 124   texture[5]
 * STRUCTURE POLO SET       textures  34  images  33   texture[31]
 * TERRA ACTIVE ZIP         textures  90  images  89   texture[5]
 * ```
 *
 * gltf-transform's READER dereferences it and dies on `Cannot read properties of
 * null (reading 'setMagFilter')` at `ReaderContext.setTextureInfo` — reproduced in
 * **17 ms**, before any transform runs, which is why no pipeline stage can fix it
 * and the repair has to happen on the bytes. The message names neither the garment
 * nor the texture, so this reads as a pipeline bug and is not one.
 *
 * ⚠️ IT IS NOT AN ORPHAN — assuming so would have been wrong. Every one is
 * REFERENCED, by 1 to 50 materials. What makes removal safe is narrower and was
 * measured: in all six garments the only slot it ever fills is
 * `metallicRoughnessTexture`, never `baseColorTexture`, and **every** material
 * using it already declares `metallicFactor: 0`. A texture with no image cannot be
 * sampled anyway, so dropping the reference leaves the material on factors it
 * already carries and changes the render by nothing.
 *
 * ⚠️ THE REFERENCES ARE REMOVED, NEVER THE TEXTURE ENTRIES. Deleting `textures[5]`
 * would renumber every later index, so a material pointing at 6 would silently
 * acquire the picture from 7 — a wrong-artwork bug across the whole garment.
 * Nothing is renumbered here; `prune()` drops the now-unreferenced entry later.
 *
 * ⚠️ THE JSON CHUNK IS PADDED BACK TO ITS ORIGINAL BYTE LENGTH. Removing keys makes
 * it shorter, and a shorter chunk would move the BIN chunk and invalidate every
 * buffer offset in the file. Trailing spaces are valid JSON whitespace, so the
 * chunk length, the total length and all binary offsets stay exactly as they were
 * — on a 601 MB export nothing is rewritten but the header.
 *
 * Verified on all six before any of this was written: each reads, and each yields
 * the material count recorded in `docs/GARMENT-CATALOGUE-BASELINE.md` — 168, 101,
 * 83, 128, 32, 141.
 */

/** GLB container layout: 12-byte header, then length-prefixed chunks. */
const GLB_HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_CHUNK_TYPE = 0x4e4f534a
/** JSON chunks are space-padded per the glTF spec, not zero-padded. */
const JSON_PAD_BYTE = 0x20

export interface DeadTextureRepair {
  /** Indices of textures that resolve to no image. */
  deadTextures: number[]
  /** How many material texture slots pointed at one. */
  referencesRemoved: number
  /** Every distinct slot name that did, e.g. `metallicRoughnessTexture`. */
  slots: string[]
}

/** A texture resolves to no image if neither it nor its codec extensions name one. */
function isDead(texture: Record<string, unknown>): boolean {
  if (typeof texture.source === 'number') return false
  const extensions = texture.extensions as Record<string, { source?: number }> | undefined
  if (!extensions) return true
  return !Object.values(extensions).some((e) => typeof e?.source === 'number')
}

/**
 * Strip every reference to a source-less texture from a parsed glTF JSON chunk.
 *
 * Mutates `json` and reports what it did. Exported separately from the byte-level
 * work so the decision can be tested without building a GLB.
 */
export function stripDeadTextureReferences(json: Record<string, unknown>): DeadTextureRepair {
  const textures = (json.textures ?? []) as Record<string, unknown>[]
  const dead = new Set(
    textures
      .map((t, i) => [i, t] as const)
      .filter(([, t]) => isDead(t))
      .map(([i]) => i),
  )
  const repair: DeadTextureRepair = { deadTextures: [...dead], referencesRemoved: 0, slots: [] }
  if (!dead.size) return repair

  const slots = new Set<string>()
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      const reference = value as { index?: number } | null
      if (key.endsWith('Texture') && reference && dead.has(reference.index as number)) {
        delete record[key]
        repair.referencesRemoved++
        slots.add(key)
        continue
      }
      walk(value)
    }
  }
  walk(json.materials)
  repair.slots = [...slots].sort()
  return repair
}

export interface RepairedGlb {
  /** The GLB bytes, repaired in place. Identical to the input when nothing was wrong. */
  bytes: Uint8Array
  repair: DeadTextureRepair
}

/** Read a GLB's JSON chunk without decoding anything else. Three positional reads. */
export function readJsonChunk(
  bytes: Uint8Array,
): { json: Record<string, unknown>; start: number; length: number } | null {
  if (bytes.byteLength < GLB_HEADER_BYTES + CHUNK_HEADER_BYTES) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) return null // 'glTF'
  const length = view.getUint32(GLB_HEADER_BYTES, true)
  if (view.getUint32(GLB_HEADER_BYTES + 4, true) !== JSON_CHUNK_TYPE) return null
  const start = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES
  if (start + length > bytes.byteLength) return null
  const text = new TextDecoder().decode(bytes.subarray(start, start + length))
  return { json: JSON.parse(text) as Record<string, unknown>, start, length }
}

/**
 * Repair a GLB's bytes in place, keeping the JSON chunk exactly the same length.
 *
 * Throws only if the shortened JSON somehow grew, which cannot happen while this
 * only ever deletes keys — asserted rather than assumed, because silently moving
 * the BIN chunk would corrupt every accessor in the file.
 */
export function repairDeadTextures(bytes: Uint8Array): RepairedGlb {
  const chunk = readJsonChunk(bytes)
  const empty: DeadTextureRepair = { deadTextures: [], referencesRemoved: 0, slots: [] }
  if (!chunk) return { bytes, repair: empty }

  const repair = stripDeadTextureReferences(chunk.json)
  if (!repair.referencesRemoved) return { bytes, repair }

  const encoded = new TextEncoder().encode(JSON.stringify(chunk.json))
  if (encoded.byteLength > chunk.length) {
    throw new Error(
      `Repaired JSON chunk grew from ${chunk.length} to ${encoded.byteLength} bytes. ` +
        'Padding in place would move the BIN chunk and invalidate every buffer offset.',
    )
  }
  const repaired = bytes.slice()
  repaired.set(encoded, chunk.start)
  repaired.fill(JSON_PAD_BYTE, chunk.start + encoded.byteLength, chunk.start + chunk.length)
  return { bytes: repaired, repair }
}

/**
 * Read a GLB from disk, repairing it only if it needs it.
 *
 * The scan reads the header and JSON chunk alone, so a healthy 1.25 GB export
 * costs the same as a 5 MB one and never enters memory whole. Only a file that
 * actually carries a dead texture pays for the full buffer.
 */
export async function readGlbBytesRepaired(path: string): Promise<RepairedGlb> {
  const bytes = new Uint8Array(await readFile(path))
  return repairDeadTextures(bytes)
}

/**
 * Would this file need repairing? Reads the header and JSON chunk ONLY.
 *
 * Three positional reads and no decode, exactly as `describeGlb` does — so the
 * 1.25 GB Cycling Bib costs the same as the 5 MB PRO-PILE and never enters memory
 * whole. That is the point: 22 of 28 exports are healthy and must not pay the cost
 * of a defect six of them have.
 *
 * Deliberately runs the REAL strip against a throwaway parse rather than a second
 * "does it look broken?" predicate. Two implementations of the same question drift,
 * and the one that drifts silently here is the one that decides whether a garment
 * can be processed at all.
 */
export async function scanForDeadTextures(path: string): Promise<DeadTextureRepair> {
  const empty: DeadTextureRepair = { deadTextures: [], referencesRemoved: 0, slots: [] }
  const handle = await open(path, 'r')
  try {
    const head = Buffer.alloc(GLB_HEADER_BYTES + CHUNK_HEADER_BYTES)
    const { bytesRead } = await handle.read(head, 0, head.byteLength, 0)
    if (bytesRead < head.byteLength) return empty
    if (head.readUInt32LE(0) !== 0x46546c67) return empty
    if (head.readUInt32LE(GLB_HEADER_BYTES + 4) !== JSON_CHUNK_TYPE) return empty
    const length = head.readUInt32LE(GLB_HEADER_BYTES)
    const json = Buffer.alloc(length)
    await handle.read(json, 0, length, GLB_HEADER_BYTES + CHUNK_HEADER_BYTES)
    return stripDeadTextureReferences(JSON.parse(json.toString('utf8')) as Record<string, unknown>)
  } catch {
    // A file this cannot parse is not a file this can repair. Let the real reader
    // produce the error, which will be about the actual problem.
    return empty
  } finally {
    await handle.close()
  }
}
