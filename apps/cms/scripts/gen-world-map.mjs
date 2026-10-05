#!/usr/bin/env node
/**
 * gen-world-map.mjs — write `apps/cms/public/world-map.svg`, the dotted world strip in the home
 * page's "Where we ship" (polish X7, 2026-10-05).
 *
 * WHERE THE LAND COMES FROM. The contact page's globe library, cobe 2.0.1, carries the world's land
 * as one 256 x 128 equirectangular mask, a 1,091-byte one-bit PNG inside `dist/index.esm.js`. This
 * reads it from the installed package, so nothing is downloaded and the strip agrees with the globe.
 * cobe is MIT licensed, Copyright (c) 2021 Shu Ding; the SVG repeats that notice.
 *
 * WHAT IT DRAWS. Mask rows 10 to 103, latitude 75.9375°N to 56.25°S (row edges, so a point
 * projects exactly): the Arctic band and Antarctica, which the mask draws as solid land, are left
 * out, and Cape Horn stays in. Every 2 x 2 block of the mask is one dot when two or more of its four
 * pixels are land, so a lone pixel of coast does not make a dot. Each dot is a zero-length stroke
 * with round caps: one `<path>` for the whole map, dots at odd coordinates in a 256 x 94 box.
 * `src/lib/worldMap.ts` projects a place onto the same box, and `src/lib/worldMap.test.ts` holds the
 * two to each other.
 *
 * USAGE
 *   node apps/cms/scripts/gen-world-map.mjs
 *
 * Re-run it only to change the strip. A new cobe can bring a new mask; the strip then changes too.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))

/** The crop, in mask rows, and the colour of a dot. The plate under it is dark in both themes. */
export const CROP = { top: 10, bottom: 103 }
export const DOT = { colour: '#ecebe4', opacity: 0.36, width: 1.1 }

/** The land mask out of cobe's bundle: `{ width, height, land(x, y) }`, land being white. */
export function decodeLandMask(png) {
  if (png.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG: no IHDR first')
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const [depth, type, , , interlace] = png.subarray(24, 29)
  if (depth !== 1 || type !== 0 || interlace !== 0) {
    throw new Error(`expected a one-bit greyscale PNG, got depth ${depth}, type ${type}`)
  }
  const idat = []
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at)
    const kind = png.toString('latin1', at + 4, at + 8)
    if (kind === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = Math.ceil(width / 8)
  const rows = []
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    // One-bit pixels filter byte by byte, with the byte to the left as "a" (PNG spec, 9.2).
    for (let i = 0; i < stride; i++) {
      const a = i > 0 ? line[i - 1] : 0
      const b = previous[i]
      const c = i > 0 ? previous[i - 1] : 0
      if (filter === 1) line[i] = (line[i] + a) & 0xff
      else if (filter === 2) line[i] = (line[i] + b) & 0xff
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff
      else if (filter === 4) {
        const p = a + b - c
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter} on row ${y}`)
    }
    rows.push(line)
    previous = line
  }
  return {
    width,
    height,
    land: (x, y) => ((rows[y]?.[x >> 3] ?? 0) >> (7 - (x & 7))) & 1,
  }
}

/** The dots: `[x, y]` centres in the 256 x 94 box, row by row. */
export function landDots(mask, crop = CROP) {
  const dots = []
  for (let y = crop.top; y <= crop.bottom; y += 2) {
    for (let x = 0; x < mask.width; x += 2) {
      const pixels =
        mask.land(x, y) + mask.land(x + 1, y) + mask.land(x, y + 1) + mask.land(x + 1, y + 1)
      if (pixels >= 2) dots.push([x + 1, y - crop.top + 1])
    }
  }
  return dots
}

/** One path: the first dot of a row absolute, the rest of the row relative to it. */
export function dotsPath(dots) {
  let d = ''
  let last = null
  for (const [x, y] of dots) {
    d += last && last[1] === y ? `m${x - last[0]} 0h0` : `M${x} ${y}h0`
    last = [x, y]
  }
  return d
}

export function worldMapSvg(dots, crop = CROP) {
  const height = crop.bottom - crop.top + 1
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 ${height}" width="256" height="${height}">`,
    // Every SVG here carries one (Biome, a11y/noSvgWithoutTitle); the page's <img> is alt="".
    '<title>The world, in dots</title>',
    '<!-- Land from cobe 2.0.1 (MIT License, Copyright (c) 2021 Shu Ding). Written by apps/cms/scripts/gen-world-map.mjs: rows 10-103, 75.9375N to 56.25S. -->',
    `<path d="${dotsPath(dots)}" fill="none" stroke="${DOT.colour}" stroke-opacity="${DOT.opacity}" stroke-width="${DOT.width}" stroke-linecap="round"/>`,
    '</svg>',
    '',
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(join(here, '..', 'package.json'))
  const bundle = readFileSync(require.resolve('cobe'), 'utf8')
  const base64 = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(bundle)?.[1]
  if (!base64) throw new Error('cobe no longer carries its land mask as a PNG data URI')
  const mask = decodeLandMask(Buffer.from(base64, 'base64'))
  const dots = landDots(mask)
  const svg = worldMapSvg(dots)
  const out = join(here, '..', 'public', 'world-map.svg')
  writeFileSync(out, svg)
  console.log(`${dots.length} dots, ${svg.length} bytes -> ${out}`)
}
