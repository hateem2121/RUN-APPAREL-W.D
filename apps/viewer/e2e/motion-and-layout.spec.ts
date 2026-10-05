import { expect, type Page, test } from '@playwright/test'
import { SITE_MENU_ID, SITE_MENU_NAME } from '../../../packages/shared/src/siteBar'
import { LONGEST_COPY } from './garmentCopy'
import { stageFallsBack } from './stage'

const MENU = `#${SITE_MENU_ID}`
const OPEN = `${MENU}:popover-open`

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
 * ⚠️ `reducedMotion: 'reduce'` IN playwright.config.ts DID NOT REACH THE PAGE before
 * Playwright 1.63 (it does since 1.63.0's `testOptions.reducedMotion`, measured in all
 * four engines 2026-09-26), and every layout number in this file was measured through a
 * live animation until 2026-08-20. The explicit `emulateMedia` calls stay: they say
 * which state a test depends on instead of inheriting it.
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

/**
 * VA-32: every DRAWN word group of a colour name — in a tab's label or in the chosen name above
 * the dots — sits on one line and inside its own box. A name may break only BETWEEN its groups
 * (after a "/"), never inside one; this replaces SZ-06's soft-hyphen instrument.
 *
 * RUNS IN THE PAGE (handed to `page.evaluate`), so it references nothing outside itself. A group
 * is an inline `nowrap` span: broken across lines it shows two client rects; spilling out of its
 * tab, a right edge past the tab's. Groups that are not drawn (a dot's hidden label) are skipped.
 */
function nameBreaks() {
  const out = {
    parts: 0,
    split: [] as string[],
    spill: [] as string[],
    shown: [] as string[],
    lines: [] as number[],
  }
  for (const part of document.querySelectorAll<HTMLElement>('.colourway-tab__part')) {
    const rects = [...part.getClientRects()].filter((rect) => rect.width > 0.5)
    if (rects.length === 0) continue
    out.parts += 1
    const text = part.textContent ?? ''
    if (rects.length > 1) out.split.push(text)
    const box = part.closest('.colourway-tab, .colourways__name')?.getBoundingClientRect()
    if (box && Math.max(...rects.map((rect) => rect.right)) > box.right + 0.5) out.spill.push(text)
  }
  for (const element of document.querySelectorAll<HTMLElement>(
    '.colourways__name, .colourway-tab__label',
  )) {
    if (element.getClientRects().length === 0) continue
    out.shown.push(element.textContent ?? '')
    const tops = new Set(
      [...element.querySelectorAll('.colourway-tab__part')].map((part) =>
        Math.round(part.getBoundingClientRect().top),
      ),
    )
    out.lines.push(tops.size)
  }
  return out
}

/**
 * Serve the fixture garment with other words in it: `names` as its colourway names in row order,
 * and the product's name and description. The fixture's own are short, and layout that holds for
 * short words is the defect this repo keeps shipping (tests-and-fixtures.md).
 */
function serveGarment(
  page: Page,
  copy: { names?: readonly string[]; productName?: string; shortDescription?: string },
) {
  return page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as {
      product: Record<string, unknown>
      colourways?: { slug: string; displayName: string }[]
      selectedColourway?: { slug: string; displayName: string } | null
    }
    const { names, ...product } = copy
    Object.assign(body.product, product)
    body.colourways?.forEach((colourway, index) => {
      colourway.displayName = names?.[index] ?? colourway.displayName
    })
    const selected = body.colourways?.find((c) => c.slug === body.selectedColourway?.slug)
    if (body.selectedColourway && selected) {
      body.selectedColourway.displayName = selected.displayName
    }
    await route.fulfill({ response, json: body })
  })
}

/**
 * RUNS IN THE PAGE. Whether an email AND a WhatsApp control are wholly on screen, unscrolled —
 * LA-11's own measure — and whether each colour's own name is drawn (`listed`: VA-32's list
 * until polish D8, the names under the dots since).
 */
function contactOnScreen() {
  const inView = (el: Element) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
  }
  const persistent = [
    ...document.querySelectorAll('.contact-rail a, .action-bar a, .stage__contact a'),
  ].filter(inView)
  return {
    listed: (document.querySelector('.colourway-tab__label')?.getClientRects().length ?? 0) > 0,
    email: persistent.some((a) => a.getAttribute('href')?.startsWith('mailto:')),
    whatsapp: persistent.some((a) => a.getAttribute('href')?.includes('wa.me')),
  }
}

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

test.describe('the bar survives a phone', () => {
  for (const width of [320, 360, 375, 390, 414]) {
    test(`the whole name, a 44px menu button, and 44px rows when open, at ${width}px`, async ({
      page,
    }) => {
      /*
       * The site's bar since 2026-09-24 (owner decision 2026-09-17). The old header's own
       * history — a theme toggle crushed to 2.0px at 320px by `flex-shrink`, a wrap to 117px
       * — is why every size here is asserted rather than assumed.
       */
      await page.setViewportSize({ width, height: 720 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const m = await page.evaluate(() => {
        const mark = document.querySelector('.notch__wordmark') as HTMLElement
        const button = document.querySelector('.notch__menu-btn')?.getBoundingClientRect()
        return {
          need: mark.scrollWidth,
          have: mark.clientWidth,
          markHeight: mark.getBoundingClientRect().height,
          button: button ? [Math.round(button.width), Math.round(button.height)] : null,
        }
      })
      expect(m.need, `the name is cut at ${width}px`).toBeLessThanOrEqual(m.have)
      // SZ-03: the old wordmark was a 33px target; the bar's is 44px.
      expect(m.markHeight, 'the wordmark is under the 44px floor').toBeGreaterThanOrEqual(43.95)
      expect(m.button).toEqual([44, 44])
      await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
      await expect(page.locator(OPEN)).toHaveCount(1)
      // Measured once the menu has landed: it drops in on a scale from 0.94 (VA-51), and a row
      // read mid-entry was 41.4px (44 x 0.94) in the full suite, 2026-10-01.
      await page.waitForFunction(() =>
        (document.querySelector('.notch-shell') as HTMLElement)
          .getAnimations({ subtree: true })
          .every((a) => a.playState !== 'running' || a.timeline !== document.timeline),
      )
      const rows = await page
        .locator(`${MENU} a, ${MENU} button`)
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().height),
        )
      expect(rows, 'the open menu holds Products, Contact, Guides and the switch').toHaveLength(4)
      for (const height of rows) expect(height).toBeGreaterThanOrEqual(43.95)
    })
  }

  test('the header offers no catalogue link at any width', async ({ page }) => {
    // Owner decision 2026-09-04; `src/catalogueLinks.test.ts` guards the source.
    await page.setViewportSize({ width: 360, height: 720 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /catalogue/i })).toHaveCount(0)
    await expect(page.locator('a.notch__wordmark')).toHaveAttribute('href', 'https://wear-run.com')
  })

  test('the bar is one 60px row and keeps its height while the page scrolls', async ({ page }) => {
    // ⚠️ NO SCROLL CONDENSE HERE. The site's fixed bar shrinks 8px over the first 160px of
    // scroll; in this page's flow that would move the 3D stage under a scrolling thumb.
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const at = () =>
        page.evaluate(() =>
          Math.round(document.querySelector('.notch')?.getBoundingClientRect().height ?? -1),
        )
      expect(await at(), `the bar at rest, ${width}px`).toBe(60)
      await page.evaluate(() => window.scrollTo(0, 400))
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      )
      expect(await at(), `the bar after scrolling, ${width}px`).toBe(60)
    }
  })

  test('widening past the phone layout closes an open menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator(OPEN)).toHaveCount(0)
  })
})

/**
 * NOTHING BETWEEN THE BAR AND THE GARMENT (polish D8 and M5, owner-approved 2026-10-04). From
 * 2026-09-17 "[ 3D PRODUCT REFERENCE ]" had a line of its own here, and on a phone the garment's
 * code and name a second one; both said again what the page says under or beside the garment.
 * The stage band now starts where the bar ends: "the header token matches where the stage band
 * starts" below holds the number, and this holds that nothing is drawn in between.
 */
