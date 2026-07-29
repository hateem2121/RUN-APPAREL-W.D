/**
 * Copy the Meshopt decoder into public/ so the viewer can serve it from its own
 * origin.
 *
 * WHY. The asset pipeline compresses every production GLB's geometry with
 * EXT_meshopt_compression. <model-viewer> supports that, but only once it has
 * been told where the decoder lives — it ships built-in locations for Draco and
 * KTX2 and leaves Meshopt unset, so without this every real garment fails with
 *   "THREE.GLTFLoader: setMeshoptDecoder must be called before loading
 *    compressed files"
 * and the 3D area stays empty. See Stage.tsx.
 *
 * WHY A COPY RATHER THAN AN IMPORT. model-viewer loads the decoder as a classic
 * <script> and reads the `MeshoptDecoder` global, so it needs the UMD build.
 * `meshoptimizer`'s exports map only offers that file under a `require`
 * condition, so a bundler `?url` import cannot reach it.
 *
 * WHY NOT A CDN. Serving from our own origin keeps the strict CSP
 * (`script-src 'self'`) unchanged and adds no third-party runtime dependency.
 *
 * The file is generated, not committed — it stays locked to whatever version of
 * `meshoptimizer` is installed, which is the same package the pipeline encodes
 * with. Encoder and decoder can never drift apart.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
const dest = join(publicDir, 'meshopt_decoder.js')

// `createRequire` applies the "require" condition, which is the only one that
// exposes the UMD build.
const require = createRequire(import.meta.url)
const src = require.resolve('meshoptimizer/decoder.cjs')

mkdirSync(publicDir, { recursive: true })
copyFileSync(src, dest)
console.log(`[meshopt] ${src} -> ${dest}`)
