import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startReveals } from './reveal'

/**
 * ⚠️ WHY THIS IS A UNIT TEST AND NOT AN e2e ONE. `startReveals` short-circuits on
 * `navigator.webdriver` and reveals everything immediately, so under Playwright
 * the observer is never constructed. An e2e assertion about reveal thresholds
 * passes no matter what the threshold is — the classic "the fixture cannot
 * exhibit the failure" shape this repo keeps getting caught by. The only level
 * at which the configuration is reachable is here.
 */

type ObserverOptions = { threshold?: number | number[]; rootMargin?: string }

/** jsdom ships no matchMedia; `matches` is what drives the reduced-motion branch. */
const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

type ObserverCallback = (entries: { isIntersecting: boolean; target: Element }[]) => void

let captured: ObserverOptions | null = null
let observed: Element[] = []
/**
 * ⚠️ THE CALLBACK WAS THROWN AWAY UNTIL 2026-08-29, and that is what made this file
 * unable to fail. The stub kept only the constructor OPTIONS, so every assertion was
 * about configuration. Replace the callback body in `reveal.ts` with nothing and all
 * four tests stayed green — while in production four page sections would sit at
 * `opacity: 0` forever. The e2e suite cannot cover it either: Playwright sets
 * `navigator.webdriver`, so `startReveals` takes the reveal-everything branch and the
 * observer is never constructed. This is the only level where the callback is reachable.
 */
let capturedCb: ObserverCallback | null = null
let unobserved: Element[] = []

beforeEach(() => {
  captured = null
  observed = []
  capturedCb = null
  unobserved = []
  // Reduced motion must be FALSE here or `startReveals` takes the
  // reveal-everything branch and never constructs the observer these tests
  // are about.
  stubMatchMedia(false)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: ObserverCallback, options?: ObserverOptions) {
        captured = options ?? {}
        capturedCb = cb
      }
      observe(el: Element) {
        observed.push(el)
      }
      unobserve(el: Element) {
        unobserved.push(el)
      }
      disconnect() {}
    },
  )
  document.body.innerHTML = '<section data-reveal></section><section data-reveal></section>'
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('startReveals', () => {
  it('observes every element that asks to be revealed', () => {
    startReveals()
    expect(observed).toHaveLength(2)
  })

  it('fires for a section only SLIGHTLY on screen, not one 12% visible', () => {
    /**
     * The bug this pins. The threshold was 0.12, and `.product-info` is 528px
     * tall on a 375x812 phone — so 12% is 63px, and a section peeking above the
     * fold by less than that stayed at `opacity: 0`.
     *
     * That matters because the peek IS the scroll affordance. Measured on the
     * redesigned mobile layout: the product panel peeked 32px, which is 6.1% of
     * its height, so the space deliberately opened up to signal "there is more
     * below" rendered completely blank. A visitor cannot decide to scroll for
     * content they have no reason to believe exists.
     *
     * Asserted as a ceiling rather than an exact value: what matters is that a
     * sliver counts, not the specific number. 0.02 of a 528px section is ~10px.
     */
    startReveals()
    const threshold = captured?.threshold
    expect(typeof threshold).toBe('number')
    expect(
      threshold as number,
      'a tall section peeking above the fold must reveal — at 0.12 a 528px ' +
        'panel needs 63px on screen before it stops being invisible',
    ).toBeLessThanOrEqual(0.02)
  })

  it('still holds content back until it reaches the fold', () => {
    // The negative half: a threshold of exactly 0 would reveal a section the
    // instant its first pixel crossed the boundary, which defeats the effect
    // entirely. The bottom rootMargin is what keeps the reveal feeling staged.
    startReveals()
    expect(captured?.rootMargin).toMatch(/-\d+%/)
  })

  it('reveals everything immediately when motion is not welcome', () => {
    // Load-bearing: this is the branch that stops a reduced-motion visitor from
    // staring at permanently invisible content.
    //
    // Driven through matchMedia rather than by removing IntersectionObserver:
    // `vi.stubGlobal('IntersectionObserver', undefined)` still leaves the KEY on
    // window, so reveal.ts's `!('IntersectionObserver' in window)` guard stays
    // false and it constructs `undefined` instead of taking this branch.
    stubMatchMedia(true)
    startReveals()
    const revealed = document.querySelectorAll('[data-reveal].is-inview')
    expect(revealed).toHaveLength(2)
  })
})

describe('the observer callback — what actually reveals the content', () => {
  /*
   * ⚠️ EVERY TEST IN THIS BLOCK IS NEW ON 2026-08-29, and none of the tests above could
   * have caught what they cover. The suite asserted the observer's SETTINGS — threshold,
   * rootMargin, which elements were observed — and never once ran its callback. Stubbing
   * the callback body to nothing left the whole file green.
   *
   * What that would look like in production: `[data-reveal]` sections have
   * `will-change: opacity, transform` and are held at opacity 0 by `base.css` until
   * `.is-inview` arrives. No `.is-inview` means four sections of the page are invisible,
   * permanently, with no error anywhere.
   */
  const fire = (entries: { isIntersecting: boolean; target: Element }[]) => {
    if (!capturedCb) throw new Error('observer callback was never captured')
    capturedCb(entries)
  }

  it('reveals a section once it intersects', () => {
    startReveals()
    const [first] = Array.from(document.querySelectorAll('[data-reveal]'))
    expect(first?.classList.contains('is-inview')).toBe(false)

    fire([{ isIntersecting: true, target: first as Element }])

    expect(first?.classList.contains('is-inview')).toBe(true)
  })

  it('leaves a section alone while it is still below the fold', () => {
    /*
     * The negative half. Without this, a callback that unconditionally revealed
     * everything would pass the test above and silently destroy the staged effect —
     * every section visible from the first frame.
     */
    startReveals()
    const [first] = Array.from(document.querySelectorAll('[data-reveal]'))

    fire([{ isIntersecting: false, target: first as Element }])

    expect(first?.classList.contains('is-inview')).toBe(false)
  })

  it('stops watching a section once revealed, so it never animates twice', () => {
    startReveals()
    const [first, second] = Array.from(document.querySelectorAll('[data-reveal]'))

    fire([{ isIntersecting: true, target: first as Element }])

    expect(unobserved).toEqual([first])
    expect(second?.classList.contains('is-inview')).toBe(false)
  })

  it('reveals only the sections in the batch, not every observed element', () => {
    startReveals()
    const [first, second] = Array.from(document.querySelectorAll('[data-reveal]'))

    fire([{ isIntersecting: true, target: second as Element }])

    expect(second?.classList.contains('is-inview')).toBe(true)
    expect(first?.classList.contains('is-inview')).toBe(false)
  })
})