test.describe('no label row and no name line over the garment (D8, M5)', () => {
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`the garment's band starts at the bar at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('main .viewer-tag, .stage-block__name')).toHaveCount(0)
      await expect(page.locator('main').getByText('3D PRODUCT REFERENCE')).toHaveCount(0)
      const gap = await page.evaluate(() => {
        const bar = document.querySelector('.notch')?.getBoundingClientRect()
        const band = document.querySelector('.stage-block')?.getBoundingClientRect()
        return bar && band ? Math.round(band.top - bar.bottom) : null
      })
      expect(gap, 'something sits between the bar and the garment').toBe(0)
    })
  }
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
          document.querySelector('header.notch-shell')?.getBoundingClientRect().bottom ?? 0,
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

  /**
   * LA-08: FOUR phone sizes, not one. This ran at 375x812 alone until 2026-09-25, while the
   * audit line names 320, 375, 390 and 402x714 — the iPhone 17's real visible height, which
   * is 98px shorter than a desktop browser at 375x812 reports (apps/viewer/CLAUDE.md, svh).
   */
  for (const [width, height] of [
    [320, 640],
    [375, 812],
    [390, 844],
    [402, 714],
  ] as const) {
    test(`the garment and its colourway picker fit one phone screen, unscrolled, at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
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
  }

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
   * The token must equal the thing it describes — WHERE THE STAGE BAND STARTS.
   *
   * `--header-h` is subtracted from the band's height (`calc(100svh - var(--header-h))`).
   * Until 2026-09-24 the header was the only thing above the band, so this compared the
   * token with the header's height. Since then the bar (60px) is followed by the label row
   * (owner decision 2026-09-17), so it compares the token with the band's own top at the top
   * of the page — the quantity the calculation actually needs, whatever sits above it.
   *
   * ⚠️ THIS GUARD IS THE WHOLE JUSTIFICATION FOR THE TOKEN. The six-part subtrahend it helps
   * replace was re-derived by hand four times and was wrong every time. 1px of tolerance for
   * sub-pixel rounding across four engines, and no more.
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the header token matches where the stage band starts at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The focus hand-off can scroll; measure after it, at the top (see "the page opens at
      // the very top").
      await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')
      const m = await page.evaluate(() => ({
        scrollY: Math.round(window.scrollY),
        bandTop: document.querySelector('.stage-block')?.getBoundingClientRect().top ?? Number.NaN,
        bar: document.querySelector('.notch')?.getBoundingClientRect().height ?? Number.NaN,
        // RESOLVED, not read: a custom property's computed value is its TEXT, and since
        // 2026-10-01 the token is `calc(var(--notch-h) + 32px)`. A probe sized by it
        // measures what the layout actually subtracts.
        token: (() => {
          const probe = document.createElement('div')
          probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--header-h)'
          document.body.append(probe)
          const px = probe.getBoundingClientRect().height
          probe.remove()
          return px > 0 ? px : Number.NaN
        })(),
      }))
      expect(m.scrollY, 'measure at the very top').toBe(0)
      expect(Number.isFinite(m.token), '--header-h did not resolve (tokens.css)').toBe(true)
      expect(
        Math.abs(Math.round(m.bandTop) - Math.round(m.token)),
        `--header-h is ${m.token}px but the stage band starts at ${m.bandTop}px at ` +
          `${width}x${height}. Re-measure and update the token in tokens.css. Do not widen this tolerance.`,
      ).toBeLessThanOrEqual(1)
      // SZ-09's intent: the bar never doubles at the default text size. One row is 60px, or
      // the condensed 52px it rests at on a screen 500px tall or less (notch.css, 2026-10-01).
      expect(Math.round(m.bar), 'the bar is not one row').toBe(height <= 500 ? 52 : 60)
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
   * IM-06 — a missing poster must not change the stage band's size.
   *
   * ⚠️ CORRECTING THE FINDING'S OWN WORDING: it described the band as holding a 4:5
   * aspect ratio while the poster loads. There is no such hold — `.stage-block`
   * never reads the poster's dimensions at all. Its floor is
   * `min-height: calc(100svh - var(--header-h))`, a base rule in `page.css` with no
   * aspect-ratio or poster involved, and `.stage__canvas` is a `flex: 1 1 auto`
   * child of it. `Stage.tsx` mounts the poster preview as `.stage__placeholder`,
   * `position: absolute; inset: 0`, which is why the poster's own intrinsic size —
   * present or 404'd — can never reach the parent's layout calculation. A missing
   * poster has nothing to subtract from.
   *
   * The fixture proves it for free: only the `black` colourway's poster file exists
   * on disk (`apps/viewer/e2e/serve.mjs:141`); `wine` — the default colourway,
   * loaded by every other test in this file — 404s on every run.
   *
   * Two assertions: the band is the same size with a working poster and a 404'd one
   * (the finding itself), and separately its height never falls short of the
   * viewport-derived floor the CSS declares (pins the MECHANISM, so a change that
   * swapped the min-height for something poster- or content-driven would still be
   * caught even on a viewport where the two colourways happened to still agree by
   * coincidence).
   */
  for (const { name, width, height } of STAGE_BAND_VIEWPORTS) {
    test(`the stage band is unaffected by a 404'd poster at ${name} (${width}x${height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })

      await page.goto('/n001/black') // the one colourway whose poster is a real 200
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const withPoster = await page.locator('.stage-block').boundingBox()
      expect(withPoster, 'no .stage-block on the black colourway').not.toBeNull()

      await page.goto('/n001/wine') // the default colourway; its poster 404s
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const withoutPoster = await page.locator('.stage-block').boundingBox()
      expect(withoutPoster, 'no .stage-block on the wine colourway').not.toBeNull()

      expect(
        Math.abs((withoutPoster?.height ?? 0) - (withPoster?.height ?? 0)),
        `the stage band is ${withPoster?.height}px with a poster and ` +
          `${withoutPoster?.height}px without one at ${width}x${height} — a 404'd ` +
          `poster must not change the band's size`,
      ).toBeLessThanOrEqual(1)

      // Pin the mechanism: the band's floor is the viewport minus EVERYTHING above
      // it (the bar and the label row under it), never the poster. Measured fresh,
      // the same way "the header token matches where the stage band starts" measures
      // it above, rather than trusting the token.
      const aboveBand = await page.evaluate(
        () =>
          (document.querySelector('.stage-block')?.getBoundingClientRect().top ?? 0) +
          window.scrollY,
      )
      const floor = height - aboveBand
      expect(
        withoutPoster?.height ?? 0,
        `the stage band is ${withoutPoster?.height}px against a floor of ${floor}px ` +
          `(viewport ${height}px minus the ${aboveBand}px above the band) — ` +
          `.stage-block's min-height is calc(100svh - var(--header-h)); if this is ` +
          `short, that rule stopped governing the band's size`,
      ).toBeGreaterThanOrEqual(floor - 1)
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
      /*
       * Judge the page once the stage has decided (see e2e/stage.ts). Measured 2026-09-26 in CI's
       * image, Firefox (no WebGL), 1 failure in 240 runs: the read landed 10 ms after
       * `render3d-unavailable`, with email on screen and WhatsApp not. Every rAF sample on either
       * side — 6 runs on a starved CPU — had the WhatsApp button at bottom 378 of 390. A state no
       * visitor can see for a frame is not the invariant; the settled page is.
       */
      await stageFallsBack(page)

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
   * Since polish D10 (2026-10-04) they are ONE component, `SpecGroups`, drawn in the 3D window's
   * corners on a computer or under the description everywhere else, and App.tsx's
   * `specsInCorners` picks one. Until then two CSS breakpoints decided it (the callouts over the
   * canvas from 1000px, the list hidden from 1000px) and a unit test held them equal; the
   * facts were printed twice above 1000px until 2026-08-21. This counts what a visitor gets.
   *
   * 1024 and 1023 straddle the corners' seam (`IDENTITY_IN_ASIDE_QUERY`), and 960 is in the
   * two-column band where the name is still under the garment, so the list must carry the facts
   * there. That band is the easiest one to lose while "tidying up".
   */
  /*
   * Both branches, on every engine. Without 3D (LA-16) nothing is drawn over the window, so the
   * list must carry the facts at EVERY width: the first version of LA-16 left a wide screen
   * with no 3D showing them nowhere, and only CI's Firefox (no WebGL on a runner) took that
   * branch. Save-Data forces it everywhere: `canRender3D()` refuses 3D on it.
   */
  for (const mode of ['as it loads', 'without 3D (Save-Data)'] as const) {
    test(`the spec facts render once at every width, ${mode}`, async ({ page }) => {
      if (mode !== 'as it loads') {
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'connection', {
            configurable: true,
            value: { saveData: true },
          })
        })
      }
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // Which branch is decided AFTER the heading shows (mobile Safari was still deciding when
      // this first read it, 2026-09-25), so wait for the stage to settle either way.
      await page.waitForFunction(
        () =>
          Boolean(
            (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded,
          ) || document.querySelector('.stage__error:not([hidden])') !== null,
        undefined,
        { timeout: 40_000 },
      )
      const noThreeD = (await page.locator('.stage__error:not([hidden])').count()) > 0
      if (mode !== 'as it loads') {
        expect(noThreeD, 'Save-Data did not put the stage in its no-3D state').toBe(true)
      }

      // Every copy of the facts on the page, and each one's place; `visible` because a copy
      // drawn and hidden would still be a copy a screen reader could reach.
      const shown = async () => ({
        corners: await page.locator('.spec-groups--corners').count(),
        list: await page.locator('.spec-groups--list').count(),
        visible: await page
          .locator('.spec-groups')
          .evaluateAll(
            (all) => all.filter((el) => (el as HTMLElement).offsetParent !== null).length,
          ),
      })
      const once = (place: 'corners' | 'list') =>
        place === 'corners'
          ? { corners: 1, list: 0, visible: 1 }
          : { corners: 0, list: 1, visible: 1 }

      for (const [width, height, withThreeD] of [
        [1280, 800, 'corners'],
        [1024, 768, 'corners'],
        [1023, 768, 'list'],
        [960, 800, 'list'],
        [375, 812, 'list'],
      ] as const) {
        await page.setViewportSize({ width, height })
        const place = noThreeD ? 'list' : withThreeD
        await expect
          .poll(shown, {
            message: `${width}x${height}${noThreeD ? ' without 3D' : ''}: the facts once, in the ${place}`,
          })
          .toEqual(once(place))
      }
    })
  }

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
           * 🟢 THE FIXTURE GAP THIS ASSERTION WAS WRITTEN AGAINST WAS CLOSED
           * 2026-08-30 — it CAN fail now. It was verified unable to fail on
           * 2026-08-15, when `serve.mjs` served FOUR colourways against production's
           * five: rebuilding with the old five-column rule restored left the suite
           * green, because under equal columns at 320px four buttons get 71.2px each
           * against production's 55.4px — and "03 BUTTER"'s label is 55.2px, so it
           * fit in the fixture while overflowing in production. The gate could not
           * see the defect it exists to catch.
           *
           * Closing it meant adding `lime` to the fixture, re-pointing the
           * retired-colourway URL at `navy` (a slug that never existed in
           * production), and renumbering Black from 04 to 05 in `viewer.spec.ts` —
           * all three shipped together on 2026-08-30, and a fifth single-word label
           * was not the end of it: 2026-09-04 added the two-word "Pebble / Optic
           * White" because five single-word labels still could not wrap the way six
           * of the eleven live products do. The 2026-08-15 layout fix itself was
           * verified by direct measurement in a real browser against the live
           * five-colourway payload, at 320px and 375px, including the longest names
           * in `colour-name.ts` ("Forest Green", 12 chars, wraps to two lines).
           */
          spillingLabels: tabs
            .filter((t) => {
              const label = t.querySelector('.colourway-tab__label')
              // A dot draws no label (VA-32): a hidden one measures 0x0 at the corner, not a
              // spill. The names those dots stand for are measured above them, by nameBreaks.
              if (!label || label.getClientRects().length === 0) return false
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
     *
     * ⚠️ UNTIL 2026-09-11 THIS TEST COULD NOT FAIL FOR THE RULE IN ITS NAME.
     * `polish/index.ts` asks `navigator.webdriver` BEFORE `prefersReducedMotion()`,
     * and Playwright sets `navigator.webdriver`, so the import was refused as a robot
     * and the reduced-motion half of the gate was never reached: deleting it left this
     * test green. The flag is lifted now (the `asAHuman` spoof from
     * audit-guards.spec.ts), both preconditions are asserted, and the test below is
     * the positive control that proves the listener sees a Lenis chunk at all.
     */
    const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`
    const requested: string[] = []
    page.on('request', (request) => {
      const file = request.url().split('/').pop() ?? ''
      if (/^lenis-.*\.js$/.test(file)) requested.push(file)
    })

    await page.addInitScript(asAHuman)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    expect(
      await page.evaluate(() => ({
        webdriver: navigator.webdriver,
        reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      })),
      'the webdriver spoof or the reduced-motion emulation never reached the page, ' +
        'so this would be measuring a different gate',
    ).toEqual({ webdriver: false, reduce: true })

    // The polish layer has to have RUN, or "no request" only means "not yet".
    // startPolish() calls startReveals() first, which reveals everything at once
    // under reduced motion.
    await expect
      .poll(() => page.locator('[data-reveal].is-inview').count(), {
        message: 'the polish layer never ran, so the absence of Lenis proves nothing',
        timeout: 10_000,
      })
      .toBeGreaterThan(0)
    // give a dynamic import that was NOT refused time to reach the network
    await page.waitForTimeout(1500)

    expect(
      requested,
      `a reduced-motion visitor downloaded the Lenis chunk (${requested.join(', ')}). ` +
        `The gate must run BEFORE the dynamic import, as it does for Motion above.`,
    ).toEqual([])
  })

  test('a human with motion allowed DOES download the Lenis chunk (the control)', async ({
    page,
  }) => {
    const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`
    const requested: string[] = []
    page.on('request', (request) => {
      const file = request.url().split('/').pop() ?? ''
      if (/^lenis-.*\.js$/.test(file)) requested.push(file)
    })

    await page.addInitScript(asAHuman)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expect
      .poll(() => requested.length, {
        message:
          'no Lenis chunk was requested for a human with motion allowed. Either the ' +
          'chunk is no longer named lenis-*.js or the listener stopped matching — and ' +
          'then the reduced-motion test above passes without measuring anything.',
        timeout: 10_000,
      })
      .toBeGreaterThan(0)
  })
})

