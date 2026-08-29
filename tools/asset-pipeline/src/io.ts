import type { Document } from '@gltf-transform/core'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import {
  type DeadTextureRepair,
  readGlbBytesRepaired,
  scanForDeadTextures,
} from './repair-dead-textures'

let ioPromise: Promise<NodeIO> | null = null

/**
 * Shared NodeIO with every Khronos extension registered plus the Draco and
 * Meshopt codecs, so raw CLO exports read reliably whatever they contain, and
 * both geometry-compression paths can be written on output.
 */
export function createIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    await MeshoptDecoder.ready
    await MeshoptEncoder.ready
    io.registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    })
    return io
  })()
  return ioPromise
}

export interface ReadGlbResult {
  document: Document
  /** What had to be repaired to make the file readable. Empty for a healthy export. */
  repair: DeadTextureRepair
}

/**
 * Read a GLB, repairing a CLO export that declares a texture pointing at no image.
 *
 * ⚠️ SIX OF 28 RAW EXPORTS CANNOT BE READ AT ALL WITHOUT THIS, and the failure names
 * nothing useful: `Cannot read properties of null (reading 'setMagFilter')` from
 * `ReaderContext.setTextureInfo`, in 17 ms, before any transform runs. That is 21%
 * of the catalogue, and it reads as a pipeline bug rather than a defect in the file.
 * See `repair-dead-textures.ts` for the measurement and why removing the reference
 * is safe.
 *
 * The healthy path is unchanged: the scan reads only the header and JSON chunk, and
 * a file with nothing wrong goes through `io.read(path)` exactly as before, never
 * holding the whole export in memory. Only the six pay for the buffer.
 */
export async function readGlb(path: string): Promise<ReadGlbResult> {
  const io = await createIO()
  const scan = await scanForDeadTextures(path)
  if (!scan.referencesRemoved) return { document: await io.read(path), repair: scan }
  const { bytes, repair } = await readGlbBytesRepaired(path)
  return { document: await io.readBinary(bytes), repair }
}
