import { describe, expect, it } from 'vitest'
import { colourHref, slideAt, slidesToLoad } from './cardGallery'

describe('slideAt', () => {
  it('reads the slide from the scroll position', () => {
    expect(slideAt(0, 300, 5)).toBe(0)
    expect(slideAt(300, 300, 5)).toBe(1)
    expect(slideAt(1200, 300, 5)).toBe(4)
  })

  it('follows the slide that covers more of the frame mid-swipe', () => {
    expect(slideAt(149, 300, 5)).toBe(0)
    expect(slideAt(151, 300, 5)).toBe(1)
  })

  it('handles the negative scrollLeft a right-to-left page reports', () => {
    expect(slideAt(-600, 300, 5)).toBe(2)
  })

  it('never points past either end', () => {
    // Overscroll bounce on iOS reports positions beyond the content for a moment.
    expect(slideAt(5000, 300, 5)).toBe(4)
    expect(slideAt(0, 300, 1)).toBe(0)
  })

  it('answers 0 for a strip that has not been laid out', () => {
    // Before layout (or display: none) the slide width is 0; dividing by it is NaN or Infinity.
    expect(slideAt(0, 0, 5)).toBe(0)
    expect(slideAt(Number.NaN, 300, 5)).toBe(0)
    expect(slideAt(0, 300, 0)).toBe(0)
  })
})

describe('colourHref', () => {
  it('builds the viewer URL printed QR tags use', () => {
    expect(colourHref('https://viewer.wear-run.help', 'rxps', 'wine')).toBe(
      'https://viewer.wear-run.help/rxps/wine',
    )
  })
})

describe('slidesToLoad', () => {
  it('adds the showing slide and both neighbours, and keeps what was loaded', () => {
    expect([...slidesToLoad(new Set([0]), 2, 5)].sort()).toEqual([0, 1, 2, 3])
  })

  it('stays inside the strip at either end', () => {
    expect([...slidesToLoad(new Set(), 0, 5)].sort()).toEqual([0, 1])
    expect([...slidesToLoad(new Set(), 4, 5)].sort()).toEqual([3, 4])
    expect([...slidesToLoad(new Set(), 0, 1)]).toEqual([0])
  })

  it('does not change the set it was given', () => {
    const before = new Set([0])
    slidesToLoad(before, 3, 5)
    expect([...before]).toEqual([0])
  })
})
