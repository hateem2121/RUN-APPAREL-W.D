import { expect, test } from '@playwright/test'

/**
 * The two halves of the motion layer, and the layout invariants that no gate
 * watched before 2026-08-13.
 *
 * WHY THIS FILE EXISTS. `playwright.config.ts` sets `reducedMotion: 'reduce'` in
 * the top-level `use`, for a good reason — it collapses the motion layer so
 * selectors and timing stay stable. The side effect is that the entire suite ran
 * in the branch MOST VISITORS NEVER SEE. `base.css` gates the scroll-reveal on
 * `@media (prefers-reduced-motion: no-preference)`, so `[data-reveal]` elements
 * only take `opacity: 0` in the default case — the case nothing tested. A reveal
 * that never un-reveals would have been invisible to CI and obvious to everyone
 * else.
 *
 * Both branches are therefore asserted here explicitly, each overriding the
 * suite default rather than relying on it.
 *
 * WHY NOT SCREENSHOT BASELINES. Pixel comparison was the obvious tool for the
 * spacing and placement regressions this file guards, and it was rejected:
 * Playwright baselines are per-platform, CI is Linux, and the only machine that
 * can generate them here is macOS. Committing Mac baselines makes CI fail
 * forever; committing none makes the first CI run generate and pass, which is a
 * gate that has never once compared anything. The invariants below are computed
 * from the live DOM instead — platform-independent, no baseline to rot, and they
 * fail on the specific things the 2026-08-13 audit found rather than on any
 * anti-aliasing difference.
 */

/**
 * ⚠️ 320 was ADDED 2026-08-14 and it is the width that mattered.
 *
 * This matrix started at 375 and the page failed at 320: measured live,
 * `clientWidth` 320 against `scrollWidth` 352 — 32px of sideways scrolling, a
 * WCAG 1.4.10 Reflow failure. The gate existed, passed, and was blind to it,
 * because 375 is where the header's contents happen to still fit.
 *
 * 320 is not an arbitrary extra rung. It is the criterion's own threshold, and
 * it is also what a 1280px desktop shows at the 400% zoom the same criterion
 * requires — so this row covers a low-vision desktop visitor as much as a small
 * phone. The rail test below already used 320; the document never did.
 */
const VIEWPORTS = [
  { name: 'small mobile', width: 320, height: 640 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const

test.describe('motion layer', () => {
  test('reduced motion never leaves revealed content invisible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The `opacity: 0` that starts a reveal lives inside
    // `@media (prefers-reduced-motion: no-preference)`, so under `reduce` it must
    // never apply. This is the failure mode most sites ship: hide-then-reveal
    // written unconditionally, with only the transition disabled, which leaves a
    // motion-sensitive visitor on a blank page.
    const hidden = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-reveal]')].filter(
          (el) => Number.parseFloat(getComputedStyle(el).opacity) === 0,
        ).length,
    )
    expect(hidden, 'a [data-reveal] element is invisible under prefers-reduced-motion').toBe(0)
  })

  test('the default branch reveals content rather than stranding it', async ({ page }) => {
    // Explicitly the OPPOSITE of the suite default — this is the branch real
    // visitors get, and until 2026-08-13 nothing exercised it at all.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const reveals = page.locator('[data-reveal]')
    const count = await reveals.count()
    expect(count, 'expected the page to use the scroll-reveal layer at all').toBeGreaterThan(0)

    // Scroll the whole document so every reveal crosses its trigger, then assert
    // that each one actually arrived. `is-inview` is the class the observer adds;
    // asserting the computed opacity instead keeps this honest about what the
    // visitor sees rather than about the mechanism.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) window.scrollTo(0, y)
      window.scrollTo(0, 0)
    })

    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              [...document.querySelectorAll('[data-reveal]')].filter(
                (el) => Number.parseFloat(getComputedStyle(el).opacity) === 0,
              ).length,
          ),
        {
          message: 'a [data-reveal] element never revealed after the page was scrolled through',
          timeout: 10_000,
        },
      )
      .toBe(0)
  })

  test('a finished reveal releases its compositor layer', async ({ page }) => {
    /**
     * `will-change: opacity, transform` was declared on `[data-reveal]` and never
     * withdrawn — `.is-inview` sets `opacity: 1; transform: none` and inherits the
     * hint from the rule above it. Five elements carry `[data-reveal]`, so after
     * the visitor's first scroll the page holds five compositor layers forever,
     * for animations that have finished and cannot run again: `startReveals()`
     * calls `observer.unobserve()` on each element as it arrives.
     *
     * `will-change` is a hint with a real memory cost, and the spec is explicit
     * that it should be removed once the animation is done. This is exactly the
     * device that is already carrying a 27 MB model on a phone GPU.
     *
     * Must run under `no-preference`: the whole reveal layer — and therefore the
     * hint — lives inside that media block, so under the suite's default `reduce`
     * this assertion would pass vacuously.
     */
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.evaluate(() => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) window.scrollTo(0, y)
      window.scrollTo(0, 0)
    })

    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            [...document.querySelectorAll('[data-reveal].is-inview')]
              .filter((el) => getComputedStyle(el).willChange !== 'auto')
              .map((el) => el.className),
          ),
        {
          message:
            'a finished reveal is still holding a compositor layer — will-change is a ' +
            'hint with a memory cost and must be released once the animation is done',
          timeout: 10_000,
        },
      )
      .toEqual([])
  })
})