/**
 * WHERE THE GARMENT'S NAME IS ON THE FIRST SCREEN (polish D8, F11 and M5, owner-approved
 * 2026-10-04). From 2026-09-04 an `aria-hidden` line put the code and name over the garment
 * wherever the <h1> was not on the first screen; tablets were added the next day, when iPads
 * measured their <h1> 70-80px below the fold. The owner's decisions replaced it:
 *
 *   computers  the <h1> beside the garment, from 1024px wide and 620px tall (D8, held by the
 *              tests further down that walk the floor with the longest copy)
 *   tablets    upright, a garment window half the screen tall, so the <h1> under it is on the
 *              first screen (F11, Q23); sideways they are computers
 *   phones     nothing over the garment, which takes the room, and the name follows it (M5)
 *
 * Measured 2026-10-04 in Chromium with the longest copy: the <h1>'s top on the five upright
 * tablets below was 815 / 868 / 895 / 904 / 1012px, against the action bar's top at 950 / 1059 /
 * 1106 / 1120 / 1292. On phones the garment window measured 61-66% of the screen (about 55% with
 * the two lines over it).
 */
test.describe("the garment's name on the first screen (D8, F11, M5)", () => {
  for (const [width, height] of [
    [768, 1024],
    [744, 1133],
    [820, 1180],
    [834, 1194],
    [1024, 1366],
  ] as const) {
    test(`an upright tablet shows the heading above the action bar at ${width}x${height}`, async ({
      page,
    }) => {
      await serveGarment(page, LONGEST_COPY)
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const m = await page.evaluate(() => {
        const heading = document.querySelector('h1') as HTMLElement
        const box = heading.getBoundingClientRect()
        const firstLine = Number.parseFloat(getComputedStyle(heading).fontSize) * 1.2
        const bar = document.querySelector('.action-bar')
        const barShown = bar !== null && getComputedStyle(bar).display !== 'none'
        return {
          firstLineBottom: Math.round(box.top + firstLine),
          barTop: Math.round(barShown ? (bar as Element).getBoundingClientRect().top : innerHeight),
          barShown,
          oneColumn: getComputedStyle(document.querySelector('.stage-block') as Element)
            .flexDirection,
        }
      })
      expect(m.oneColumn, 'an upright tablet is the one-column layout (F11)').toBe('column')
      expect(
        m.barShown,
        'one column with no aside needs the action bar for Email and WhatsApp',
      ).toBe(true)
      expect(
        m.firstLineBottom,
        `the heading's first line ends at ${m.firstLineBottom}px, under the action bar at ${m.barTop}px`,
      ).toBeLessThanOrEqual(m.barTop)
    })
  }

  for (const [width, height] of [
    [375, 812],
    [390, 844],
    [430, 932],
  ] as const) {
    test(`a phone gives the garment the room and names it after at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const m = await page.evaluate(() => {
        const canvas = (document.querySelector('.stage__canvas') as Element).getBoundingClientRect()
        const band = (document.querySelector('.stage-block') as Element).getBoundingClientRect()
        const heading = (document.querySelector('h1') as Element).getBoundingClientRect()
        return {
          share: canvas.height / innerHeight,
          headingAfterBand: heading.top >= band.bottom,
        }
      })
      // 58%, not the 61-66% measured: a line put back over the garment costs it about 32px, 4%.
      expect(m.share, 'the garment window lost its room').toBeGreaterThanOrEqual(0.58)
      expect(m.headingAfterBand, 'the name is no longer after the garment').toBe(true)
    })
  }

  test('a phone held sideways keeps its band to one screen and draws no name line', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.stage-block__name')).toHaveCount(0)
    await expect(page.getByTestId('product-identity-aside')).toHaveCount(0)
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
        /*
         * Until polish M2 (2026-10-04) this also read `.page`'s padding, the room under the
         * footer that the footer check below stood on. That room is gone (the bar steps aside
         * at the footer), so the rem probe alone says whether the text size reached the layout.
         */
        const applied = await page.evaluate(() => {
          const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
          // A rem length on a throwaway element, measured through layout rather
          // than read back off a declaration. Nothing of ours can make it stale,
          // so it says whether `rem` means the injected root AT ALL.
          const probe = document.createElement('div')
          probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:4.5rem'
          document.body.appendChild(probe)
          const probePx = probe.getBoundingClientRect().height
          probe.remove()
          return { rootPx, probePx }
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
          applied.probePx + 1 < expectedFloor,
          `the engine did not re-resolve after the root font-size changed to ${root}px ` +
            `(4.5rem probe measured ${applied.probePx}px against an expected ` +
            `${expectedFloor}px; <html> reports ${applied.rootPx}px) — the text size never ` +
            `reached the layout, so there is nothing here to measure`,
        )

        /**
         * ⚠️ MEASURED AFTER SCROLLING TO THE BOTTOM, AND THE FIRST VERSION DID NOT.
         * It asserted clearance at scroll 0, which failed on WebKit and mobile
         * Safari at 320px with 24px text — Chrome's largest setting on the smallest
         * phone. That failure was real but it was not the right question: the action
         * bar is `position: fixed` and the page runs on far past the rail (it reserved
         * the bar's height at the document end too, until polish M2), so a rail sitting
         * under it at REST scrolls clear a moment later.
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
            // Document-space reachability. Positive clearance = clears the bar.
            clearance:
              bar && tabs.length
                ? Math.round(
                    document.documentElement.scrollHeight -
                      bar.height -
                      (Math.max(...tabs.map((t) => t.bottom)) + window.scrollY),
                  )
                : null,
            // Document space too: how far the page runs on past the footer (0 since polish M2).
            roomUnderFooter: footer
              ? Math.round(document.documentElement.scrollHeight - (footer.bottom + window.scrollY))
              : null,
            why: {
              // What sticks out past the screen's right edge, the deepest first, so a sideways
              // overflow names its element (found 2026-10-04 once this test stopped skipping).
              overflowing: [...document.querySelectorAll('body *')]
                .map((el) => ({ el, right: el.getBoundingClientRect().right }))
                .filter(({ right }) => right > window.innerWidth + 0.5)
                .slice(-4)
                .map(
                  ({ el, right }) =>
                    `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${Math.round(right)}`,
                ),
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
         * ⚠️ THE FOOTER IS THE ELEMENT THAT CAUGHT THE BUG ONCE, and checking only the
         * rail said the fix was unnecessary. Until polish M2 (2026-10-04) `.page`
         * reserved the bar's height under the footer (`--action-bar-h`, written by
         * lib/actionBarHeight.ts), and at 320x640 with a 24px root the footer sat 34px
         * UNDER a 106px bar whenever that token still read 72px — permanently, with no
         * further to scroll.
         *
         * Since M2 nothing is reserved there: the bar steps aside while any of the
         * footer is above it, its height read off the bar itself
         * (lib/actionBarStepsAside.ts), so at the largest text the page ends AT the
         * footer and the bar has gone there. Both halves are asserted: the room in
         * document space (one pixel of rounding: `scrollHeight` is an integer and the
         * footer's edge is not), and the bar scrolled to the end, re-scrolled on each
         * poll because this file records the document growing after a scroll in CI.
         */
        expect(
          Math.abs(m.roomUnderFooter ?? 0),
          `the page runs on ${m.roomUnderFooter}px past the footer at a ${root}px root. ${why}`,
        ).toBeLessThanOrEqual(1)
        if (m.why.barDisplay !== null && m.why.barDisplay !== 'none') {
          await expect
            .poll(
              async () => {
                await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
                return page.evaluate(
                  () =>
                    getComputedStyle(document.querySelector('.action-bar') as Element).visibility,
                )
              },
              {
                message: `the bar stayed over the footer at a ${root}px root. ${why}`,
                timeout: 5_000,
              },
            )
            .toBe('hidden')
        }
      })
    }
  }
})

/**
 * ⚠️ WAIT UNTIL THE STAGE HAS PICKED ITS BRANCH BEFORE ASKING WHICH ONE IT PICKED
 * (2026-09-25). The stage can reach its no-3D notice LONG after the heading shows: a model
 * download that stops arriving is aborted by the viewer's stall watchdog, retried, and only
 * then reported ("The 3D model stopped downloading…"). Measured here with the fixture's GLB
 * held back 32 s: `requestfailed … ERR_ABORTED` three times, and the notice at ~36 s. Read
 * straight after the heading, the fallback check saw neither state, so the old tests waited
 * 30 s for a cue that never comes and failed with "element(s) not found" — the exact error
 * that stopped `main`'s deploy after #66 on CI's Firefox. With this wait they see the
 * notice and skip. Whether CI's runs were stalls or merely slow loads is not established;
 * the wait covers both. The Save-Data case above already waits the same way.
 */
async function waitForStageToSettle(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () =>
      Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded) ||
      document.querySelector('.stage__error:not([hidden])') !== null,
    undefined,
    { timeout: 60_000, polling: 250 },
  )
}

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
    await waitForStageToSettle(page)
    const fallback = await page.locator('.stage__error:not([hidden])').count()
    test.skip(fallback > 0, 'no WebGL on this engine — the stage is in poster fallback')
  }

  test('it is absent on arrival and appears only after an idle pause', async ({ page }) => {
    test.slow()
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // On arrival there is nothing to nag about — the visitor has not had time to be
    // confused yet. True on either branch, so it is read before the stage settles.
    await expect(page.locator(CUE)).toBeHidden()
    await skipUnless3D(page)
    // Generous: the idle timer only STARTS once the model has loaded, and a CI
    // runner decoding a GLB in software takes far longer than this machine.
    await expect(page.locator(CUE)).toBeVisible({ timeout: 30000 })
  })

  test('it is legible: not the 10px muted corner label it replaced', async ({ page }) => {
    test.slow()
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
    test.slow()
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
    test(`the bar is centred on the page at ${width}px`, async ({ page }) => {
      /*
       * ⚠️ THIS TEST USED TO PIN THE WORDMARK TO THE CONTENT COLUMN (audit FA-D-08, 2026-09-07):
       * the old full-bleed header and the 1200px column were two formulas for one edge. The
       * owner chose the website's bar for the viewer on 2026-09-17 — a pill centred on the
       * page, as the site's own `e2e/composition.spec.ts` measures it — so the edge it
       * guarded no longer exists, and centring is the property that replaced it.
       */
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const offset = await page.evaluate(() => {
        const bar = document.querySelector('.notch')?.getBoundingClientRect()
        return bar
          ? bar.left + bar.width / 2 - document.documentElement.clientWidth / 2
          : Number.NaN
      })
      expect(Math.abs(offset), `the bar sits ${offset}px off centre`).toBeLessThanOrEqual(0.5)
    })
  }

  /*
   * The garment's facts in the window's corners are a technical drawing (polish D10): the top
   * pair hangs from one line, the bottom pair shares one line (FA-D-07: the old callouts'
   * fourth corner floated by one line of text per feature the CMS listed), the left pair shares
   * a left edge and the right pair a right edge. The PERFORMANCE list is the fixture's two
   * features against FIT's one, so a floating bottom pair shows here as a whole line.
   */
  for (const [width, height] of [
    [1440, 900],
    [1024, 640],
  ] as const) {
    test(`the four corner groups make one drawing at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      test.skip(
        await stageFallsBack(page),
        'no 3D here (CI Firefox has no WebGL): the facts are under the stage by design (LA-16)',
      )
      await expect(page.locator('.spec-groups--corners')).toBeVisible()

      const m = await page.evaluate(() => {
        const box = (selector: string) => {
          const r = document.querySelector(selector)?.getBoundingClientRect()
          return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null
        }
        const heading = (key: string) => box(`.spec-group--${key} .spec-group__heading`)
        const lastRow = (key: string) => box(`.spec-group--${key} li:last-child .spec-item__row`)
        return {
          canvas: box('.stage__canvas'),
          plinth: box('.stage__plinth'),
          fabric: heading('fabric'),
          weight: heading('weight'),
          fit: heading('fit'),
          performance: heading('performance'),
          fabricRow: box('.spec-group--fabric .spec-item__row'),
          fitRow: box('.spec-group--fit .spec-item__row'),
          weightRow: box('.spec-group--weight .spec-item__row'),
          performanceRow: box('.spec-group--performance .spec-item__row'),
          performanceEnd: lastRow('performance'),
        }
      })
      const near = (a: number | undefined, b: number | undefined) =>
        Math.abs((a ?? Number.NaN) - (b ?? Number.NaN)) <= 1

      expect(near(m.fabric?.top, m.weight?.top), 'the top pair does not share a line').toBe(true)
      expect(
        near(m.fit?.top, m.performance?.top),
        `FIT sits at ${m.fit?.top} and PERFORMANCE at ${m.performance?.top}: the bottom pair ` +
          'is meant to share one line, set by the taller group (FA-D-07)',
      ).toBe(true)
      expect(near(m.fabricRow?.left, m.fitRow?.left), 'the left pair does not share an edge').toBe(
        true,
      )
      expect(
        near(m.weightRow?.right, m.performanceRow?.right),
        'the right pair does not share an edge',
      ).toBe(true)

      // Inside the window, the top pair clear of the AR cube's 12 + 44px (iPads have it), and
      // the bottom pair clear of the controls under the window.
      const canvas = m.canvas!
      expect(m.fabric!.top - canvas.top, 'the top pair is up under the AR button').toBeGreaterThan(
        56,
      )
      expect(m.fabricRow!.left).toBeGreaterThan(canvas.left)
      expect(m.weightRow!.right).toBeLessThan(canvas.right)
      expect(
        m.performanceEnd!.bottom,
        'the bottom pair runs out of the window',
      ).toBeLessThanOrEqual(canvas.bottom)
      expect(m.performanceEnd!.bottom).toBeLessThan(m.plinth?.top ?? Number.POSITIVE_INFINITY)
    })
  }
})

