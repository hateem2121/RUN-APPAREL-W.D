#!/usr/bin/env node
/**
 * How much DETAIL does each print's ink carry? — the table behind the "artwork
 * crushed" warning (audit F2-07).
 *
 * The warning judged bytes per pixel, then bytes per INK pixel, and both cried wolf
 * on a flat one-colour logo: WebP keeps alpha near-lossless and a single flat colour
 * costs almost nothing, so a crisp 1462x1069 mark stores in 15 KB (ARMOR, 2026-09-02,
 * looked at). Bytes can only be "too few" for ink that has something to lose —
 * colour edges inside the ink. This prints, per artwork texture: bytes, ink share,
 * bytes per ink pixel, the share of ink pixels sitting on a COLOUR edge (neighbouring
 * ink differs in luminance by > 24/255), distinct ink colours (16 levels/channel),
 * and bytes per colour-edge pixel — so the rule is drawn from the owner's files and
 * from deliberately crushed controls, not by feel.
 *
 * Usage (from tools/asset-pipeline):
 *   NODE_OPTIONS=--max-old-space-size=12288 npx tsx scripts/artwork-detail-census.mjs <file.glb> [...]
 */
import { basename } from 'node:path'
import sharp from 'sharp'
import { createIO } from '../src/io.ts'
import { classifyArtworkForGate } from '../src/texture-artwork.ts'
import { findArtworkTexturesByGeometry } from '../src/artwork-geometry.ts'

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) {
  console.error('usage: artwork-detail-census.mjs <file.glb> [...]')
  process.exit(1)
}
const INK_ALPHA = 8
const EDGE_LUMA = 24

console.log(
  [
    'file',
    'material',
    'size',
    'KB',
    'ink%',
    'bpp',
    'bpp/ink',
    'colourEdge%ofInk',
    'colours',
    'B/edgePx',
    'alphaEdge%ofInk',
  ].join('\t'),
)
for (const file of files) {
  const io = await createIO()
  const document = await io.read(file)
  const root = document.getRoot()
  const byGeometry = findArtworkTexturesByGeometry(document)
  const cache = new Map()
  const seen = new Set()
  for (const material of root.listMaterials()) {
    const texture = material.getBaseColorTexture()
    if (!texture || seen.has(texture)) continue
    const gate = await classifyArtworkForGate(material, cache)
    if (!gate.artwork && !byGeometry.has(texture)) continue
    seen.add(texture)
    const image = texture.getImage()
    if (!image) continue
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const W = info.width
    const H = info.height
    const pixels = W * H
    let ink = 0
    let colourEdges = 0
    let alphaEdges = 0
    const colours = new Set()
    const luma = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (data[i * 4 + 3] <= INK_ALPHA) continue
        ink++
        colours.add(
          ((data[i * 4] >> 4) << 8) | ((data[i * 4 + 1] >> 4) << 4) | (data[i * 4 + 2] >> 4),
        )
        const l = luma(i)
        let colourEdge = false
        let alphaEdge = false
        for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
          if (j < 0) continue
          if (data[j * 4 + 3] <= INK_ALPHA) alphaEdge = true
          else if (Math.abs(luma(j) - l) > EDGE_LUMA) colourEdge = true
        }
        if (colourEdge) colourEdges++
        if (alphaEdge) alphaEdges++
      }
    }
    const bytes = image.byteLength
    console.log(
      [
        basename(file),
        (material.getName() || '(unnamed)').slice(0, 40),
        `${W}x${H}`,
        (bytes / 1024).toFixed(1),
        ((100 * ink) / pixels).toFixed(1),
        (bytes / pixels).toFixed(4),
        ink ? (bytes / ink).toFixed(4) : '-',
        ink ? ((100 * colourEdges) / ink).toFixed(2) : '-',
        colours.size,
        colourEdges ? (bytes / colourEdges).toFixed(2) : '-',
        ink ? ((100 * alphaEdges) / ink).toFixed(2) : '-',
      ].join('\t'),
    )
  }
}
