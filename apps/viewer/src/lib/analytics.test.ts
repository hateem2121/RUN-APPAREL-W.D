import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VIEWER_ANALYTICS_EVENTS } from '@run-apparel/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from './analytics'

/**
 * `track()` is three lines and it is the seam every analytics event in the viewer
 * passes through — including the ones the CMS rate-limits and stores.
 *
 * WHY IT IS WORTH PINNING. The event name and the detail shape are a contract with
 * `sanitizeEvents` in apps/cms/src/endpoints/events.ts, which DROPS any analytics
 * event whose name is not in the shared allowlist. That drop is silent by design (the
 * endpoint answers 204 to everything), so a rename on this side does not fail, warn,
 * or log — the events simply stop arriving, and the first person to notice is
 * whoever opens the weekly digest and sees a flat line.
 *
 * The DOM CustomEvent seam is also the integration point the module comment promises
 * for "if richer analytics are ever approved". A test is what makes that promise
 * true rather than aspirational.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

const capture = (fn: () => void): CustomEvent[] => {
  const seen: CustomEvent[] = []
  const listener = (e: Event) => seen.push(e as CustomEvent)
  document.addEventListener('run:analytics', listener)
  try {
    fn()
  } finally {
    document.removeEventListener('run:analytics', listener)
  }
  return seen
}

describe('track', () => {
  it('dispatches a run:analytics CustomEvent carrying the event name', () => {
    const seen = capture(() => track('model_loaded'))

    expect(seen).toHaveLength(1)
    expect(seen[0]?.detail).toEqual({ event: 'model_loaded' })
  })

  it('merges detail fields alongside the event name', () => {
    const seen = capture(() => track('colourway_selected', { variant: 'N001-WINE' }))

    expect(seen[0]?.detail).toEqual({ event: 'colourway_selected', variant: 'N001-WINE' })
  })

  /**
   * The allowlist lives in packages/shared and both sides import it, so this cannot
   * drift — but only as long as something actually calls every member. Without this,
   * an event could be removed from the shared list while a caller in the viewer kept
   * emitting it, and the mismatch would surface only as missing data.
   */
  it.each(VIEWER_ANALYTICS_EVENTS)('emits the shared allowlisted event %s unchanged', (name) => {
    const seen = capture(() => track(name))
    expect(seen, 'no event was dispatched at all').toHaveLength(1)
    expect((seen[0] as CustomEvent).detail).toEqual({ event: name })
  })

  it('does not throw when nothing is listening', () => {
    expect(() => track('viewer_page_loaded')).not.toThrow()
  })
})

/**
 * A SOURCE-LEVEL GUARD, and deliberately so.
 *
 * `onSelectColourway` lives in `App.tsx`, which mounts `<model-viewer>` — and under
 * jsdom that asserts against a stub, which is why this repo's viewer coverage floor
 * is 42% and the real behaviour is covered by `apps/viewer/e2e/` in a browser
 * instead. Telemetry is switched off under automation, so e2e cannot see it either.
 * That leaves this one line covered by nothing, and it was wrong in production for
 * an unknown length of time.
 *
 * ⚠️ WHY THE UNIT TESTS ABOVE COULD NOT CATCH IT. They call `track()` with a literal
 * (`variant: 'N001-WINE'`), so they exercise the transport, never the CHOICE of what
 * to send. And `ColourwayTabs.test.tsx` used to build `variantId` as
 * `N001-${slug.toUpperCase()}` — a value derived from the slug, which made
 * `variantId` look like a perfectly good thing to report. Production CLO writes
 * `"Colorway 5"`. Both fixtures were consistent with the bug.
 *
 * Reading the source is a weak instrument and this comment is the honest label on
 * it. It is strictly better than the nothing that was here before.
 */
describe('what a colourway selection reports (source guard)', () => {
  const APP = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8')
  const trackCall = () => /track\(\s*'colourway_selected',\s*\{([^}]*)\}/.exec(APP)?.[1]

  it('finds the call at all, so the assertions below are not vacuous', () => {
    expect(trackCall(), 'no colourway_selected track() call found in App.tsx').toBeDefined()
  })

  it('reports the slug — the value printed on the QR tag and never renamed', () => {
    expect(trackCall()).toContain('colourway.slug')
  })

  it("does NOT report CLO's internal variantId", () => {
    // Measured live on 2026-08-30: the beacon carried `variant: "Colorway 5"`, and a
    // five-colourway garment emitted "Colorway 6", so the label does not even encode
    // position. Analytics could not answer "which colour do people look at".
    expect(trackCall()).not.toContain('variantId')
  })

  it('the guard can fail (negative control)', () => {
    // Prove the regex actually discriminates, rather than returning undefined and
    // letting `.not.toContain` pass on nothing.
    const regressed = APP.replace('variant: colourway.slug', 'variant: colourway.variantId')
    const call = /track\(\s*'colourway_selected',\s*\{([^}]*)\}/.exec(regressed)?.[1]
    expect(call).toContain('variantId')
    expect(call).not.toContain('colourway.slug')
  })
})