test.describe('interaction feedback', () => {
  test('every control answers a press, on a phone as well as a pointer', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    /**
     * There was not one `:active` rule in `apps/viewer/src` — verified by grep
     * across every CSS and TSX file on 2026-08-14.
     *
     * That is not an oversight in isolation; it is the shadow of a correct
     * decision. Every interaction cue in this viewer sits inside
     * `@media (hover: hover) and (pointer: fine)`, deliberately, because an
     * ungated `:hover` sticks after a tap (see the touch test below and the
     * `pointer-only styling` suite in tokens.test.ts). The consequence nobody
     * followed through on: the phone — the device a QR code is scanned with —
     * was then left with NO feedback on any control at all.
     *
     * `:active` is the correct answer and is deliberately NOT gated: unlike
     * `:hover` it is a real press on both pointer types and it releases itself.
     */
    const missing = await page.evaluate(() => {
      const css = [...document.styleSheets]
        .flatMap((sheet) => {
          try {
            return [...sheet.cssRules]
          } catch {
            return []
          }
        })
        .map((rule) => rule.cssText)
        .join('\n')
      return [
        '.btn:active',
        '.camera-btn:active',
        '.colourway-tab:active',
        '.theme-toggle:active',
      ].filter((selector) => !css.includes(selector))
    })

    expect(
      missing,
      'these controls give a phone no press feedback — every other cue in this ' +
        'stylesheet is correctly hidden behind (hover: hover), which leaves touch with nothing',
    ).toEqual([])
  })

  /**
   * ⚠️ THE CUSTOM CURSOR IS THE ONE THING ON THIS PAGE NO TEST CAN DRIVE DIRECTLY,
   * and that is by design: `Cursor.tsx` refuses to mount when `navigator.webdriver`
   * is set, so Playwright — and every browser agent — sees an ordinary pointer. It
   * had four simultaneous defects on 2026-08-15 with every gate green.
   *
   * The worst was pure CSS composition, so a real engine is the only place it can be
   * measured; jsdom computes no matrices. `.cursor-ring[data-pointer="true"]` carried
   * `scale: 1.53` while Motion wrote the ring's POSITION into `transform`. CSS
   * applies translate → rotate → scale → transform, with `transform` innermost, so
   * the scale multiplied the translation: the ring's centre landed at 1.53× the
   * pointer's coordinates and flew off-target over every button, link and tab.
   *
   * This builds the real element — real class, real stylesheet, real engine — and
   * writes the transform Motion emits, then reads the computed matrix. The element is
   * synthetic and the inline transform is copied from Motion's `transformPropOrder`;
   * `src/polish/Cursor.test.tsx` pins that Motion really does emit that string, so
   * the two halves meet. What is NOT synthetic is the cascade, which is where the
   * defect lived.
   */
  test('the custom cursor ring stays on the pointer when it is over a button', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'custom cursor is hidden on touch/mobile devices via @media (pointer: coarse)',
    )
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const POINTER = { x: 800, y: 400 }
      const read = (pointerState: 'true' | 'false') => {
        const el = document.createElement('span')
        el.className = 'cursor-ring'
        el.dataset.pointer = pointerState
        // Exactly what Motion writes: x and y precede scale in transformPropOrder.
        el.style.transform =
          `translateX(${POINTER.x}px) translateY(${POINTER.y}px)` +
          (pointerState === 'true' ? ' scale(1.53)' : '')
        document.body.append(el)
        const style = getComputedStyle(el)
        const box = el.getBoundingClientRect()
        /**
         * ⚠️ MEASURE THE RENDERED BOX, NOT `style.transform`. Reading the matrix out
         * of the computed `transform` was this test's first draft and it silently
         * missed the entire defect: `transform` reports only its OWN property, so a
         * standalone `scale` on `.cursor-ring` — the actual bug — never appears in
         * it. The negative control caught the size but passed the position, which is
         * the assertion that matters. `getBoundingClientRect()` is the composed
         * result, so it is the only honest reading here.
         */
        const out = {
          centre: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)],
          size: Math.round(box.width),
          standaloneScale: style.scale,
        }
        el.remove()
        return out
      }
      return { POINTER, resting: read('false'), overButton: read('true') }
    })

    const { POINTER, resting, overButton } = measured

    expect(
      resting.centre,
      `the ring is off the pointer at rest: ${resting.centre} vs ${[POINTER.x, POINTER.y]}`,
    ).toEqual([POINTER.x, POINTER.y])

    expect(
      overButton.centre,
      `the ring flies off the pointer over a button — its centre lands at ` +
        `${overButton.centre} instead of ${[POINTER.x, POINTER.y]}. Something in ` +
        'the cascade is scaling the POSITION: a standalone translate/scale/rotate on ' +
        '.cursor-ring composes ahead of the transform Motion writes. Put the ' +
        'inflation inside that transform (Cursor.tsx), never in base.css.',
    ).toEqual([POINTER.x, POINTER.y])

    // The inflation must still actually happen — a ring that never grows would
    // satisfy the assertions above while losing the whole affordance.
    expect(overButton.size, 'the inflated ring is not the expected 52px').toBe(52)
    expect(
      overButton.standaloneScale,
      'base.css set the standalone `scale` property again — that is the exact ' +
        'regression this test exists for',
    ).toBe('none')
  })
})

