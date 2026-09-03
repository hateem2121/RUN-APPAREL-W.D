import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions'
import { quantize } from '@gltf-transform/functions'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compareRenders } from './compare'
import { renderViews } from './render'
import { remapUvRanges, UV_QUANTIZE_BITS } from './uv-remap'

/**
 * THE REMAP, RENDERED — BOTH WAYS (fix plan Rank 11, audit CT-08).
 *
 * The unit tests prove the arithmetic: every vertex samples the same texel through the
 * composed transform. This proves the thing that arithmetic cannot — that three.js in a
 * real browser applies `KHR_texture_transform` the way the spec's shader does, per map,
 * after our composition — and, first, that the compare step can SEE a wrong UV at all.
 * A checkerboard tiled four times across a quad: with the remap composed, the render must
 * match the original; with the coordinates moved and the materials left alone (the
 * negative control), the same quad shows a tenth of one tile and must differ wildly. A
 * harness that reported "identical" for both would be measuring nothing (2026-08-29).
 *
 * ⚠️ NEEDS CHROMIUM — skips loudly without one, like instruments.browser.test.ts.
 */

const chromiumAvailable = (() => {
  try {
    const path = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? chromium.executablePath()
    return existsSync(path)
  } catch {
    return false
  }
})()

/** A quad in pattern space: UVs −20..20 with a CLO-style transform of scale 0.1. */
async function fixture(): Promise<Document> {
  const document = new Document()
  const buffer = document.createBuffer()
  const checker = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .raw()
    .toBuffer()
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const dark = (x + y) % 2 === 0
      const i = (y * 8 + x) * 3
      checker[i] = dark ? 20 : 235
      checker[i + 1] = dark ? 20 : 60
      checker[i + 2] = dark ? 120 : 60
    }
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

  const position = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]))
    .setBuffer(buffer)
  const normal = document
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer)
  const uv = document
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([-20, -20, 20, -20, 20, 20, -20, 20]))
    .setBuffer(buffer)
  const indices = document
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer)
  const prim = document
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(indices)
    .setMaterial(material)
  const mesh = document.createMesh('panel').addPrimitive(prim)
  document.createScene('scene').addChild(document.createNode('panel').setMesh(mesh))
  return document
}

const VIEW = [{ name: 'front', orbit: '0deg 90deg 105%', fieldOfView: '30deg' }]

describe.skipIf(!chromiumAvailable)('the UV remap, rendered in a real browser (Rank 11)', () => {
  it('composed: identical to the original; control (materials untouched): plainly different', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'uv-remap-'))
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

    const original = await fixture()
    const originalFile = join(dir, 'original.glb')
    await writeFile(originalFile, await io.writeBinary(original))

    // Remapped AND quantized at the shipped precision: what a garment actually carries.
    const remapped = await fixture()
    await remapped.transform(
      remapUvRanges(),
      quantize({ pattern: /^TEXCOORD_/, quantizeTexcoord: UV_QUANTIZE_BITS }),
    )
    const remappedFile = join(dir, 'remapped.glb')
    await writeFile(remappedFile, await io.writeBinary(remapped))

    const control = await fixture()
    await control.transform(remapUvRanges({ composeMaterials: false }))
    const controlFile = join(dir, 'control.glb')
    await writeFile(controlFile, await io.writeBinary(control))

    const size = { width: 256, height: 256, views: VIEW, timeoutMs: 120_000 }
    await renderViews(originalFile, join(dir, 'original'), size)
    await renderViews(remappedFile, join(dir, 'remapped'), size)
    await renderViews(controlFile, join(dir, 'control'), size)

    const same = await compareRenders(
      join(dir, 'original'),
      join(dir, 'remapped'),
      join(dir, 'same.png'),
    )
    const wrong = await compareRenders(
      join(dir, 'original'),
      join(dir, 'control'),
      join(dir, 'wrong.png'),
    )
    const changed = (r: Awaited<ReturnType<typeof compareRenders>>) =>
      r.diffs[0]?.changedFraction ?? Number.NaN

    // The instrument sees a wrong UV: a tenth of a tile against sixteen tiles.
    expect(changed(wrong)).toBeGreaterThan(0.2)
    // And the shipped path is the original to well under the closure line (0.05%).
    expect(changed(same)).toBeLessThan(0.0005)
  }, 300_000)
})
