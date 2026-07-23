import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

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
