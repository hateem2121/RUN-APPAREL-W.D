import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

let ioPromise: Promise<NodeIO> | null = null

/**
 * Shared NodeIO with every Khronos extension registered plus Draco
 * codecs, so raw CLO exports read reliably whatever they contain.
 */
export function createIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    io.registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    })
    return io
  })()
  return ioPromise
}
