import { describe, expect, it } from 'vitest'
import {
  garmentCount,
  luminance,
  PROOF_GARMENT,
  pickProofGarment,
  pillPaint,
} from './proofShowcase'

/*
 * D43, №03 (owner, 2026-10-15/16). What would have to break for these to fail: the section showing
 * another garment than the owner's while it is published; the section empty while any garment has a
 * poster; the count reading "1 garments"; a colour's name put under 4.5:1 on its own pill.
 */
describe('pickProofGarment', () => {
  const garment = (slug: string, posterUrl: string | null = `https://m/${slug}.webp`) => ({
    slug,
    posterUrl,
  })

  it('is the Capsule Core Hoodie wherever it stands in the order', () => {
    expect(PROOF_GARMENT).toBe('r-cch')
    expect(pickProofGarment([garment('r-xmp'), garment('r-asb'), garment('r-cch')])?.slug).toBe(
      'r-cch',
    )
  })

  // NEGATIVE CONTROL: retired, or without a poster, it gives way to what №03 showed before.
  it('falls back to the first garment with a poster, and is null with none', () => {
    expect(pickProofGarment([garment('r-xmp'), garment('r-asb')])?.slug).toBe('r-xmp')
    expect(
      pickProofGarment([garment('r-xmp', null), garment('r-cch', null), garment('r-asb')])?.slug,
    ).toBe('r-asb')
    expect(pickProofGarment([garment('r-xmp', null)])).toBeNull()
  })
})

describe('garmentCount', () => {
  it('reads as the owner asked, beside "See products in 3D": "41 garments", and "1 garment"', () => {
    expect(garmentCount(41)).toBe('41 garments')
    expect(garmentCount(1)).toBe('1 garment')
    expect(garmentCount(1200)).toBe('1,200 garments')
  })
})

describe('pillPaint: the chosen colour’s name keeps 4.5:1 on its own pill', () => {
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a) ?? 0, luminance(b) ?? 0]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  // The hoodie's five, from the public API (2026-10-15), all painted in their own colour.
  it.each([
    ['Bay Leaf / Matcha', '#6C6C3B'],
    ['Rose Petal', '#EDB1AF'],
    ['Spearmint', '#A0D1C0'],
    ['Duck Egg / Bluebell', '#BED6EB'],
    ['Black Cherry / Cranberry', '#905260'],
  ])('%s keeps its own colour, its name at 4.5:1 or more', (_name, swatch) => {
    const paint = pillPaint(swatch)
    expect(paint.surface).toBe('swatch')
    expect(contrast(paint.text, swatch)).toBeGreaterThanOrEqual(4.5)
  })

  // NEGATIVE CONTROL: a mid grey reaches 4.5:1 with neither ink, so its pill is ink with paper words.
  it('a mid-tone no ink reads on is drawn on ink, and so is a colour with no swatch', () => {
    expect(contrast('#1d1f1a', '#808080')).toBeLessThan(4.5)
    expect(contrast('#f1efea', '#808080')).toBeLessThan(4.5)
    expect(pillPaint('#808080')).toEqual({ surface: 'ink', text: '#f1efea' })
    expect(pillPaint(null)).toEqual({ surface: 'ink', text: '#f1efea' })
    expect(pillPaint('not a colour')).toEqual({ surface: 'ink', text: '#f1efea' })
  })
})
