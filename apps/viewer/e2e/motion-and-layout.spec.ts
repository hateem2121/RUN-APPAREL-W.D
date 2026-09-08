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
     * device that is already carrying a 1.9-8.2 MB model on a phone GPU.
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

    /**
     * ⚠️ THE POSITIVE CONTROL BELOW IS THE TEST. Without it this passed twice under a
     * sabotage it exists to catch — audit FA-H-18, re-verified 2026-09-07.
     *
     * `will-change: auto` in `[data-reveal].is-inview` was changed back to
     * `opacity, transform` and the built CSS was confirmed to carry it
     * (`is-inview{opacity:1;will-change:opacity, transform;transform:none}` in
     * `dist/assets/index-*.css`), and a probe on the same page read
     * `willChange: "opacity, transform"` on all four revealed elements, in Chromium
     * and in WebKit. The assertion still went green in **102 ms**.
     *
     * The reason is `expect.poll`: it stops at the FIRST success. `startPolish()` is
     * dynamically imported after the ready render, so for the first frames there is
     * no `.is-inview` anywhere — `querySelectorAll` returns an empty list, the filter
     * returns `[]`, and `.toEqual([])` matches an empty page. Whether this test
     * measured anything depended on whether the poll's first tick beat a dynamic
     * import, and on a warm run it did. Left alone it would have gone on being
     * credited with catching a regression it could not see.
     *
     * So: wait for the reveals to ARRIVE, assert there are some, and only then look
     * at the hint. `[data-reveal]` count is read from the same page rather than
     * hard-coded, because the comment above this test has already been wrong about
     * how many there are (it says five; the fixture renders four).
     */
    const revealCount = await page.locator('[data-reveal]').count()
    expect(
      revealCount,
      'the page uses no reveal layer at all — nothing to release',
    ).toBeGreaterThan(0)
    await expect
      .poll(async () => page.locator('[data-reveal].is-inview').count(), {
        message:
          'no [data-reveal] element ever arrived, so the will-change assertion below ' +
          'would have been made against an empty list',
        timeout: 10_000,
      })
      .toBe(revealCount)

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

  test('the press it answers with is eased, at the duration the token is named for', async ({
    page,
  }) => {
    /**
     * Audit FA-H-31. The `:active { scale: 0.97 }` rules the test above guards had
     * no transition covering `scale`, so both edges of every press were hard cuts:
     * measured six consecutive frames at 0.97 after `mouse.down()` and six at
     * `none` after `mouse.up()`, 0ms either way. `tokens.css` names `--instant`
     * "focus responses and press feedback" and only the focus half used it — the
     * token's second purpose described an intention rather than the code.
     *
     * ⚠️ THE PROPERTY IS READ FROM THE COMPUTED LIST, NOT FROM THE SOURCE. A second
     * `transition` declaration REPLACES the first rather than adding to it, so the
     * obvious "add a rule for scale" fix silently deletes the colour transitions
     * beside it — and the stylesheet would still contain the word `scale`. Only the
     * resolved list can tell the two apart.
     */
    // ⚠️ THE DEFAULT BRANCH, EXPLICITLY. The suite-wide `beforeEach` emulates
    // reduced motion, and `base.css` collapses every transition-duration to 0.01ms
    // there — which is correct behaviour and would make this test pass against a
    // transition list that does not mention `scale` at all, since 0.01 rounds to
    // the same 0 as "absent". This asserts the branch most visitors get.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const ms = (value: string) =>
        value.trim().endsWith('ms')
          ? Number.parseFloat(value)
          : Math.round(Number.parseFloat(value) * 1000)
      const instant = ms(getComputedStyle(document.documentElement).getPropertyValue('--instant'))

      return {
        instant,
        /*
         * ⚠️ `.camera-btn` IS CONDITIONAL ON WEBGL, AND THIS FAILED IN CI FOR THAT REASON.
         * `Stage.tsx` renders `{!fallback && <StageControls …>}` — "the poster branch has
         * no camera to point" — and FIREFOX IS THE ONE ENGINE HERE WITHOUT WebGL, so on a
         * runner it takes the fallback branch and the button does not exist. It passed on
         * every local Firefox, which has WebGL, and failed on both attempts in CI with
         * ".camera-btn is not on the page to measure". Nine other tests in this suite
         * already carry this gate; this one was written without it.
         *
         * Filtered rather than skipped: the other three controls are present in both
         * branches and are most of what this test is for. The assertion below requires a
         * minimum count so a filter that silently matched nothing cannot pass.
         */
        controls: ['.btn', '.camera-btn', '.colourway-tab', '.theme-toggle']
          .filter((selector) => selector !== '.camera-btn' || document.querySelector(selector))
          .map((selector) => {
            const el = document.querySelector(selector)
            if (!el) return { selector, found: false, scaleMs: null, others: 0 }
            const style = getComputedStyle(el)
            const properties = style.transitionProperty.split(',').map((p) => p.trim())
            const durations = style.transitionDuration.split(',').map((d) => ms(d))
            const index = properties.indexOf('scale')
            return {
              selector,
              found: true,
              scaleMs: index === -1 ? null : (durations[index] ?? null),
              // The colour transitions that a replacing declaration would have eaten.
              others: properties.filter((p) => p !== 'scale').length,
            }
          }),
      }
    })

    /*
     * The floor that stops the filter above from emptying the test. Three controls exist
     * in both the WebGL and the poster-fallback branch; only `.camera-btn` is conditional.
     */
    expect(
      measured.controls.length,
      'no controls were measured at all — the page did not render its chrome',
    ).toBeGreaterThanOrEqual(3)

    for (const control of measured.controls) {
      expect(control.found, `${control.selector} is not on the page to measure`).toBe(true)
      expect(
        control.scaleMs,
        `${control.selector} does not transition \`scale\`, so its :active press is a ` +
          `hard cut — see the transition list in page.css (base.css for .btn).`,
      ).toBe(measured.instant)
      expect(
        control.others,
        `${control.selector} lost its other transitions — a second \`transition\` ` +
          `declaration replaces the list rather than extending it.`,
      ).toBeGreaterThanOrEqual(2)
    }
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

      /**
       * The "Back to Catalogue" button was REMOVED on 2026-09-04 (owner decision:
       * search traffic must not be handed the catalogue), and with it the two
       * assertions that used to live here — one counting the label's line-boxes,
       * one bounding the button's height.
       *
       * They are deliberately not replaced with an equivalent on another element.
       * What they were really protecting is the HEADER'S OWN HEIGHT: a wrapped
       * label inflated the header from 69px to 81px, and at 320px the whole bar
       * wrapped to two rows and stood 117px over the garment. That consequence is
       * already asserted directly, and markup-independently, by "the header token
       * matches the real header" below — which compares `--header-h` against the
       * rendered height at every stage-band viewport with 1px of tolerance.
       *
       * Re-adding a bespoke per-element bound here would be a second, weaker
       * measurement of the same thing, and the weaker one is what drifts.
       */
    })
  }

  test('the header offers no catalogue link at any width', async ({ page }) => {
    // Replaces "shortening the label below 700px does not change its accessible
    // name", which guarded the two-span responsive label on the catalogue button.
    // Owner decision 2026-09-04 removed that button; this asserts the REMOVAL
    // holds in a real browser, at the width where the short form used to appear.
    // `src/catalogueLinks.test.ts` guards the source; this guards the render.
    await page.setViewportSize({ width: 360, height: 720 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.header .btn')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /catalogue/i })).toHaveCount(0)
    // …and the wordmark is a link to the SITE, never to the catalogue. It was a
    // plain <span> between 2026-09-04 and 2026-09-07; owner decision D5 restored
    // the link once `wear-run.help` had ordinary pages to send anyone to. The
    // catalogue assertion above is the one that must not move.
    await expect(page.locator('a.header__wordmark')).toBeVisible()
    await expect(page.locator('a.header__wordmark')).toHaveAttribute(
      'href',
      'https://wear-run.help',
    )
  })

  test('the wordmark is a real target and keeps the header 69px tall', async ({ page }) => {
    // Two things at once, because the second is what makes the first safe.
    //
    // ⚠️ THE TARGET-SIZE HALF PASSED BEFORE THE FIX — measured, not assumed. The
    // link's box is 24.8px tall with no padding at all, i.e. 0.8px over WCAG
    // 2.5.8's floor, on a number a font produces. The padding takes it to 32.8px;
    // this assertion pins the FLOOR rather than the padding, and says so instead of
    // pretending to be a regression test for something it cannot see.
    //
    // The header height is the assertion that bites: `--header-h` is subtracted
    // from the stage band, and that budget has been wrong four times in this file's
    // history by arithmetic instead of measurement. Making the wordmark taller than
    // the 44px theme toggle grows the header and fails this.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const wordmark = document.querySelector('.header__wordmark')?.getBoundingClientRect()
      const header = document.querySelector('.header')?.getBoundingClientRect()
      return { w: wordmark?.width ?? 0, h: wordmark?.height ?? 0, header: header?.height ?? 0 }
    })

    expect(measured.h, `the wordmark link is ${measured.h}px tall`).toBeGreaterThanOrEqual(24)
    expect(measured.header, 'the header grew: --header-h and the stage budget now lie').toBe(69)
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
      await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')

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
       * absence is accepted ONLY when the stage is genuinely in its fallback,
       * which the DOM says outright.
       *
       * ⚠️ THAT DOM SIGNAL CHANGED 2026-08-21 and took nine of this file's tests
       * down with it. It used to be `.stage__poster-fallback`; the poster image
       * was removed from the stage that day, so the element stopped existing, the
       * escape hatch below stopped opening, and every Firefox run — the one engine
       * that actually takes this branch, having no WebGL — failed. The signal is
       * now the visible notice, which is what the visitor gets and is therefore
       * the thing worth keying on.
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
          // <Stage> SHOWS this only when `isPoster(phase)` — no WebGL, no GLB,
          // Save-Data, a module failure, or a lost context. The element itself is
          // mounted unconditionally so the live region can announce, so presence
          // proves nothing and the `hidden` attribute is the actual signal.
          inFallback: (() => {
            const notice = document.querySelector('.stage__error')
            return notice !== null && !notice.hasAttribute('hidden')
          })(),
        }
      })

      expect(boxes.canvas, 'no .stage__canvas on the page').not.toBeNull()

      if (boxes.controls === null) {
        expect(
          boxes.inFallback,
          'the camera controls are missing and the stage is NOT in its fallback ' +
            '— they are reserved-and-disabled during the download, never ' +
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
   * Five is the count that matters — it is what the live product ships.
   *
   * ⚠️ THIS TEST USED TO APPEND A FIFTH SWATCH ITSELF, because `serve.mjs` served
   * only four. `serve.mjs` serves five as of 2026-08-30, so the append is gone: it
   * would now synthesise a SIXTH, and `page.css` documents that six legitimately
   * lays out 5 + 1 at 320px — the `auto-fit` floor is tuned for five, which is what
   * ships. Leaving the append in place turned a correct layout into a failure, and
   * for a few minutes it looked like a real production defect.
   *
   * The lesson is the fixture one, inverted: a fixture that could not exhibit the
   * failure was compensated for IN THE TEST, and the compensation outlived the gap
   * it existed for. Fix the fixture, then delete the workaround — in that order,
   * and never leave both.
   */
  /**
   * ⚠️ A THIRD FIXTURE-SHAPED GAP, FOUND 2026-09-04: this loop ran EIGHT WIDTHS AND
   * ONE HEIGHT (812), so it never entered the two-column layout at all. Landscape
   * is where the rail stops spanning the page and moves into a ~260px aside — a
   * completely different container, with a `@container` query of its own — and it
   * is exactly where the live site strands a swatch. Measured on r-xmp and r-aj at
   * 844x390 with the reveal complete: 4 + 1, one tab beside three empty cells.
   *
   * A width-only sweep cannot reach a layout that is selected by an ASPECT RATIO.
   * The two-column query is `(min-width: 900px), (min-width: 700px) and
   * (min-aspect-ratio: 3/2)` — 844x390 satisfies the second limb and no width in
   * the old list could, at any height, because 812 makes them all portrait.
   */
  const RAIL_VIEWPORTS = [
    { width: 320, height: 812 },
    { width: 360, height: 812 },
    { width: 375, height: 812 },
    { width: 390, height: 812 },
    { width: 393, height: 812 },
    { width: 402, height: 812 },
    { width: 414, height: 812 },
    { width: 430, height: 812 },
    // Landscape phone — the two-column layout, where the rail is in the aside.
    { width: 844, height: 390 },
    { width: 926, height: 428 },
    /**
     * ⚠️ A FOURTH FIXTURE-SHAPED GAP, FOUND 2026-09-07 (audit FA-E-51): tablet
     * PORTRAIT was in neither list. Above 430 and below 900, held upright, the rail
     * still spans the page and is wider than the 500px container threshold — so it
     * was the one band left on the old wrapping-flex layout, where the number of
     * tabs per row is decided by the length of the colour names. Measured on the
     * live site: r-aj, r-ajm, r-css and r-wzu all laid out 4 + 1 at 768 and/or 834,
     * while rxps — five single-word names — never did at any of ten viewports.
     *
     * The 548 and 600 rows are the same band lower down, where even this fixture's
     * five names wrapped to two rows before the fix.
     */
    { width: 548, height: 900 },
    { width: 600, height: 900 },
    { width: 768, height: 1024 },
    { width: 834, height: 1194 },
  ]
  for (const { width, height } of RAIL_VIEWPORTS) {
    test(`the colourway rail never strands a single swatch at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const layout = await page.evaluate(() => {
        const list = document.querySelector('.colourways__list')
        if (!list) return null
        // No synthesised swatch: the fixture ships the production count (five).
        const tabs = [...list.querySelectorAll('.colourway-tab')].map((t) =>
          Math.round(t.getBoundingClientRect().top),
        )
        const rows = [...new Set(tabs)].sort((a, b) => a - b)
        const counts = rows.map((top) => tabs.filter((t) => t === top).length)
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
      // Firefox has no WebGL context, so `canRender3D()` correctly refuses.
      //
      // ⚠️ THE SECOND ARM USED TO BE `.stage__poster-fallback img`, and this test
      // measured THAT box when the model was absent — both were height:100% of the
      // same parent, so both carried the 378x0 risk. The poster image was removed
      // from the stage on 2026-08-21, which means a browser without WebGL now
      // shows NO garment surface at all: there is nothing left to measure, and the
      // invariant this test guards simply does not apply there. So the wait
      // accepts the notice, and the measurement is skipped in that case rather
      // than asserted against a surface that no longer exists. Skipping silently
      // would be the trap, so the fallback branch still asserts the stage reached
      // its fallback deliberately instead of going blank.
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
        .locator('model-viewer, .stage__error:not([hidden])')
        .first()
        .waitFor({ state: 'attached' })

      const box = await page.evaluate(() => {
        const model = document.querySelector('model-viewer.stage__model')
        if (!model) {
          const notice = document.querySelector('.stage__error')
          return {
            kind: 'fallback' as const,
            inFallback: notice !== null && !notice.hasAttribute('hidden'),
          }
        }
        const r = model.getBoundingClientRect()
        return {
          kind: 'model-viewer' as const,
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })

      if (box.kind === 'fallback') {
        expect(
          box.inFallback,
          'there is no model-viewer AND the stage is not in its fallback — it is ' +
            'showing no garment surface and no explanation either, which is the ' +
            'blank stage this whole file exists to prevent',
        ).toBe(true)
        return
      }

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

  test('a reduced-motion visitor does not download the Lenis chunk', async ({ page }) => {
    /**
     * The same trap as Motion above, found 2026-09-04 at about a seventh of the
     * size. `./smooth-scroll` was a STATIC import in polish/index.ts and it
     * statically imports `lenis`, while the reduced-motion refusal lived INSIDE
     * startSmoothScroll — so a visitor who had asked for less motion downloaded
     * and parsed 18.6 kB of scroll physics and then the function declined to use
     * it. The check was correct and in the wrong place.
     *
     * This asserts the placement, not the check: the bytes must never arrive.
     */
    const requested: string[] = []
    page.on('request', (request) => {
      const file = request.url().split('/').pop() ?? ''
      if (/^lenis-.*\.js$/.test(file)) requested.push(file)
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // the polish layer is imported after first ready render; give it a beat
    await page.waitForTimeout(1500)

    expect(
      requested,
      `a reduced-motion visitor downloaded the Lenis chunk (${requested.join(', ')}). ` +
        `The gate must run BEFORE the dynamic import, as it does for Motion above.`,
    ).toEqual([])
  })
})

test.describe('the garment is named on the first screen', () => {
  /**
   * Measured 2026-09-04 in two browsers on all eleven live products: `.product-info`
   * starts at 836px on an 812px screen, missing the fold by 24px. A visitor who has
   * just scanned a QR tag saw the garment, the colourways and both enquiry buttons —
   * and no name, code, category or spec until they scrolled.
   *
   * The fix is a compact `aria-hidden` line above the canvas, portrait phones only.
   * `aria-hidden` because `<h1 id="product-heading">` must exist exactly once and a
   * screen reader has no fold to be above; see "the product heading moves between
   * columns and never doubles" in this file.
   */
  /**
   * ⚠️ THE TABLET ROWS WERE ADDED 2026-09-05, AND THEY ARE THE POINT OF THIS BLOCK
   * NOW. The rule was `max-width: 699px`, so three real devices took the hidden
   * branch and showed no name at all — measured with reveals forced:
   *
   *     768x1024   iPad portrait       h1 top 1094 — 70px below the fold
   *     834x1194   iPad Pro portrait   h1 top 1267 — 73px below
   *     1024x1366  iPad Pro 12.9       h1 top 1446 — 80px below
   *
   * The last one is two-column, so no width ceiling on this element could have
   * expressed the condition. The element is gated on `!identityInAside` instead —
   * the query that actually decides whether the `<h1>` is on the first screen.
   */
  for (const { width, height, name } of [
    { width: 320, height: 640, name: 'small mobile' },
    { width: 375, height: 812, name: 'mobile' },
    { width: 414, height: 896, name: 'large mobile' },
    { width: 768, height: 1024, name: 'tablet portrait' },
    { width: 834, height: 1194, name: 'tablet pro portrait' },
    { width: 1024, height: 1366, name: 'tablet pro 12.9 portrait' },
  ]) {
    test(`the product code and name are above the fold at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const line = page.locator('.stage-block__name')
      await expect(line).toBeVisible()
      const box = await line.boundingBox()
      expect(box, 'the compact name line has no box').not.toBeNull()
      expect(
        (box as { y: number; height: number }).y + (box as { height: number }).height,
        `the garment's name is below the fold at ${width}x${height} — the case this ` +
          `element exists for`,
      ).toBeLessThan(height)

      // It must carry the code AND the name: the code is what is printed on the tag
      // the visitor just scanned, and the name is what they will quote back.
      const text = (await line.textContent()) ?? ''
      expect(text).toContain('N001')
      expect(text.length, 'the line rendered empty').toBeGreaterThan(6)
    })
  }

  test('a wide desktop uses the real heading instead, so the line is not rendered at all', async ({
    page,
  }) => {
    /**
     * NEGATIVE CONTROL for the block above. Without it, a change that rendered the
     * compact line unconditionally would pass all six sizes and quietly put a second
     * name on every desktop page, above a heading that already says it.
     *
     * 1440x900 puts the identity in the aside (`min-width: 1100px` AND
     * `min-height: 720px`), so `identityInAside` is true and the element is absent
     * from the DOM entirely — not merely hidden.
     */
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
    const box = await h1.boundingBox()
    expect(
      (box as { y: number }).y,
      'the real heading is below the fold on a desktop, so hiding the compact line ' +
        'leaves the garment unnamed there too',
    ).toBeLessThan(900)
    await expect(page.locator('.stage-block__name')).toHaveCount(0)
  })

  test('it stays hidden in the two-column landscape band, which has no row to spare', async ({
    page,
  }) => {
    // 844x390 is asserted elsewhere in this file at <=390px of band. Adding a row
    // there would break that, so the element is deliberately portrait-only — and
    // this pins the deliberateness so nobody "fixes" the inconsistency later.
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.stage-block__name')).toBeHidden()
  })
})

