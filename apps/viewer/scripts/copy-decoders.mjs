/**
 * Copy every geometry/texture decoder <model-viewer> may need into public/, so
 * the viewer serves all of them from its own origin.
 *
 * WHY AT ALL. The asset pipeline compresses production GLBs with
 * EXT_meshopt_compression. <model-viewer> supports that, but only once it has
 * been told where the decoder lives — it ships built-in locations for Draco and
 * KTX2 and leaves Meshopt unset, so without this every real garment fails with
 *   "THREE.GLTFLoader: setMeshoptDecoder must be called before loading
 *    compressed files"
 * and the 3D area stays empty. That reached production on 2026-07-29. See
 * Stage.tsx.
 *
 * WHY ALL THREE, NOT JUST MESHOPT. model-viewer's built-in Draco and KTX2
 * locations point at gstatic.com, which meant the strict CSP had to allow a
 * third-party origin and the "served from our own origin" rationale was only
 * ever true for one of the three codecs. `--ktx2` is documented as the
 * production texture target, so that gap was going to matter. Self-hosting all
 * three lets connect-src drop gstatic entirely.
 *
 * WHY A COPY RATHER THAN AN IMPORT. model-viewer loads these as classic scripts
 * and reads globals, so they must be plain files at a known URL, not bundled
 * modules.
 *
 * VERSION COUPLING. The Draco and Basis files come from `three`, pinned to the
 * exact version @google/model-viewer depends on — model-viewer embeds that same
 * three, and a decoder from a different build is the kind of mismatch that fails
 * only at runtime, on a real model. If model-viewer's three range changes, this
 * pin must move with it. The Meshopt decoder comes from `meshoptimizer`, the
 * same package the pipeline encodes with, so encoder and decoder cannot drift.
 *
 * The files are generated, not committed (see .gitignore).
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
const require = createRequire(import.meta.url)

/**
 * Where three keeps the web builds of the decoders GLTFLoader expects.
 *
 * Resolved through the `./examples/jsm/*` export rather than
 * `three/package.json`, which three's exports map does not expose. The wasm
 * files sit next to the js and are not individually exported, so the directory
 * is derived once from a file that is.
 */
const dracoEntry = require.resolve('three/examples/jsm/libs/draco/gltf/draco_decoder.js')
const threeLibs = dirname(dirname(dracoEntry))

/**
 * Enforce the version coupling the docblock above describes.
 *
 * That comment has said "this pin must move with it" since the decoders were
 * self-hosted, and nothing checked it. A `@google/model-viewer` bump whose
 * three range moved would keep building, keep passing every test, and ship
 * Draco/Basis decoders from a different three build than the one model-viewer
 * has compiled in — a mismatch that surfaces only at runtime, only on a real
 * compressed garment, and looks exactly like the blank-stage bug of 2026-07-29.
 * The seeded fixtures use Meshopt, so the e2e suite would not catch it either.
 *
 * Compared on major.minor: three's `^0.183.0` is `>=0.183.0 <0.184.0`, and 0.x
 * minors are where three makes breaking changes.
 */
function assertThreeMatchesModelViewer() {
  // three's exports map does not expose ./package.json (which is why the decoder
  // path above is resolved through a file that IS exported), so read it off disk.
  let dir = threeLibs
  let installed
  while (dir !== parse(dir).root) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (pkg.name === 'three') {
        installed = pkg.version
        break
      }
    } catch {
      // keep walking up
    }
    dir = dirname(dir)
  }
  const mv = require('@google/model-viewer/package.json')
  const range = mv.peerDependencies?.three ?? mv.dependencies?.three
  if (!installed || !range) {
    throw new Error(
      `[decoders] Could not determine the three version coupling (installed=${installed}, ` +
        `model-viewer wants=${range}). Refusing to build rather than shipping decoders that ` +
        'might not match — see the VERSION COUPLING note in this file.',
    )
  }
  const minorOf = (v) => v.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.')
  if (minorOf(installed) !== minorOf(range)) {
    throw new Error(
      `[decoders] three ${installed} is installed, but @google/model-viewer ${mv.version} wants ` +
        `${range}. The Draco and Basis decoders copied from three MUST come from the same build ` +
        'model-viewer embeds; a mismatch fails only at runtime on a real compressed model. ' +
        "Update `three` in apps/viewer/package.json to match model-viewer's range.",
    )
  }
  console.log(`[decoders] three ${installed} matches model-viewer ${mv.version} (${range})`)
}

assertThreeMatchesModelViewer()

const copies = [
  // `createRequire` applies the "require" condition, the only one that exposes
  // meshoptimizer's UMD build — a bundler `?url` import cannot reach it.
  { from: require.resolve('meshoptimizer/decoder.cjs'), to: join(publicDir, 'meshopt_decoder.js') },

  // GLTFLoader's DRACOLoader expects this exact trio under one directory.
  ...['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'].map((file) => ({
    from: join(threeLibs, 'gltf', file),
    to: join(publicDir, 'draco', file),
  })),

  // KTX2Loader expects the Basis transcoder pair under one directory.
  ...['basis_transcoder.js', 'basis_transcoder.wasm'].map((file) => ({
    from: join(threeLibs, '..', 'basis', file),
    to: join(publicDir, 'basis', file),
  })),
]

for (const { from, to } of copies) {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)

  // Assert each file landed and is non-empty BEFORE the build proceeds.
  //
  // A missing decoder looks exactly like the bug this script exists to prevent:
  // a blank 3D stage on every real garment. Because these files are generated
  // and gitignored, their absence is invisible in the repo and — until this
  // check — was invisible at build time too. Failing loudly costs nothing.
  const { size } = statSync(to)
  if (size === 0) {
    throw new Error(
      `[decoders] ${to} was written but is empty. Without a working decoder every compressed ` +
        'GLB fails to load and the 3D stage renders blank. Refusing to build.',
    )
  }
  console.log(`[decoders] ${from} -> ${to} (${size} bytes)`)
}
