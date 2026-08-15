import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCursor } from './Cursor'

/**
 * ⚠️ WHY THIS FILE EXISTS. The custom cursor had FOUR defects at once and every
 * gate in this repo was green through all of them, because nothing rendered it:
 * `Cursor` refuses to mount under automation (`navigator.webdriver`), so Playwright
 * and every browser agent see an ordinary pointer, and no unit test existed at all.
 *
 * The worst one shipped in `c133949` and survived until 2026-08-15. The ring is
 * positioned by `transform` (Motion writes it) and was inflated by the standalone
 * `scale` property in `base.css`. CSS applies those in a FIXED order — translate,
 * rotate, scale, transform — with `transform` innermost, so the scale multiplied
 * the POSITION: measured with the pointer at (800, 400), the ring's centre landed
 * at (1224, 612). It flew off-target over every button, link and colourway tab.
 *
 * Read what each half covers before trusting either. jsdom computes no transform
 * matrices, so the composition itself is guarded in a real engine by
 * `e2e/motion-and-layout.spec.ts` → "the custom cursor stays on the pointer over a
 * button". What jsdom CAN decide is which layer owns the scale, and the mount
 * ordering — both below, both deterministic.
 */

// Both read matchMedia, which jsdom does not implement. A fine pointer with motion
// allowed is the only configuration in which this component renders anything.
vi.mock('../lib/capabilities', () => ({
  isCoarsePointer: () => false,
  prefersReducedMotion: () => false,
}))
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let teardown: (() => void) | null = null

const ring = () => document.querySelector<HTMLElement>('.cursor-ring')
const dot = () => document.querySelector<HTMLElement>('.cursor-dot')
const hasCursorClass = () => document.documentElement.classList.contains('has-custom-cursor')

/** The pointer moves to (x, y); `over` is what sits under it. */
const move = (x: number, y: number, over: EventTarget = document.body) =>
  act(() => {
    over.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
  })

beforeEach(() => {
  // jsdom leaves this undefined; the component's automation gate reads it.
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  act(() => {
    teardown = mountCursor()
  })
})

afterEach(() => {
  act(() => {
    teardown?.()
  })
  teardown = null
  document.documentElement.classList.remove('has-custom-cursor')
  for (const el of [...document.body.children]) el.remove()
})

describe('the custom cursor hides the real one only once it has drawn a replacement', () => {
  /**
   * The regression this pins: `has-custom-cursor` was added on mount while the dot
   * and ring stayed at `opacity: 0` until the first `mousemove`. The class sets
   * `cursor: none` on the root and on every link, button and tab, so in that window
   * there was NO cursor at all — real one suppressed, replacement invisible.
   *
   * Not a theoretical window. `startPolish()` runs after the ready render, while a
   * 27 MB model downloads, which is exactly when a visitor parks the pointer and
   * waits. Park it and the cursor vanished until they moved.
   */
  it('does not suppress the real cursor before the pointer has been located', () => {
    expect(hasCursorClass(), 'cursor: none applied before anything was drawn').toBe(false)
    expect(ring()?.dataset.hidden).toBe('true')
    expect(dot()?.dataset.hidden).toBe('true')
  })

  it('suppresses it once the pointer position is known', () => {
    move(800, 400)
    expect(hasCursorClass()).toBe(true)
    expect(ring()?.dataset.hidden).toBe('false')
    expect(dot()?.dataset.hidden).toBe('false')
  })

  it('gives the real cursor back when the pointer leaves the window', () => {
    move(800, 400)
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseleave'))
    })
    expect(hasCursorClass(), 'the page kept cursor: none with nothing drawn').toBe(false)
    expect(ring()?.dataset.hidden).toBe('true')
  })

  it('removes the class on teardown', () => {
    move(800, 400)
    expect(hasCursorClass()).toBe(true)
    act(() => {
      teardown?.()
    })
    teardown = null
    expect(hasCursorClass()).toBe(false)
  })
})

describe('the ring reports whether it is over an interactive control', () => {
  /**
   * ⚠️ APPENDS. Assigning `document.body.innerHTML` here destroys the cursor's own
   * host element — `mountCursor` appends `#polish-cursor-root` to the body — so the
   * ring vanishes and every assertion below reads `undefined` instead of failing on
   * the thing it is testing. Cost a run on 2026-08-15.
   */
  const withButton = () => {
    const button = document.createElement('button')
    button.type = 'button'
    const inner = document.createElement('span')
    inner.textContent = 'label'
    button.append(inner)
    document.body.append(button)
    return { button, inner }
  }

  it('is inert over ordinary content', () => {
    move(800, 400)
    expect(ring()?.dataset.pointer).toBe('false')
  })

  it('inflates over a button, and over a child of one', () => {
    const { button, inner } = withButton()
    move(10, 10, button)
    expect(ring()?.dataset.pointer).toBe('true')
    move(10, 10, document.body)
    expect(ring()?.dataset.pointer).toBe('false')
    // The label spans inside a colourway tab are what the pointer actually hits.
    move(10, 10, inner)
    expect(ring()?.dataset.pointer, 'a child of a button must still count').toBe('true')
  })

  /**
   * `mousemove` cannot see the element under a STATIONARY pointer changing, and two
   * routine things on this page do exactly that: Lenis smooth-scrolls the document
   * under a still pointer, and clicking a colourway re-renders the whole tablist.
   * Before `pointerover` was added the ring kept whatever state the last movement
   * left it with.
   */
  it('updates when the element beneath a stationary pointer changes', () => {
    const { button } = withButton()
    move(10, 10, document.body)
    expect(ring()?.dataset.pointer).toBe('false')
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    expect(ring()?.dataset.pointer, 'pointerover did not refresh the state').toBe('true')
  })

  it('ignores pointerover until the pointer has been located', () => {
    // Fresh mount, no mousemove yet — nothing is drawn, so nothing should inflate.
    const { button } = withButton()
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    expect(ring()?.dataset.pointer).toBe('false')
    expect(hasCursorClass()).toBe(false)
  })
})