/**
 * VA-35 (visual audit; owner decisions 2026-10-01 and 2026-10-02): the phone stack keeps ONE
 * rhythm — 16px between groups (the label, the garment, its controls, the colours) and 8px
 * within one — and the words take the website's 20px margin while the garment's card keeps
 * 8-12px, so the garment keeps its size. Measured on the live page before: the label touched
 * the product line (0px), the controls sat 4px above the colours, and a phone-only 8px gap
 * above the controls had never applied (an equal-specificity rule later in page.css won).
 */
test.describe('the phone stack keeps one rhythm (VA-35)', () => {
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [430, 932],
  ] as const) {
    test(`16px between groups, 8px within, words at 20px, at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const m = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
        const textLeft = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const range = document.createRange()
          range.selectNodeContents(el)
          return Math.round(range.getBoundingClientRect().left)
        }
        // Since polish D8 and M5 (2026-10-04) the garment is the first thing under the bar: the
        // label and the product line that stood between them are gone.
        const bar = box('.notch')
        const canvas = box('.stage__canvas')
        const controls = box('.stage__plinth')
        const colour = box('.colourways__name')
        const dot = box('.colourway-tab')
        const gap = (a?: DOMRect, b?: DOMRect) => (a && b ? Math.round(b.top - a.bottom) : null)
        return {
          gaps: {
            'bar > garment': gap(bar, canvas),
            'garment > controls': gap(canvas, controls),
            'controls > colour name': gap(controls, colour),
            'colour name > colours': gap(colour, dot),
          },
          words: [textLeft('.colourways__name'), dot && Math.round(dot.left)],
          card: canvas ? Math.round(canvas.left) : null,
        }
      })
      expect(m.gaps).toEqual({
        'bar > garment': 8,
        'garment > controls': 16,
        'controls > colour name': 16,
        'colour name > colours': 8,
      })
      expect(m.words, "the words and the colours start at the website's 20px margin").toEqual([
        20, 20,
      ])
      expect(
        m.card,
        "the garment's card took the words' margin, and the garment drew 5% smaller",
      ).toBeLessThanOrEqual(13)
    })
  }
})

/**
 * The colourway rail against the catalogue's worst case, not the fixture's.
 *
 * ⚠️ WHY THE NAMES ARE SERVED IN THE TEST. The fixture ships one product's five names, of
 * which one is long ('Pebble / Optic White'). The live catalogue (200 colourways, read
 * 2026-10-02) has names whose single word group is wider still ("Bottle Green /", 139px of
 * 12px capitals) and products with several two-word names at once. No single fixture product
 * carries all of that, so the same page is served the catalogue's longest names instead.
 */
test.describe('the colourway rail survives the catalogue, not just the fixture', () => {
  /**
   * VA-32 (owner, 2026-10-01 and 2026-10-02): colour names break only after a "/", never inside a
   * word, reopening SZ-06's soft hyphens, which the owner found cramped. The colours are dots with
   * the chosen name written above them, on phones and tablets alike. The spill check here also
   * covers FA-E-08 ("TERRACOTTA" 0.3px past its tab at 1440x900), whose own test measured the
   * five-across tabs this replaced.
   *
   * POLISH D8 (owner-approved 2026-10-04) put each name under its dot beside the garment on a
   * laptop, where the column is at least 350px and the window 656px tall (page.css has the
   * measurements); it replaced VA-32's list, which needed a 1080px window. A sideways iPad's
   * column is narrower (289-337px) and keeps the dots.
   *
   * POLISH N1 (names awaiting the owner's approval, 2026-10-05) renames every colour in its
   * category's style (packages/shared/src/colourNames.ts, at most 12 characters a name). The third
   * set is that list's worst garment-for-garment: 12-character names before a " /" (14 characters,
   * as wide as "Bottle Green /"), and the longest whole name, 26 characters, first, so the dots'
   * one line above carries it. Kept beside the old sets: the live names change only at the end.
   */
  const LONG_NAMES = [
    ['Terracotta / Blush', 'Bottle Green / Mint', 'Tangerine', 'Turquoise', 'Magenta / Burgundy'],
    [
      'Pebble / Optic White',
      'Slate / Powder Blue',
      'Blush / Fuchsia',
      'Burgundy',
      'Tangerine / Rust',
    ],
    [
      'Silver Medal / Clean Sheet',
      'Bluebird Day / Ice Rink',
      'Black Cherry / Cranberry',
      'Ice Rink / Bluebird Day',
      'Victory Lap / Night Game',
    ],
  ] as const

  for (const [width, height, layout] of [
    [320, 640, 'dots'],
    [390, 844, 'dots'],
    [768, 1024, 'dots'],
    [834, 1194, 'dots'],
    // Beside the garment on a sideways iPad: a column under 350px keeps the dots (D8).
    [1024, 768, 'dots'],
    [1180, 820, 'dots'],
    // A laptop's 360px column, and the 400px one of a 2560px window: a name under each dot (D8).
    [1280, 720, 'names'],
    [1366, 657, 'names'],
    [1440, 900, 'names'],
    [2560, 1440, 'names'],
  ] as const) {
    for (const [set, names] of LONG_NAMES.entries()) {
      test(`colour names never break inside a word at ${width}x${height}, ${layout} (set ${set + 1}, VA-32)`, async ({
        page,
      }) => {
        await serveGarment(page, { names })
        await page.setViewportSize({ width, height })
        await page.goto('/n001/wine')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

        const report = await page.evaluate(nameBreaks)
        expect(report.parts, 'no word group was drawn, so this measured nothing').toBeGreaterThan(0)
        expect(report.split, 'a word group broke across lines').toEqual([])
        expect(report.spill, 'a word group ran out of its box').toEqual([])
        if (layout === 'dots') {
          // the dots carry no words; the line above them carries the chosen colour's name
          expect(report.shown).toEqual([names[0]])
          expect(report.lines, 'the name above the dots took more than one line').toEqual([1])
        } else {
          // under each dot its own name, on a line per "/" part at most: a name breaks only
          // after its "/" (D8), and one that fits stays on one line
          expect(report.shown).toEqual([...names])
          const tooTall = names.filter(
            (name, index) => (report.lines[index] ?? 0) > name.split('/').length,
          )
          expect(tooTall, 'a name took more lines than it has "/" parts').toEqual([])
        }

        const tabs = page.getByRole('tab')
        await expect(tabs).toHaveCount(names.length)
        for (const [index, name] of names.entries()) {
          await expect(
            tabs.nth(index),
            'a tab is named by the plain colour name',
          ).toHaveAccessibleName(name)
        }
      })
    }
  }

  test('the instrument sees a word group split across lines (negative control)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.addStyleTag({
      content:
        '.colourway-tab__part { white-space: normal !important } .colourway-tab__label { display: block; width: 30px }',
    })
    const report = await page.evaluate(nameBreaks)
    expect(report.split, 'a group forced across lines was not reported').toContain('Optic White')
  })

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`every colour is a dot in one row, the chosen one ringed, its name above, at ${width}x${height} (VA-32)`, async ({
      page,
    }) => {
      await serveGarment(page, { names: LONG_NAMES[1] })
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const m = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll<HTMLElement>('.colourway-tab')]
        const name = document.querySelector('.colourways__name')?.getBoundingClientRect()
        return {
          boxes: tabs.map((tab) => {
            const box = tab.getBoundingClientRect()
            return [Math.round(box.width), Math.round(box.height), Math.round(box.top)]
          }),
          rings: tabs.map((tab) => {
            const style = getComputedStyle(tab)
            return `${tab.getAttribute('aria-selected')}:${style.borderTopWidth}:${style.borderTopColor}`
          }),
          nameBottom: name ? Math.round(name.bottom) : null,
        }
      })
      const tops = new Set(m.boxes.map(([, , top]) => top))
      expect(tops.size, 'the dots wrapped onto a second row').toBe(1)
      for (const [boxWidth, boxHeight] of m.boxes) expect([boxWidth, boxHeight]).toEqual([44, 44])
      const selected = m.rings.filter((ring) => ring.startsWith('true:'))
      expect(selected, 'not exactly one chosen dot').toHaveLength(1)
      expect(selected[0], 'the chosen dot has no 2px ring').toMatch(/^true:2px:/)
      for (const ring of m.rings.filter((r) => r.startsWith('false:'))) {
        expect(ring, 'an unchosen dot wears a ring').toMatch(/rgba\(0, 0, 0, 0\)$/)
      }
      expect(m.nameBottom, 'the name is not above the dots').toBeLessThanOrEqual(
        Math.min(...m.boxes.map(([, , top]) => top ?? 0)),
      )
    })
  }

  test('beside the garment on a laptop, the colours are three to a row, names under, the chosen one ringed (D8)', async ({
    page,
  }) => {
    await serveGarment(page, { names: LONG_NAMES[1] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // The ring fades in (`transition: box-shadow`), and Firefox applies the grid's container query
    // a frame after the others, so it was read mid-fade there: measure the settled state.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const swatch = document.querySelector(
              '.stage__aside .colourway-tab[aria-selected="true"] .colourway-tab__swatch',
            )
            return swatch
              ? swatch.getAnimations().length === 0 &&
                  /0px 0px 0px 4px/.test(getComputedStyle(swatch).boxShadow)
              : false
          }),
        { message: 'the chosen dot never settled with its ring' },
      )
      .toBe(true)
    const m = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>('.stage__aside .colourway-tab')]
      return tabs.map((tab) => {
        const box = tab.getBoundingClientRect()
        const swatch = tab.querySelector('.colourway-tab__swatch') as HTMLElement
        return {
          top: Math.round(box.top),
          height: Math.round(box.height),
          selected: tab.getAttribute('aria-selected') === 'true',
          // The ring is the shadow with a 4px spread. Engines write its colour first (Chromium) or
          // last (Firefox), so the offsets and spread are what is matched.
          ring: /0px 0px 0px 4px/.test(getComputedStyle(swatch).boxShadow),
          named: (tab.querySelector('.colourway-tab__label')?.getClientRects().length ?? 0) > 0,
        }
      })
    })
    const rows = [...new Set(m.map((tab) => tab.top))]
    expect(
      rows.map((top) => m.filter((tab) => tab.top === top).length),
      'five colours are not 3 + 2',
    ).toEqual([3, 2])
    for (const tab of m) {
      expect(tab.height, 'a cell under 44px').toBeGreaterThanOrEqual(44)
      expect(tab.named, 'a dot without its name').toBe(true)
      expect(
        tab.ring,
        `${tab.selected ? 'the chosen dot has no' : 'an unchosen dot has a'} ring`,
      ).toBe(tab.selected)
    }
  })

  test('four colours beside the garment are two rows of two, so none sits alone (D8)', async ({
    page,
  }) => {
    await page.route('**/api/public/viewer/**', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { colourways?: unknown[] }
      body.colourways = body.colourways?.slice(0, 4)
      await route.fulfill({ response, json: body })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const perRow = await page.evaluate(() => {
      const tops = [...document.querySelectorAll('.stage__aside .colourway-tab')].map((tab) =>
        Math.round(tab.getBoundingClientRect().top),
      )
      return [...new Set(tops)].map((top) => tops.filter((t) => t === top).length)
    })
    expect(perRow).toEqual([2, 2])
  })

  /**
   * D8's names add a row of words under each row of dots, and the side column also holds the
   * name, three lines of description and both buttons. Measured 2026-10-04 with the longest copy
   * and these names, the column needs 614-625px of window in Chromium and Firefox and 617-638px in
   * WebKit with the names, 549-602px without, so the names show from 656px of height (page.css).
   * This walks the widths at exactly that height and one pixel under, with copy LONGER than any
   * live garment's: against the fixture's own 145-character description it could not fail.
   */
  test('the names under the dots leave both contact buttons on screen at their shortest height (D8)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await serveGarment(page, { ...LONGEST_COPY, names: LONG_NAMES[0] })
    const gaps: string[] = []
    for (const [width, height, named] of [
      [1280, 656, true],
      [1366, 656, true],
      [1440, 656, true],
      [1536, 656, true],
      [1920, 656, true],
      [2560, 656, true],
      [1280, 655, false],
      [1920, 655, false],
      // A column under 350px keeps the dots, however tall the window.
      [1024, 768, false],
      [1180, 820, false],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const seen = await page.evaluate(contactOnScreen)
      const at = `${width}x${height}`
      if (seen.listed !== named) {
        gaps.push(`${at}: the names are ${seen.listed ? '' : 'not '}under the dots`)
      }
      if (!seen.email) gaps.push(`${at}: no email control on screen`)
      if (!seen.whatsapp) gaps.push(`${at}: no WhatsApp control on screen`)
    }
    expect(gaps).toEqual([])
  })
})

/**
 * POLISH D8 (owner-approved 2026-10-04): the name and description beside the garment on every
 * computer, the description at three lines with "Read more". From 2 Oct (VA-60) they went beside
 * it only in a window 800-880px tall, because live descriptions run to 454 characters and pushed
 * Email and WhatsApp below a shorter screen; the three lines bound the column instead. Measured
 * with the longest copy and names (useIdentityInAside.ts has the per-engine table), the column
 * needs 549-602px of window, so the floor is 620px. This walks every width at the floor and one
 * pixel under it, the two commonest laptop windows by name, and the layouts either side.
 */
test.describe('the longest copy never pushes the contact buttons off screen (D8)', () => {
  test('beside the garment from 1024px wide and 620px tall, and under it one pixel shorter', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await serveGarment(page, {
      ...LONGEST_COPY,
      names: [
        'Terracotta / Blush',
        'Bottle Green / Mint',
        'Tangerine',
        'Turquoise',
        'Magenta / Burgundy',
      ],
    })
    const gaps: string[] = []
    for (const [width, height, beside] of [
      [1024, 620, true],
      [1100, 620, true],
      [1180, 620, true],
      [1280, 620, true],
      [1366, 620, true],
      [1440, 620, true],
      [1920, 620, true],
      [2560, 620, true],
      [1024, 619, false],
      [1280, 619, false],
      [1920, 619, false],
      // 1366x768 and 1280x720 laptop screens, less the browser's own bars.
      [1366, 657, true],
      [1280, 633, true],
      // Upright, never beside (F11); and from 900 to 1023px wide the name stays under it.
      [1024, 1366, false],
      [960, 700, false],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const inAside = (await page.locator('.stage__aside h1').count()) === 1
      const seen = await page.evaluate(contactOnScreen)
      const at = `${width}x${height}`
      if (inAside !== beside) {
        gaps.push(`${at}: the description is ${inAside ? 'beside' : 'under'} the garment`)
      }
      if (!seen.email) gaps.push(`${at}: no email control on screen`)
      if (!seen.whatsapp) gaps.push(`${at}: no WhatsApp control on screen`)
    }
    expect(gaps).toEqual([])
  })
})

/**
 * "READ MORE" (polish D8, owner-approved 2026-10-04): beside the garment the description stops at
 * three lines (ProductIdentity.tsx), which is what bounds the column above. The button shows only
 * when there is more to read, the whole text stays in the page for a screen reader while closed,
 * and under the garment, where nothing needs bounding, the description is whole.
 */
test.describe('the description beside the garment opens with Read more (D8)', () => {
  const lines = (statement: import('@playwright/test').Locator) =>
    statement.evaluate((el) =>
      Math.round(
        el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
      ),
    )

  test('a long description shows three lines, and opens and closes in full', async ({ page }) => {
    await serveGarment(page, LONGEST_COPY)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const statement = page.locator('.product-info--aside .product-info__statement')
    const more = page.getByRole('button', { name: 'Read more' })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(await lines(statement)).toBe(3)
    // The clipped lines are still text in the page, for a screen reader and for search.
    await expect(statement).toContainText('rain, grit and cold.')
    const box = await more.boundingBox()
    expect(
      box?.height ?? 0,
      'Read more is under the 24px WCAG 2.5.8 target',
    ).toBeGreaterThanOrEqual(24)

    await more.click()
    const less = page.getByRole('button', { name: 'Read less' })
    await expect(less).toHaveAttribute('aria-expanded', 'true')
    expect(await lines(statement)).toBeGreaterThan(3)

    await less.click()
    await expect(page.getByRole('button', { name: 'Read more' })).toBeVisible()
    expect(await lines(statement)).toBe(3)
  })

  test('a description that fits in three lines has no Read more (the control)', async ({
    page,
  }) => {
    await serveGarment(page, { shortDescription: 'A short description that fits on one line.' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('product-identity-aside')).toHaveCount(1)
    await expect(page.locator('.product-info__more')).toHaveCount(0)
  })

  test('under the garment the description is whole, with no Read more', async ({ page }) => {
    await serveGarment(page, LONGEST_COPY)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.product-info__more')).toHaveCount(0)
    await expect(page.locator('.product-info__statement[data-clamped]')).toHaveCount(0)
    expect(await lines(page.locator('.product-info__statement'))).toBeGreaterThan(3)
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
    expect(second).toContain('notch__wordmark')
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

    /**
     * AC-03, the missing half: where the NEXT Tab goes. Focus on <main> is only useful if
     * the keyboard continues from there, into the page's first control, and not back to
     * the top chrome or out to <body>. The first control is derived in the page (document
     * order, tabbable, drawn), not named, so a reordered page is judged on what it is.
     *
     * ⚠️ WAIT FOR THE STAGE TO FINISH FIRST. <model-viewer> becomes a Tab stop only once it
     * has loaded; pressed earlier, Tab correctly skips to the colourway tabs, and the stop
     * appears a moment later, so the "first control" read after the key press named the
     * garment 3 runs in 20 (measured 2026-09-25). Loaded, or the no-3D notice, then Tab.
     */
    await page.waitForFunction(
      () =>
        Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded) ||
        document.querySelector('.stage__error:not([hidden])') !== null,
      undefined,
      { timeout: 40_000 },
    )
    await page.keyboard.press('Tab')
    const next = await page.evaluate(() => {
      const main = document.getElementById('main-content')
      const describe = (el: Element | null) =>
        el
          ? `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`
          : 'none'
      const first = main
        ? ([...main.querySelectorAll<HTMLElement>('*')].find(
            (el) =>
              // A custom element can keep its Tab stop in its shadow root: <model-viewer>'s
              // host reads tabIndex -1 while the keyboard stops on it (measured 2026-09-25).
              (el.tabIndex >= 0 ||
                el.shadowRoot?.querySelector('[tabindex]:not([tabindex="-1"])') != null) &&
              !(el as HTMLButtonElement).disabled &&
              el.getClientRects().length > 0 &&
              getComputedStyle(el).visibility !== 'hidden' &&
              !el.closest('[inert]'),
          ) ?? null)
        : null
      return {
        active: describe(document.activeElement),
        first: describe(first),
        same: first !== null && document.activeElement === first,
        insideMain: Boolean(main?.contains(document.activeElement)),
      }
    })
    console.log(
      `AC-03: Tab after the skip link -> ${next.active}; first control in <main>: ${next.first}`,
    )
    expect(
      next.insideMain,
      `the Tab after the skip link left <main> (landed on ${next.active})`,
    ).toBe(true)
    expect(
      next.same,
      `the Tab after the skip link landed on ${next.active}, not <main>'s first control ${next.first}`,
    ).toBe(true)
  })
})

