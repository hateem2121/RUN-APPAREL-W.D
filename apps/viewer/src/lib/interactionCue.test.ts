import { describe, expect, it } from 'vitest'
import { CUE_IDLE_MS, CUE_RETURN_MS, CUE_SWEEP_DEGREES, offsetOrbitAzimuth } from './interactionCue'

describe('offsetOrbitAzimuth', () => {
  it('turns the azimuth and leaves phi and radius exactly as given', () => {
    expect(offsetOrbitAzimuth('12deg 82deg auto', 14)).toBe('26deg 82deg auto')
  })

  it('preserves a metric radius rather than normalising it', () => {
    // The radius is calibrated per product and model-viewer clamps anything
    // under ~54% of the framed distance, so a rewritten radius is a silently
    // different camera. Assert the string comes back untouched.
    expect(offsetOrbitAzimuth('0deg 75deg 0.445m', 14)).toBe('14deg 75deg 0.445m')
  })

  it('preserves a PERCENTAGE radius, which is what production actually sends', () => {
    // Every live product and the e2e fixture use "<deg> <deg> <pct>%", e.g.
    // '0deg 82deg 105%'. The first version of this suite only covered `auto` and
    // a metric radius, so the one format that ships was the one untested.
    expect(offsetOrbitAzimuth('0deg 82deg 105%', 14)).toBe('14deg 82deg 105%')
  })

  it('handles a negative and a fractional azimuth', () => {
    expect(offsetOrbitAzimuth('-30deg 90deg auto', 14)).toBe('-16deg 90deg auto')
    expect(offsetOrbitAzimuth('7.5deg 90deg auto', 14)).toBe('21.5deg 90deg auto')
  })

  it('turns the other way for a negative delta', () => {
    expect(offsetOrbitAzimuth('12deg 82deg auto', -14)).toBe('-2deg 82deg auto')
  })

  it('tolerates extra whitespace, which a CMS textarea will produce', () => {
    expect(offsetOrbitAzimuth('  12deg   82deg   auto  ', 14)).toBe('26deg 82deg auto')
  })

  /**
   * ⚠️ THE REFUSALS ARE THE POINT, not defensive padding. These values come from
   * a CMS field, and the caller skips the sweep entirely on null. A best-effort
   * parse would aim the camera somewhere nobody calibrated on the one page whose
   * job is showing the garment accurately; not animating merely leaves the
   * visitor where they already were.
   */
  it.each([
    ['empty', ''],
    ['only an azimuth', '12deg'],
    ['radians, which model-viewer allows but this does not parse', '0.2rad 82deg auto'],
    ['a bare number with no unit', '12 82deg auto'],
    ['a percentage azimuth, which is not a thing', '50% 82deg auto'],
    ['prose', 'front'],
  ])('refuses %s rather than guessing', (_label, orbit) => {
    expect(offsetOrbitAzimuth(orbit, 14)).toBeNull()
  })
})

describe('cue constants', () => {
  it('waits long enough to be a genuine idle signal, not a flash on arrival', () => {
    // Under ~2s the cue fires while a visitor is still reading the garment and
    // reads as a glitch; the point is to catch someone who has stalled.
    expect(CUE_IDLE_MS).toBeGreaterThanOrEqual(2000)
    expect(CUE_IDLE_MS).toBeLessThanOrEqual(6000)
  })

  it('sweeps far enough to be visible and not far enough to be expensive', () => {
    // The garment is 2.4M triangles at a measured 33.4ms median frame under a 4x
    // CPU throttle. A large sweep is a long stretch of that while the phone is
    // still uploading textures.
    expect(CUE_SWEEP_DEGREES).toBeGreaterThanOrEqual(8)
    expect(CUE_SWEEP_DEGREES).toBeLessThanOrEqual(25)
  })

  it('returns to the calibrated view promptly', () => {
    expect(CUE_RETURN_MS).toBeGreaterThan(0)
    expect(CUE_RETURN_MS).toBeLessThanOrEqual(2000)
  })
})