describe('the inflation belongs to the transform, never to a standalone property', () => {
  /**
   * ⚠️ THIS IS THE ONE THAT WOULD HAVE CAUGHT `c133949`. Do not relax it into
   * "base.css contains no scale" — the dot and ring legitimately use `translate`
   * for centring, and `.cursor-ring` may grow other paint-only state.
   *
   * The rule is narrow and load-bearing: the `[data-pointer="true"]` rule may
   * change PAINT (a fill, a border) and must never change GEOMETRY, because it
   * applies to an element whose position lives in `transform` and every standalone
   * transform property composes ahead of that.
   */
  // `import.meta.dirname` rather than `__dirname`: this file is ESM under vitest,
  // and a cwd-relative path would silently depend on where the runner was invoked.
  const css = readFileSync(join(import.meta.dirname, '..', 'styles', 'base.css'), 'utf8')

  it('base.css does not give the over-a-button rule any transform property', () => {
    const rule = css.match(/\.cursor-ring\[data-pointer="true"\]\s*\{([^}]*)\}/)
    expect(rule, 'the .cursor-ring[data-pointer="true"] rule has gone missing').not.toBeNull()
    const body = (rule as RegExpMatchArray)[1] ?? ''
    for (const property of ['scale', 'translate', 'rotate', 'transform']) {
      expect(
        new RegExp(`(^|[;{\\s])${property}\\s*:`).test(body),
        `\`${property}\` is back in .cursor-ring[data-pointer="true"]. CSS applies ` +
          'translate/rotate/scale before transform, and Motion writes this ' +
          "element's POSITION into transform — so this scales the position, not " +
          'just the size. Measured at (800, 400) it put the ring at (1224, 612). ' +
          'Pass it through Motion in Cursor.tsx instead, where it lands in the same ' +
          'transform string as x/y.',
      ).toBe(false)
    }
  })

  /**
   * The other half of the chain. The rule above proves CSS is not scaling the ring;
   * this proves something still is, and that it lands INSIDE the same transform as
   * the position — where it scales the element about its own centre rather than
   * scaling the translation.
   *
   * Order matters and is asserted: Motion's `transformPropOrder` lists x and y ahead
   * of scale, so it emits `translateX(…) translateY(…) scale(…)`. Within one
   * transform string the functions concatenate left to right, so the element is
   * scaled first and then moved — the composition the standalone `scale` property
   * could not express.
   *
   * jsdom applies no stylesheet and computes no matrix, so this reads the inline
   * string Motion wrote. `e2e/motion-and-layout.spec.ts` carries the real-engine
   * half, where the matrix is actually computed with base.css loaded.
   */
  it('Motion writes the inflation into the transform, after the translation', async () => {
    const button = document.createElement('button')
    button.type = 'button'
    document.body.append(button)
    move(800, 400, button)
    expect(ring()?.dataset.pointer).toBe('true')

    // Motion animates scale over --fast (200ms) on rAF; poll rather than guess.
    const deadline = Date.now() + 2000
    let transform = ''
    while (Date.now() < deadline) {
      transform = ring()?.style.transform ?? ''
      if (/scale\(/.test(transform)) break
      await act(async () => {
        await new Promise((r) => setTimeout(r, 16))
      })
    }

    expect(
      transform,
      'the ring is over a button but nothing scaled it — if the inflation moved ' +
        'back into base.css it will corrupt the position, see the rule above',
    ).toMatch(/scale\(/)
    expect(
      transform.indexOf('scale('),
      `scale must come AFTER the translation in \`${transform}\` — ahead of it, the ` +
        'element is moved and then scaled about the origin, which multiplies the ' +
        'position exactly as the CSS property did',
    ).toBeGreaterThan(transform.indexOf('translateY('))
  })

  it('the resting ring rule does not carry one either', () => {
    // `.cursor-ring { scale: 1 }` looks harmless and is not: it establishes the
    // property, so the matrix picks up a scale step ahead of the position.
    const rule = css.match(/\.cursor-ring\s*\{([^}]*)\}/)
    const body = (rule as RegExpMatchArray)[1] ?? ''
    expect(/(^|[;{\s])scale\s*:/.test(body), '.cursor-ring re-declares scale').toBe(false)
  })
})
