import { describe, expect, it } from 'vitest'
import { autoLoadAllowed } from './liveGarment'

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
