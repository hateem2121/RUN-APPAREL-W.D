import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  MARGIN_X,
  MARGIN_Y,
  OG_CARD_BACKGROUND,
  composeCard,
} from './og-cards.mjs'

/**
 * The garment card's one promise (2026-10-25): the WHOLE garment is on the card. The tall
 * card it replaced was cut by every wide app to a band of torso or leg, so "the garment
 * touches the edge" is the defect this guards, checked on every card that ships.
 */

const PAPER = [0xf1, 0xef, 0xea]
const ogDir = join(import.meta.dirname, '..', '..', '..', 'apps', 'viewer', 'public', 'og')

/** True when the outer `band` pixels of the card are all paper (JPEG noise allowed). */
async function edgeIsPaper(jpeg: Buffer, band = 12, tolerance = 10): Promise<boolean> {
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const inside = x >= band && x < info.width - band && y >= band && y < info.height - band
      if (inside) continue
      const i = (y * info.width + x) * 3
      for (let c = 0; c < 3; c++) {
        if (Math.abs(data[i + c]! - PAPER[c]!) > tolerance) return false
      }
    }
  }
  return true
}

/** A garment-shaped picture: an opaque block inside a 5 px transparent border, as a render is. */
async function garment(width: number, height: number): Promise<Buffer> {
  const block = await sharp({
    create: { width, height, channels: 4, background: { r: 120, g: 30, b: 40, alpha: 1 } },
  })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: width + 10,
      height: height + 10,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: block, left: 5, top: 5 }])
    .png()
    .toBuffer()
}

/** Where the non-paper pixels are on a card. */
async function garmentBox(jpeg: Buffer) {
  const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let top = info.height
  let bottom = -1
  let left = info.width
  let right = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3
      if (Math.abs(data[i]! - PAPER[0]!) > 40) {
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
  }
  return { top, bottom, left, right }
}

describe('composeCard', () => {
  it('is a 1200x630 JPEG on the paper ground', async () => {
    const card = await composeCard(await garment(400, 1000))
    const meta = await sharp(card).metadata()
    expect({ format: meta.format, width: meta.width, height: meta.height }).toEqual({
      format: 'jpeg',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    })
    expect(OG_CARD_BACKGROUND).toBe('#f1efea')
  })

  it('fits a tall garment whole, trimmed of its transparent border and centred', async () => {
    const box = await garmentBox(await composeCard(await garment(400, 1000)))
    // Trimmed: the 5 px border is gone, so the garment fills the full height inside the margins.
    expect(box.top).toBeLessThanOrEqual(MARGIN_Y + 1)
    expect(box.bottom).toBeGreaterThanOrEqual(CARD_HEIGHT - MARGIN_Y - 2)
    // Centred left to right.
    expect(Math.abs(box.left - (CARD_WIDTH - 1 - box.right))).toBeLessThanOrEqual(2)
  })

  it('fits a wide garment whole inside the side margins', async () => {
    const box = await garmentBox(await composeCard(await garment(1800, 1150)))
    expect(box.left).toBeGreaterThanOrEqual(MARGIN_X - 1)
    expect(box.right).toBeLessThanOrEqual(CARD_WIDTH - MARGIN_X)
  })

  it('leaves paper all round the edge, and the check sees a card cut at the edge', async () => {
    expect(await edgeIsPaper(await composeCard(await garment(400, 1000)))).toBe(true)
    // NEGATIVE CONTROL: the old way of making a wide picture from a tall one, a centre crop.
    const cropped = await sharp(await garment(400, 1000))
      .resize({ width: CARD_WIDTH, height: CARD_HEIGHT, fit: 'cover' })
      .flatten({ background: OG_CARD_BACKGROUND })
      .jpeg()
      .toBuffer()
    expect(await edgeIsPaper(cropped)).toBe(false)
  })
})

describe('every card that ships', () => {
  const keys: string[] = []
  for (const product of readdirSync(ogDir)) {
    if (!statSync(join(ogDir, product)).isDirectory()) continue
    for (const file of readdirSync(join(ogDir, product))) {
      if (file.endsWith('.jpg')) keys.push(`${product}/${file.replace(/\.jpg$/, '')}`)
    }
  }

  it('exists', () => expect(keys.length).toBeGreaterThan(100))

  it.each(keys)('%s shows the whole garment: paper all round its edge', async (key) => {
    expect(await edgeIsPaper(await readFile(join(ogDir, `${key}.jpg`)))).toBe(true)
  })
})