test.describe('text follows the browser text-size setting', () => {
  /**
   * The type scale became rem on 2026-09-04 so a visitor who sets their browser's
   * default text size to Large actually gets larger text — it was px, and `html`
   * declares no font-size, so the setting did nothing at all.
   *
   * ⚠️ SPACING DELIBERATELY STAYED IN px, so this is the guard that matters rather
   * than a formality: text now grows inside boxes that do not. 20px is Chrome's
   * "Large" and 24px its "Very Large"; setting `html { font-size }` is exactly what
   * that preference does to rem.
   *
   * The two failures worth catching are the ones a visitor cannot work around: text
   * pushing the document wider than the screen, and the colourway rail growing until
   * it slides under the fixed action bar — the 2026-08-20 defect, arriving by a new
   * route.
   */
  for (const root of [20, 24]) {
    for (const { width, height, name } of [
      { width: 320, height: 640, name: 'small mobile' },
      { width: 375, height: 812, name: 'mobile' },
      { width: 414, height: 896, name: 'large mobile' },
    ]) {
      test(`no overflow and the rail still clears at ${root}px root, ${name}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.goto('/n001/wine')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.addStyleTag({ content: `html { font-size: ${root}px }` })
        await page.waitForTimeout(400)

        /**
         * ⚠️ CONFIRM THE TEXT SIZE ACTUALLY REACHED THE LAYOUT BEFORE MEASURING IT.
         * On CI's WebKit and mobile-safari it does not: `<html>` reports the new
         * font-size and `.page`'s `padding-bottom` — declared
         * `max(var(--action-bar-h), 4.5rem)`, so rem-derived and unable to be stale
         * for any reason of ours — keeps the value it had at the 16px default:
         *
         *     root 24px reported on <html>   .page padding-bottom  73px  (4.5rem = 108px)
         *
         * The whole declaration is never recomputed when a stylesheet injected by
         * `addStyleTag` changes the root font-size. That is the harness failing to
         * establish the precondition, not the page failing the assertion, and the
         * distinction cost six CI rounds: every mechanism for setting the reserve
         * was tried — custom property, bare var(), inline style, forced reflow,
         * `!important`, a rAF-deferred write and finally a pure-CSS rem floor —
         * and all seven reported the same stale number, because none of them was
         * ever the thing that was broken.
         *
         * A real visitor changes text size through browser settings, which is a
         * different path; macOS WebKit, Chromium and Firefox all propagate it here
         * and run the assertions below normally. So this SKIPS rather than fails:
         * asserting on a page where the setup demonstrably did not apply would be
         * measuring the harness, which is the exact defect this block already
         * carries a scar from.
         */
        const applied = await page.evaluate(() => {
          const page_ = document.querySelector('footer')?.closest('.page')
          const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          const padPx = page_ ? Number.parseFloat(getComputedStyle(page_).paddingBottom) : 0
          // A rem length on a throwaway element, measured through layout rather
          // than read back off a declaration. Nothing of ours can make it stale,
          // so it says whether `rem` means the injected root AT ALL.
          const probe = document.createElement('div')
          probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:4.5rem'
          document.body.appendChild(probe)
          const probePx = probe.getBoundingClientRect().height
          probe.remove()
          return { rootPx, padPx, probePx }
        })
        /**
         * ⚠️ THE YARDSTICK IS THE ROOT WE INJECTED, NEVER THE ONE THE ENGINE REPORTS.
         * This guard read `Math.min(4.5 * applied.rootPx, 4.5 * root)` until
         * 2026-09-08, which disarmed it in precisely the case it exists to catch:
         * when propagation fails, `applied.rootPx` is itself stale, so the floor
         * collapsed to the stale value and the stale padding cleared it.
         *
         * Measured on run 34226292207, mobile-safari at 414x896, 20px root:
         *
         *     injected root 20px    4.5 * root      = 90px   <- ground truth
         *     engine reported 16px  4.5 * rootPx    = 72px   <- stale
         *     .page padding         73px                     <- stale, clears 72
         *     action bar height     77px                     <- DID re-resolve
         *
         * `Math.min(72, 90)` is 72, `73 + 1 < 72` is false, so the precondition was
         * recorded as satisfied and the assertion then compared a re-resolved bar
         * against an unre-resolved reserve and reported a 4px shortfall no visitor
         * experiences. Propagation here is PARTIAL and per-element — the bar grew
         * while `.page` and `<html>`'s own reported size did not — so no single
         * element's self-report can be trusted to answer the question.
         */
        const expectedFloor = 4.5 * root
        test.skip(
          applied.probePx + 1 < expectedFloor || applied.padPx + 1 < expectedFloor,
          `the engine did not re-resolve after the root font-size changed to ${root}px ` +
            `(4.5rem probe measured ${applied.probePx}px, .page padding ${applied.padPx}px, ` +
            `both against an expected ${expectedFloor}px; <html> reports ` +
            `${applied.rootPx}px) — the text size never reached the layout, so there is ` +
            `nothing here to measure`,
        )

        /**
         * ⚠️ MEASURED AFTER SCROLLING TO THE BOTTOM, AND THE FIRST VERSION DID NOT.
         * It asserted clearance at scroll 0, which failed on WebKit and mobile
         * Safari at 320px with 24px text — Chrome's largest setting on the smallest
         * phone. That failure was real but it was not the right question: the action
         * bar is `position: fixed` and `.page` reserves its height at the document
         * end, so a rail sitting under it at REST scrolls clear a moment later.
         *
         * What actually harms a visitor is a swatch they can never reach, not one
         * they must scroll to. So the invariant asserted is reachability, which is
         * also what "every colourway is reachable without sliding" above measures.
         * Weakening this to clearance-at-rest on the widths that happened to pass
         * would have been lowering a gate to go green; changing WHAT is measured to
         * the thing that matters is not the same move, and the numbers below say so
         * either way.
         */
        /**
         * ⚠️ NOTHING IS SCROLLED HERE ANY MORE, AND THAT IS THE FIX. This block
         * used to scroll to the bottom and measure against the viewport, which made
         * every number depend on the scroll having landed. On 2026-09-04 it landed
         * SHORT in CI — and only in CI — and the shortfall was reported as a layout
         * bug. The diagnostics from that run:
         *
         *     barH 106  token 107px  pagePadBottom 107px   <- the reserve was CORRECT
         *     scrollY 1697   maxScroll 1900                <- 203px short of the end
         *
         * `footerHidden` was `barH - padding + shortfall`, so a 203px shortfall read
         * as "the footer is 202px under the action bar". The old line asked to
         * scroll to `document.body.scrollHeight` (2712) against a maximum of 1900;
         * asking past the maximum clamps, so landing at 1697 means the document was
         * SHORTER when the scroll ran and grew afterwards. This machine does not
         * grow it, the assertion passed here by 1px, and four local engines agreed —
         * which is exactly how it reached CI.
         *
         * ⚠️ THREE SCROLL LOOPS WERE TRIED AND ALL THREE LOSE THE RACE, measured
         * against a probe that inserts a 300px spacer before the footer at a known
         * delay. "Until scrollY stops changing" measured 300px short at 120ms —
         * byte-identical to the single scrollTo it replaced — because it tests the
         * condition before scrolling. "Until the end is confirmed once" fixed 120ms
         * and still lost 400ms. "Until the end holds three checks" also lost 400ms,
         * because three checks is a fixed 360ms and the grower fires at 400. The
         * 900ms and 1500ms cases then PASSED VACUOUSLY: the growth lands after the
         * measurement, so there is nothing to be short of yet. A single probe delay
         * would have blessed any of the three.
         *
         * So the scroll is the wrong instrument. What the two assertions below
         * actually mean is "is this element reachable at all", which is a property
         * of the DOCUMENT, not of where the viewport happens to be:
         *
         *     reachable  <=>  elementBottomInDocument <= documentHeight - barHeight
         *
         * `+ window.scrollY` converts a viewport rect to document coordinates, so
         * the answer is identical at any scroll position and there is no race left
         * to lose. It is also immune to the grower by construction: a spacer above
         * the footer moves the footer and the document end by the same 300px.
         */
        const m = await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('[role=tab]')].map((t) =>
            t.getBoundingClientRect(),
          )
          const barEl = document.querySelector('.action-bar')
          const footerEl = document.querySelector('footer')
          const bar = barEl?.getBoundingClientRect() ?? null
          const footer = footerEl?.getBoundingClientRect() ?? null
          /**
           * ⚠️ THESE DIAGNOSTICS EXIST BECAUSE THE BARE NUMBER WAS UNDIAGNOSABLE.
           * On 2026-09-04 this test passed on macOS WebKit by 1px and failed in
           * CI's Linux WebKit container by 260-358px, and the only thing the
           * failure said was "the footer is 358px under the action bar" — which
           * cannot distinguish a token that never got written from a bar that is
           * genuinely that tall from a scroll that never landed. Reproducing it
           * locally is impossible by construction (different engine build,
           * different fonts), so the message has to carry the measurement.
           */
          return {
            scrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            // Document-space reachability. Positive clearance = clears the bar;
            // positive footerHidden = permanently underneath it, no further to scroll.
            clearance:
              bar && tabs.length
                ? Math.round(
                    document.documentElement.scrollHeight -
                      bar.height -
                      (Math.max(...tabs.map((t) => t.bottom)) + window.scrollY),
                  )
                : null,
            footerHidden:
              bar && footer
                ? Math.round(
                    footer.bottom +
                      window.scrollY -
                      (document.documentElement.scrollHeight - bar.height),
                  )
                : null,
            why: {
              barH: bar ? Math.round(bar.height) : null,
              barDisplay: barEl ? getComputedStyle(barEl).display : null,
              token: getComputedStyle(document.documentElement)
                .getPropertyValue('--action-bar-h')
                .trim(),
              pagePadBottom: (() => {
                // NOT `querySelector('.page')`: App.tsx renders an aria-hidden
                // skeleton `.page` too, and the first match was that one — it
                // reported 73px against a 107px token in CI and read as a stale
                // update. Measure the one the footer is actually in.
                const page = document.querySelector('footer')?.closest('.page')
                return page ? getComputedStyle(page).paddingBottom : null
              })(),
              footerInPage: footerEl ? !!footerEl.closest('.page') : null,
              // Distinguishes "the variable never inherited" from "it inherited
              // and the padding never recomputed" — the two look identical in
              // `pagePadBottom` alone, and they need different fixes.
              pageOwnToken: (() => {
                const page = document.querySelector('footer')?.closest('.page')
                return page
                  ? getComputedStyle(page).getPropertyValue('--action-bar-h').trim()
                  : null
              })(),
              pageInlinePad: (() => {
                const page = document.querySelector('footer')?.closest('.page')
                return page instanceof HTMLElement ? page.style.paddingBottom : null
              })(),
              /**
               * ⚠️ SEPARATES THE LAST TWO CANDIDATES, which `pagePadBottom` alone
               * cannot. It read 73px while BOTH the inherited variable and the
               * inline style on that same element read 107px, so either the
               * padding really is 73 (a style that never applied) or it is 107
               * and `documentElement.scrollHeight` is not growing with it (the
               * page cannot scroll far enough to clear the bar — a real defect).
               *
               *   gapBelowFooterInPage  = .page's bottom edge - the footer's
               *   gapBelowFooterInDoc   = the document end     - the footer's
               *
               * Equal and 107 => the reserve applied and the document is fine.
               * Equal and 73  => the padding genuinely never applied.
               * 107 vs 73     => the padding applied and the document is short.
               */
              pages: [...document.querySelectorAll('.page')].map((el) => ({
                pad: getComputedStyle(el).paddingBottom,
                inline: el instanceof HTMLElement ? el.style.paddingBottom : null,
                h: Math.round(el.getBoundingClientRect().height),
                hasFooter: !!el.querySelector('footer'),
                // The raw attribute and the priority: if the declaration is
                // present AND important AND still losing, the cause is outside
                // the cascade entirely.
                attr: el.getAttribute('style'),
                prio:
                  el instanceof HTMLElement ? el.style.getPropertyPriority('padding-bottom') : null,
              })),
              gapBelowFooterInPage: (() => {
                const page = document.querySelector('footer')?.closest('.page')
                const f = document.querySelector('footer')?.getBoundingClientRect()
                return page && f ? Math.round(page.getBoundingClientRect().bottom - f.bottom) : null
              })(),
              gapBelowFooterInDoc: (() => {
                const f = document.querySelector('footer')?.getBoundingClientRect()
                return f
                  ? Math.round(document.documentElement.scrollHeight - (f.bottom + window.scrollY))
                  : null
              })(),
              scrollY: Math.round(window.scrollY),
              maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
              bodySH: document.body.scrollHeight,
              docSH: document.documentElement.scrollHeight,
            },
          }
        })
        const why = JSON.stringify(m.why)

        expect(
          m.scrollW,
          `the document is ${m.scrollW}px wide in a ${m.innerW}px viewport at a ` +
            `${root}px root — enlarged text has pushed the page sideways, which a ` +
            `visitor cannot scroll away from on the axis they read on. ${why}`,
        ).toBeLessThanOrEqual(m.innerW)

        if (m.clearance !== null) {
          expect(
            m.clearance,
            `a colourway swatch sits ${-(m.clearance ?? 0)}px past the last point the ` +
              `page can scroll to at a ${root}px root — the fixed bar covers it and there ` +
              `is no further to go, so it cannot be reached at all. Measured in document ` +
              `space, so this is the reserve being wrong, not the rail starting low. ${why}`,
          ).toBeGreaterThanOrEqual(0)
        }

        /**
         * ⚠️ THE FOOTER IS THE ELEMENT THAT ACTUALLY CAUGHT THE BUG, and checking
         * only the rail said the fix was unnecessary.
         *
         * `--action-bar-h` is what `.page` reserves at the DOCUMENT END, so when it
         * is wrong the last thing on the page is what disappears. Measured at
         * 320x640 with a 24px root, scrolled fully down: with the runtime measure in
         * lib/actionBarHeight.ts the footer clears the bar by 1px; without it the
         * token reads 72px against a 106px bar and the footer sits 34px UNDER it,
         * permanently — there is no further to scroll.
         *
         * Removing that module made every rail assertion above still pass, which is
         * exactly the shape of a guard that measures the wrong element. This line is
         * what makes the module load-bearing in the suite.
         */
        if (m.footerHidden !== null) {
          /**
           * ⚠️ ONE PIXEL OF TOLERANCE BELOW, AND IT IS ROUNDING RATHER THAN SLACK.
           * `documentElement.scrollHeight` is an INTEGER; `footer.bottom` and
           * `bar.height` are fractional, and the reserve is `Math.ceil(height)`. So
           * a correct page lands in [-1, 0] and this assertion sat exactly on its
           * own boundary — measured flaky on Chromium at 375x812 with a 20px root,
           * failing once and passing on a re-run with nothing changed.
           *
           * This does not weaken the gate. The defect it exists for measured +34px
           * in CI, and forcing `--action-bar-h` to 20px against a 106px bar measures
           * +86. One pixel is not a footer anyone cannot read; it is two coordinate
           * systems disagreeing in the last digit.
           */
          expect(
            m.footerHidden,
            `the footer ends ${m.footerHidden}px past the last point the page can scroll ` +
              `to at a ${root}px root — the bottom reserve (--action-bar-h) is smaller than ` +
              `the bar, so the last content on the page can never clear it. ${why}`,
          ).toBeLessThanOrEqual(1)
        }
      })
    }
  }
})

test.describe('the interaction cue tells a visitor the garment is not a photograph', () => {
  /**
   * "On first glance it looks like an image so some visitors ignore it thinking
   * that it's an image" — the owner, 2026-09-04.
   *
   * ⚠️ THE CUE ALREADY EXISTED AND WAS INVISIBLE, which is what these assertions
   * are really guarding. `.stage__hint` has carried "DRAG TO ROTATE · PINCH TO
   * ZOOM" for a long time at 10px in `var(--muted)`, in the corner. So a test
   * that only asserts "the hint exists" would have passed against the broken
   * state and will pass against any future regression back to it. Size,
   * contrast and position are the finding, so they are what is measured.
   */
  const CUE = '.stage__hint'

  /**
   * ⚠️ THE CUE CANNOT EXIST WITHOUT A LIVE 3D STAGE, AND ONE ENGINE HERE HAS NO
   * WebGL. `viewer-firefox` takes the poster fallback, where `<Stage>` renders no
   * hint because there is nothing to drag — so asserting the hint appears there is
   * asserting something unreachable, and it failed in CI on exactly that project
   * plus any run where WebGL did not come up. `apps/viewer/CLAUDE.md` records the
   * same trap from the other direction: of 15 tests once keyed on the fallback
   * markup, 9 were Firefox, "the only engine here without WebGL and so the only
   * one taking that branch".
   *
   * Keyed on what the VISITOR gets, per that file's rule: the error paragraph is
   * always mounted so its live region can announce, so `:not([hidden])` is
   * load-bearing.
   */
  const skipUnless3D = async (page: import('@playwright/test').Page) => {
    const fallback = await page.locator('.stage__error:not([hidden])').count()
    test.skip(fallback > 0, 'no WebGL on this engine — the stage is in poster fallback')
  }

  test('it is absent on arrival and appears only after an idle pause', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await skipUnless3D(page)
    // Immediately after the model loads there is nothing to nag about — the
    // visitor has not had time to be confused yet.
    await expect(page.locator(CUE)).toBeHidden()
    // Generous: the idle timer only STARTS once the model has loaded, and a CI
    // runner decoding a GLB in software takes far longer than this machine.
    await expect(page.locator(CUE)).toBeVisible({ timeout: 30000 })
  })

  test('it is legible: not the 10px muted corner label it replaced', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await skipUnless3D(page)
    await expect(page.locator(CUE)).toBeVisible({ timeout: 30000 })

    const m = await page.evaluate(() => {
      const el = document.querySelector('.stage__hint')
      if (!el) return null
      const s = getComputedStyle(el)
      const stage = el.closest('.stage__canvas') ?? el.parentElement
      const r = el.getBoundingClientRect()
      const sr = stage?.getBoundingClientRect() ?? r
      return {
        fontPx: Number.parseFloat(s.fontSize),
        color: s.color,
        mutedColor: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
        hasIcon: !!el.querySelector('svg'),
        // Distance from the hint's centre to the stage's centre, horizontally,
        // as a share of the stage width. The old rule sat at `left: 3%`.
        offCentre: Math.abs(r.left + r.width / 2 - (sr.left + sr.width / 2)) / sr.width,
      }
    })
    expect(m, 'the hint should be in the DOM once visible').not.toBeNull()
    expect(
      m?.fontPx,
      `the hint is ${m?.fontPx}px — it was 10px and unreadable, which is the whole defect`,
    ).toBeGreaterThan(10)
    expect(
      m?.hasIcon,
      'the hint carries a rotate icon: Baymard advises pairing "Pinch" with one ' +
        'for an international audience, and these buyers are',
    ).toBe(true)
    expect(
      m?.offCentre,
      'the hint should sit under the garment, not pinned to a corner at left: 3%',
    ).toBeLessThan(0.15)
  })

  test('one drag dismisses it for good', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await skipUnless3D(page)
    await expect(page.locator(CUE)).toBeVisible({ timeout: 30000 })

    const box = await page.locator('.stage__canvas').boundingBox()
    if (!box) throw new Error('no stage to drag')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 12 })
    await page.mouse.up()

    await expect(page.locator(CUE)).toBeHidden()
    // And it stays gone. A cue that returns punishes the buyer comparing five
    // colourways, who has already proved they know the garment is interactive.
    await page.waitForTimeout(4500)
    await expect(page.locator(CUE)).toBeHidden()
  })
})

/**
 * The chrome and the content column are two different formulas for one edge, and
 * the four spec callouts are a technical drawing whose fourth corner floated.
 *
 * Both were measured on the live site by the 2026-09-06 audit (FA-D-07, FA-D-08)
 * and both reproduce in this fixture, which is why they are pinned here rather
 * than described in a comment: each one is a number two rules have to agree on,
 * and this file's history is a list of such numbers drifting apart.
 */
test.describe('the page composes on one grid', () => {
  const EDGE_WIDTHS = [390, 768, 1024, 1280, 1440, 1920] as const

  for (const width of EDGE_WIDTHS) {
    test(`the header starts where the page's content column starts at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const edges = await page.evaluate(() => {
        const x = (sel: string) => {
          const el = document.querySelector(sel)
          return el ? Math.round(el.getBoundingClientRect().x * 10) / 10 : null
        }
        // `.footer__inner` is the same 1200px centred measure as `.content` and
        // `.stage__inner`, and it is the one that is present at every width and in
        // every layout branch — the other two move into the two-column band.
        return { wordmark: x('.header__wordmark'), footer: x('.footer__inner') }
      })

      expect(
        edges.wordmark,
        `the wordmark starts at ${edges.wordmark} and the page's own content at ` +
          `${edges.footer}. Two independent inset formulas — see the third term on ` +
          `.header's padding in page.css.`,
      ).toBe(edges.footer)
    })
  }

  test('the four stage callouts share two baselines, not three', async ({ page }) => {
    // 1440x900 because `.stage__callouts` is `display: none` below 1000px — measured
    // 0x0 boxes at 834, 768 and 390 — so this is a desktop-only composition.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const tops = await page.evaluate(() =>
      [...document.querySelectorAll('.callout')].map((c) => ({
        label: c.querySelector('.label')?.textContent?.trim() ?? '',
        top: Math.round(c.getBoundingClientRect().top * 10) / 10,
        bottom: Math.round(c.getBoundingClientRect().bottom * 10) / 10,
      })),
    )

    expect(tops).toHaveLength(4)
    const at = (label: string) => tops.find((t) => t.label.includes(label))

    // The top pair was always pinned and always agreed; asserting it is what makes
    // the bottom assertion meaningful rather than a coincidence of one layout.
    expect(at('FABRIC')?.top).toBe(at('WEIGHT')?.top)

    // ⚠️ THE ONE THAT USED TO FAIL. Measured before the fix, this fixture: [ FIT ]
    // 636.7 against [ PERFORMANCE ] 621.2, and 15.5 / 31.0 / 46.5 / 62.0 across six
    // live products — always a whole multiple of 15.5px, one line of value text,
    // because each block was bottom-anchored and grew upward by however many lines
    // the CMS gave it.
    expect(
      at('FIT')?.top,
      `[ FIT ] sits at ${at('FIT')?.top} and [ PERFORMANCE ] at ${at('PERFORMANCE')?.top} — ` +
        `the bottom pair is meant to share one baseline, set by the taller block.`,
    ).toBe(at('PERFORMANCE')?.top)

    /*
     * …and the row is still anchored where it was: the taller block's bottom edge has not
     * moved toward the plinth.
     *
     * ⚠️ THIS WAS `toBe(686.7)`, AND THAT NUMBER SILENTLY ENCODED "THE STAGE HAS WebGL".
     * CI's Firefox measured 688.3 and failed twice on a layout that is correct.
     *
     * The first guess was platform font metrics, and it was wrong — REPRODUCED locally by
     * launching Firefox with `webgl.disabled: true`, which gives **688.3 exactly**. The
     * 1.6px is the poster-fallback branch composing the stage slightly differently, not a
     * different font stack. A constant read off a WebGL-capable machine is therefore not a
     * property of this layout at all; it is a property of the runner.
     *
     * The sentence above describes a RELATIONSHIP — "has not moved toward the plinth" —
     * and it was written as an absolute, which is the arithmetic-instead-of-measurement
     * mistake this repo's stage-height budget has already made three times. The
     * relationship holds in both branches.
     *
     * So the relationship is what is asserted. The plinth is the thing it must not
     * approach, and its position is read from the same page rather than assumed.
     */
    const plinthTop = await page.evaluate(
      () => document.querySelector('.stage__plinth')?.getBoundingClientRect().top ?? null,
    )
    expect(plinthTop, 'no .stage__plinth to measure against').not.toBeNull()

    const bottom = at('PERFORMANCE')?.bottom ?? 0
    expect(
      plinthTop === null ? 0 : plinthTop - bottom,
      `[ PERFORMANCE ] ends at ${bottom} and the plinth starts at ${plinthTop} — the ` +
        'callout row has drifted down into the controls.',
    ).toBeGreaterThan(0)
  })
})

