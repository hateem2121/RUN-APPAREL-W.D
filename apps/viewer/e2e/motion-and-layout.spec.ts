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
/**
 * ⚠️ `reducedMotion: 'reduce'` IN playwright.config.ts DOES NOT REACH THE PAGE,
 * and every layout number in this file was measured through a live animation
 * until 2026-08-20.
 *
 * `apps/viewer/CLAUDE.md` states as settled fact that "Playwright sets
 * `reducedMotion: 'reduce'`, `base.css` gates the reveal on
 * `prefers-reduced-motion: no-preference`, so there is no transform to pollute
 * it" — and that is the stated reason to tune layout against this suite rather
 * than against the live page. Measured on Playwright 1.62.1, all four engines:
 *
 *     info.project.use.reducedMotion       "reduce"     <- config resolved it
 *     matchMedia('...reduce').matches      false        <- page never saw it
 *     after page.emulateMedia() explicitly true         <- the API works fine
 *
 * So the option was configured, resolved, and silently ineffective. Every
 * `.colourways` measurement carried `matrix(1, 0, 0, 1, 0, 24)` — the reveal's
 * own translate — and worse, the value depends on WHEN the assertion ran inside
 * an 800ms transition: caught mid-flight, Firefox reported 6.03px where WebKit
 * reported 24px in the same run. Layout assertions were racing an animation.
 *
 * This makes it explicit, per test, using the API that demonstrably works. The
 * two motion tests below call `emulateMedia` themselves afterwards and still
 * get the branch they ask for.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

const VIEWPORTS = [
  { name: 'small mobile', width: 320, height: 640 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const

/**
 * ⚠️ ONE MATRIX FOR BOTH STAGE-BAND GUARDS — and their being SPLIT is why two
 * defects shipped.
 *
 * Until 2026-08-20 the clearance guard below ran at 375x812 and nothing else,
 * while the thumb guard ran at four portrait sizes that did NOT include 375's
 * partner. Every size was visited and every rule was written, but no size
 * received BOTH checks — and the gap between which screen each one visited is
 * exactly where two live defects sat. Measured on the live site that day:
 *
 *     320x640   colourway rail ends y=598, action bar starts y=568
 *               -> 04 Lime and 05 Black **57% covered**
 *     844x390   **4px** of scrollable strip below the canvas,
 *               against this suite's own 140px floor
 *
 * WHY THIS IS NOT `VIEWPORTS` ABOVE. That matrix exists for document-level
 * checks (reflow, header) and carries tablet and desktop, where `.action-bar` is
 * `display: none` and there is nothing for these two guards to measure against.
 * This one is the phone-shaped screens where the bar is real.
 *
 * ⚠️ LANDSCAPE IS IN THE LIST because a phone turned sideways is an ordinary way
 * to look at a garment and nothing in this file had ever visited one. 844x390 is
 * an iPhone 14/15 Pro Max on its side.
 */
