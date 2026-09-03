#!/usr/bin/env node
/**
 * What would the fabric PICTURE name each colourway? — the table behind texture
 * sampling in variant-colour.ts (audit CG-06, F1-03, F2-04).
 *
 * CLO writes a white baseColorFactor and puts the colour in the texture on four of
 * the five FIXED GLBs, so the factor-only reader returns White at low confidence and
 * the CMS blanks the name. This prints, per colourway: the dominant fabric material
 * the reader picked, its texture's dominant sRGB colour (sharp stats(), 4096-bin
 * histogram), the palette name for it, the mean per-channel stdev (how busy the
 * picture is), whether the texture is opaque, and whether the SAME texture object is
 * bound for every colourway (in which case it cannot tell them apart).
 *
 * Usage (from tools/asset-pipeline):
 *   NODE_OPTIONS=--max-old-space-size=12288 npx tsx scripts/fabric-texture-census.mjs <file.glb> [...]
 */
import { basename } from 'node:path'
import sharp from 'sharp'
import { readGlb } from '../src/io.ts'
import { nameColour } from '../src/colour-name.ts'
import { readVariantColours } from '../src/variant-colour.ts'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) {
  console.error('usage: fabric-texture-census.mjs <file.glb> [...]')
  process.exit(1)
}
const hex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase()

console.log(
  [
    'file',
    'variant',
    'material',
    'factorHex',
    'factorName',
    'conf',
    'texture',
    'dominant',
    'textureName',
    'texConf',
    'dE',
    'stdev',
    'opaque',
    'shared',
  ].join('\t'),
)
for (const file of files) {
  // readGlb, not io.read: six raw exports declare a texture pointing at no image and
  // crash a plain read (see io.ts); the pipeline itself reads through the repair.
  const { document } = await readGlb(file)
  const materials = document.getRoot().listMaterials()
  const colours = readVariantColours(document)
  const textures = colours.map(
    (c) =>
      materials
        .find((m) => (m.getName() || '(unnamed material)') === c.sampledMaterial)
        ?.getBaseColorTexture() ?? null,
  )
  const distinct = new Set(textures.filter(Boolean)).size
  const cache = new Map()
  for (const [i, c] of colours.entries()) {
    const texture = textures[i]
    let row = ['-', '-', '-', '-', '-', '-', '-']
    if (texture) {
      const image = texture.getImage()
      let s = cache.get(texture)
      if (!s && image) {
        try {
          const st = await sharp(image).stats()
          s = {
            dominant: hex(st.dominant),
            stdev: st.channels.slice(0, 3).reduce((a, ch) => a + ch.stdev, 0) / 3,
            opaque: st.isOpaque,
          }
        } catch (e) {
          s = { error: String(e).slice(0, 40) }
        }
        cache.set(texture, s)
      }
      if (s?.dominant) {
        const n = nameColour(s.dominant)
        row = [
          `#${document.getRoot().listTextures().indexOf(texture)}`,
          s.dominant,
          n.name,
          n.confidence,
          n.deltaE.toFixed(1),
          s.stdev.toFixed(1),
          String(s.opaque),
          colours.length > 1 && distinct === 1 ? 'ALL' : 'no',
        ]
      } else
        row = [
          `#${document.getRoot().listTextures().indexOf(texture)}`,
          s?.error ?? 'undecodable',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
        ]
    }
    console.log(
      [
        basename(file).slice(0, 28),
        c.variantId,
        c.sampledMaterial.slice(0, 26),
        c.hex,
        c.name,
        c.confidence,
        ...row,
      ].join('\t'),
    )
  }
}