test.describe('the header survives a phone', () => {
  for (const width of [320, 360, 375, 390, 414]) {
    test(`controls keep their size and the nav stays on one line at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * `.header` had no flex-wrap and no shrink protection, so a declared width
       * on a child acted as a MAXIMUM. Measured live 2026-08-14, before the fix:
       * the theme toggle rendered 2.0px at 320, 21.1px at 360, 27.1px at 375,
       * 30.7px at 390 and 36.6px at 414 — every one of those under the 44px this
       * system states twice, and the first two under WCAG 2.5.8's 24x24 floor.
       *
       * 360px is called out because it is the commonest Android CSS width, and
       * because the existing target-size test runs at 375 where the control is
       * 27px — big enough to clear 24x24 and therefore invisible to that gate.
       */
      const toggle = await page.$eval('.theme-toggle', (el) => el.getBoundingClientRect().width)
      expect(
        Math.round(toggle),
        `the theme toggle is ${toggle}px wide at ${width}px — docs/DESIGN.md §4 states 44`,
      ).toBeGreaterThanOrEqual(44)

      // Measure the VISIBLE label only. The button carries two spans — the long
      // form is moved offscreen rather than unmounted so the accessible name
      // survives (see Header.tsx) — so a Range over the whole button counts the
      // hidden one too and reports four rects for a single-line button.
      const label = await page.$eval('.header .btn', (el) => {
        const shown =
          [...el.children].find((child) => getComputedStyle(child).position !== 'absolute') ?? el
        const range = document.createRange()
        range.selectNodeContents(shown)
        return { lines: range.getClientRects().length, height: el.getBoundingClientRect().height }
      })
      expect(
        label.lines,
        `the nav label wraps to ${label.lines} lines at ${width}px — it is the only ` +
          'navigation on the page and it sits above the garment',
      ).toBeLessThanOrEqual(1)
      // The user-visible consequence, asserted independently of the markup: two
      // lines measured 56.1px against the 40px declared, and that 16px is what
      // inflated the whole header from 69px to 81px on a phone.
      expect(
        Math.round(label.height),
        `the header button is ${label.height}px tall at ${width}px — 40px is one line`,
      ).toBeLessThanOrEqual(48)
    })
  }

  test('shortening the label below 700px does not change its accessible name', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await page.goto('/n001/wine')
    // The long form moves offscreen rather than unmounting, and the short form is
    // aria-hidden — so this must read the same at every width.
    await expect(page.locator('.header .btn')).toHaveAccessibleName('Back to Catalogue')
  })
})

test.describe('layout invariants', () => {
  for (const viewport of VIEWPORTS) {
    test(`no horizontal overflow at ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      // The page must never scroll sideways. Individual elements MAY exceed the
      // viewport — the colourway rail scrolls horizontally on purpose, and SVG
      // artwork is clipped by its own viewBox — so the assertion is on the
      // document, which is what the visitor actually feels.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(
        overflow.scrollWidth,
        `the page scrolls sideways at ${viewport.width}px ` +
          `(${overflow.scrollWidth} > ${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1)
    })

    test(`the page opens at the very top at ${viewport.name} (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * Measured on the live site 2026-08-17, before this test existed: every
       * viewport arrived at `scrollY: 69` — the header's height, to the pixel.
       *
       * The cause is not a scroll call; there is none anywhere in the viewer.
       * `App.tsx` hands focus to `<main>` when the preloader leaves, and
       * `focus()` scrolls its element into view. `<main>` starts directly below
       * the sticky header and is taller than the viewport, so the browser
       * scrolls the minimum that makes it fill the viewport — which is exactly
       * the header's height.
       *
       * It is not cosmetic. Measured at 390x844 the sticky header then covered
       * the top **29px of the garment**, so the first thing a QR visitor saw was
       * a product with its shoulders cut off — reported as "the model gets cut
       * off", and diagnosed for a while as a stage-height problem.
       *
       * The assertion is on scroll POSITION rather than on the focus call,
       * because `preventScroll` is one of two things that can regress this: a
       * later `scrollIntoView`, an anchor, or restored scroll would all put it
       * back with the focus option still correct.
       */
      /**
       * ⚠️ WAIT FOR THE HAND-OFF, do not assert straight after `toBeVisible`.
       *
       * The first draft of this test read `scrollY` as soon as the <h1> appeared
       * and was FLAKY IN THE DIRECTION THAT PASSES: the focus effect had usually
       * not committed yet, so it measured `scrollY: 0` and went green against the
       * unfixed code. Two runs of the identical test disagreed.
       *
       * Waiting on the hand-off is also the only honest synchronisation point —
       * it is the thing that used to move the page, so "it has happened and the
       * page is still at the top" is exactly the claim being made.
       */
      await page.waitForFunction(() => document.activeElement?.id === 'main-content')

      const top = await page.evaluate(() => ({
        scrollY: Math.round(window.scrollY),
        headerBottom: Math.round(
          document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0,
        ),
        stageTop: Math.round(
          document.querySelector('.stage__canvas')?.getBoundingClientRect().top ?? 0,
        ),
      }))

      expect(
        top.scrollY,
        `the page arrives ${top.scrollY}px down instead of at the top ` +
          `(the header is ${top.headerBottom}px tall — if those two match, ` +
          `something is scrolling <main> into view again)`,
      ).toBe(0)

      // The whole point of the fix: the sticky header must not sit on the stage.
      expect(
        top.stageTop,
        `the sticky header covers the top ${top.headerBottom - top.stageTop}px of the garment`,
      ).toBeGreaterThanOrEqual(top.headerBottom)
    })

    test(`the camera controls sit off the garment at ${viewport.name} (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * FRONT / BACK / SIDE were `position: absolute; bottom: 16px` INSIDE
       * `.stage__canvas` until 2026-08-17, so they were painted on the product.
       *
       * The numbers, measured live before the change: the garment fills 86.3% of
       * the canvas height at every viewport (camera radius and field of view are
       * fixed, so canvas height alone sets the garment's size), which put
       * **26px of garment under the pill at 1440x900 and 38px at 390x844**.
       *
       * The assertion is on the two BOXES, not on the garment's pixels, and
       * deliberately so: the pixels depend on the model, and this must fail for
       * any garment. A control that is outside the canvas cannot be on top of
       * whatever is inside it.
       *
       * ⚠️ It must also never regress by the controls simply vanishing — they are
       * rendered-and-disabled during the download precisely so the row cannot
       * appear late and shove the page around, so their existence is asserted
       * first.
       */
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
        }
        return { canvas: rect('.stage__canvas'), controls: rect('.stage__controls') }
      })

      expect(boxes.canvas, 'no .stage__canvas on the page').not.toBeNull()
      expect(
        boxes.controls,
        'no camera controls on the page — they are reserved-and-disabled during ' +
          'the download, never unmounted, so this means they were removed',
      ).not.toBeNull()

      const { canvas, controls } = boxes as {
        canvas: { top: number; bottom: number }
        controls: { top: number; bottom: number }
      }

      expect(
        controls.top,
        `the camera controls overlap the garment by ${canvas.bottom - controls.top}px ` +
          `(canvas ends at ${canvas.bottom}, controls start at ${controls.top})`,
      ).toBeGreaterThanOrEqual(canvas.bottom)
    })
  }

  test('the garment and its colourway picker fit one phone screen, unscrolled', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    /**
     * Measured on the live site 2026-08-13, before this test existed: the canvas
     * ended at y=674 and the colourway rail began at y=1360 — 686px of product
     * copy in between, because <ColourwayTabs> was rendered inside `.content`
     * AFTER the 613px-tall product panel. Scrolling the rail into view put the
     * canvas 306px above the top of the viewport, so **zero pixels** of the
     * garment were on screen at the moment a visitor chose its colour. Pick a
     * colour blind, scroll back up, discover what you picked.
     *
     * The invariant is deliberately "unscrolled", not "eventually both visible".
     * A weaker assertion — that some scroll position shows both — is satisfied by
     * a layout where the two are 400px apart on a 812px screen, which is the same
     * bug wearing a smaller number. What the visitor is owed is that the garment
     * is already on screen when they reach for the swatches.
     *
     * The fixed action bar is subtracted rather than ignored: it is 72px of
     * EMAIL / WHATSAPP painted over the bottom of the viewport, so a rail that
     * "fits" underneath it does not fit at all.
     */
    const fit = await page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
      }
      const bar = document.querySelector('.action-bar')
      return {
        scrollY: Math.round(window.scrollY),
        usableBottom: bar ? Math.round(bar.getBoundingClientRect().top) : window.innerHeight,
        canvas: box('.stage__canvas'),
        rail: box('[role="tablist"]'),
      }
    })

    expect(fit.canvas, 'no .stage__canvas on the page').not.toBeNull()
    expect(fit.rail, 'no colourway tablist on the page').not.toBeNull()
    const { canvas, rail, usableBottom } = fit as {
      canvas: { top: number; bottom: number }
      rail: { top: number; bottom: number }
      usableBottom: number
    }

    expect(
      canvas.bottom,
      `the garment is cut off: canvas ends at ${canvas.bottom}, ` +
        `usable viewport ends at ${usableBottom}`,
    ).toBeLessThanOrEqual(usableBottom)

    expect(
      rail.bottom,
      `the colourway rail is off screen at rest: it ends at ${rail.bottom}, ` +
        `usable viewport ends at ${usableBottom} — a visitor must scroll the ` +
        `garment away to change its colour`,
    ).toBeLessThanOrEqual(usableBottom)

    expect(
      rail.top,
      `the colourway rail sits above the garment (rail top ${rail.top}, ` +
        `canvas bottom ${canvas.bottom})`,
    ).toBeGreaterThanOrEqual(canvas.bottom)
  })

  test('every interactive control meets the WCAG 2.5.8 target size', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // WCAG 2.2 AA wants 24x24 CSS px, with an exception for targets spaced far
    // enough apart that a 24px circle centred on each would not overlap. Both
    // limbs are evaluated, because the header links legitimately rely on the
    // second one.
    const undersized = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'a, button, [role="button"], [role="tab"], input, select, summary',
        ),
      ].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })

      return targets
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width >= 24 && r.height >= 24) return false
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          const nearest = Math.min(
            ...targets
              .filter((other) => other !== el)
              .map((other) => {
                const q = other.getBoundingClientRect()
                return Math.hypot(cx - (q.x + q.width / 2), cy - (q.y + q.height / 2))
              }),
          )
          return !(nearest >= 24)
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)
          return `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`
        })
    })

    expect(undersized, 'controls below 24x24 CSS px with no spacing exception').toEqual([])
  })

  test('hover styling is inert on a touch device', async ({ page, browserName }) => {
    // The regression this guards shipped as a CSS-only bug: six `:hover` rules
    // with no `(hover: hover)` guard, two of them sharing their styling with
    // `[aria-pressed]` / `[aria-selected]`. On a phone that makes a
    // merely-tapped control look selected. `hasTouch` is what flips the media
    // query, so the assertion has to run in a touch context to mean anything.
    test.skip(browserName !== 'chromium', 'needs a touch-emulating context')

    const context = await page
      .context()
      .browser()
      ?.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 375, height: 812 },
      })
    expect(context, 'expected to be able to open a touch context').toBeTruthy()
    if (!context) return

    const touchPage = await context.newPage()
    try {
      await touchPage.goto('/n001/wine')
      await expect(touchPage.getByRole('heading', { level: 1 })).toBeVisible()

      const anyHoverRuleActive = await touchPage.evaluate(
        () => matchMedia('(hover: hover) and (pointer: fine)').matches,
      )
      expect(
        anyHoverRuleActive,
        'a touch context still reports a fine pointer — the guard cannot work here',
      ).toBe(false)
    } finally {
      await context.close()
    }
  })
})

test.describe('the colourway rail fits the screen', () => {
  for (const width of [320, 375, 414]) {
    test(`every colourway is reachable without sliding at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      /**
       * Measured on the live site 2026-08-13, before this test existed: the rail
       * needed 637px inside 361px of room at 375px wide, so 276px — THREE of the
       * five colourways — sat off the right edge with no visual cue they existed.
       * "03 BUTTE" was clipped mid-word at the boundary.
       *
       * For a B2B garment reference the colourways ARE the product, so a picker
       * that hides 60% of the range by default is not a styling detail.
       *
       * The assertion is deliberately "no horizontal scrolling exists", not "the
       * swatches are wide enough" — a rail that fits by shrinking targets below
       * the WCAG 2.5.8 minimum trades one defect for another, and the target-size
       * test above still guards that independently.
       */
      const fit = await page.evaluate(() => {
        const list = document.querySelector('.colourways__list')
        if (!list) return null
        const listRect = list.getBoundingClientRect()
        const tabs = [...list.querySelectorAll('[role="tab"]')]
        return {
          overflowPx: Math.round(list.scrollWidth - list.clientWidth),
          offEdge: tabs
            .filter((t) => {
              const r = t.getBoundingClientRect()
              return r.right > listRect.right + 1 || r.left < listRect.left - 1
            })
            .map((t) => t.textContent?.trim() ?? '?'),
          /**
           * ⚠️ THE ASSERTION ABOVE PASSED WHILE THE RAIL WAS VISIBLY BROKEN, and
           * this is the one that catches it. Added 2026-08-15.
           *
           * `offEdge` measures the BUTTON boxes against the list. Under the
           * five-equal-columns rule those fit perfectly by construction — `1fr`
           * cannot overflow its own grid. The defect was one level in: at 320px the
           * button was 53.8px wide and "03 BUTTER"'s LABEL was 55.2px, so the text
           * rendered outside its own border and nearly touched the neighbouring
           * button. Nothing clipped it, because the tab sets no `overflow`.
           *
           * A layout test that measures only the boxes it lays out will keep
           * agreeing with itself. Measure the text against the box that holds it.
           *
           * ⚠️ THIS ASSERTION CANNOT CURRENTLY FAIL, AND THAT IS A FIXTURE GAP, NOT
           * A REASON TO DELETE IT. Verified 2026-08-15 by rebuilding with the old
           * five-column rule restored: the suite stayed green.
           *
           * `serve.mjs` serves FOUR colourways; production ships five. Lime is
           * deliberately absent so `/n001/lime` reaches the retired-colourway notice
           * in `a11y.spec.ts` and `viewer.spec.ts`. Under equal columns at 320px that
           * is 71.2px per button against production's 55.4px — and "03 Butter"'s
           * label is 55.2px, so it fits in the fixture and overflows in production.
           * The gate could not see the defect it exists to catch.
           *
           * Closing it means adding `lime` here, re-pointing the retired-colourway
           * URL at a slug that is genuinely absent (`navy` — it never existed in
           * production), and renumbering Black from 04 to 05 in `viewer.spec.ts`.
           * Deliberately not bundled into the 2026-08-15 layout fix; the fix itself
           * was verified by direct measurement in a real browser against the live
           * five-colourway payload, at 320px and 375px, including the longest names
           * in `colour-name.ts` ("Forest Green", 12 chars, wraps to two lines).
           */
          spillingLabels: tabs
            .filter((t) => {
              const label = t.querySelector('.colourway-tab__label')
              if (!label) return false
              const b = t.getBoundingClientRect()
              const l = label.getBoundingClientRect()
              return l.left < b.left - 0.5 || l.right > b.right + 0.5
            })
            .map((t) => t.textContent?.trim() ?? '?'),
          count: tabs.length,
        }
      })

      expect(fit, 'no colourway tablist on the page').not.toBeNull()
      const { overflowPx, offEdge, spillingLabels, count } = fit as {
        overflowPx: number
        offEdge: string[]
        spillingLabels: string[]
        count: number
      }
      expect(count).toBeGreaterThan(0)
      expect(
        overflowPx,
        `the rail scrolls horizontally by ${overflowPx}px — the colours past the ` +
          'edge can only be found by guessing they are there',
      ).toBeLessThanOrEqual(0)
      expect(
        offEdge,
        `these colourways are outside the visible rail: ${offEdge.join(', ')}`,
      ).toEqual([])
      expect(
        spillingLabels,
        `these colourway labels render outside their own button, so the text runs ` +
          `into the neighbouring swatch: ${spillingLabels.join(', ')}`,
      ).toEqual([])
    })
  }
})
