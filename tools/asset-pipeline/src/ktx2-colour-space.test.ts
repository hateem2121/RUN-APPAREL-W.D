import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document } from '@gltf-transform/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createIO } from './io'
import { optimizeGlb } from './optimize'

/**
 * THE KTX2 FILES SAY WHICH COLOUR SPACE THEY ARE IN (fix plan Rank 14; audits TEX-03,
 * TEX-12). Read from the bytes the encoder wrote, not from the option passed: a KTX2
 * header carries a Data Format Descriptor whose transfer-function byte is 2 for sRGB
 * and 1 for linear (KDF 1.3 §5), and a viewer decodes the picture through it. Until
 * 2026-09-03 no pass set the flag, so colour and data maps were stamped alike — the
 * 2026-08-21 KTX2 refusal ("the white bib panel came out grey and blotchy") had the
 * transfer function as its variable, not the codec.
 */

/** KTX2: `dfdByteOffset` is the uint32 at byte 48; the descriptor's transfer function sits 14 bytes in. */
function transferFunction(ktx2: Uint8Array): number {
  const view = new DataView(ktx2.buffer, ktx2.byteOffset, ktx2.byteLength)
  const identifier = Array.from(ktx2.slice(1, 7), (b) => String.fromCharCode(b)).join('')
  expect(identifier, 'not a KTX2 file').toBe('KTX 20')
  const dfdByteOffset = view.getUint32(48, true)
  return ktx2[dfdByteOffset + 4 + 4 + 4 + 2] as number
}
const KHR_DF_TRANSFER_LINEAR = 1
const KHR_DF_TRANSFER_SRGB = 2

async function png(r: number, g: number, b: number): Promise<Uint8Array> {
  const raw = Buffer.alloc(16 * 16 * 3)
  for (let i = 0; i < 16 * 16; i++) {
    raw[i * 3] = (r + i) % 256
    raw[i * 3 + 1] = g
    raw[i * 3 + 2] = b
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width: 16, height: 16, channels: 3 } })
      .png()
      .toBuffer(),
  )
}

describe('KTX2 colour space per slot', () => {
  it('writes sRGB into the colour maps and linear into the normal and roughness maps', async () => {
    const document = new Document()
    const buffer = document.createBuffer()
    const colour = document
      .createTexture('colour')
      .setImage(await png(200, 40, 40))
      .setMimeType('image/png')
    const normal = document
      .createTexture('normal')
      .setImage(await png(128, 128, 255))
      .setMimeType('image/png')
    const mr = document
      .createTexture('mr')
      .setImage(await png(0, 200, 0))
      .setMimeType('image/png')
    const material = document
      .createMaterial('FABRIC 1')
      .setBaseColorTexture(colour)
      .setNormalTexture(normal)
      .setMetallicRoughnessTexture(mr)
    const prim = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        document
          .createAccessor()
          .setType('VEC3')
          .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]))
          .setBuffer(buffer),
      )
      .setAttribute(
        'TEXCOORD_0',
        document
          .createAccessor()
          .setType('VEC2')
          .setArray(new Float32Array([0, 0, 1, 0, 1, 1]))
          .setBuffer(buffer),
      )
      .setMaterial(material)
    document
      .createScene('s')
      .addChild(document.createNode('n').setMesh(document.createMesh('m').addPrimitive(prim)))
    const dir = await mkdtemp(join(tmpdir(), 'ktx2-'))
    const io = await createIO()
    const src = join(dir, 'src.glb')
    const out = join(dir, 'out.glb')
    await io.write(src, document)

    await optimizeGlb(src, out, { texture: 'ktx2', maxTextureSize: 16 })

    const reread = await io.read(out)
    const byName = new Map(
      reread
        .getRoot()
        .listTextures()
        .map((t) => [t.getName(), t]),
    )
    for (const [name, expected] of [
      ['colour', KHR_DF_TRANSFER_SRGB],
      ['normal', KHR_DF_TRANSFER_LINEAR],
      ['mr', KHR_DF_TRANSFER_LINEAR],
    ] as const) {
      const texture = byName.get(name)
      expect(texture?.getMimeType(), name).toBe('image/ktx2')
      expect(transferFunction(texture?.getImage() as Uint8Array), `${name} transfer function`).toBe(
        expected,
      )
    }
  }, 120_000)
})