/**
 * The colourway rail against the catalogue's worst case, not the fixture's.
 *
 * ⚠️ WHY THE LABELS ARE REWRITTEN IN THE TEST. The fixture ships production's five
 * names for ONE product, of which one is long ('Pebble / Optic White', 20 chars).
 * Six of the eleven live products ship SEVERAL two-word names, and that is what
 * strands a swatch at tablet widths — five long labels, not one. No single fixture
 * product can carry both shapes, and the strand guard above deliberately measures
 * the shipped fixture as-is, so this is the other half rather than a substitute for
 * it: same page, labels replaced with the longest name the catalogue actually
 * contains, in the container band where the old flex layout decided rows by content.
 */
test.describe('the colourway rail survives the catalogue, not just the fixture', () => {
  for (const [width, height] of [
    [768, 1024],
    [834, 1194],
  ] as const) {
    test(`five long colour names still lay out in one row at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const layout = await page.evaluate(() => {
        for (const label of document.querySelectorAll('.colourway-tab__label')) {
          label.textContent = 'Pebble / Optic White'
        }
        const tabs = [...document.querySelectorAll('.colourway-tab')].map((t) =>
          Math.round(t.getBoundingClientRect().top),
        )
        const rows = [...new Set(tabs)].sort((a, b) => a - b)
        return { counts: rows.map((top) => tabs.filter((t) => t === top).length) }
      })

      expect(
        layout.counts,
        `five equally-long swatches laid out as ${layout.counts.join(' + ')}. With ` +
          `equal grid columns this cannot depend on the label at all; a wrapping ` +
          `flex row lays them out 4 + 1 here.`,
      ).toEqual([5])
    })
  }

  test('a long one-word colour name stays inside its own tab', async ({ page }) => {
    // Audit FA-E-08, measured live on r-ajm at 1440x900: five 65.6px cells, and
    // "TERRACOTTA" rendered 66.2px — 0.3px across its own right border into the
    // neighbouring swatch. `.colourway-tab` is overflow: visible, so nothing clips
    // and nothing is unreadable; the rail simply has no slack, and the name is read
    // out of a garment file by variant-colour.ts rather than typed by anyone.
    //
    // The fixture cannot exhibit it — its longest WORD is six characters and it
    // wraps at the spaces — so the name is written in. It is a real production
    // value, not a stress string.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const spill = await page.evaluate(() => {
      const worst = { text: '', spill: Number.NEGATIVE_INFINITY, cell: 0 }
      for (const label of document.querySelectorAll('.colourway-tab__label')) {
        label.textContent = 'Terracotta'
      }
      for (const label of document.querySelectorAll('.colourway-tab__label')) {
        const tab = label.closest('.colourway-tab')
        if (!tab) continue
        const range = document.createRange()
        range.selectNodeContents(label)
        const text = range.getBoundingClientRect()
        const cell = tab.getBoundingClientRect()
        const over = Math.max(cell.left - text.left, text.right - cell.right)
        if (over > worst.spill) {
          worst.text = label.textContent ?? ''
          worst.spill = Math.round(over * 10) / 10
          worst.cell = Math.round(cell.width * 10) / 10
        }
      }
      return worst
    })

    expect(
      spill.spill,
      `"${spill.text}" reaches ${spill.spill}px past the edge of its ${spill.cell}px ` +
        `tab, into the swatch beside it. See overflow-wrap on .colourway-tab__label.`,
    ).toBeLessThanOrEqual(0)
  })
})

/**
 * Where the first Tab goes — audit FA-H-26.
 *
 * ⚠️ THE KEYBOARD IS MEASURED HERE AND NOWHERE ELSE, and the reason is worth
 * keeping: a browser-automation pane was measured DROPPING key events on this page
 * (`keydownDoc: 0` on a real press), which made the keyboard look broken when it was
 * fine. Playwright delivers them; every assertion below is on
 * `document.activeElement` after a real `Tab`.
 */
test.describe('the keyboard starts at the top of the document', () => {
  test('Tab 1 reaches the skip link, and Tab 2 the wordmark', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit does not put LINKS in the tab order unless "Press Tab to highlight each item" ' +
        'is on — a browser preference, not a page behaviour. Measured with the skip removed: ' +
        'Tab 1 on WebKit lands on a colourway tab (a <button>), skipping both links. ' +
        'Chromium and Firefox cover this.',
    )
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // ⚠️ WAIT FOR THE HAND-OFF, exactly as "the page opens at the very top" does.
    // Asserting before `App.tsx` moves focus measures the browser's own default and
    // passes against the unfixed code — flaky in the direction that passes.
    await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')

    await page.keyboard.press('Tab')
    const first = await page.evaluate(() => ({
      className: document.activeElement?.className ?? '',
      // The link reveals itself on focus; -75.5px is where it sits when it has not.
      top: Math.round((document.activeElement?.getBoundingClientRect().top ?? -999) * 10) / 10,
    }))
    expect(
      first.className,
      `the first Tab landed on "${first.className}" — focus was handed to <main>, so ` +
        `everything above it (skip link, wordmark, theme toggle) was reachable only ` +
        `backwards. See PAGE_TOP_ID in App.tsx.`,
    ).toContain('skip-link')
    /**
     * ⚠️ POLLED, NOT READ ONCE — the first version of this assertion raced the
     * reveal and failed at exactly -75.5px, the un-revealed position, because
     * `getBoundingClientRect()` right after the key press returns the transition's
     * value at t=0. Same defect this file's own header documents for `.colourways`.
     * What is being asserted is that the link ARRIVES, not when.
     */
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Math.round(document.activeElement?.getBoundingClientRect().top ?? -999),
          ),
        { message: 'the skip link is focused but never leaves its hidden position' },
      )
      .toBeGreaterThanOrEqual(0)

    await page.keyboard.press('Tab')
    const second = await page.evaluate(() => document.activeElement?.className ?? '')
    expect(second).toContain('header__wordmark')
  })

  test('the skip link still skips: it moves focus into <main>, not just the scroll', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'see above — link focus is a WebKit preference')
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')

    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')

    // `tabIndex={-1}` on <main> is what makes this work; without it the fragment
    // moves the scroll position and leaves focus in the header, so the next Tab
    // walks back through exactly the links the visitor asked to skip.
    const landed = await page.evaluate(() => document.activeElement?.id ?? '')
    expect(landed).toBe('main-content')
  })
})
