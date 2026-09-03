/**
 * Lay rendered posters out as one contact sheet, so a set can be judged at a glance —
 * every colourway of a garment in a row, and two sets (before / after an export or a
 * pipeline change) one above the other.
 *
 * WHY A SHEET AND NOT THE FILES. Posters are transparent since 2026-09-03 (fix plan
 * Rank 6): opened one at a time on a dark desktop a white garment is invisible and a
 * black one is a silhouette, so each is flattened here onto the viewer's own light
 * ground (`--bg`, apps/viewer/src/styles/tokens.css), which is where a visitor sees it.
 * And the question a poster set answers — "does every colourway show ITS colour?" —
 * is a question about five pictures side by side (2026-09-03: five skinsuit posters,
 * all wine, passed every per-file check).
 *
 * Usage (from tools/asset-pipeline):
 *   npx tsx scripts/poster-sheet.mjs --out sheet.jpg "label=dir:product:colour,colour,…" […]
 *   e.g. --out ../../output/sheet.jpg "before=../../output/posters:rxps:wine,blush,butter,lime,black" \
 *                                     "after=../../output/posters-new:rxps:wine,blush,butter,lime,black"
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const CELL_W = 240
const CELL_H = 300
const LABEL_W = 150
const HEADER_H = 28
/** apps/viewer/src/styles/tokens.css `--bg`, light — the ground the viewer paints. */
const BG = '#f1efea'

const args = process.argv.slice(2)
let out = null
const rows = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i]
  else rows.push(args[i])
}
if (!out || rows.length === 0) {
  console.error('usage: poster-sheet.mjs --out <sheet.jpg> "label=dir:product:colour,…" […]')
  process.exit(2)
}

const parsed = rows.map((row) => {
  const eq = row.indexOf('=')
  const [dir, product, colours] = row.slice(eq + 1).split(':')
  if (eq < 0 || !dir || !product || !colours) throw new Error(`bad row: ${row}`)
  return { label: row.slice(0, eq), dir, product, colours: colours.split(',') }
})
const columns = Math.max(...parsed.map((r) => r.colours.length))
const width = LABEL_W + columns * CELL_W
const height = HEADER_H + parsed.length * CELL_H

const svgText = (text, x, y, size = 14) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#222">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')}</text>`

const composites = []
const labels = []
for (const [r, row] of parsed.entries()) {
  const top = HEADER_H + r * CELL_H
  labels.push(svgText(row.label, 8, top + CELL_H / 2, 15))
  for (const [c, colour] of row.colours.entries()) {
    const left = LABEL_W + c * CELL_W
    const file = join(row.dir, `${row.product}-${colour}-poster.webp`)
    let buffer
    try {
      buffer = await readFile(file)
    } catch {
      labels.push(svgText(`missing: ${colour}`, left + 8, top + 20, 12))
      continue
    }
    const cell = await sharp(buffer)
      .resize(CELL_W, CELL_H, { fit: 'contain', background: BG })
      .flatten({ background: BG })
      .png()
      .toBuffer()
    composites.push({ input: cell, left, top })
    if (r === 0) labels.push(svgText(colour, left + 8, 19, 13))
  }
}
const overlay = Buffer.from(
  `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels.join('')}</svg>`,
)
await sharp({ create: { width, height, channels: 3, background: BG } })
  .composite([...composites, { input: overlay, left: 0, top: 0 }])
  .jpeg({ quality: 88 })
  .toFile(out)
console.log(`wrote ${out} (${width}x${height}, ${parsed.length} row(s) x ${columns})`)
