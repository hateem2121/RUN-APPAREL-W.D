import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cropBox, SHAPES, SOURCES } from '../../../scripts/build-factory-photos.mjs'
import {
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  type FactoryPhoto,
} from './lib/factoryPhotos'

/**
 * OI-3 — the home page's factory strip. What would have to break for these to fail: a file
 * the page asks for is missing or the wrong shape (a broken tile, or a stretched one), the
 * script and the page drift apart (the next rebuild writes files the page does not name), or
 * a reorder leaves a hole in the grid at a phone's or a desktop's column count.
 */

const DIR = join(import.meta.dirname, '../public/factory')

/**
 * Width and height from a WebP's own header — lossy (VP8), lossless (VP8L) or extended (VP8X).
 * Through a DataView, not Buffer's read methods: this package types `Buffer` from the Workers
 * types, which do not declare them.
 */
function webpSize(file: Uint8Array): { width: number; height: number } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const ascii = (start: number) => String.fromCharCode(...file.subarray(start, start + 4))
  const uint24 = (at: number) => view.getUint16(at, true) | (view.getUint8(at + 2) << 16)
  if (ascii(0) !== 'RIFF' || ascii(8) !== 'WEBP') throw new Error('not a WebP file')
  const chunk = ascii(12)
  if (chunk === 'VP8X') return { width: uint24(24) + 1, height: uint24(27) + 1 }
  if (chunk === 'VP8 ') {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  throw new Error(`unknown WebP chunk ${chunk}`)
}

/**
 * Places tiles in order the way CSS grid does without `dense`: a tile that does not fit in
 * what is left of the row starts a new one, and the cells it skipped stay empty. Returns the
 * rows that were left with a hole.
 */
function rowsWithHoles(photos: readonly Pick<FactoryPhoto, 'slug' | 'shape'>[], columns: number) {
  const rows: string[][] = [[]]
  let used = 0
  for (const photo of photos) {
    const span = photo.shape === 'wide' ? 2 : 1
    if (used + span > columns) {
      rows.push([])
      used = 0
    }
    rows[rows.length - 1]?.push(photo.slug)
    used += span
  }
  const spanOf = (slug: string) =>
    photos.find((photo) => photo.slug === slug)?.shape === 'wide' ? 2 : 1
  return rows.filter((row) => row.reduce((sum, slug) => sum + spanOf(slug), 0) !== columns)
}

describe('the factory strip (OI-3)', () => {
  it('every picture the page names exists, at both widths, at its tile shape', () => {
    const wrong: string[] = []
    for (const photo of FACTORY_PHOTOS) {
      for (const width of FACTORY_PHOTO_WIDTHS[photo.shape]) {
        const file = `${photo.slug}-${width}.webp`
        let size: { width: number; height: number }
        try {
          size = webpSize(readFileSync(join(DIR, file)))
        } catch (error) {
          wrong.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        const height = Math.round(width / FACTORY_PHOTO_ASPECT[photo.shape])
        if (size.width !== width || size.height !== height) {
          wrong.push(
            `${file} is ${size.width}x${size.height}, the page reserves ${width}x${height}`,
          )
        }
      }
    }
    expect(wrong, 'rebuild with scripts/build-factory-photos.mjs').toEqual([])
  })

  it('no picture sits in public/factory that the page does not show', () => {
    const named = new Set(
      FACTORY_PHOTOS.flatMap((photo) =>
        FACTORY_PHOTO_WIDTHS[photo.shape].map((width) => `${photo.slug}-${width}.webp`),
      ),
    )
    expect(readdirSync(DIR).filter((file) => !named.has(file))).toEqual([])
  })

  it('the build script and the page list the same pictures, shapes, sizes and order', () => {
    expect(SOURCES.map(({ slug, shape }) => ({ slug, shape }))).toEqual(
      FACTORY_PHOTOS.map(({ slug, shape }) => ({ slug, shape })),
    )
    for (const shape of ['wide', 'single'] as const) {
      expect(SHAPES[shape].widths).toEqual([...FACTORY_PHOTO_WIDTHS[shape]])
      expect(SHAPES[shape].aspect).toBe(FACTORY_PHOTO_ASPECT[shape])
    }
  })

  it('the order fills every row at 2 columns (phone) and at 4 (desktop)', () => {
    expect(rowsWithHoles(FACTORY_PHOTOS, 2), '2 columns').toEqual([])
    expect(rowsWithHoles(FACTORY_PHOTOS, 4), '4 columns').toEqual([])
  })

  it('the hole check sees a hole (negative control)', () => {
    const [first, ...rest] = FACTORY_PHOTOS
    const singleFirst = rest.find((photo) => photo.shape === 'single')
    if (!first || !singleFirst) throw new Error('the strip needs a wide and a single picture')
    // A single moved to the front strands the wide tile after it at 2 columns.
    const reordered = [singleFirst, first, ...rest.filter((photo) => photo !== singleFirst)]
    expect(rowsWithHoles(reordered, 2).length).toBeGreaterThan(0)
  })

  it('every picture has alt text and a caption, and they are not the same words', () => {
    for (const photo of FACTORY_PHOTOS) {
      expect(photo.alt.length, photo.slug).toBeGreaterThan(20)
      expect(photo.caption.length, photo.slug).toBeGreaterThan(3)
      expect(photo.alt.toLowerCase()).not.toContain(photo.caption.toLowerCase())
    }
  })

  it('the crop stays inside the picture, centred on the focus where it can be', () => {
    // A 2:1 panorama cut to 8:5 around its centre loses equal width from both sides.
    expect(cropBox(2000, 1000, 8 / 5, [0.5, 0.5])).toEqual({
      left: 200,
      top: 0,
      width: 1600,
      height: 1000,
    })
    // A focus at the very edge slides the box back inside rather than past it.
    expect(cropBox(1000, 2000, 4 / 5, [0.5, 1])).toEqual({
      left: 0,
      top: 750,
      width: 1000,
      height: 1250,
    })
  })
})
