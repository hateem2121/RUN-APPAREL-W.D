import { describe, expect, it } from 'vitest'
import { autoLoadAllowed, garmentTouchAction } from './liveGarment'

/**
 * The home page's 3D garment loads by itself only where that is kind to the visitor (owner,
 * 2026-09-29: "phones on slow data keep the picture plus a Turn it in 3D button"). A multi-
 * megabyte model on a data-saving or 2G connection waits for a tap instead.
 */
describe('autoLoadAllowed', () => {
  it('loads where the browser says nothing about the connection (Safari, Firefox)', () => {
    expect(autoLoadAllowed(undefined)).toBe(true)
  })

  it('waits for a tap when the visitor has asked to save data', () => {
    expect(autoLoadAllowed({ saveData: true, effectiveType: '4g' })).toBe(false)
  })

  it('waits for a tap on 2G and slower', () => {
    expect(autoLoadAllowed({ effectiveType: '2g' })).toBe(false)
    expect(autoLoadAllowed({ effectiveType: 'slow-2g' })).toBe(false)
  })

  it('loads on 3G and faster', () => {
    expect(autoLoadAllowed({ effectiveType: '3g' })).toBe(true)
    expect(autoLoadAllowed({ effectiveType: '4g', saveData: false })).toBe(true)
  })
})

// Polish M3: the frame sizes measured on the live home page, 2026-10-04 (frame height, screen).
describe('garmentTouchAction', () => {
  it.each([
    [348, 568, '320x568'],
    [398, 640, '360x640'],
    [435, 844, '390x844'],
    [480, 932, '430x932'],
  ])(
    'an upright phone: the garment wins the swipe (%ipx frame, %ipx screen, %s)',
    (frame, screen) => {
      expect(garmentTouchAction(frame, screen)).toBe('none')
    },
  )

  it.each([
    [638, 320, '568x320 sideways'],
    [948, 390, '844x390 sideways'],
    [863, 1024, '768x1024 tablet'],
  ])(
    'a frame filling the screen keeps up-and-down for scrolling (%ipx frame, %ipx screen, %s)',
    (frame, screen) => {
      expect(garmentTouchAction(frame, screen)).toBe('pan-y')
    },
  )

  it('keeps scrolling when it cannot measure (no layout yet)', () => {
    expect(garmentTouchAction(0, 844)).toBe('pan-y')
    expect(garmentTouchAction(435, 0)).toBe('pan-y')
    expect(garmentTouchAction(Number.NaN, 844)).toBe('pan-y')
  })
})
