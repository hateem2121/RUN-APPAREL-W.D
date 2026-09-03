/**
 * THE BOTH-WAYS PROOF FOR THE UV REMAP, WITH ITS NUMBERS (fix plan Rank 11, audit CT-08).
 *
 * `src/uv-remap.browser.test.ts` asserts these; this prints them for the record. A
 * checkerboard tiled four times across a quad (UVs −20..20 with a CLO-style transform of
 * scale 0.1) is rendered three ways: as exported, remapped into 0..1 and quantized at the
 * shipped 16 bits, and with the coordinates moved but the materials left alone — the
 * negative control that a blind compare step would also call "identical".
 *
 *   npx tsx scripts/uv-remap-proof.mts [--out <dir>]
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions'
import { quantize } from '@gltf-transform/functions'
import sharp from 'sharp'
import { compareRenders } from '../src/compare.ts'
import { renderViews } from '../src/render.ts'
import { remapUvRanges, UV_QUANTIZE_BITS } from '../src/uv-remap.ts'

const outIdx = process.argv.indexOf('--out')
const dir =
  outIdx === -1
    ? await mkdtemp(join(tmpdir(), 'uv-remap-proof-'))
    : (process.argv[outIdx + 1] as string)
await mkdir(dir, { recursive: true })

async function fixture(): Promise<Document> {
  const document = new Document()
  const buffer = document.createBuffer()
  const checker = Buffer.alloc(8 * 8 * 3)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const dark = (x + y) % 2 === 0
      const i = (y * 8 + x) * 3
      checker[i] = dark ? 20 : 235
      checker[i + 1] = dark ? 20 : 60
      checker[i + 2] = dark ? 120 : 60
    }
  const png = await sharp(checker, { raw: { width: 8, height: 8, channels: 3 } })
    .resize(256, 256, { kernel: 'nearest' })
    .png()
    .toBuffer()
  const texture = document
    .createTexture('checker')
    .setImage(new Uint8Array(png))
    .setMimeType('image/png')
  const material = document
    .createMaterial('FABRIC')
    .setBaseColorTexture(texture)
    .setRoughnessFactor(1)
  const transform = document
    .createExtension(KHRTextureTransform)
    .createTransform()
    .setOffset([0.3, 0.7])
    .setScale([0.1, 0.1])
  material.getBaseColorTextureInfo()?.setExtension(KHRTextureTransform.EXTENSION_NAME, transform)
  const acc = (type: 'VEC3' | 'VEC2' | 'SCALAR', array: Float32Array | Uint16Array) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const prim = document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      acc('VEC3', new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0])),
    )
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array([-20, -20, 20, -20, 20, 20, -20, 20])))
    .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
    .setMaterial(material)
  const mesh = document.createMesh('panel').addPrimitive(prim)
  document.createScene('scene').addChild(document.createNode('panel').setMesh(mesh))
  return document
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const views = [{ name: 'front', orbit: '0deg 90deg 105%', fieldOfView: '30deg' }]
const size = { width: 512, height: 512, views, timeoutMs: 120_000 }
const cases: [string, (d: Document) => Promise<void>][] = [
  ['original', async () => {}],
  [
    'remapped-16bit',
    async (d) => {
      await d.transform(
        remapUvRanges(),
        quantize({ pattern: /^TEXCOORD_/, quantizeTexcoord: UV_QUANTIZE_BITS }),
      )
    },
  ],
  [
    'remapped-12bit',
    async (d) => {
      await d.transform(remapUvRanges(), quantize({ pattern: /^TEXCOORD_/, quantizeTexcoord: 12 }))
    },
  ],
  [
    'control-materials-untouched',
    async (d) => {
      await d.transform(remapUvRanges({ composeMaterials: false }))
    },
  ],
]
for (const [name, prepare] of cases) {
  const document = await fixture()
  await prepare(document)
  const file = join(dir, `${name}.glb`)
  await writeFile(file, await io.writeBinary(document))
  await renderViews(file, join(dir, name), size)
}
console.log(`renders in ${dir}`)
for (const name of cases.slice(1).map(([n]) => n)) {
  const r = await compareRenders(
    join(dir, 'original'),
    join(dir, name),
    join(dir, `${name}-vs-original.png`),
  )
  const d = r.diffs[0]!
  console.log(
    `  ${name.padEnd(30)} vs original: changed ${(d.changedFraction * 100).toFixed(3)}%  mean ${d.meanDelta}  max ${d.maxDelta}`,
  )
}
