import { describe, expect, it } from 'vitest'
import {
  CAMERA_FREEDOM_ATTRIBUTES,
  DECAL_OFFSET_FACTOR,
  DECAL_OFFSET_UNITS,
  instrumentsScript,
  LIGHTING_MODES,
  lightingAttributes,
  lightingModesLiteral,
  MAX_ABS_OVERLAY_BIAS,
  MIN_ABS_OVERLAY_BIAS,
  MIN_NEAR,
  NEAR_FRACTION,
} from './viewer-page'

/**
 * The shared page module. Two pages are built from it (render.ts, review-server.ts),
 * and the 2026-09 audit found them disagreeing about the same file when they were
 * two copies — HR-2 (a fix reported as 0.00%) and HR-3 (a camera 183x coarser than
 * production). These pin the properties that make one source safe to share.
 */
describe('instrumentsScript', () => {
  it('contains no backtick — both callers embed it inside a template literal', () => {
    // A backtick in a comment ends the caller's literal, and the error names
    // something else entirely (cost two cycles on 2026-08-29).
    expect(instrumentsScript()).not.toContain('`')
  })

  it('carries the viewer constants by VALUE, so the page cannot drift from them', () => {
    const script = instrumentsScript()
    expect(script).toContain(`const NEAR_FRACTION = ${NEAR_FRACTION}`)
    expect(script).toContain(`const MIN_NEAR = ${MIN_NEAR}`)
    expect(script).toContain(`const OFFSET_FACTOR = ${DECAL_OFFSET_FACTOR}`)
    expect(script).toContain(`const OFFSET_UNITS = ${DECAL_OFFSET_UNITS}`)
    expect(script).toContain(`const MIN_ABS_OVERLAY_BIAS = ${MIN_ABS_OVERLAY_BIAS}`)
    expect(script).toContain(`const MAX_ABS_OVERLAY_BIAS = ${MAX_ABS_OVERLAY_BIAS}`)
  })

  it('installs the near plane as a GETTER and re-applies the bias per colourway', () => {
    const script = instrumentsScript()
    expect(script).toContain("Object.defineProperty(camera, 'near'")
    // isObject3D, not `.camera` alone — the trap that costs a debugging session.
    expect(script).toContain('value.isObject3D')
    expect(script).toContain("addEventListener('variant-applied', applyBias)")
    expect(script).toContain("addEventListener('load'")
  })

  it('says so when the near plane could NOT be installed (HR-7)', () => {
    // The bias already reported UNREACHABLE on screen; the near plane failed
    // silently. Both now name the failure through window.__instruments.
    const script = instrumentsScript()
    expect(script).toContain('nearPlaneSkipped')
    expect(script).toContain('NEAR PLANE NOT INSTALLED')
    expect(script).toContain('window.__instruments')
  })
})

describe('lightingAttributes', () => {
  it('production is what the customer sees; diagnostic is flat; studio is the sales light', () => {
    expect(lightingAttributes('production', '/env/studio-soft.hdr')).toEqual({
      'environment-image': '/env/studio-soft.hdr',
      'tone-mapping': 'neutral',
      exposure: '1',
      'shadow-intensity': '0.6',
    })
    expect(lightingAttributes('diagnostic', '/env/studio-soft.hdr')).toEqual({
      'environment-image': 'neutral',
      'tone-mapping': 'neutral',
      exposure: '1',
      'shadow-intensity': '0',
    })
    expect(lightingAttributes('studio')['tone-mapping']).toBe('commerce')
    expect(LIGHTING_MODES).toEqual(['production', 'diagnostic', 'studio'])
  })

  it('production without the HDR on disk falls back to neutral with no shadow', () => {
    expect(lightingAttributes('production', 'neutral')).toMatchObject({
      'environment-image': 'neutral',
      'shadow-intensity': '0',
    })
  })

  it('the modes literal keeps the single-quoted shape the review page tests assert', () => {
    const literal = lightingModesLiteral('/env/studio-soft.hdr')
    expect(literal).toContain("'environment-image': '/env/studio-soft.hdr'")
    expect(literal).toContain("'environment-image': 'legacy'")
    expect(literal).not.toContain('`')
  })
})

describe('CAMERA_FREEDOM_ATTRIBUTES', () => {
  it('frees the zoom AND the pull-back — both were silently clamped (2026-08-08, HR-5)', () => {
    const floor = CAMERA_FREEDOM_ATTRIBUTES.match(/min-field-of-view="([\d.]+)deg"/)
    expect(floor).not.toBeNull()
    expect(Number(floor?.[1])).toBeLessThan(12)
    const orbit = CAMERA_FREEDOM_ATTRIBUTES.match(/max-camera-orbit="[^"]*?(\d+)%"/)
    expect(orbit, 'max-camera-orbit must name an explicit radius, not auto').not.toBeNull()
    expect(Number(orbit?.[1])).toBeGreaterThanOrEqual(500)
  })
})
