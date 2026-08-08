import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEWS, PAGE_HTML } from './render'

/**
 * The render harness's own configuration, pinned.
 *
 * These are not tests of rendering — that needs a browser and belongs to
 * `eval:artwork`. They pin the two properties of the HARNESS that decide whether
 * a rendered number means what it says.
 */
describe('render harness page', () => {
  /**
   * ⚠️ THE INCIDENT THIS PINS (2026-08-08). <model-viewer>'s `min-field-of-view`
   * defaults to **12deg**, and this harness did not override it. Every view asking
   * for a tighter crop silently got 12°, and the renderer reported no error —
   * it returned a perfectly plausible frame of the wrong thing.
   *
   * Measured on the real N001 baseline: four renders at 1.4° / 2° / 3.1° / 4.5°
   * came back BYTE-IDENTICAL (sha256 294291db…), as did 1.9° / 2.7° / 4° / 5.9° on
   * a second print; a third separated only between 9.2° and 13.5°, putting the
   * floor exactly at the documented default.
   *
   * The consequence was not cosmetic. `raw/CANONICAL.json` fingerprints
   * `fieldOfView` instead of range-checking it, on the stated grounds that it "is
   * the zoom control" — true only above the floor. Below it, the manifest records a
   * zoom the renderer never used. And it is why CLAUDE.md lists N001's 0.039 m hem
   * label and 0.030 m neck logo as "NOT COVERED": at a 12° floor they could not be
   * framed tightly enough to measure at all, so prints smaller than roughly a hand
   * were unguardable by construction rather than by choice.
   *
   * Removing this attribute silently restores all of that. It must not be removed
   * without a new set of contact sheets.
   */
  it('does not let model-viewer clamp the field of view at its 12deg default', () => {
    expect(PAGE_HTML).toContain('min-field-of-view=')
    const floor = PAGE_HTML.match(/min-field-of-view="([\d.]+)deg"/)
    expect(floor, 'min-field-of-view must be set explicitly, in degrees').not.toBeNull()
    expect(Number(floor![1])).toBeLessThan(12)
  })

  /**
   * `disable-zoom` stops a stray wheel event moving the camera mid-capture. It is
   * unrelated to `fieldOfView`, which is set programmatically per view — a
   * distinction worth pinning, because "zoom is disabled" reads like a reason to
   * delete the attribute above.
   */
  it('keeps interaction out of the capture', () => {
    expect(PAGE_HTML).toContain('disable-zoom')
    expect(PAGE_HTML).toContain('interaction-prompt="none"')
  })

  /**
   * Every default crop view must carry an explicit `fieldOfView`. Left at 'auto',
   * model-viewer frames the whole bounding sphere and a "crop" measures the garment.
   */
  it('gives every crop view an explicit field of view', () => {
    for (const view of DEFAULT_VIEWS.filter((v) => v.name.startsWith('crop-'))) {
      expect(view.fieldOfView, `${view.name} must pin its zoom`).toBeDefined()
    }
  })
})