const STAGE_BAND_VIEWPORTS = [
  { name: 'small mobile', width: 320, height: 640 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'iphone 17', width: 402, height: 714 },
  { name: 'large mobile', width: 414, height: 896 },
  { name: 'phone landscape', width: 844, height: 390 },
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
       * ⚠️ THE POSTER FALLBACK HAS NO CONTROLS, AND ASSERTING THEIR EXISTENCE HERE
       * FAILED CI WHILE PASSING ON EVERY LOCAL RUN. This suite runs on projects
       * with no guaranteed WebGL — `playwright.config.ts` says so explicitly of
       * WebKit, and it is true of headless Firefox on Linux too. There
       * `canRender3D()` is false, <Stage> goes to its poster branch, and
       * `{!fallback && <StageControls …>}` correctly renders nothing: there is no
       * camera to point. macOS headless Firefox DOES have WebGL, so the original
       * assertion passed on this machine and failed on all four viewports in CI.
       *
       * So the existence check moved to `webgl.spec.ts`, which is the only project
       * that guarantees a context. What belongs HERE is the overlap invariant, and
       * it is stated so that a missing control cannot make it vacuous by accident:
       * absence is accepted ONLY when the stage is genuinely in its poster
       * fallback, which the DOM says outright.
       */
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
        }
        return {
          canvas: rect('.stage__canvas'),
          controls: rect('.stage__controls'),
          // <Stage> renders this only when `isPoster(phase)` — no WebGL, no GLB,
          // Save-Data, a module failure, or a lost context.
          posterFallback: document.querySelector('.stage__poster-fallback') !== null,
        }
      })

      expect(boxes.canvas, 'no .stage__canvas on the page').not.toBeNull()

      if (boxes.controls === null) {
        expect(
          boxes.posterFallback,
          'the camera controls are missing and the stage is NOT in its poster ' +
            'fallback — they are reserved-and-disabled during the download, never ' +
            'unmounted, so this means they were removed',
        ).toBe(true)
        return
      }

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

  /**
   * The rail must clear the action bar by a MARGIN, not by zero.
   *
   * The test above asserts `rail.bottom <= usableBottom`, which is the right
   * invariant and is satisfied by a layout with nothing to spare. On 2026-08-19
   * the stage budget was retuned to give the garment more height and a first
   * attempt landed at `rail.bottom === 644` against an action bar starting at
   * 642 — caught by that test, correctly. A second attempt landed at 640: two
   * pixels of clearance, passing, and one font-metric change away from failing
   * in production instead of here.
   *
   * So the clearance is asserted directly. 8px is below the 10 the budget was
   * measured to give (see `.stage__canvas` in page.css) and above the 0-2 that
   * two arithmetic errors produced, which is exactly the band this should catch.
   *
   * ⚠️ If this fails, the fix is to RAISE the subtrahend in page.css, never to
   * lower this number. The whole point is that the garment cannot be grown by
   * quietly pushing the colour picker under the bar.
   */
  /**
   * ⚠️ PARAMETERISED 2026-08-20. It ran at 375x812 alone, and 320x640 — a size
   * this file already visited for the OTHER guard — was burying two colourways
   * under the bar the whole time. See `STAGE_BAND_VIEWPORTS`.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the colourway rail clears the action bar at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measured = await page.evaluate(() => {
        const bar = document.querySelector('.action-bar')
        const rail = document.querySelector('[role="tablist"]')
        if (!rail) return null
        // `.action-bar` is `display: none` above 900px AND on any screen under
        // 500px tall (the max-height rule that gives a zoomed-in visitor their
        // screen back). Report its presence rather than substituting a number.
        const barShown = Boolean(bar) && getComputedStyle(bar as Element).display !== 'none'
        return {
          barShown,
          barTop: barShown ? Math.round((bar as Element).getBoundingClientRect().top) : 0,
          railBottom: Math.round(rail.getBoundingClientRect().bottom),
        }
      })

      expect(measured, 'no colourway tablist on the page').not.toBeNull()
      const { barShown, barTop, railBottom } = measured as {
        barShown: boolean
        barTop: number
        railBottom: number
      }

      /**
       * ⚠️ THE INVARIANT IS "NOT COVERED", NOT "ABOVE THE FOLD" — and conflating
       * the two made this test wrong on its first run, 2026-08-20.
       *
       * Substituting the viewport's bottom edge for an absent bar failed at
       * 844x390 with -104px, because the rail there is simply BELOW THE FOLD.
       * That is not this test's defect to catch: a rail below the fold is
       * scrollable and fully tappable, and `.stage-block`'s own comment names it
       * as the ACCEPTABLE degradation when a screen is too short. A rail under a
       * fixed bar is neither. Only the second is a defect.
       *
       * So when no bar is painted there is nothing that can cover the rail, and
       * this skips with a reason rather than passing vacuously against a number
       * that means nothing.
       */
      test.skip(
        !barShown,
        `no fixed action bar is painted at ${width}x${height}, so nothing can ` +
          `cover the colourway rail here`,
      )

      expect(
        barTop - railBottom,
        `the colourway rail has ${barTop - railBottom}px of clearance under the ` +
          `fixed action bar (rail ends ${railBottom}, bar starts ${barTop}). ` +
          `Raise the subtrahend in .stage__canvas — do not lower this threshold.`,
      ).toBeGreaterThanOrEqual(8)
    })
  }

  /**
   * The colourway rail never strands a single swatch on its own row.
   *
   * ⚠️ THE FAILURE THIS CATCHES IS COSMETIC AND THEREFORE INVISIBLE TO EVERY
   * OTHER GUARD IN THIS FILE. Lowering the grid's `minmax` floor to fit five
   * swatches on one row at 402px makes a 375px phone lay out **4 + 1** — one tab
   * alone against three empty cells. Nothing overflows, nothing is covered,
   * every clearance assertion passes, and the control looks broken.
   *
   * So the rule is stated directly: the last row is either full, or it is not
   * alone. A single swatch is only acceptable when the whole rail is one tab.
   *
   * Five is the count that matters — the live product has five colourways and
   * the e2e fixture has four, so a fixture-only check cannot see this. The test
   * appends a fifth before measuring, which is the same "the fixture cannot
   * exhibit the failure" pattern the root CLAUDE.md is built around.
   */
  for (const width of [320, 360, 375, 390, 393, 402, 414, 430]) {
    test(`the colourway rail never strands a single swatch at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const layout = await page.evaluate(() => {
        const list = document.querySelector('.colourways__list')
        if (!list) return null
        // The fixture ships four colourways; production ships five. Measure the
        // production shape, not the fixture's.
        const clone = list.children[0]?.cloneNode(true) as HTMLElement | undefined
        if (clone) {
          clone.setAttribute('aria-selected', 'false')
          clone.id = 'colourway-tab-probe'
          const label = clone.querySelector('.colourway-tab__label')
          if (label) label.textContent = 'Slate'
          list.appendChild(clone)
        }
        const tabs = [...list.querySelectorAll('.colourway-tab')].map((t) =>
          Math.round(t.getBoundingClientRect().top),
        )
        const rows = [...new Set(tabs)].sort((a, b) => a - b)
        const counts = rows.map((top) => tabs.filter((t) => t === top).length)
        clone?.remove()
        return { total: tabs.length, rows: rows.length, counts }
      })

      expect(layout, 'no .colourways__list on the page').not.toBeNull()
      const { total, rows, counts } = layout as {
        total: number
        rows: number
        counts: number[]
      }

      const last = counts[counts.length - 1] ?? 0
      expect(
        rows > 1 && last === 1,
        `${total} swatches laid out as ${counts.join(' + ')} at ${width}px — the ` +
          `last row holds one tab against ${(counts[0] ?? 1) - 1} empty cells. ` +
          `Adjust the minmax floor or the container threshold in page.css; do ` +
          `not delete this test.`,
      ).toBe(false)
    })
  }

  /**
   * The colourway rail spans the stage band, whatever is inside it.
   *
   * ⚠️ THIS GUARDS A LANDMINE, NOT A VISIBLE BUG. When `.stage-block` became a
   * flex column on 2026-08-20, `.colourways` became a flex item — and its
   * long-standing `margin: 0 auto` (there to centre it inside a 1200px measure)
   * SUPPRESSED the default stretch, because auto margins in the cross axis do
   * that. The element stopped filling the band and began shrink-wrapping its
   * widest child.
   *
   * It still looked right, because that widest child was the disclaimer sentence
   * underneath the swatches. Measured at 402x714: hiding `.colourways__hint` took
   * the element from 385px wide to 116px and the grid from three columns to one,
   * turning two rows of swatches into four. So the number of colourways per row
   * was being decided by the length of a sentence — and that sentence has since
   * moved into <ProductPanel>, which is precisely why the probe below hides
   * SWATCHES rather than the sentence: a probe aimed at an element that has left
   * passes vacuously.
   *
   * The test removes contents and asserts the rail does not care. Asserting the
   * width alone would pass against the broken layout.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the colourway rail spans the stage band at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measure = () =>
        page.evaluate(() => {
          const rail = document.querySelector('.colourways')
          if (!rail?.parentElement) return null
          // ⚠️ THE PARENT, NOT `.stage-block` — updated 2026-08-20 when the
          // two-column layout landed. The invariant is "the rail is sized by its
          // container", and in two columns that container is a 260px aside, not
          // the full-width band. Comparing against the band asserted a
          // ONE-COLUMN layout, which is a different claim and not this one.
          const parent = rail.parentElement
          const cs = getComputedStyle(parent)
          const inner =
            parent.getBoundingClientRect().width -
            Number.parseFloat(cs.paddingLeft) -
            Number.parseFloat(cs.paddingRight)
          return {
            rail: Math.round(rail.getBoundingClientRect().width),
            container: Math.round(inner),
          }
        })

      const before = await measure()
      expect(before, 'no .colourways or .stage-block on the page').not.toBeNull()

      // Take away most of what is inside the rail. A rail laid out by its
      // container does not move; one that shrink-wraps collapses onto whatever
      // is left.
      //
      // ⚠️ THIS USED TO HIDE `.colourways__hint`, which was the widest child and
      // therefore the perfect probe — until that element moved into
      // <ProductPanel> on 2026-08-20. Hiding a selector that matches nothing
      // changes nothing and the assertion below would have passed VACUOUSLY,
      // guarding an element that had left the building. Hiding tabs keeps the
      // probe attached to something the rail will always contain.
      await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.colourway-tab')]
        for (const tab of tabs.slice(1)) (tab as HTMLElement).style.display = 'none'
      })
      const after = await measure()

      const { rail: railBefore, container } = before as { rail: number; container: number }
      const { rail: railAfter } = after as { rail: number }

      expect(
        railBefore - railAfter,
        `removing swatches changed the colourway rail's width by ` +
          `${railBefore - railAfter}px (${railBefore} -> ${railAfter}). The rail is ` +
          `sizing itself from its contents instead of from its container. Add ` +
          `width: 100% to .stage-block .colourways — auto margins on a flex item ` +
          `suppress the cross-axis stretch.`,
      ).toBe(0)

      // Fills its container, whatever that container currently is: the full-width
      // band in one column, the aside in two. Capped at the 1200px measure.
      expect(
        Math.min(container, 1200) - railBefore,
        `the colourway rail is ${railBefore}px inside a ${container}px container`,
      ).toBeLessThanOrEqual(1)
    })
  }

  /**
   * The token must equal the thing it describes.
   *
   * `--header-h` is subtracted from the stage band's height. If the header
   * changes and the token does not, the band is wrong by exactly the difference
   * and the colourway rail slides under the action bar — which is the 2026-08-20
   * defect this work exists to fix, arriving again by a new route.
   *
   * ⚠️ THIS GUARD IS THE WHOLE JUSTIFICATION FOR THE TOKEN. The six-part
   * subtrahend it helps replace was re-derived by hand four times and was wrong
   * every time, and the failure was never the arithmetic — it was that nothing
   * ever compared the result against the page. A number nobody checks drifts, no
   * matter how carefully it was worked out the first time.
   *
   * 1px of tolerance for sub-pixel rounding across four engines, and no more.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the header token matches the real header at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measured = await page.evaluate(() => {
        const header = document.querySelector('.header')
        if (!header) return null
        const token = getComputedStyle(document.documentElement).getPropertyValue('--header-h')
        return {
          real: Math.round(header.getBoundingClientRect().height),
          token: Math.round(Number.parseFloat(token)),
        }
      })

      expect(measured, 'no .header on the page').not.toBeNull()
      const { real, token } = measured as { real: number; token: number }

      expect(
        Number.isFinite(token),
        '--header-h did not resolve to a number. It is declared in tokens.css ' +
          'with a 320px override in page.css; check both.',
      ).toBe(true)

      expect(
        Math.abs(real - token),
        `--header-h is ${token}px but the header renders ${real}px at ` +
          `${width}x${height}. Re-measure and update the token in tokens.css, or ` +
          `its max-width:359px override in page.css. Do not widen this tolerance.`,
      ).toBeLessThanOrEqual(1)
    })
  }

  /**
   * ⚠️ THE CANVAS HAVING A HEIGHT DOES NOT MEAN THE GARMENT HAS ONE.
   *
   * `apps/viewer/CLAUDE.md` records a measured **378 x 0** box: `.stage__canvas`
   * survived at its `min-height` while `model-viewer.stage__model` — which is
   * `height: 100%` of a parent that had become `auto` — resolved to zero. The
   * visitor got the blueprint grid and no product, and every height assertion in
   * this file passed the whole time, because they all measure the CONTAINER.
   *
   * The 2026-08-20 flex conversion can reach that same state two ways: a missing
   * `min-height: 0` on one of the elements forwarding the growth, or `height:
   * 100%` failing to resolve against a flex-sized parent. So assert the MODEL's
   * own box, in both axes, at every viewport.
   *
   * ⚠️ THIS PASSES BEFORE THE CHANGE IT GUARDS, DELIBERATELY. A guard first seen
   * failing tells you nothing about whether it can pass; this one was run green
   * against the old layout first, so a later failure is a real regression rather
   * than a test that never worked.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the garment element has a real box at ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      // ⚠️ DO NOT WAIT FOR `model-viewer` ALONE — that makes this a test of the
      // runner's GPU, a mistake `viewer.spec.ts` already documents. Headless
      // Firefox has no WebGL context, so `canRender3D()` correctly refuses and
      // <Stage> renders `.stage__poster-fallback` instead. Both are "the surface
      // showing the garment", both are height:100% of the same parent, and both
      // therefore carry the 378x0 risk this test exists for.
      //
      // ⚠️ AND DO NOT COPY `viewer.spec.ts`'s LOCATOR, which also lists
      // `.stage__loading`. That one asks "did the stage do anything at all", and
      // it resolves on the loading readout — which is painted OVER a
      // model-viewer that has not mounted yet. Waiting on it and then measuring
      // the garment surface is a race, and it failed a scattered 3-of-5
      // viewports per engine on 2026-08-20 before this comment existed.
      //
      // `attached`, not `visible`: during the download the surface is mounted and
      // deliberately not yet painted.
      await page
        .locator('model-viewer, .stage__poster-fallback img')
        .first()
        .waitFor({ state: 'attached' })

      const box = await page.evaluate(() => {
        const model = document.querySelector('model-viewer.stage__model')
        const poster = document.querySelector('.stage__poster-fallback img')
        const el = model ?? poster
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          kind: model ? 'model-viewer' : 'poster fallback',
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })

      expect(
        box,
        'neither model-viewer nor the poster fallback is on the page — the stage ' +
          'is showing no garment surface at all',
      ).not.toBeNull()
      const { kind, w, h } = box as { kind: string; w: number; h: number }

      expect(w, `the ${kind} is ${w}px wide`).toBeGreaterThan(100)
      expect(
        h,
        `the ${kind} is ${h}px tall against a width of ${w}px. A zero or tiny ` +
          `height with a healthy width is the 378x0 failure recorded in ` +
          `apps/viewer/CLAUDE.md: the garment surface is height:100% of a parent ` +
          `that resolved to auto. Check min-height: 0 on the flex chain.`,
      ).toBeGreaterThan(100)
    })
  }

  /**
   * A visitor must always have somewhere to swipe.
   *
   * `Stage.tsx` sets `touch-action: none` on the model, so a one-finger drag
   * anywhere on the canvas turns the garment and NEVER scrolls the page. That is
   * the behaviour the owner asked for, and it is only safe while enough of the
   * screen is not canvas. The justification recorded in `Stage.tsx` was "there is
   * more non-canvas height on screen than canvas" — a fair rule of thumb that
   * stops being true the moment the canvas is grown, while the page stays
   * perfectly scrollable. A rule of thumb is not an invariant; this is.
   *
   * What is measured is the CONTIGUOUS strip below the canvas, because that is
   * the one a thumb actually reaches: the header above the canvas is scrollable
   * too, but nobody reaches the top of a phone to scroll. The fixed action bar
   * counts — it takes touches and the page scrolls under it.
   *
   * 140px is roughly a thumb's comfortable swipe and is far below what the
   * layout gives (measured 277px at both 375x812 and 402x714 on 2026-08-19), so
   * it fails on a real regression rather than on a few pixels of drift.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`a thumb can always scroll the page at ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const strip = await page.evaluate(() => {
        const canvas = document.querySelector('.stage__canvas')
        if (!canvas) return null
        const c = canvas.getBoundingClientRect()
        return {
          below: Math.round(window.innerHeight - c.bottom),
          // ⚠️ BESIDE, ADDED 2026-08-20 WITH THE TWO-COLUMN LAYOUT. The strip
          // below the canvas was the only place to swipe for as long as the
          // canvas spanned the page. Beside it there is now a whole column that
          // is not the model — and a thumb reaches a 260px-wide column at least
          // as easily as a 140px-tall strip. Measuring only "below" asserted a
          // ONE-COLUMN layout rather than the invariant, which is: somewhere
          // big enough to find that is not the garment.
          beside: Math.round(Math.max(c.left, window.innerWidth - c.right)),
          viewportHeight: window.innerHeight,
          canvasBottom: Math.round(c.bottom),
        }
      })

      expect(strip, 'no .stage__canvas on the page').not.toBeNull()
      const { below, beside, canvasBottom, viewportHeight } = strip as {
        below: number
        beside: number
        canvasBottom: number
        viewportHeight: number
      }

      expect(
        Math.max(below, beside),
        `only ${below}px below the garment and ${beside}px beside it is swipeable ` +
          `(canvas ends ${canvasBottom}, viewport ${viewportHeight}). With ` +
          `touch-action: none on the model, a visitor here can scroll the page ` +
          `only from a region too small to find. Shrink the canvas or give the ` +
          `layout a second column — do not lower this threshold.`,
      ).toBeGreaterThanOrEqual(140)
    })
  }

  /**
   * ⚠️ 950 IS THE WIDTH THAT WAS BROKEN, and it is why this loop is not just
   * [phone, desktop].
   *
   * `.action-bar` is hidden from `min-width: 900px`; `.contact-rail` only existed
   * from `min-width: 1100px`. Between those two numbers the page carried **no
   * persistent contact control at all** — and this is the only conversion path in
   * the product, so a visitor at 950px who did not scroll to the contact section
   * simply could not make contact. Nothing reported it because nothing was ever
   * measured at that width: the e2e matrix runs 320/375/768/1280, and 768 and
   * 1280 both sit on working sides of the gap.
   *
   * The second half of the assertion is the one that matters for the owner's
   * report: the controls must be reachable WITHOUT SCROLLING. The desktop rail
   * used to appear only once the garment had scrolled out of view.
   */
  /**
   * ⚠️ EXTENDED 2026-08-20, AND A SECOND HOLE OF THE SAME SHAPE WAS ALREADY OPEN.
   *
   * The 950px gap above was found by asking "which widths carry neither
   * control". Nobody asked it of HEIGHTS. `.action-bar` hides itself below 500px
   * tall — deliberately, to give a zoomed-in visitor their screen back — and
   * `.contact-rail` needs 900px of width. A phone in landscape at 844x390
   * satisfies neither, so it carried **no persistent contact control at all**,
   * exactly as 950px once did, and for four days longer than anyone knew.
   *
   * The matrix is now heights as well as widths, and the selector is by
   * DESTINATION rather than by container: whichever element carries the mailto:
   * and wa.me links counts. That is what the invariant actually says, and it
   * stops this test from having to be edited every time the controls move —
   * which they are about to be, into the two-column layout.
   */
  for (const { name, width, height } of [
    { name: 'phone landscape', width: 844, height: 390 },
    { name: 'the 950 seam', width: 950, height: 800 },
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'wide desktop', width: 1440, height: 900 },
  ] as const) {
    test(`contact is reachable without scrolling at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const reachable = await page.evaluate(() => {
        const inView = (el: Element) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden') return false
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
        }
        // By DESTINATION, not by container — see the note above. The in-page
        // <ContactSection> is deliberately excluded: it is far down the document
        // and is not a persistent control, which is the whole point here.
        const persistent = [
          ...document.querySelectorAll('.contact-rail a, .action-bar a, .stage__contact a'),
        ]
        return {
          scrollY: Math.round(window.scrollY),
          email: persistent.filter(
            (a) => a.getAttribute('href')?.startsWith('mailto:') && inView(a),
          ).length,
          whatsapp: persistent.filter((a) => a.getAttribute('href')?.includes('wa.me') && inView(a))
            .length,
        }
      })

      expect(reachable.scrollY, 'the page should not have scrolled to reach this').toBe(0)
      expect(
        reachable.email,
        `no email control is on screen unscrolled at ${width}x${height}. This is ` +
          `the only conversion path in the product: the visitor taps one of these ` +
          `or leaves. Check that .action-bar, .contact-rail and .stage__contact ` +
          `between them cover every viewport.`,
      ).toBeGreaterThan(0)
      expect(
        reachable.whatsapp,
        `no WhatsApp control is on screen at ${width}x${height}`,
      ).toBeGreaterThan(0)
    })
  }

  /**
   * The product's name moves between columns, and there is only ever one of it.
   *
   * ⚠️ THIS TEST USED TO PIN `.stage__caption`, an aria-hidden echo of the <h1>
   * shown only at ≥900px. That element was removed on 2026-08-21, when
   * <ProductIdentity> moved the real <h1> into `.stage__aside` — beside the
   * garment, on exactly the screens where the caption rendered, which made it a
   * third printing of the same name on one screen.
   *
   * What the old test was really protecting survives and is asserted below: ONE
   * <h1> per page. The new layout can break that in a way the old one could not,
   * because the heading is now rendered by one of two mutually exclusive branches
   * in App.tsx (`{twoColumn && <ProductIdentity/>}` and
   * `<ProductPanel showIdentity={!twoColumn}/>`). Invert one and you get two <h1>
   * elements sharing one id; invert the other and you get none. Both render
   * without erroring, and neither is invalid enough for axe to flag.
   *
   * The viewport is changed on a LIVE page rather than reloaded at each size,
   * because that is the case the hook exists for: `useTwoColumnLayout` subscribes
   * to the query, so rotating a tablet must move the heading without a reload. A
   * reload between sizes would pass against a mount-time-only implementation.
   */
  test('the product heading moves between columns and never doubles', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const h1 = page.getByRole('heading', { level: 1 })
    const asideH1 = page.locator('.stage__aside h1')
    const contentH1 = page.locator('.content h1')

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(h1).toBeVisible()
    await expect(h1).toHaveCount(1)
    await expect(asideH1, 'in two columns the heading belongs beside the garment').toHaveCount(1)
    await expect(contentH1).toHaveCount(0)

    await page.setViewportSize({ width: 375, height: 812 })
    await expect(h1).toBeVisible()
    await expect(h1).toHaveCount(1)
    await expect(contentH1, 'in one column the heading belongs below the garment').toHaveCount(1)
    await expect(asideH1).toHaveCount(0)

    // And back, on the same page — the subscription, not the first render.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(h1).toHaveCount(1)
    await expect(asideH1).toHaveCount(1)

    // The element it replaced is gone for good.
    await expect(page.locator('.stage__caption')).toHaveCount(0)
  })

  /**
   * A landscape phone is two columns and is still the wrong home for a paragraph.
   *
   * ⚠️ THIS IS A REGRESSION TEST FOR A BUG THAT WAS BUILT AND MEASURED BEFORE IT
   * SHIPPED, on 2026-08-21. The first version of <ProductIdentity> keyed off the
   * two-column layout query alone. That query deliberately includes 844x390, so
   * that the colourway rail and the two buttons can sit beside the garment on a
   * short wide screen — a band about 320px tall, which those controls fit into.
   *
   * A 312-character description does not. Rendered there, the aside became the
   * tallest column and the band grew to **726px in a 390px viewport**: the garment
   * was cut off at the fold and both controls went below it. Every unit test
   * passed, every assertion about "exactly one <h1>" passed, and the page was
   * unusable on the device most likely to be holding it sideways.
   *
   * So this test asserts the SHAPE OF THE BAND, not the presence of an element.
   * `toHaveCount(0)` on the aside heading would pass for the wrong reason if the
   * identity were merely hidden with CSS while still driving the column's height.
   */
  test('a landscape phone keeps the garment and its controls on one screen', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Two columns, as designed — the controls belong beside the garment here.
    await expect(page.locator('.stage__aside')).toBeVisible()
    const asideBox = await page.locator('.stage__aside').boundingBox()
    expect(asideBox, 'the aside must exist at this size').not.toBeNull()

    const band = await page.locator('.stage-block').boundingBox()
    expect(
      band?.height,
      'the stage band must not outgrow the viewport here — at 726px the garment ' +
        'is cut off at the fold and the colourway rail goes under it',
    ).toBeLessThanOrEqual(390)

    // The heading stayed below the fold, where there is room for prose.
    await expect(page.locator('.stage__aside h1')).toHaveCount(0)
    await expect(page.locator('.content h1')).toHaveCount(1)

    // What the two-column layout is FOR at this size is still on the first screen.
    for (const control of ['.colourways__list', '.stage__contact']) {
      const box = await page.locator(control).boundingBox()
      expect(box, `${control} must be laid out`).not.toBeNull()
      expect(
        (box?.y ?? 0) + (box?.height ?? 0),
        `${control} must be fully above the fold on a landscape phone`,
      ).toBeLessThanOrEqual(390)
    }
  })

  /**
   * The four spec facts are on screen exactly once, at every width.
   *
   * `specDuplication.test.ts` proves the two breakpoints are the same NUMBER by
   * reading the stylesheet. This proves the number is the right one by counting
   * what a visitor can actually see — the two checks fail for different reasons
   * and neither replaces the other.
   *
   * 1024px and 960px straddle the 1000px seam deliberately: between 900 and 1000
   * the two-column layout is on but the callouts are NOT, so `.spec-list` is the
   * only rendering there and must stay visible. That band is the easiest thing to
   * delete by accident while "tidying up the duplication".
   */
  test('the spec facts render once at every width', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const shown = async () => {
      const callouts = await page.locator('.stage__callouts .callout').count()
      const listVisible = await page.locator('.spec-list').isVisible()
      const calloutsVisible = await page.locator('.stage__callouts').isVisible()
      return { callouts, listVisible, calloutsVisible }
    }

    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await shown(), 'above 1000px the callouts say it and the list must not').toMatchObject({
      calloutsVisible: true,
      listVisible: false,
    })

    await page.setViewportSize({ width: 960, height: 800 })
    expect(
      await shown(),
      'between 900 and 1000 the callouts are off, so the list is the ONLY copy',
    ).toMatchObject({ calloutsVisible: false, listVisible: true })

    await page.setViewportSize({ width: 375, height: 812 })
    expect(await shown(), 'on a phone the list is the only copy').toMatchObject({
      calloutsVisible: false,
      listVisible: true,
    })
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
    //
    // ENGINE COVERAGE FIXED 2026-08-18 (audit M3). The condition was
    // `browserName !== 'chromium'`, so the assertion skipped on webkit,
    // mobile-safari AND firefox — 3 of the suite's 4 skips. The product's entry
    // point is a QR tag scanned with a phone, and on iOS every browser is WebKit,
    // so the engine this assertion targets was not the engine it ran in.
    //
    // The redundancy that hid it: viewer-mobile-safari already runs
    // devices['iPhone 13'] (playwright.config.ts), and every iPhone descriptor
    // sets isMobile, hasTouch and defaultBrowserType 'webkit'. The page handed to
    // this test IS a touch context there, so building a second one was never
    // necessary — only Firefox genuinely cannot, because Playwright does not
    // support isMobile on it.
    //
    // ⚠️ Playwright's WebKit is the DESKTOP WebKit build in a small viewport, not
    // iOS Safari. This covers the engine family that ships on iPhone. It is not
    // proof that iOS Safari behaves identically and must not be quoted as such.
    test.skip(browserName === 'firefox', 'Playwright does not support isMobile on Firefox')

    // This file has no beforeEach — every test navigates itself — and the original
    // version of this one navigated only the context it built, so `page` was still
    // blank here.
    await page.goto('/n001/wine')

    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(
        await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches),
        'a touch context still reports a fine pointer — the guard cannot work here',
      ).toBe(false)
      return
    }

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

/**
 * The Motion chunk must not reach a phone.
 *
 * WHY THIS EXISTS AS A TEST AND NOT A COMMENT. `vite.config.ts` claimed for
 * months that this file already pinned this, and it never did — which is the
 * direct reason the same chunking failure was fixed and reintroduced four times.
 * The assertion is cheap and the defect is invisible without it: every chunk
 * keeps its exact byte count when this regresses, so `check-bundle-budget.mjs`
 * reports nothing and the only symptom is a phone quietly fetching 48 KB gzip it
 * cannot use.
 *
 * WHAT IT CAUGHT, 2026-08-19: the entry chunk carried a static
 * `import{a as t,i as n}from"./motion-*.js"`, so the pointer gate in
 * `polish/index.ts` — which correctly kept `Cursor-*.js` from ever being
 * requested on touch — was gating 2 KB while 130,808 bytes came down anyway.
 * Fixed by moving to rolldown's `advancedChunks`; the full diagnosis is in
 * `vite.config.ts`.
 *
 * ⚠️ IF THIS FAILS, DO NOT RELAX IT. It means Motion has become reachable from
 * the entry graph again, and the byte cost lands on the phone a QR tag is
 * scanned with — the one device in this product that cannot afford it.
 */
test.describe('bundle weight on a phone', () => {
  /**
   * The 3D renderer must not be on the critical path either — same defect class
   * as the Motion one below, six times the weight.
   *
   * `__vitePreload` (a ~700-byte helper) had been placed inside the model-viewer
   * chunk, and the entry imported it from there. A static import of one symbol
   * pulls the whole chunk, so 286,496 bytes gzip of three.js blocked the entry
   * before `canRender3D()` — which declines 3D entirely under Save-Data — could
   * run. Fixed 2026-08-19 by giving the helper its own group; see vite.config.ts.
   *
   * This asserts the SHAPE that matters: model-viewer may be fetched (this page
   * is a 3D viewer), but never as a static dependency of the entry chunk.
   */
  test('the 3D renderer is not a static dependency of the entry chunk', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const assets = join(process.cwd(), 'dist', 'assets')
    const entry = readdirSync(assets).find((f) => /^index-.*\.js$/.test(f))
    expect(entry, 'no built entry chunk in dist/assets — run pnpm build').toBeTruthy()
    const source = readFileSync(join(assets, entry as string), 'utf8')
    const staticImports = source.match(/from"\.\/model-viewer-[^"]*"/g) ?? []
    expect(
      staticImports,
      'the entry chunk statically imports the model-viewer chunk, so every ' +
        'visitor downloads ~287 KB gzip of three.js before the app can start. ' +
        'Check that the preload-helper group in vite.config.ts still wins.',
    ).toEqual([])
  })

  test('a touch device does not download the Motion chunk', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      const file = request.url().split('/').pop() ?? ''
      if (/^motion-.*\.js$/.test(file)) requested.push(file)
    })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    expect(
      requested,
      `a phone downloaded the Motion chunk (${requested.join(', ')}). It exists ` +
        `only for the desktop cursor, which never mounts here.`,
    ).toEqual([])
  })
})
