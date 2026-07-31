import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'

/**
 * Contact sheets — put two renders of the same GLB side by side with the
 * difference between them amplified.
 *
 * WHY AMPLIFY. The artwork failure is subtle per pixel and obvious in aggregate:
 * a logo whose UVs have been dragged a few texels looks "slightly soft" in
 * isolation and unmistakably smeared next to the original. A raw difference
 * image of two renders that are 98% identical is almost black, so it gets
 * multiplied by a gain before being written. The numbers in each row's label are
 * the unamplified truth; the picture is there to point at.
 *
 * WHY FLATTEN ONTO GREY. model-viewer's canvas is transparent where the garment
 * is not, so an un-flattened diff would light up the entire background the
 * moment the silhouette moves by one pixel. Compositing both sides onto the same
 * neutral grey first means the diff shows changes to the garment, which is the
 * question being asked.
 */

/** Per-pixel difference above this (0-255, any channel) counts as a changed pixel. */
export const DIFF_THRESHOLD = 8

/** Amplification applied to the difference image so subtle smearing is visible. */
export const DEFAULT_DIFF_GAIN = 6

/** Background both sides are flattened onto before diffing. Mid-grey hides neither light nor dark artwork. */
const FLATTEN_BACKGROUND = { r: 128, g: 128, b: 128 }

const LABEL_HEIGHT = 34

export interface ViewDiff {
  view: string
  /** Mean absolute per-channel difference, 0-255. */
  meanDelta: number
  /** Largest single-channel difference found. */
  maxDelta: number
  /** Fraction of pixels differing by more than DIFF_THRESHOLD on any channel. */
  changedFraction: number
}

export interface CompareResult {
  outFile: string
  diffs: ViewDiff[]
  /** View names present in one directory but not the other. */
  unmatched: string[]
}

interface Decoded {
  data: Buffer
  width: number
  height: number
}

/** Decode a PNG to flat RGB at a known size, so two renders are directly comparable. */
async function decode(file: string, width: number, height: number): Promise<Decoded> {
  const { data, info } = await sharp(file)
    .resize(width, height, { fit: 'fill' })
    .flatten({ background: FLATTEN_BACKGROUND })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/**
 * Build the amplified difference image and its statistics in one pass over the
 * pixels. Returns raw RGB, ready to composite.
 */
function diffPixels(a: Decoded, b: Decoded, gain: number): { data: Buffer; stats: Omit<ViewDiff, 'view'> } {
  const out = Buffer.allocUnsafe(a.data.length)
  let total = 0
  let max = 0
  let changed = 0
  const pixels = a.data.length / 3

  for (let i = 0; i < a.data.length; i += 3) {
    let pixelMax = 0
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs((a.data[i + c] as number) - (b.data[i + c] as number))
      total += delta
      if (delta > pixelMax) pixelMax = delta
      out[i + c] = Math.min(255, delta * gain)
    }
    if (pixelMax > max) max = pixelMax
    if (pixelMax > DIFF_THRESHOLD) changed++
  }

  return {
    data: out,
    stats: {
      meanDelta: Math.round((total / a.data.length) * 100) / 100,
      maxDelta: max,
      changedFraction: Math.round((changed / pixels) * 10000) / 10000,
    },
  }
}

/** Escape text for embedding in the SVG label strip. */
function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/**
 * One label strip spanning a full row: the view name on the left, the three
 * column headings positioned over their cells, and the diff numbers on the
 * right. Rendered as SVG because that is the only text sharp can draw.
 */
function labelStrip(view: string, stats: Omit<ViewDiff, 'view'>, cell: number, labelA: string, labelB: string): Buffer {
  const width = cell * 3
  const numbers = `mean ${stats.meanDelta}  max ${stats.maxDelta}  changed ${(stats.changedFraction * 100).toFixed(2)}%`
  return Buffer.from(
    `<svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${width}" height="${LABEL_HEIGHT}" fill="#111"/>` +
      `<text x="10" y="23" font-family="monospace" font-size="15" fill="#fff">${escapeXml(view)}</text>` +
      `<text x="${cell + 10}" y="23" font-family="monospace" font-size="15" fill="#8ab4ff">${escapeXml(labelA)}</text>` +
      `<text x="${cell * 2 + 10}" y="23" font-family="monospace" font-size="15" fill="#ffb86b">${escapeXml(labelB)}</text>` +
      `<text x="${width - 10}" y="23" font-family="monospace" font-size="15" fill="#9f9" text-anchor="end">${escapeXml(numbers)}</text>` +
      `</svg>`,
  )
}

/** PNG basenames (without extension) in a render directory. */
async function viewNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  return entries.filter((entry) => entry.endsWith('.png')).map((entry) => basename(entry, '.png')).sort()
}

export interface CompareOptions {
  /** Amplification for the difference column. Default DEFAULT_DIFF_GAIN. */
  gain?: number
  /** Width of each of the three columns. Defaults to the first image's width. */
  cell?: number
}

/**
 * Compare two directories of renders and write one contact sheet.
 *
 * Views are matched by filename, so `render`'s output directories line up
 * automatically. A view present in only one side is reported rather than
 * silently dropped — that usually means one of the two runs failed partway, and
 * a short sheet is easy to mistake for a clean result.
 */
export async function compareRenders(
  dirA: string,
  dirB: string,
  outFile: string,
  options: CompareOptions = {},
): Promise<CompareResult> {
  const gain = options.gain ?? DEFAULT_DIFF_GAIN
  const namesA = await viewNames(dirA)
  const namesB = await viewNames(dirB)
  const shared = namesA.filter((name) => namesB.includes(name))
  const unmatched = [
    ...namesA.filter((name) => !namesB.includes(name)),
    ...namesB.filter((name) => !namesA.includes(name)),
  ].sort()

  if (shared.length === 0) {
    throw new Error(
      `No view name appears in both ${dirA} and ${dirB}, so there is nothing to compare. ` +
        `Found ${namesA.length} and ${namesB.length} PNG(s) respectively.`,
    )
  }

  const first = await sharp(join(dirA, `${shared[0]}.png`)).metadata()
  const cell = options.cell ?? first.width ?? 512
  const cellHeight = Math.round(((first.height ?? cell) / (first.width ?? cell)) * cell)
  const rowHeight = cellHeight + LABEL_HEIGHT
  const sheetWidth = cell * 3
  const sheetHeight = rowHeight * shared.length

  const labelA = basename(dirA)
  const labelB = basename(dirB)
  const layers: OverlayOptions[] = []
  const diffs: ViewDiff[] = []

  for (const [row, view] of shared.entries()) {
    const top = row * rowHeight
    const a = await decode(join(dirA, `${view}.png`), cell, cellHeight)
    const b = await decode(join(dirB, `${view}.png`), cell, cellHeight)
    const { data, stats } = diffPixels(a, b, gain)
    diffs.push({ view, ...stats })

    const raw = { raw: { width: cell, height: cellHeight, channels: 3 as const } }
    layers.push(
      { input: labelStrip(view, stats, cell, labelA, labelB), top, left: 0 },
      { input: a.data, ...raw, top: top + LABEL_HEIGHT, left: 0 },
      { input: b.data, ...raw, top: top + LABEL_HEIGHT, left: cell },
      { input: data, ...raw, top: top + LABEL_HEIGHT, left: cell * 2 },
    )
  }

  await sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 3, background: FLATTEN_BACKGROUND },
  })
    .composite(layers)
    .png()
    .toFile(outFile)

  return { outFile, diffs, unmatched }
}
