#!/usr/bin/env node
/**
 * Builds the home page's "Inside the factory" pictures (OI-3) from the owner's originals.
 *
 * ⚠️ THE ORIGINALS NEVER ENTER THE REPOSITORY. They live in the owner's own folder on their
 * Mac (4,000–5,000 px, up to 16 MB each) and this repo is public; only the web-sized,
 * pre-cropped WebPs this writes are committed, under `apps/cms/public/factory/`.
 *
 * ⚠️ EACH PICTURE IS CROPPED TO ITS TILE HERE, NOT BY `object-fit` IN THE BROWSER. The
 * originals are 0.55:1 portraits and 2:1 panoramas; the tiles are 4:5 and 8:5. Letting CSS
 * crop would ship a 1280×2347 portrait to fill a 490×612 box — four times the bytes for
 * pixels nobody sees. `focus` is where the subject sits in the original, as fractions of its
 * width and height, chosen by looking at each picture (2026-09-25).
 *
 * Output carries no metadata: sharp drops EXIF/XMP unless asked to keep it, the same for
 * every picture, which is ordinary web optimisation.
 *
 * Usage:
 *   node scripts/build-factory-photos.mjs "<folder with the originals>"
 * The page's list, captions and alt text: apps/cms/src/lib/factoryPhotos.ts. Its unit test
 * fails if a file this should have written is missing or the wrong size.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

/** Tile shapes, as width/height, and the two widths written for each (1× and 2×). */
export const SHAPES = {
  wide: { aspect: 8 / 5, widths: [640, 1200] },
  single: { aspect: 4 / 5, widths: [400, 800] },
}

export const SOURCES = [
  { slug: 'exterior', file: 'factory exterior image.png', shape: 'wide', focus: [0.5, 0.6] },
  { slug: 'solar-roof', file: 'Factory Solar.png', shape: 'wide', focus: [0.5, 0.5] },
  { slug: 'showroom', file: "RUN's Showroom.png", shape: 'wide', focus: [0.5, 0.55] },
  { slug: 'screen-printing', file: 'SCREEN PRINTING.png', shape: 'single', focus: [0.5, 0.45] },
  { slug: 'inspection', file: 'QC.png', shape: 'single', focus: [0.5, 0.5] },
  { slug: 'stitching', file: 'Apparel Stitching Department.png', shape: 'wide', focus: [0.5, 0.5] },
  { slug: 'lab', file: 'apparel lab 2016@0.5x.png', shape: 'wide', focus: [0.55, 0.5] },
  { slug: 'tagging', file: 'Tagging Department.png', shape: 'wide', focus: [0.5, 0.5] },
  { slug: 'final-check', file: 'QC2.png', shape: 'single', focus: [0.5, 0.6] },
  { slug: 'packing', file: 'Packaging-Department.png', shape: 'single', focus: [0.55, 0.5] },
]

/**
 * The largest box of `aspect` that fits in width×height, centred on the focus point and
 * slid back inside the picture where the focus sits near an edge.
 */
export function cropBox(width, height, aspect, [fx, fy]) {
  const boxWidth = Math.min(width, Math.round(height * aspect))
  const boxHeight = Math.min(height, Math.round(boxWidth / aspect))
  const clamp = (value, max) => Math.max(0, Math.min(max, Math.round(value)))
  return {
    left: clamp(width * fx - boxWidth / 2, width - boxWidth),
    top: clamp(height * fy - boxHeight / 2, height - boxHeight),
    width: boxWidth,
    height: boxHeight,
  }
}

async function main() {
  const from = process.argv[2]
  if (!from) {
    console.error('Usage: node scripts/build-factory-photos.mjs "<folder with the originals>"')
    process.exit(2)
  }
  // sharp is the pipeline's dependency, not this script's (the icon-parity probe's pattern),
  // and it is loaded here so the unit test can import the list without it.
  const sharp = createRequire(resolve(import.meta.dirname, '../tools/asset-pipeline/package.json'))(
    'sharp',
  )
  const out = resolve(import.meta.dirname, '../apps/cms/public/factory')
  mkdirSync(out, { recursive: true })
  for (const source of SOURCES) {
    const shape = SHAPES[source.shape]
    const { width, height } = await sharp(join(from, source.file)).metadata()
    const box = cropBox(width, height, shape.aspect, source.focus)
    for (const w of shape.widths) {
      const h = Math.round(w / shape.aspect)
      const target = join(out, `${source.slug}-${w}.webp`)
      const info = await sharp(join(from, source.file))
        .extract(box)
        .resize(w, h)
        .webp({ quality: 72, effort: 6, smartSubsample: true })
        .toFile(target)
      console.log(`${source.slug}-${w}.webp  ${info.width}x${info.height}  ${info.size} bytes`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) await main()
