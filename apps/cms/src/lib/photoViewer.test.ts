import { describe, expect, it } from 'vitest'
import { counterText, indexFromScroll, photosToLoad, stepIndex, viewerTitle } from './photoViewer'

/**
 * The factory gallery's photo viewer (BUILD 8.5): the arithmetic the island runs, kept here so it is
 * measured by the coverage floors and cannot drift between the counter, the name and the strip.
 */
describe('the photo viewer', () => {
  it('steps forward and back, wrapping at both ends', () => {
    expect(stepIndex(0, 1, 9)).toBe(1)
    expect(stepIndex(8, 1, 9)).toBe(0)
    expect(stepIndex(0, -1, 9)).toBe(8)
    expect(stepIndex(4, -1, 9)).toBe(3)
  })

  it('counts from one, as a person does: "3 / 9", and names the dialog the same way', () => {
    expect(counterText(2, 9)).toBe('3 / 9')
    expect(viewerTitle(2, 9)).toBe('Factory photo 3 of 9')
  })

  it('reads the photo on screen from where the strip is scrolled, never past either end', () => {
    expect(indexFromScroll(0, 800, 9)).toBe(0)
    expect(indexFromScroll(1600, 800, 9)).toBe(2)
    // Mid-swipe, the nearer photo counts.
    expect(indexFromScroll(1150, 800, 9)).toBe(1)
    expect(indexFromScroll(1250, 800, 9)).toBe(2)
    expect(indexFromScroll(99_999, 800, 9)).toBe(8)
    expect(indexFromScroll(-40, 800, 9)).toBe(0)
    // A strip not laid out yet (0 wide) is on its first photo, not NaN.
    expect(indexFromScroll(0, 0, 9)).toBe(0)
  })

  it('loads only the photo on screen and its two neighbours', () => {
    expect(photosToLoad(0, 9)).toEqual(new Set([8, 0, 1]))
    expect(photosToLoad(4, 9)).toEqual(new Set([3, 4, 5]))
    expect(photosToLoad(0, 1)).toEqual(new Set([0]))
    expect(photosToLoad(0, 2)).toEqual(new Set([0, 1]))
  })
})
