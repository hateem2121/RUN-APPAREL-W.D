import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEWS, PAGE_HTML, renderHarnessPage } from './render'

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
   * ⚠️ THE INCIDENT THIS PINS (2026-09-08). model-viewer's own loading chrome can
   * be CAPTURED, and its progress bar was: `#default-progress-bar > .bar` is a
   * full-width 5px strip at `top: 0` filled with
   * `var(--progress-bar-color, rgba(0, 0, 0, 0.4))`, so a poster came out with
   * **alpha 102 across the whole top edge, 5 rows deep** — `posters.test.ts`
   * reporting `expected 102 to be +0`. It read as a flaky test because the bar is
   * only hidden by CSS transitions (`opacity 0.3s 1s`, applied from a rAF), so an
   * idle machine captures before the bar expands and a loaded one captures while
   * it is still opaque: 8 of 8 concurrent `renderPosters` runs carried the band.
   *
   * The page has always suppressed the POSTER this way; the progress bar was the
   * omission. Height and colour are both asserted because either alone is enough
   * to keep the frame clean, so this survives a rename of one of them.
   */
  it('keeps model-viewer’s own loading chrome out of the capture', () => {
    expect(PAGE_HTML).toContain('--poster-color: transparent')
    expect(PAGE_HTML).toContain('--progress-bar-color: transparent')
    expect(PAGE_HTML).toContain('--progress-bar-height: 0px')
  })

  /** Every page the harness can build, not just the default one. */
  it('suppresses the progress bar on the transparent poster page too', () => {
    for (const background of ['grey', 'transparent'] as const) {
      const page = renderHarnessPage({ background })
      expect(page, `${background} page must hide the progress bar`).toContain(
        '--progress-bar-color: transparent',
      )
      expect(page).toContain('--progress-bar-height: 0px')
    }
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

/**
 * THE INSTRUMENTS, 2026-09-02. Until then the harness page was a bare
 * <model-viewer>: no adaptive near plane (HR-3: depth 183x coarser than the
 * product, sparkle no customer sees) and no decal depth bias (HR-2: 0.00% for a
 * fix the review page shows moving 1.8% of the picture). These pin that the
 * default page carries both, that only the explicit negative control drops them,
 * and that the lighting switch changes lighting and nothing else.
 */
describe('render harness page — instruments and lighting', () => {
  it('carries the near plane and the decal bias by default', () => {
    expect(PAGE_HTML).toContain("Object.defineProperty(camera, 'near'")
    expect(PAGE_HTML).toContain("addEventListener('variant-applied', applyBias)")
    expect(PAGE_HTML).toContain('window.__instruments')
  })

  it('drops them ONLY on the explicit negative control, and says so in the title', () => {
    const blind = renderHarnessPage({ instruments: false })
    expect(blind).not.toContain("Object.defineProperty(camera, 'near'")
    expect(blind).not.toContain('polygonOffset')
    expect(blind).toContain('instruments OFF')
    expect(PAGE_HTML).toContain('instruments on')
  })

  it('defaults to production lighting and offers the flat diagnostic light', () => {
    expect(PAGE_HTML).toContain('tone-mapping="neutral"')
    expect(PAGE_HTML).toContain('production lighting')
    const flat = renderHarnessPage({ lighting: 'diagnostic' })
    expect(flat).toContain('environment-image="neutral"')
    expect(flat).toContain('shadow-intensity="0"')
    // The instruments do not depend on the light.
    expect(flat).toContain("Object.defineProperty(camera, 'near'")
  })

  /**
   * THE BLANK MACRO FRAMES, 2026-09-02. three.js reads the near-plane getter only
   * when the projection is rebuilt; model-viewer rebuilds it on a field-of-view change
   * and never on a radius-only move. A 2.2 m view followed by a 0.6 m view kept the
   * far plane, clipped the whole garment and rendered flat grey — scored 0.00% against
   * the other flat grey. The page refreshes the projection on every camera move, the
   * harness asks for it after each jump, and a flat frame is named in views.json.
   * The browser test drives the sequence; this pins that the wiring is present.
   */
  it('refreshes the projection after a camera move, and names a flat frame', () => {
    expect(PAGE_HTML).toContain("addEventListener('camera-change', refreshProjection)")
    expect(PAGE_HTML).toContain('refreshProjection,')
  })

  it('lets the camera pull back past the framed radius (HR-5)', () => {
    // model-viewer's max-camera-orbit radius defaults to auto, which clamps at the
    // framed distance: 110/140/200/500% all rendered byte-identical to 105%.
    expect(PAGE_HTML).toMatch(/max-camera-orbit="[^"]*\d+%"/)
  })
})
