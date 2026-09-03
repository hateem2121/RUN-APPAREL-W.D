import { describe, expect, it } from 'vitest'
import {
  PLACEHOLDER_BLUR_MAX_PX,
  PLACEHOLDER_BLUR_MIN_PX,
  PLACEHOLDER_BLUR_UNKNOWN_PX,
  PLACEHOLDER_FADE_MS,
  placeholderAsset,
  placeholderBlurPx,
  placeholderLeaveMs,
} from './placeholder'

const asset = (url: string) => ({ url, alt: '', width: 1200, height: 1500, mimeType: 'image/webp' })

describe('placeholderAsset', () => {
  it("prefers the colourway's own photo, then the product's backup, then nothing", () => {
    const product = { posterFallback: asset('/fallback.webp') }
    expect(placeholderAsset({ poster: asset('/wine.webp') }, product)?.url).toBe('/wine.webp')
    expect(placeholderAsset({ poster: null }, product)?.url).toBe('/fallback.webp')
    expect(placeholderAsset(null, product)?.url).toBe('/fallback.webp')
    expect(placeholderAsset({ poster: null }, { posterFallback: null })).toBeNull()
  })
})

describe('placeholderBlurPx', () => {
  it('sharpens with the bytes: max blur at 0%, the last soft step at 100%', () => {
    expect(placeholderBlurPx('downloading', 0)).toBe(PLACEHOLDER_BLUR_MAX_PX)
    expect(placeholderBlurPx('downloading', 50)).toBeCloseTo(
      (PLACEHOLDER_BLUR_MAX_PX + PLACEHOLDER_BLUR_MIN_PX) / 2,
      6,
    )
    expect(placeholderBlurPx('downloading', 100)).toBe(PLACEHOLDER_BLUR_MIN_PX)
  })

  it('never reaches zero — the last step hides the pixel or two between photo and frame', () => {
    expect(PLACEHOLDER_BLUR_MIN_PX).toBeGreaterThan(0)
    for (const percent of [0, 25, 99, 100, 140, -5]) {
      expect(placeholderBlurPx('downloading', percent)).toBeGreaterThanOrEqual(
        PLACEHOLDER_BLUR_MIN_PX,
      )
    }
  })

  it('holds a middle blur while no honest percentage exists, and the last step once every byte is in', () => {
    expect(placeholderBlurPx('downloading', null)).toBe(PLACEHOLDER_BLUR_UNKNOWN_PX)
    expect(placeholderBlurPx('preparing', null)).toBe(PLACEHOLDER_BLUR_MIN_PX)
    expect(placeholderBlurPx('ready', null)).toBe(PLACEHOLDER_BLUR_MIN_PX)
  })
})

describe('placeholderLeaveMs', () => {
  it('fades over --settle, and leaves at once under reduced motion', () => {
    expect(placeholderLeaveMs(false)).toBe(PLACEHOLDER_FADE_MS)
    expect(placeholderLeaveMs(true)).toBe(0)
  })
})
