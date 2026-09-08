import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createIO } from './io'
import { PLACEHOLDER_COLOURWAYS, buildPlaceholderTee } from './placeholders'
import {
  POSTER_HEIGHT,
  POSTER_WIDTH,
  parseColourMap,
  renderPosters,
  slugForVariant,
} from './posters'

describe('the poster naming', () => {
  it('slugifies a CLO variant name the way the CMS slugs its colourways', () => {
    expect(slugForVariant('Colorway 2')).toBe('colorway-2')
    expect(slugForVariant('N001-WINE')).toBe('n001-wine')
    expect(slugForVariant('  ')).toBe('default')
  })

  it('parses the --colours map and refuses a malformed pair', () => {
    expect(parseColourMap('Colorway 2=wine, Colorway 3=black')).toEqual({
      'Colorway 2': 'wine',
      'Colorway 3': 'black',
    })
    expect(() => parseColourMap('Colorway 2')).toThrow(/<variant>=<slug>/)
    expect(() => parseColourMap('=wine')).toThrow(/both a variant and a slug/)
  })
})

const chromiumAvailable = (() => {
  try {
    return existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH ?? chromium.executablePath())
  } catch {
    return false
  }
})()

/**
 * The rendered poster is TRANSPARENT where there is no garment and opaque where there is
 * — measured on the pixels, not assumed from an option. A harness that quietly painted
 * its grey behind the garment would pass every other check and ship a grey slab into the
 * viewer's stage.
 */
describe.skipIf(!chromiumAvailable)('renderPosters (needs Chromium)', () => {
  it('writes a 1200×1500 WebP + PNG per colourway with alpha at the corners and none at the centre', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'posters-'))
    const io = await createIO()
    const glb = join(dir, 'tee.glb')
    await io.write(glb, await buildPlaceholderTee(PLACEHOLDER_COLOURWAYS[0]!))
    const results = await renderPosters(glb, { product: 'n001', outDir: join(dir, 'out') })
    expect(results).toHaveLength(1)
    const [poster] = results
    expect(poster?.webp.endsWith('n001-default-poster.webp')).toBe(true)
    const { width, height, channels } = await sharp(poster!.png).metadata()
    expect([width, height, channels]).toEqual([POSTER_WIDTH, POSTER_HEIGHT, 4])
    const { data, info } = await sharp(poster!.png).raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] ?? -1
    expect(alphaAt(2, 2)).toBe(0) // the corner: nothing there
    expect(alphaAt(info.width - 3, 2)).toBe(0)
    /**
     * THE WHOLE TOP EDGE, not two pixels — because the defect those two corners
     * caught on 2026-09-08 was a BAND. model-viewer paints its loading progress bar
     * as a full-width 5px strip at `top: 0` in `rgba(0, 0, 0, 0.4)`, which captured
     * as alpha 102 for 5 rows; the two corner samples happened to sit inside it.
     * They are kept exactly as they were, and this measures the shape of the thing.
     * 8 of 8 concurrent renders carried it before `render.ts` suppressed the chrome.
     */
    let worstTopAlpha = 0
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < info.width; x++) worstTopAlpha = Math.max(worstTopAlpha, alphaAt(x, y))
    expect(worstTopAlpha, "the top edge must carry none of model-viewer's chrome").toBe(0)
    expect(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBe(255) // the garment
  }, 180_000)
})