/**
 * Batch C, PR 2 — the page's structure after the shared menu bar (#38) landed.
 *
 * Reduced motion first, in every test: `.footer` and other blocks carry `data-reveal`, whose
 * 24px offset sits in every layout number until the reveal runs, and before Playwright 1.63
 * the config's own `reducedMotion` never reached the page (apps/viewer/CLAUDE.md).
 */
test.describe('the page keeps its structure (LA-03, LA-11, LA-15)', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  /**
   * LA-03: header, stage, colourway rail, details, footer — in DOCUMENT order, which is what
   * a screen reader and a keyboard follow. Visual position could be faked by a CSS reorder;
   * `compareDocumentPosition` cannot. The details are content inside <main>, not a landmark of
   * their own, so they are asserted as inside <main> and before the footer.
   */
  test('the document reads header, stage, colourway rail, details, footer', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const order = await page.evaluate(() => {
      const parts = {
        header: document.querySelector('header.notch-shell'),
        stage: document.querySelector('.stage-block .stage'),
        rail: document.querySelector('[role="tablist"]'),
        details: document.querySelector('main .content'),
        footer: document.querySelector('footer.site-footer'),
      }
      const missing = Object.entries(parts)
        .filter(([, el]) => !el)
        .map(([name]) => name)
      const entries = Object.entries(parts)
      const wrong: string[] = []
      entries.slice(1).forEach(([name, b], i) => {
        const [previous, a] = entries[i] ?? ['', null]
        if (a && b && !(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)) {
          wrong.push(`${name} comes before ${previous}`)
        }
      })
      const main = document.querySelector('main')
      return {
        missing,
        wrong,
        stageInMain: Boolean(main?.contains(parts.stage)),
        detailsInMain: Boolean(main?.contains(parts.details)),
        footerOutsideMain: !main?.contains(parts.footer),
      }
    })
    expect(order.missing, 'a part of the page is missing').toEqual([])
    expect(order.wrong, 'the document order is wrong').toEqual([])
    expect(order.stageInMain, 'the stage is outside <main>').toBe(true)
    expect(order.detailsInMain, 'the details are outside <main>').toBe(true)
    expect(order.footerOutsideMain, 'the footer is inside <main>').toBe(true)
  })

  /**
   * LA-11: an email AND a WhatsApp control on screen, unscrolled, at EVERY width from 320 to
   * 1920 in 50px steps, plus 899 and 900 — the seam where `.action-bar` hands over to the
   * two-column controls. The fixed matrix above (844, 950, 1280, 1440) is what let a
   * 900–1099px gap with NO contact control live for four days; a sweep cannot miss a band.
   * One navigation per width: a resize leaves viewport units stale.
   */
  test('a contact control is on screen at every width from 320 to 1920', async ({ page }) => {
    test.setTimeout(180_000)
    const widths = [...Array.from({ length: 33 }, (_, i) => 320 + i * 50), 899, 900].sort(
      (a, b) => a - b,
    )
    const gaps: string[] = []
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const seen = await page.evaluate(() => {
        const inView = (el: Element) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden') return false
          return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
        }
        const persistent = [
          ...document.querySelectorAll('.contact-rail a, .action-bar a, .stage__contact a'),
        ].filter(inView)
        return {
          email: persistent.some((a) => a.getAttribute('href')?.startsWith('mailto:')),
          whatsapp: persistent.some((a) => a.getAttribute('href')?.includes('wa.me')),
        }
      })
      if (!seen.email) gaps.push(`${width}px: no email control on screen`)
      if (!seen.whatsapp) gaps.push(`${width}px: no WhatsApp control on screen`)
    }
    expect(gaps, `checked ${widths.length} widths`).toEqual([])
  })

  /**
   * LA-15: the pinned chrome never sits over content. The bar is sticky at the top and the
   * action bar is fixed at the bottom below 900px. Top: at rest, <main> starts where the bar
   * ends. Bottom: until polish M2 (2026-10-04) the page reserved the action bar's height under
   * the footer, and this checked the footer's last pixel was reachable above the bar. Since M2
   * the bar steps aside while any of the footer is above it (lib/actionBarStepsAside.ts) and the
   * page ends AT the footer, so those two are asserted: the footer ends the document, in
   * DOCUMENT space with no scroll in the measurement, because a check that scrolls first
   * measures the scroll (e2e-scroll-not-layout); and scrolled to the end, the bar has gone,
   * re-scrolled on each poll for the same reason.
   */
  for (const [width, height] of [
    [320, 640],
    [375, 812],
    [768, 1024],
    [1280, 800],
  ] as const) {
    test(`the pinned bars never cover content at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // Measured 2026-09-25: read straight after the heading, the bar was still in the
      // fallback font (74.25px), against 73.6px once the webfont swapped in. A visitor never
      // reaches the bottom inside that first instant, so measure the settled page: fonts in,
      // then two frames for the ResizeObservers' writes to land.
      await page.evaluate(() =>
        document.fonts.ready.then(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        ),
      )
      const m = await page.evaluate(() => {
        const bar = document.querySelector('.action-bar') as HTMLElement | null
        const barShown = Boolean(bar) && getComputedStyle(bar as HTMLElement).display !== 'none'
        return {
          scrollY: window.scrollY,
          headerBottom: document.querySelector('header.notch-shell')?.getBoundingClientRect()
            .bottom,
          mainTop: document.querySelector('main')?.getBoundingClientRect().top,
          barHeight: barShown ? (bar as HTMLElement).getBoundingClientRect().height : 0,
          documentHeight: document.documentElement.scrollHeight,
          footerBottom:
            (document.querySelector('footer.site-footer')?.getBoundingClientRect().bottom ??
              Number.NaN) + window.scrollY,
        }
      })
      expect(m.scrollY, 'the page must be at rest for the top check').toBe(0)
      expect(
        m.mainTop,
        `<main> starts under the bar: bar ends at ${m.headerBottom}, main starts at ${m.mainTop}`,
      ).toBeGreaterThanOrEqual((m.headerBottom ?? Number.POSITIVE_INFINITY) - 0.5)
      // One pixel of rounding: `scrollHeight` is an integer and the footer's edge is not.
      expect(
        Math.abs(m.documentHeight - m.footerBottom),
        `the page runs on past the footer: footer bottom ${m.footerBottom}, ` +
          `document ${m.documentHeight}`,
      ).toBeLessThanOrEqual(1)
      if (m.barHeight > 0) {
        await expect
          .poll(
            async () => {
              await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
              return page.evaluate(
                () => getComputedStyle(document.querySelector('.action-bar') as Element).visibility,
              )
            },
            {
              message: `the action bar stayed over the footer at ${width}x${height}`,
              timeout: 5_000,
            },
          )
          .toBe('hidden')
      }
    })
  }
})

/**
 * LA-16 — the facts in the window's corners frame a GARMENT. When 3D cannot run (Save-Data, no
 * WebGL, a stalled download), the stage holds the picture and the notice instead, and the old
 * callouts were still drawn over the same box: measured 2026-09-25 before the fix, at five
 * widths from 1000px. Since polish D10 the corners are the facts' only copy on a computer, so
 * App.tsx moves them under the stage while the stage has no garment ("the spec facts render
 * once at every width" counts that), and `Stage.tsx` draws none over a failure state either way.
 */
test.describe('the corner facts never sit over the no-3D notice (LA-16)', () => {
  const WIDTHS = [1000, 1100, 1280, 1440, 1920] as const
  const measure = (page: Page) =>
    page.evaluate(() => {
      const failure = document.querySelector('.stage__failure')?.getBoundingClientRect()
      const groups = [...document.querySelectorAll('.spec-groups--corners .spec-group')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
      const overlaps = failure
        ? groups.filter(
            (r) =>
              r.left < failure.right &&
              failure.left < r.right &&
              r.top < failure.bottom &&
              failure.top < r.bottom,
          ).length
        : 0
      return { shown: groups.length, overlaps }
    })

  for (const width of WIDTHS) {
    test(`none is drawn while the notice shows, at ${width}px`, async ({ page }) => {
      // Save-Data is the fallback every engine can reach: `canRender3D()` refuses 3D on it.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', {
          configurable: true,
          value: { saveData: true },
        })
      })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.locator('.stage__error:not([hidden])')).toBeVisible()
      const m = await measure(page)
      console.log(
        `LA-16 fallback ${width}px: ${m.shown} corner groups drawn, ${m.overlaps} over the notice`,
      )
      expect(m.overlaps, `${m.overlaps} corner groups sit over the no-3D notice`).toBe(0)
      expect(m.shown, 'the corners frame a garment that is not here').toBe(0)
    })
  }

  // From 1024px: the corners follow the name and description beside the garment, which starts
  // there (`IDENTITY_IN_ASIDE_QUERY`); at 1000px the facts are under the description.
  test('with 3D available they render at every computer width', async ({ page, browserName }) => {
    for (const width of [1024, ...WIDTHS.slice(1)]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      /*
       * ⚠️ WAIT FOR THE STAGE TO SHOW ONE OF ITS TWO STATES, then branch (2026-09-25). Read
       * once, straight after the heading, CI's Firefox found NEITHER the no-3D notice NOR a
       * drawn callout at 1000px, twice in a row: red on `main` after #60 (a unit-test-only
       * change) and flaky on #62, on runners where that engine's 3D tests were also timing
       * out waiting for models to load. The cause is NOT established — no snapshot was kept,
       * this Mac cannot reproduce it (also tried inside CI's image, with the 3D library's
       * download delayed 3s), and in the code a fallback always shows the notice. So this
       * waits up to 20s for the corners or the notice; a stage that shows neither now fails
       * with "the stage never settled", which names the real question.
       */
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              if (document.querySelector('.stage__error:not([hidden])')) return 'fallback'
              const drawn = [
                ...document.querySelectorAll('.spec-groups--corners .spec-group'),
              ].filter((el) => el.getBoundingClientRect().width > 0).length
              return drawn > 0 ? 'corners' : 'pending'
            }),
          { message: `the stage never settled at ${width}px`, timeout: 20_000 },
        )
        .not.toBe('pending')
      const fallback = await page.locator('.stage__error:not([hidden])').count()
      test.skip(fallback > 0, `${browserName}: no WebGL here, so there is no garment to frame`)
      const m = await measure(page)
      expect(m.shown, `not four corner groups at ${width}px with 3D available`).toBe(4)
    }
  })
})

/**
 * Batch C, PR 2 — the motion layer's contracts, read off the running page rather than the
 * stylesheet's text: what a reduced-motion visitor gets, what a press does, and exactly
 * which blocks reveal and how.
 */
test.describe('the motion layer keeps its contracts (MO-03, MO-04, MO-17)', () => {
  /**
   * MO-03: under reduced motion EVERY transition and animation on the page, pseudo-elements
   * included, resolves to at most 0.01ms with no delay, and every reveal is already shown on
   * arrival. `base.css`'s universal rule is what promises this; the test above only proved
   * the reveals were not left at opacity 0.
   */
  test('reduced motion: every duration is 0.01ms and every reveal is already shown', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      'reduced motion was not actually emulated',
    ).toBe(true)
    const found = await page.evaluate(() => {
      const ms = (v: string) => {
        const n = Number.parseFloat(v)
        if (Number.isNaN(n)) return 0 // `auto`: no time-based duration at all
        return v.trim().endsWith('ms') ? n : n * 1000
      }
      const worst = (list: string) => Math.max(...list.split(',').map(ms))
      const slow: string[] = []
      let checked = 0
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo)
          checked++
          const d = Math.max(worst(cs.transitionDuration), worst(cs.animationDuration))
          const delay = Math.max(worst(cs.transitionDelay), worst(cs.animationDelay))
          if (d > 0.0101 || delay > 0) {
            slow.push(
              `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''}${pseudo ?? ''}: ` +
                `transition ${cs.transitionDuration} +${cs.transitionDelay}, ` +
                `animation ${cs.animationDuration} +${cs.animationDelay}`,
            )
          }
        }
      }
      const reveals = [...document.querySelectorAll('[data-reveal]')].map((el) => {
        const cs = getComputedStyle(el)
        return { opacity: cs.opacity, transform: cs.transform }
      })
      return { checked, slow: slow.slice(0, 8), reveals }
    })
    expect(found.checked, 'the sweep read nothing').toBeGreaterThan(300)
    expect(found.slow, 'something still moves for a reader who asked it not to').toEqual([])
    expect(found.reveals.length, 'no reveal blocks on the page').toBeGreaterThan(0)
    for (const r of found.reveals) {
      expect(r, 'a reveal is not already in place on arrival').toEqual({
        opacity: '1',
        transform: 'none',
      })
    }
  })

  /**
   * MO-04: a press shrinks the control to 0.97 with the standalone `scale`
   * property, promptly, and never through `transform` — which the cursor's
   * magnet owns on the same elements, and a `transform: scale()` would fight
   * (apps/viewer/CLAUDE.md, the translate → rotate → scale → transform order). The test
   * above proves the transition is declared; this one presses a real tab and reads the
   * frames.
   */
  test('a press shrinks the control to 0.97 through `scale`, promptly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const tab = page.locator('.colourway-tab').nth(1)
    await expect(tab, 'no second colourway tab to press').toBeVisible()
    await tab.scrollIntoViewIfNeeded()
    /*
     * ⚠️ AIM ONLY ONCE THE RAIL HAS LANDED (2026-10-03). This test asks for motion, so the colourway
     * rail's reveal runs: `.colourways` starts `--reveal-y` (24px) low and rises over --slow. The aim
     * used to be the tab's box read straight after the <h1>, and a probe over 60 runs read it mid-rise
     * twice (y 384 against a settled 360). A 44px tab that rises 24px leaves its old centre 2px below
     * it, so a press that lands late misses: two of four full local gate runs that day failed with
     * "the press never reached the tab", the press held back by the 3D engine's long task. Planting a
     * restarted rise and a 900ms wait missed 10 times in 10 with the old aim and hit 10 in 10 with this
     * one. `hover()` then checks the tab is stable and is what a pointer there would hit
     * (playwright.dev/docs/actionability), and leaves the mouse on it for the press below.
     */
    await expect
      .poll(() => page.locator('.colourways').evaluate((el) => getComputedStyle(el).transform))
      .toBe('none')
    await tab.hover()
    await page.evaluate(() => {
      const el = document.querySelectorAll('.colourway-tab')[1] as HTMLElement
      const w = window as unknown as {
        __press: { t: number; scale: string; transform: string }[]
        __down: number
      }
      w.__press = []
      w.__down = -1
      el.addEventListener('pointerdown', () => (w.__down = performance.now()), { once: true })
      const start = performance.now()
      const tick = () => {
        const cs = getComputedStyle(el)
        w.__press.push({ t: performance.now(), scale: cs.scale, transform: cs.transform })
        if (performance.now() - start < 5000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    /*
     * ⚠️ "PROMPT" IS READ OFF THE TRANSITION THE ELEMENT CARRIES, NOT A STOPWATCH (2026-09-26).
     * It asked "first changed frame within 100ms after pointerdown" and failed CI's WebKit at 151
     * and 268ms (runs 36149983039, 36157796251) while the Mac read 3-56ms: on a loaded runner the
     * FRAMES are that far apart. Two frame-based replacements were tried the same day and both
     * were blind or flaky: during a transition-delay every engine reports `scale: 1`, not `none`,
     * so a planted 150ms delay "started" at 10ms; and `getAnimations()` missed a 120ms transition
     * that finished between two starved frames. The computed `transition-*` lists are what the
     * browser will run, cascade and overrides included, and reading them needs no frame at all:
     * the planted `transition-delay: 150ms` read 150 here in every engine.
     */
    const timing = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelectorAll('.colourway-tab')[1] as HTMLElement)
      const list = (v: string) => v.split(',').map((x) => x.trim())
      const ms = (v: string) =>
        v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000
      const props = list(cs.transitionProperty)
      const i = props.findIndex((p) => p === 'scale' || p === 'all')
      if (i < 0) return null
      const at = (v: string) => {
        const items = list(v)
        return items[i % items.length] ?? '0s'
      }
      return { delay: ms(at(cs.transitionDelay)), duration: ms(at(cs.transitionDuration)) }
    })
    await page.mouse.down()
    // Held until a DRAWN frame shows the press (up to 3s), not for a fixed 400ms: on a starved
    // runner no frame may fall inside 400ms at all, which is frame pacing, not the page.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __press: { t: number; scale: string }[]
              __down: number
            }
            return w.__press.some(
              (f) => f.t >= w.__down && Math.abs(Number.parseFloat(f.scale) - 0.97) < 0.001,
            )
          }),
        { timeout: 3_000 },
      )
      .toBe(true)
      .catch(() => {
        // Reported by the assertion below, with the frames it saw.
      })
    const { frames, down, instant } = await page.evaluate(() => {
      const w = window as unknown as {
        __press: { t: number; scale: string; transform: string }[]
        __down: number
      }
      const v = getComputedStyle(document.documentElement).getPropertyValue('--instant').trim()
      return {
        frames: w.__press,
        down: w.__down,
        instant: v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000,
      }
    })
    await page.mouse.up()
    expect(down, 'the press never reached the tab').toBeGreaterThan(0)
    const after = frames.filter((f) => f.t >= down)
    // Within 0.001, not `=== '0.97'`: an eased value approaches its end and the last exact
    // frame need not be sampled. CI's Chromium read 0.970186 then 0.970024 and never the
    // literal string, twice (2026-09-25), on a press that had plainly arrived.
    const pressed = after.find((f) => Math.abs(Number.parseFloat(f.scale) - 0.97) < 0.001)
    console.log(
      `MO-04 press: delay ${timing?.delay}ms, duration ${timing?.duration}ms, lands ${Math.round((pressed?.t ?? Number.NaN) - down)}ms (--instant ${instant}ms)`,
    )
    expect(
      pressed,
      `the tab never read scale 0.97 while held; frames saw ${[...new Set(after.map((f) => f.scale))].join(', ')}`,
    ).toBeDefined()
    expect(timing, 'no transition covers `scale` on the tab').not.toBeNull()
    expect(timing?.delay, 'the press waits before it starts answering').toBeLessThanOrEqual(0)
    expect(timing?.duration, 'the press is not on the --instant duration').toBeCloseTo(instant, 0)
    expect(
      after.filter((f) => f.transform !== 'none').map((f) => f.transform),
      'the press moved `transform`, which the cursor magnet owns',
    ).toEqual([])
  })

  /**
   * MO-17, the viewer half: exactly four blocks reveal on scroll — colourways, customise,
   * contact, footer — and each by fading AND rising (opacity + transform). The site's half,
   * rise only, is in apps/cms/e2e/motion.spec.ts. A fourth reveal, or one that lost its
   * fade, is a change to the design this pins.
   *
   * THREE SINCE 2026-10-02: the footer was the fourth, and its reveal went with it when these
   * pages took the website's footer (visual audit VA-31), which has never revealed on the site.
   * FOUR AGAIN SINCE 2026-10-04: "More from this category" (polish S6) sits between customise
   * and contact, the two sections that already reveal, and moves as they do.
   */
  test('four blocks reveal, each by fading and rising', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const inventory = await page.evaluate(() =>
      [...document.querySelectorAll('[data-reveal]')].map((el) => ({
        block: el.classList[0] ?? el.tagName.toLowerCase(),
        properties: getComputedStyle(el)
          .transitionProperty.split(',')
          .map((p) => p.trim()),
      })),
    )
    expect(inventory.map((r) => r.block).sort()).toEqual([
      'colourways',
      'contact',
      'customise',
      'related',
    ])
    for (const r of inventory) {
      expect(r.properties, `${r.block} does not fade`).toContain('opacity')
      expect(r.properties, `${r.block} does not rise`).toContain('transform')
    }
  })
})

/**
 * Batch C, PR 2 — the entrance and the idle cue, timed on a real load.
 */
test.describe('the entrance and the idle cue keep their timing (MO-10, MO-12)', () => {
  /**
   * MO-10: the preloader stays at least PRELOADER_MIN_DWELL_MS (400) before it leaves, its
   * clip-path wipe runs for --slow (800ms) and it unmounts only after the wipe, and it
   * carries one sentence a screen reader can reach (not a live region: the whole page
   * behind it is aria-hidden, and a region whose text never changes says nothing —
   * Preloader.tsx). Recorded by a MutationObserver installed before the app runs, so no
   * moment is missed between polls.
   */
  test('the preloader stays 400ms, wipes over 800ms, and says one sentence', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // As a HUMAN: Preloader.tsx treats `navigator.webdriver` like reduced motion and skips
    // the wipe, so without this the exit is never recorded (measured 2026-09-25: exit -1,
    // "dwell" negative). Same override as audit-guards.spec.ts's `asAHuman`.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => false,
        configurable: true,
      })
    })
    /*
     * ⚠️ TWO `.preloader` ELEMENTS, ONE AFTER THE OTHER (RO-08, 2026-09-25). index.html
     * paints a static copy inside #root so slow 3G shows something before React arrives;
     * React's first render replaces it with the component that times and wipes. So the
     * floor is timed from when the element that WIPES appeared (`mount`), which is when
     * Preloader.tsx starts its 400ms, and the transition and sentence are read as it
     * begins to leave, when the stylesheet has certainly applied. Read at the first
     * appearance instead, the static copy is still unstyled ("all 0s") and the floor would
     * include however long the JavaScript took, so a deleted dwell timer would still pass.
     * `appear` stays the first paint a visitor sees, reported but not asserted.
     */
    await page.addInitScript(() => {
      const log: {
        appear: number
        mount: number
        exit: number
        gone: number
        transition: string
        sentence: string
      } = { appear: -1, mount: -1, exit: -1, gone: -1, transition: '', sentence: '' }
      ;(window as unknown as { __preloader: typeof log }).__preloader = log
      let current: Element | null = null
      let currentSince = -1
      new MutationObserver(() => {
        const el = document.querySelector('.preloader')
        const now = performance.now()
        if (el && log.appear < 0) log.appear = now
        if (el && el !== current) {
          current = el
          currentSince = now
        }
        if (el?.classList.contains('preloader--exit') && log.exit < 0) {
          log.exit = now
          log.mount = currentSince
          const cs = getComputedStyle(el)
          log.transition = `${cs.transitionProperty} ${cs.transitionDuration}`
          // Readable = has text and neither it nor an ancestor is aria-hidden.
          log.sentence = [...el.querySelectorAll('*')]
            .filter((n) => n.children.length === 0 && !n.closest('[aria-hidden="true"]'))
            .map((n) => n.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' | ')
        }
        if (!el && log.appear >= 0 && log.gone < 0) log.gone = now
      }).observe(document, { subtree: true, childList: true, attributes: true })
    })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.preloader')).toHaveCount(0, { timeout: 10_000 })
    const p = await page.evaluate(
      () =>
        (
          window as unknown as {
            __preloader: {
              appear: number
              mount: number
              exit: number
              gone: number
              transition: string
              sentence: string
            }
          }
        ).__preloader,
    )
    console.log(
      `MO-10: first paint to exit ${Math.round(p.exit - p.appear)}ms, dwell ${Math.round(p.exit - p.mount)}ms, ` +
        `wipe-to-unmount ${Math.round(p.gone - p.exit)}ms, ` +
        `transition "${p.transition}", sentence "${p.sentence}"`,
    )
    expect(p.appear, 'the preloader never appeared').toBeGreaterThanOrEqual(0)
    expect(p.exit, 'the preloader never began its exit').toBeGreaterThan(p.mount)
    // 16ms of slack: the observer fires on the mutation's microtask, not the timer's tick.
    expect(p.exit - p.mount, 'the preloader left before its 400ms floor').toBeGreaterThanOrEqual(
      384,
    )
    expect(p.transition, 'the wipe is not clip-path over --slow').toBe('clip-path 0.8s')
    expect(
      p.gone - p.exit,
      'the preloader unmounted before its 800ms wipe finished',
    ).toBeGreaterThanOrEqual(784)
    expect(p.sentence, 'the preloader says nothing a screen reader can reach').toBe(
      'Loading the product reference.',
    )
  })

  /**
   * MO-12, the part a robot can reach: the cue is absent at the moment the MODEL has loaded,
   * not only before it. The older test above asserts absence as soon as the heading shows,
   * when the model has not loaded and the cue cannot show anyway, so a cue that appeared
   * the instant the model arrived would pass it. The 14° sweep's timing and its 900ms
   * return stay on the owner's phone list: a software-rendered runner cannot time them.
   */
  test('the cue is absent at the moment the model loads, and waits its idle pause', async ({
    page,
  }) => {
    test.slow()
    // Recorded once per DRAWN FRAME from before the app runs, so neither moment can fall
    // between two polls. ⚠️ Not a page.evaluate promise on the 'load' event: <model-viewer>
    // arrives by a dynamic import, so the element can be absent when that runs, and the
    // promise then never settles (it timed out that way on 2026-09-25).
    await page.addInitScript(() => {
      const log = { loadedAt: -1, hintAt: -1, hintAtLoad: false }
      ;(window as unknown as { __cue: typeof log }).__cue = log
      const tick = () => {
        const mv = document.querySelector('model-viewer') as { loaded?: boolean } | null
        const hint = document.querySelector('.stage__hint')
        const now = performance.now()
        if (mv?.loaded && log.loadedAt < 0) {
          log.loadedAt = now
          log.hintAtLoad = hint !== null
        }
        if (hint && log.hintAt < 0) log.hintAt = now
        if (log.hintAt < 0) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await waitForStageToSettle(page)
    const fallback = await page.locator('.stage__error:not([hidden])').count()
    test.skip(fallback > 0, 'no WebGL on this engine — the stage is in poster fallback')
    const readCue = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __cue: { loadedAt: number; hintAt: number; hintAtLoad: boolean }
            }
          ).__cue,
      )
    await expect
      .poll(async () => (await readCue()).hintAt, {
        message: 'the cue never appeared',
        timeout: 40_000,
      })
      .toBeGreaterThan(0)
    const cue = await readCue()
    console.log(
      `MO-12: model loaded ${Math.round(cue.loadedAt)}ms, cue ${Math.round(cue.hintAt)}ms`,
    )
    expect(cue.loadedAt, 'the model never loaded').toBeGreaterThan(0)
    expect(cue.hintAtLoad, 'the cue shows the instant the model loads').toBe(false)
    expect(
      cue.hintAt - cue.loadedAt,
      'the cue did not wait its idle pause (CUE_IDLE_MS, 3000)',
    ).toBeGreaterThanOrEqual(2900)
  })
})
