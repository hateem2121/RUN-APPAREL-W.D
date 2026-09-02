import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compareRenders } from './compare'

/**
 * The contact sheet is what the artwork decision gets made from, so its numbers
 * have to be trustworthy in both directions: zero when two renders agree, and
 * non-zero in proportion to how much they do not.
 */

let root: string
const solid = (dir: string, name: string, colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: colour } })
    .png()
    .toFile(join(dir, `${name}.png`))

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'compare-test-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('compareRenders', () => {
  it('reports zero difference for identical renders', async () => {
    const a = join(root, 'same-a')
    const b = join(root, 'same-b')
    await mkdir(a, { recursive: true })
    await mkdir(b, { recursive: true })
    await solid(a, 'front', { r: 40, g: 60, b: 90 })
    await solid(b, 'front', { r: 40, g: 60, b: 90 })

    const result = await compareRenders(a, b, join(root, 'same.png'))
    expect(result.diffs).toHaveLength(1)
    expect(result.diffs[0]).toMatchObject({
      view: 'front',
      meanDelta: 0,
      maxDelta: 0,
      changedFraction: 0,
    })
  })

  it('measures the difference when the renders disagree', async () => {
    const a = join(root, 'diff-a')
    const b = join(root, 'diff-b')
    await mkdir(a, { recursive: true })
    await mkdir(b, { recursive: true })
    await solid(a, 'front', { r: 0, g: 0, b: 0 })
    await solid(b, 'front', { r: 20, g: 20, b: 20 })

    const result = await compareRenders(a, b, join(root, 'diff.png'))
    expect(result.diffs[0]?.meanDelta).toBe(20)
    expect(result.diffs[0]?.maxDelta).toBe(20)
    // 20 is over DIFF_THRESHOLD (8), so every pixel counts as changed.
    expect(result.diffs[0]?.changedFraction).toBe(1)
  })

  it('reports views present on only one side rather than dropping them', async () => {
    // A short sheet is easy to mistake for a clean result; a half-failed render
    // run must not look like agreement.
    const a = join(root, 'partial-a')
    const b = join(root, 'partial-b')
    await mkdir(a, { recursive: true })
    await mkdir(b, { recursive: true })
    await solid(a, 'front', { r: 10, g: 10, b: 10 })
    await solid(a, 'crop-chest', { r: 10, g: 10, b: 10 })
    await solid(b, 'front', { r: 10, g: 10, b: 10 })

    const result = await compareRenders(a, b, join(root, 'partial.png'))
    expect(result.diffs.map((d) => d.view)).toEqual(['front'])
    expect(result.unmatched).toEqual(['crop-chest'])
  })

  it('refuses to write a sheet when nothing lines up', async () => {
    const a = join(root, 'none-a')
    const b = join(root, 'none-b')
    await mkdir(a, { recursive: true })
    await mkdir(b, { recursive: true })
    await solid(a, 'front', { r: 1, g: 1, b: 1 })
    await solid(b, 'back', { r: 1, g: 1, b: 1 })

    await expect(compareRenders(a, b, join(root, 'none.png'))).rejects.toThrow(/nothing to compare/)
  })

  it('writes a sheet three cells wide, one row per view', async () => {
    const a = join(root, 'shape-a')
    const b = join(root, 'shape-b')
    await mkdir(a, { recursive: true })
    await mkdir(b, { recursive: true })
    for (const view of ['front', 'back']) {
      await solid(a, view, { r: 5, g: 5, b: 5 })
      await solid(b, view, { r: 9, g: 9, b: 9 })
    }

    const out = join(root, 'shape.png')
    await compareRenders(a, b, out)
    const metadata = await sharp(out).metadata()
    expect(metadata.width).toBe(32 * 3)
    // Two rows of (cell height + label strip).
    expect(metadata.height).toBe(2 * (32 + 34))
  })
})

describe('compareRenders refuses renders of different sizes (HR-6)', () => {
  it('names the size it expected and the file that disagreed, instead of measuring resampling', async () => {
    // Until 2026-09-02 a 256 px render compared against a 512 px render was silently
    // upscaled, and the blur reported as up to 1.39% damage on a garment compared
    // against itself — nearly half the shipped preset's real 3.100%.
    const dir = await mkdtemp(join(tmpdir(), 'compare-size-'))
    const a = join(dir, 'a')
    const b = join(dir, 'b')
    await mkdir(a)
    await mkdir(b)
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#808080' } })
      .png()
      .toFile(join(a, 'front.png'))
    await sharp({ create: { width: 32, height: 32, channels: 3, background: '#808080' } })
      .png()
      .toFile(join(b, 'front.png'))
    await expect(compareRenders(a, b, join(dir, 'sheet.png'))).rejects.toThrow(
      /differ in size.*Expected 64x64.*front\.png 32x32/s,
    )
  })

  it('reports the common size when they agree', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'compare-size-'))
    const a = join(dir, 'a')
    const b = join(dir, 'b')
    await mkdir(a)
    await mkdir(b)
    for (const d of [a, b]) {
      await sharp({ create: { width: 48, height: 40, channels: 3, background: '#808080' } })
        .png()
        .toFile(join(d, 'front.png'))
    }
    const result = await compareRenders(a, b, join(dir, 'sheet.png'))
    expect(result.width).toBe(48)
    expect(result.height).toBe(40)
  })
})
