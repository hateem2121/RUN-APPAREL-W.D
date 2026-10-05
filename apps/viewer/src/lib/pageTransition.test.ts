import { describe, expect, it, vi } from 'vitest'
import { keepLeavingInstant } from './pageTransition'

/** A `pageswap` as the browser fires it when a transition is on its way out of the page. */
function swap(target: EventTarget) {
  const skipTransition = vi.fn()
  target.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition: { skipTransition } }))
  return skipTransition
}

const aPage = () => new EventTarget() as unknown as Window

describe('leaving a garment page stays instant (polish MO3)', () => {
  it('skips the transition the opt-in in page.css would otherwise start', () => {
    const page = aPage()
    keepLeavingInstant(page)
    expect(swap(page)).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no transition is coming (reduced motion, or a browser without them)', () => {
    const page = aPage()
    keepLeavingInstant(page)
    for (const viewTransition of [null, undefined]) {
      expect(() =>
        page.dispatchEvent(Object.assign(new Event('pageswap'), { viewTransition })),
      ).not.toThrow()
    }
  })

  // VIEWER-E (5 Oct 2026): skipping rejects `ready` with "Transition was skipped"; left unhandled,
  // Sentry's global handler reported it as an error on every link out of a garment page.
  it('handles the rejection skipping causes, so it never reaches Sentry', async () => {
    const page = aPage()
    keepLeavingInstant(page)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const ready = Promise.reject(new DOMException('Transition was skipped', 'AbortError'))
      const skipTransition = vi.fn()
      page.dispatchEvent(
        Object.assign(new Event('pageswap'), { viewTransition: { skipTransition, ready } }),
      )
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(skipTransition).toHaveBeenCalledTimes(1)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  // NEGATIVE CONTROL: the same event on a page that never called it is left to run.
  it('sees the fault: without it the transition is not skipped', () => {
    expect(swap(aPage())).not.toHaveBeenCalled()
  })
})
