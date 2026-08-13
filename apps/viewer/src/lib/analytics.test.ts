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
