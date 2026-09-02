#!/usr/bin/env node
/**
 * How soft is each print's INK? — the table the cut-out threshold is calibrated from.
 *
 * `solidifyMaterials` decides "hard cut-out" from the share of part-transparent
 * pixels in the WHOLE texture (CUTOUT_MID_FRACTION). A brush print on a mostly-empty
 * canvas is 4% partial overall but 36–51% partial as a share of its ink, so it was
 * read as a sticker and hard-clipped (audit F1-01, FAB-08, CT-05). Fix plan Rank 3
 * moves the test to mid / (mid + opaque) — softness OVER THE INK — and this prints
 * that number for every artwork material in a file, next to the whole-texture number
 * and the verdict the current rule gives, so the new line is chosen from a table of
 * the owner's real garments rather than by feel.
 *
 * Usage (from tools/asset-pipeline):
 *   NODE_OPTIONS=--max-old-space-size=12288 npx tsx scripts/ink-softness-census.mjs <file.glb> [--all]
 * --all: every textured material, not only the ones the gate's strict classifier calls artwork.
 */
import { resolve } from 'node:path'
import sharp from 'sharp'
import { createIO } from '../src/io.ts'
import { classifyArtworkForGate } from '../src/texture-artwork.ts'
import { findArtworkTexturesByGeometry } from '../src/artwork-geometry.ts'
import {
  CUTOUT_MID_FRACTION,
  CUTOUT_MIN_TRANSPARENT,
  isCutoutProfile,
  profileAlpha,
} from '../src/textures.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--'))
if (!file) {
  console.error('usage: ink-softness-census.mjs <file.glb> [--all]')
  process.exit(2)
}
const all = args.includes('--all')
const io = await createIO()
const document = await io.read(resolve(file))
const root = document.getRoot()
const byGeometry = findArtworkTexturesByGeometry(document)
const cache = new Map()
const seen = new Set()
const rows = []
for (const material of root.listMaterials()) {
  const texture = material.getBaseColorTexture()
  if (!texture) continue
  // One row per TEXTURE — CLO binds one picture to five colourway materials.
  if (seen.has(texture)) continue
  const gate = await classifyArtworkForGate(material, cache)
  const geometry = byGeometry.has(texture)
  if (!all && !gate.artwork && !geometry) continue
  seen.add(texture)
  const image = texture.getImage()
  const alpha = image ? await profileAlpha(image) : null
  if (!alpha) continue
  const ink = alpha.midFraction + alpha.opaqueFraction
  let width = 0
  let height = 0
  try {
    const meta = await sharp(image).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch {}
  const pixels = width * height
  rows.push({
    size: pixels ? `${width}x${height}` : '?',
    bpp: pixels ? image.byteLength / pixels : 0,
    bppInk: pixels && ink > 0 ? image.byteLength / (pixels * ink) : 0,
    material: material.getName() || '(unnamed)',
    mode: material.getAlphaMode(),
    factor: material.getBaseColorFactor()[3] ?? 1,
    character: alpha.character,
    transparent: alpha.transparentFraction,
    mid: alpha.midFraction,
    opaque: alpha.opaqueFraction,
    midOfInk: ink > 0 ? alpha.midFraction / ink : 0,
    cutoutNow: isCutoutProfile(alpha),
    gate: gate.artwork ? gate.reason : gate.excluded ? 'excluded' : '-',
    geometry,
  })
}
const pct = (n) => `${(n * 100).toFixed(1).padStart(5)}%`
console.log(
  `${file}\n  ${rows.length} artwork texture(s); rule today: cutout = binary, or mid ≤ ${CUTOUT_MID_FRACTION} of ALL pixels AND clear ≥ ${CUTOUT_MIN_TRANSPARENT}\n`,
)
console.log(
  '  mode   factor char     clear     mid   opaque  MID/INK  cutout?  gate     geom  material',
)
for (const r of rows.sort((a, b) => b.midOfInk - a.midOfInk)) {
  console.log(
    `  ${r.mode.padEnd(6)} ${r.factor.toFixed(2)}   ${r.character.padEnd(8)} ${pct(r.transparent)} ${pct(r.mid)} ${pct(r.opaque)}  ${pct(r.midOfInk)}  ${String(r.cutoutNow).padEnd(7)}  ${String(r.gate).padEnd(8)} ${r.geometry ? 'yes ' : 'no  '} ${r.bpp.toFixed(3).padStart(6)} ${r.bppInk.toFixed(3).padStart(8)}  ${r.size.padEnd(11)} ${r.material}`,
  )
}
