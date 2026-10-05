import { expect, type Page, test } from './offlineMedia'

/**
 * Motion and preference guards for the 2026-09-06 beta-website audit (kept privately).
 *
 * ⚠️ EACH CASE RE-TAKES A MEASUREMENT THAT PASSED AND THAT NOTHING WAS HOLDING. These
 * are the rows the audit scored 8 and 9 — correct on the day, and one ordinary edit from
 * being quietly wrong afterwards. The source-text gate in `apps/viewer/src/styles/
 * tokens.test.ts` can say a rule EXISTS; only a browser can say it applies, and this
 * repo has shipped four gates that were green while measuring nothing.
 */

const PAGES = ['/', '/products', '/contact'] as const

test.describe('FA-H-05 — a press is answered immediately', () => {
  /**
   * MEASURED 2026-09-06: `.btn--primary` answers pointer-down with `scale: none → 0.97`
   * on the next frame, and it is the ONE control on the site that does — FA-H-04 scored
   * the other three at 3/10 for giving no press feedback at all.
   *
   * So this is the surviving half of a defect, and the half that survives is the half
   * that gets refactored. `packages/ui/src/base.css` lists four classes on one
   * `:active` rule; dropping `.btn` from that list, or adding `scale` to the `.btn`
   * transition (which would ease the press instead of answering it), both read as
   * tidying.
   */
  test('.btn answers pointer-down on the next frame', async ({ page }) => {
    await page.goto('/')
    const button = page.locator('.btn--primary').first()
    await button.scrollIntoViewIfNeeded()
    const box = await button.boundingBox()
    expect(box, 'no primary button on the home page').not.toBeNull()

    const scale = () => button.evaluate((el) => getComputedStyle(el).scale)
    const rest = await scale()
    expect(rest, 'the button is already scaled at rest').toBe('none')

    /*
     * ⚠️ POLLED, NOT SAMPLED ONCE — AND THE FIRST DRAFT OF THIS TEST FAILED FOR THAT
     * REASON. `.btn` transitions `scale` on `--instant`, so the frame immediately after
     * `mouse.down()` reports `1`: the press has started and has not arrived. Sampling
     * there reads as "no press feedback" against a control that is working. The audit's
     * own instrument resampled on the next rAF and then read six consecutive frames.
     *
     * ⚠️ THE MAGNITUDE, NOT THE DIFFERENCE, is what is asserted. That caveat is the
     * audit's too: `none` → `1` registers as a textual change while being visually
     * nothing, so a `:active { scale: 1 }` regression would satisfy "it changed".
     */
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await expect
      .poll(scale, { timeout: 2_000, message: 'pointer-down produced no press feedback' })
      .toBe('0.97')

    // and it is a PRESS, not a state: it must come back on release.
    await page.mouse.up()
    await expect
      .poll(scale, { timeout: 2_000, message: 'the button stayed pressed after release' })
      .toBe('none')

    /*
     * "Immediate" is half the finding, so it is half the guard. `--instant` is the token
     * DESIGN.md assigns to press feedback; easing the press on `--settle` would still
     * reach 0.97 and would no longer answer the finger.
     */
    const timing = await button.evaluate((el) => {
      const style = getComputedStyle(el)
      const properties = style.transitionProperty.split(',').map((value) => value.trim())
      const durations = style.transitionDuration.split(',').map((value) => value.trim())
      const index = properties.indexOf('scale')
      return {
        index,
        duration: index === -1 ? null : (durations[index] ?? durations[0]),
        instant: style.getPropertyValue('--instant').trim(),
      }
    })
    if (timing.index !== -1) {
      expect(
        Number.parseFloat(timing.duration ?? '0'),
        'the press is no longer answered on --instant',
      ).toBeLessThanOrEqual(Number.parseFloat(timing.instant) + 0.001)
    }
  })
})

/**
 * MO6 (owner, 3 Oct: "every button presses the same way"): the controls that answered a press with
 * nothing now shrink as `.btn` does, 0.97, and the file drop area as the cards do, 0.98 (site.css
 * says why). Each is pressed for real, with the pointer on its middle, and the value it reaches
 * is read, then that it comes back on release.
 */
test.describe('MO6 — every control answers a press the same way', () => {
  const CASES = [
    {
      path: '/products',
      selector: '.card-gallery__dot',
      scale: '0.97',
      hover: '.product-card__figure',
    },
    {
      path: '/products',
      selector: '.card-gallery__arrow--next',
      scale: '0.97',
      hover: '.product-card__figure',
    },
    { path: '/contact', selector: '.inquiry-form__answer', scale: '0.97' },
    { path: '/contact', selector: '.inquiry-form__drop', scale: '0.98' },
    { path: '/contact', selector: '.inquiry-files__remove', scale: '0.97', file: true },
    { path: '/custom-teamwear-manufacturer', selector: '.sport-filter__chip', scale: '0.97' },
  ] as const

  for (const item of CASES) {
    test(`${item.selector} on ${item.path} presses to ${item.scale}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(item.path)
      if ('file' in item && item.file) {
        await page.locator('.inquiry-form [name="files"]').setInputFiles({
          name: 'tech-pack.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7\nxref\n%%EOF\n'),
        })
      }
      const control = page.locator(item.selector).first()
      if ((await control.count()) === 0) test.skip(true, `no ${item.selector} on ${item.path} here`)
      await control.scrollIntoViewIfNeeded()
      if ('hover' in item && item.hover) await page.locator(item.hover).first().hover()
      await control.hover()
      const box = await control.boundingBox()
      expect(box, `${item.selector} has no box`).not.toBeNull()
      const scale = () => control.evaluate((el) => getComputedStyle(el).scale)
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await page.mouse.down()
      await expect.poll(scale, { timeout: 2_000, message: 'no press feedback' }).toBe(item.scale)
      await page.mouse.up()
      // The × does its job on release: the file leaves, and the button with it.
      if ('file' in item && item.file)
        await expect(page.locator('.inquiry-files__item')).toHaveCount(0)
      else await expect.poll(scale, { timeout: 2_000, message: 'it stayed pressed' }).toBe('none')
    })
  }
})

test.describe('VA-46 — both buttons answer a mouse the same way', () => {
  /**
   * Visual audit 2026-10-02, measured live: the primary button lifted 2px with no change of colour
   * and the outline button filled solid with no lift, while the cards and chips agreed with each
   * other. Both now lift 2px and invert (`packages/ui/src/base.css`, `.btn:hover`).
   *
   * Reduced motion is emulated, as every layout suite here does: the transition collapses to
   * 0.01ms, so the settled state is what is read, and it is polled because "settled" is a frame
   * away. Both themes are read, because each button's pair is two tokens that flip.
   *
   * ⚠️ WHAT SWAPPED IS ASSERTED, NOT A COLOUR. The primary button's hover fill is its resting TEXT
   * colour and its hover text its resting FILL; the outline button's fill is the page's text and its
   * text the page's ground. A literal colour would pass in one theme and fail in the other.
   */
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a mouse over either lifts it 2px and inverts it, in ${colorScheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/')
      const ground = await page.evaluate(() => {
        const style = getComputedStyle(document.body)
        return { text: style.color, page: style.backgroundColor }
      })
      const read = (selector: string) =>
        page
          .locator(selector)
          .last()
          .evaluate((element) => {
            const style = getComputedStyle(element)
            return { transform: style.transform, fill: style.backgroundColor, text: style.color }
          })
      // The closing section's buttons sit on the page's own ground, so the page's tokens are theirs.
      for (const selector of ['main .btn--primary', 'main .btn--ghost']) {
        const button = page.locator(selector).last()
        await button.scrollIntoViewIfNeeded()
        const rest = await read(selector)
        expect(rest.transform, `${selector} is lifted at rest`).toBe('none')
        await button.hover()
        // The primary button swaps its own two colours; the outline button takes the page's.
        const swapped = selector.endsWith('primary')
          ? { fill: rest.text, text: rest.fill }
          : { fill: ground.text, text: ground.page }
        await expect
          .poll(() => read(selector), { message: `${selector} did not lift 2px and invert` })
          .toEqual({ transform: 'matrix(1, 0, 0, 1, 0, -2)', ...swapped })
        // And it is a hover, not a state: it goes when the mouse does.
        await page.mouse.move(0, 0)
        await expect
          .poll(() => read(selector), { message: `${selector} stayed lifted after the mouse left` })
          .toEqual(rest)
      }
    })
  }

  test('a touch screen gets no hover state: the lift never sticks after a tap', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName === 'firefox', 'Firefox has no mobile emulation in Playwright')
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    })
    try {
      const page = await context.newPage()
      await page.goto('/')
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
      const button = page.locator('main .btn--primary').last()
      await button.scrollIntoViewIfNeeded()
      // A touch device still MATCHES :hover on a tap; the rule sits behind `(hover: hover)`.
      await button.hover()
      expect(await button.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
    } finally {
      await context.close()
    }
  })
})

test.describe('FA-F-01 / FA-R-06 — the notch condenses, gated, with the right fallback', () => {
  /**
   * MEASURED 2026-09-06: 60px → 52px over `scroll(root block) 0 160px` in Chromium and
   * WebKit; Firefox has no `animation-timeline: scroll()` and keeps the resting bar,
   * which site.css records as the DESIGN and not as a broken version of it. Under
   * `prefers-reduced-motion: reduce` all three engines hold it at 60px.
   *
   * ⚠️ THE FALLBACK IS ASSERTED IN THE ENGINE THAT TAKES IT. A guard that only checked
   * "the bar condenses" would fail in Firefox for a correct reason and get loosened; one
   * that only checked Chromium would never see the fallback break. Each engine is asked
   * for what it should do, and which branch it took is derived from `CSS.supports` in
   * the page rather than from the browser's name.
   */
  test('it condenses where the engine supports it, and rests where it does not', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    const supported = await page.evaluate(() => CSS.supports('animation-timeline', 'scroll()'))
    const heightAt = async (y: number) => {
      await page.evaluate((to) => window.scrollTo(0, to), y)
      // The animation is driven by scroll position, not by time; one painted frame is
      // enough, and waiting for a fixed duration would be waiting for nothing.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      return page.evaluate(() =>
        Math.round(document.querySelector('.notch')!.getBoundingClientRect().height),
      )
    }

    const atRest = await heightAt(0)
    const atRange = await heightAt(160)
    const past = await heightAt(1200)

    expect(atRest, 'the resting bar is not the measured 60px').toBe(60)
    if (supported) {
      expect(atRange, 'the bar did not condense over its scroll range').toBe(52)
      expect(past, 'the bar kept shrinking past the end of its range').toBe(52)
    } else {
      expect(atRange, 'an engine without scroll timelines lost the resting bar').toBe(60)
      expect(past).toBe(60)
    }
  })

  test('and it holds still under reduced motion, in every engine', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    // Assert the emulation took, or this test proves nothing — the audit's own note.
    const reduced = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    expect(reduced, 'reduced motion was not actually emulated').toBe(true)

    const height = async (y: number) => {
      await page.evaluate((to) => window.scrollTo(0, to), y)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      return page.evaluate(() =>
        Math.round(document.querySelector('.notch')!.getBoundingClientRect().height),
      )
    }
    expect(await height(0)).toBe(60)
    expect(await height(400), 'the bar condensed for a reader who asked it not to').toBe(60)
  })

  /**
   * Visual audit 2026-10-01 (owner-approved polish): on a sideways phone the 60px bar was
   * 17% of a 360px-high screen. Under `max-height: 500px` it RESTS at the condensed size the
   * owner already approved (52px, 4px padding) instead of reaching it only on scroll; the
   * menu button keeps its full 44px. Reduced motion is emulated so the scroll animation
   * cannot be what produced the 52.
   */
  test('on a sideways phone the bar rests at its condensed 52px, with a full-size button', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const [width, height] of [
      [640, 360],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      const bar = await page.evaluate(() => {
        const notch = document.querySelector('.notch')!.getBoundingClientRect().height
        const buttons = [...document.querySelectorAll('.notch a, .notch button')]
          .map((el) => el.getBoundingClientRect())
          .filter((box) => box.width > 0)
        return {
          notch: Math.round(notch),
          shortest: Math.round(Math.min(...buttons.map((box) => box.height))),
        }
      })
      expect(bar.notch, `the bar at ${width}x${height}`).toBe(52)
      expect(bar.shortest, `a bar control under 44px at ${width}x${height}`).toBeGreaterThanOrEqual(
        44,
      )
    }
    // The control: a screen taller than 500px keeps the resting 60px bar.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    expect(
      await page.evaluate(() =>
        Math.round(document.querySelector('.notch')!.getBoundingClientRect().height),
      ),
    ).toBe(60)
  })
})

test.describe('FA-F-05 — the page comes back where it was left', () => {
  /**
   * MEASURED 2026-09-06: `/products` at scrollY 1200 → client navigation to `/contact`
   * (top) → back → **1199**. `history.scrollRestoration` is `auto`.
   *
   * ⚠️ THIS IS THE ONE THAT BREAKS BY ACCIDENT. It is not implemented by anything here —
   * it is the browser's default, kept by NOT setting `scrollRestoration = 'manual'`, which
   * is exactly what a smooth-scroll integration or a scroll-progress effect asks you to do
   * first. The site smooth-scrolls since D22; this runs under automation (layer off), and
   * e2e/smoothScroll.spec.ts repeats it as a person with the layer on — where a planted
   * `'manual'` failed both it and the back-forward-cache case.
   */
  test('going back to the gallery restores the scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/products')

    expect(
      await page.evaluate(() => history.scrollRestoration),
      'something took over scroll restoration',
    ).toBe('auto')

    /*
     * 1000, not the audit's 1200: the gallery is 2176px tall at 1280x800 in this
     * fixture against production's 3900, so 1200 is close enough to the maximum scroll
     * that a restored position could look correct by landing at the bottom. 1000 is
     * comfortably mid-page, and the floor below refuses to run the test at all on a
     * page too short for the measurement to mean anything.
     */
    const target = 1000
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    expect(
      height,
      'the gallery is too short for this measurement to mean anything',
    ).toBeGreaterThan(1900)
    await page.evaluate((to) => window.scrollTo(0, to), target)
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(900)

    await page.locator('.notch__nav a', { hasText: /contact/i }).click()
    await expect(page).toHaveURL(/\/contact$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/products$/)
    // Restoration is asynchronous — poll rather than sample once.
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 5_000 })
      .toBeGreaterThan(target - 60)
  })
})

/**
 * SC-05 (site half, AUTOMATION PATH) — one trusted wheel tick settles fast when the smooth
 * layer is off, which it is under automation and reduced motion (D22 in
 * docs/DECISIONS-BETA-WEBSITE.md). The glide a person gets is measured with the webdriver
 * flag lifted in e2e/smoothScroll.spec.ts. Here a tick is the browser's own scroll. The
 * viewer's half, in apps/viewer/e2e/audit-guards.spec.ts, explains the instrument: scrollY
 * is sampled on every animation frame IN the page, never polled over the protocol, and
 * "settled" means within 1px of where it finished.
 */
test.describe('SC-05 (site) — one wheel tick settles quickly', () => {
  test('scrollY settles within a few hundred ms of one wheel tick', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a phone has no mouse wheel')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/products')
    const header = await page.locator('header').first().boundingBox()
    if (!header) throw new Error('no header to wheel over')
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
    await page.evaluate(() => {
      const w = window as unknown as { __sc05: { t: number; y: number }[] }
      w.__sc05 = []
      const t0 = performance.now()
      const tick = () => {
        const t = performance.now() - t0
        w.__sc05.push({ t, y: window.scrollY })
        if (t < 2000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(2200)
    const samples = await page.evaluate(
      () => (window as unknown as { __sc05: { t: number; y: number }[] }).__sc05,
    )
    const final = samples.at(-1)?.y ?? 0
    const firstMove = samples.find((x) => x.y !== samples[0]?.y)?.t ?? 0
    let lastFar = firstMove
    // Only frames AFTER movement began: an instant (one-frame) scroll has no far sample
    // after it and settles in 0ms — the first version read -8 to -48ms here (2026-09-25).
    for (const x of samples) if (x.t >= firstMove && Math.abs(x.y - final) >= 1) lastFar = x.t
    const settleMs = Math.round(lastFar - firstMove)
    console.log(`SC-05 (site) measured: moved ${final}px, settled ${settleMs}ms after it started`)
    expect(
      final,
      'the wheel tick moved nothing at all — the probe measured no scroll',
    ).toBeGreaterThan(0)
    // Measured 2026-09-25: 0ms, eight runs — the browser's own wheel scroll lands in one
    // frame here. 300ms leaves room for a browser that animates it, and still fails the
    // regression that matters: a script (or a smooth-scroll library) taking over the wheel
    // and gliding the page, planted as a 1s glide and caught.
    expect(settleMs, `settled ${settleMs}ms after it started moving`).toBeLessThan(300)
  })
})

/**
 * SC-01 — the other two return paths FA-F-05 above does not cover: typing a fresh
 * address (a NEW navigation, not history traversal — correctly starts at the top,
 * every time), and a plain reload (the browser's own `scrollRestoration: 'auto'`
 * behaviour, same as FA-F-05 relies on, exercised via `page.reload()` instead of
 * `page.goBack()`).
 */
test.describe('SC-01 — scroll restoration, the other two paths', () => {
  test('typing a fresh address always starts at the top, never a remembered position', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/products')
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    expect(
      height,
      'the gallery is too short for this measurement to mean anything',
    ).toBeGreaterThan(1900)
    await page.evaluate(() => window.scrollTo(0, 1000))
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(900)

    // A fresh page.goto() is a NEW navigation, the same shape as typing an address in
    // the bar — not history traversal, so nothing should be restored.
    await page.goto('/products')
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0)
  })

  test('a plain reload restores the scroll position, same as history back does', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/products')
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    expect(
      height,
      'the gallery is too short for this measurement to mean anything',
    ).toBeGreaterThan(1900)
    const target = 1000
    await page.evaluate((to) => window.scrollTo(0, to), target)
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(900)

    await page.reload()
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 5_000 })
      .toBeGreaterThan(target - 60)
  })
})

test.describe('FA-H-10 — the skip link answers on --instant and actually moves', () => {
  /**
   * MEASURED 2026-09-06: the skip link is the one place the `--instant` token is honoured
   * (the cross-surface note X-01 records that the PRESS half of the same token is not),
   * and it was caught mid-transition at `top: -1.0px`.
   *
   * navbar.spec.ts already proves the link is reachable and moves focus. This is the
   * other half: that it is visibly revealed, on the duration the design system names. A
   * skip link that never leaves `translateY(-150%)` is focusable, announced, and
   * invisible — which is a WCAG 2.4.7 failure that every keyboard test still passes.
   */
  test('it is unseen at rest, on-screen when focused, on the --instant duration', async ({
    page,
  }) => {
    await page.goto('/')
    const measured = await page.evaluate(() => {
      const link = document.querySelector('.skip-link') as HTMLElement
      const box = link.getBoundingClientRect()
      return {
        // Off-screen OR clipped to nothing: since VA-26 (2026-10-01) it is both, because an
        // iPhone's pull-down bounce showed the off-screen strip above the page.
        unseen: box.bottom <= 0 || (box.width <= 1 && box.height <= 1),
        duration: getComputedStyle(link).transitionDuration,
        instant: getComputedStyle(document.documentElement).getPropertyValue('--instant').trim(),
      }
    })
    expect(measured.unseen, 'the skip link is visible before it is focused').toBe(true)
    // `.12s` in the token, `0.12s` from getComputedStyle — compare as numbers.
    expect(
      Number.parseFloat(measured.duration),
      'the skip link no longer uses the --instant duration',
    ).toBeCloseTo(Number.parseFloat(measured.instant), 3)
    expect(Number.parseFloat(measured.instant), '--instant resolved to nothing').toBeGreaterThan(0)

    await page.keyboard.press('Tab')
    await expect(page.locator('.skip-link')).toBeFocused()
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.round(
            (document.querySelector('.skip-link') as HTMLElement).getBoundingClientRect().top,
          ),
        ),
      )
      .toBeGreaterThanOrEqual(0)
  })
})

test.describe('FA-H-08 — there is nothing translucent to reduce', () => {
  /**
   * MEASURED 2026-09-06 by a full-DOM scan: **0** elements with `backdrop-filter` and
   * **0** semi-opaque elements wider than 100px on the marketing site. That is why
   * `prefers-reduced-transparency` has nothing to answer here, and it was recorded so the
   * absence would not be re-filed as a finding.
   *
   * ⚠️ IT IS ALSO A PERFORMANCE AND LEGIBILITY PROPERTY, WHICH IS WHY IT IS WORTH
   * HOLDING. A blurred sticky bar is the single most reached-for chrome effect there is;
   * the viewer has one and answers the preference for it. Adding one here would be
   * invisible in review, would put a compositor-expensive filter under a fixed element
   * on every page, and would need a preference block nobody would remember to write.
   */
  for (const path of PAGES) {
    test(`${path} paints nothing see-through`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(path)
      const found = await page.evaluate(() => {
        const blurred: string[] = []
        const translucent: string[] = []
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          const style = getComputedStyle(el)
          const name = `${el.tagName}.${String(el.className).slice(0, 30)}`
          if (style.backdropFilter && style.backdropFilter !== 'none') blurred.push(name)
          const parts = style.backgroundColor.match(/rgba?\(([^)]+)\)/)
          if (!parts?.[1]) continue
          const values = parts[1].split(',').map((v) => Number.parseFloat(v))
          const alpha = values.length > 3 ? (values[3] ?? 1) : 1
          // Fully transparent is not translucent — most elements report rgba(0,0,0,0).
          // 100px is the audit's own threshold: a tinted chip is not a frosted panel.
          if (alpha > 0 && alpha < 1 && el.getBoundingClientRect().width > 100) {
            translucent.push(`${name} @ ${style.backgroundColor}`)
          }
        }
        return { blurred: [...new Set(blurred)], translucent: [...new Set(translucent)] }
      })
      expect(
        found.blurred,
        'a backdrop-filter arrived, and nothing answers the preference',
      ).toEqual([])
      expect(found.translucent, 'a large translucent surface arrived').toEqual([])
    })
  }
})

test.describe('FA-G-52 — Windows High Contrast is answered, not fought', () => {
  /**
   * MEASURED 2026-09-06 with and without `forcedColors: active`: the browser's own
   * substitution reaches every element checked, `forced-color-adjust: none` appears
   * nowhere on the site, and two `@media (forced-colors: active)` blocks restore the two
   * cues that colour substitution would otherwise take away — the bar's carved fillets
   * (pseudo-elements whose only content is a background) and the volt underline that
   * marks the current page.
   *
   * ⚠️ THE INSTRUMENT CARRIES ITS OWN POSITIVE CONTROL, AND IT IS NOT DECORATION. An
   * injected probe styled `color: rgb(1,2,3); background: rgb(4,5,6)` must come back
   * substituted. Without it this test would pass identically in a browser that ignored
   * the emulation, which is precisely how a gate ends up measuring nothing. The audit
   * ran the same control for the same reason.
   */
  test('the browser substitutes, and the underline survives it', async ({ page, browserName }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/products')

    const active = await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches)
    test.skip(!active, `${browserName} does not emulate forced-colors`)

    const measured = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.textContent = 'probe'
      probe.style.color = 'rgb(1, 2, 3)'
      probe.style.backgroundColor = 'rgb(4, 5, 6)'
      document.body.appendChild(probe)
      const probeStyle = getComputedStyle(probe)
      const control = { color: probeStyle.color, background: probeStyle.backgroundColor }
      probe.remove()

      const current = document.querySelector('.nav-link[aria-current="page"]') as HTMLElement
      const fillet = getComputedStyle(document.querySelector('.notch') as HTMLElement, '::before')
      return {
        control,
        underline: getComputedStyle(current).textDecorationLine,
        filletDisplay: fillet.display,
        forcedAdjust: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => getComputedStyle(el).forcedColorAdjust === 'none')
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 30)}`),
      }
    })

    // The positive control: the emulation is real, not a media-query flip.
    expect(
      measured.control.color,
      'the probe kept its own colour — forced-colors is not actually applying, so nothing below is a measurement',
    ).not.toBe('rgb(1, 2, 3)')
    expect(measured.control.background).not.toBe('rgb(4, 5, 6)')

    expect(
      measured.underline,
      'the current-page cue is gone under high contrast — it is colour-only again',
    ).toContain('underline')
    expect(
      measured.filletDisplay,
      'the carved fillets are still painted, and under substitution they are two floating blocks',
    ).toBe('none')
    expect(
      measured.forcedAdjust,
      'something opted out of the palette the reader chose for legibility',
    ).toEqual([])
  })
})

/**
 * MO-17, the site half: the home page reveals exactly six sections on scroll (№01–№06; seven
 * until the factory strip, then №06, was removed on 2026-10-02, visual audit VA-29), and by
 * RISING alone — `site-reveal` animates `transform` and never `opacity`. The fade was taken
 * out on purpose: text mid-fade failed contrast checks (7 violations on the home page, 0
 * without it; see `site.css`). The viewer's half, fade AND rise, is in
 * apps/viewer/e2e/motion-and-layout.spec.ts.
 */
test.describe('MO-17 — the site reveals by rising alone', () => {
  test('six home sections reveal, and the keyframes never touch opacity', async ({ page }) => {
    await page.goto('/')
    const found = await page.evaluate(() => {
      const properties = new Set<string>()
      let keyframes = 0
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          if (rule instanceof CSSKeyframesRule && rule.name === 'site-reveal') {
            keyframes++
            for (const frame of rule.cssRules) {
              const style = (frame as CSSKeyframeRule).style
              for (let i = 0; i < style.length; i++) properties.add(style.item(i))
            }
          } else if ('cssRules' in rule) {
            walk((rule as CSSGroupingRule).cssRules)
          }
        }
      }
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules)
        } catch {
          // a cross-origin sheet: not ours
        }
      }
      return {
        sections: document.querySelectorAll('[data-site-reveal]').length,
        keyframes,
        properties: [...properties].sort(),
      }
    })
    // №01–№06 since 2026-10-02 (№07 went with the factory strip); the hero never reveals.
    expect(found.sections, 'the home page reveals a different number of sections').toBe(6)
    expect(found.keyframes, 'no `site-reveal` keyframes in the served CSS').toBeGreaterThan(0)
    expect(found.properties, 'the site reveal animates something besides a rise').toEqual([
      'transform',
    ])
  })
})

/**
 * The count-up in №05 (owner, 2026-09-29). What would have to break for these to fail: the
 * figure missing without scripting (a crawler or a no-JS visitor sees a zero or nothing), the
 * roll running for someone who asked for less motion, or the roll never running at all.
 */
test.describe('№05 — the numbers count up, and only when they may', () => {
  const feature = '.fact--feature .count-up'

  test('with scripting off, every figure is the real number', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator(feature)).toHaveText('100,000')
    await expect(page.locator('.facts-grid .count-up')).toHaveText([
      '100,000',
      '50',
      '7',
      '200',
      '193,000',
    ])
    await context.close()
  })

  test('under reduced motion the figure never rolls', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.locator(feature).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await expect(page.locator(feature)).toHaveText('100,000')
    await expect(page.locator(`${feature} number-flow-react`)).toHaveCount(0)
  })

  test('with motion allowed, the figure rolls once it is seen and ends on the real number', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    // Not yet seen: still the plain server text.
    await expect(page.locator(`${feature} number-flow-react`)).toHaveCount(0)
    await page.locator(feature).scrollIntoViewIfNeeded()
    await expect(page.locator(`${feature} number-flow-react`)).toHaveCount(1, { timeout: 3000 })
    // A screen reader is told the final figure, never a digit mid-roll.
    await expect(page.locator(`${feature} .visually-hidden`)).toHaveText('100,000')
    await expect(page.locator(`${feature} [aria-hidden="true"]`)).toHaveCount(1)
  })
})

/**
 * The scroll motion (owner, 2026-09-29): the photos wipe open and drift.
 * What would have to break: motion for someone who asked for none, or a photo left half-clipped
 * once it is on screen — which is how a scroll animation turns into missing content.
 * The photos measured are №01's two (`.about`): the factory strip they were first measured on went
 * with VA-29 (2026-10-02), and the order timeline's eight, and its drawn line, with polish D4
 * (2026-10-05), whose stacking cards `e2e/orderTimeline.spec.ts` measures.
 */
test.describe('scroll motion — the photos open and drift', () => {
  const targets = {
    '.about .photo-wipe': 'photo-wipe',
    '.about .photo-parallax': 'photo-drift',
  } as const

  const names = (page: Page) =>
    page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const element = document.querySelector(selector)
          return element ? getComputedStyle(element).animationName : 'MISSING'
        }),
      Object.keys(targets),
    )

  test('with motion allowed, each is attached to the scroll', async ({ page, browserName }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'))
    test.skip(
      !supported,
      `${browserName} has no scroll-driven animations: it shows the finished page`,
    )
    expect(await names(page)).toEqual(Object.values(targets))
  })

  test('under reduced motion none of them runs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    expect(await names(page)).toEqual(['none', 'none'])
  })

  test('a photo scrolled into view is fully open, whatever the engine', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    const frame = page.locator('.about .photo-wipe').first()
    await frame.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    // "Fully open" is `none` or an inset whose every edge is zero — Chromium writes the
    // animation's end as `inset(0px 0px 0%)`.
    const isOpen = (clip: string) =>
      clip === 'none' ||
      (clip.startsWith('inset(') && (clip.match(/-?[\d.]+/g) ?? []).every((v) => Number(v) === 0))
    await expect
      .poll(async () =>
        isOpen(await frame.evaluate((element) => getComputedStyle(element).clipPath)),
      )
      .toBe(true)
  })
})

/**
 * MO4 (polish, 2026-10-05): the ticket cards rise into place as they scroll in, as the sections do.
 * What would have to break: motion for someone who asked for none, or a card left part-way up once
 * it is on screen, which is how a scroll animation turns into a card out of line with its row.
 * The card measured is the first one below the first screen, so it can be seen entering.
 */
test.describe('MO4 — the ticket cards rise into place as they scroll in', () => {
  for (const [path, selector] of [
    ['/products', '.product-card'],
    ['/', '.family-card'],
  ] as const) {
    test(`${path}: a card is lowered while it enters and in place once on screen`, async ({
      page,
      browserName,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      // 700 tall (a laptop with its bars): the seed has ONE garment, whose card starts 778px down,
      // inside a 900px screen, so only a shorter one shows it arriving.
      await page.setViewportSize({ width: 1440, height: 700 })
      await page.goto(path)
      const supported = await page.evaluate(() =>
        CSS.supports('(animation-timeline: view()) and (animation-range: entry)'),
      )
      test.skip(
        !supported,
        `${browserName} has no scroll-driven animations: every card is in place`,
      )

      const below = await page.evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)].findIndex(
            (card) => card.getBoundingClientRect().top > window.innerHeight,
          ),
        selector,
      )
      expect(
        below,
        'every card is on the first screen, so none can be seen entering',
      ).toBeGreaterThan(-1)
      const card = page.locator(selector).nth(below)
      const style = () =>
        card.evaluate((el) => ({
          name: getComputedStyle(el).animationName,
          lowered: Number.parseFloat(getComputedStyle(el).translate.split(' ')[1] ?? '0'),
        }))
      expect((await style()).name).toBe('card-rise')

      // Its top a little inside the foot of the screen: entering, so still lowered.
      await card.evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight + 40),
      )
      await expect.poll(async () => (await style()).lowered).toBeGreaterThan(0)
      // In the middle of the screen: wholly in place.
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await expect
        .poll(() => card.evaluate((el) => getComputedStyle(el).translate))
        .toMatch(/^(none|0px( 0px)?)$/)
    })
  }

  test('under reduced motion no card moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/products')
    await expect(page.locator('.product-card').first()).toBeVisible()
    const names = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll('.product-card')].map(
          (card) => getComputedStyle(card).animationName,
        ),
      ),
    ])
    expect(names).toEqual(['none'])
  })
})

/**
 * MO3 (owner, 5 Oct: "grow into the loading screen"): a product card's picture grows into the
 * garment page, and every other link on the site loads the next page exactly as before.
 *
 * In this suite the garment pages live on the viewer's own server, another origin, where no
 * transition can run, so the card's link is pointed at a website page for the test. What is
 * measured is THIS page's half (`CardOpening.tsx`), on the page being LEFT: whether the browser
 * offered a transition (`pageswap`) and whether the script cancelled it. Whether the next page
 * then takes it is that page's business: the garment page's half, inline opt-in included, is
 * apps/viewer's `e2e/page-transition.spec.ts`.
 */
test.describe('MO3 — only a card tap carries its picture into the next page', () => {
  const NAME = 'garment-opening'

  /** Open /products with a recorder on every page, the first card aimed at /contact, and taps held. */
  async function ready(page: Page, motion: 'no-preference' | 'reduce') {
    await page.addInitScript(() => {
      // Registered before the page's own scripts, so it runs before CardOpening's listener: it
      // notes what the browser offered, and the wrapped skip notes whether the script cancelled it.
      const proto = (
        window as Window & { ViewTransition?: { prototype: { skipTransition(): void } } }
      ).ViewTransition?.prototype
      if (proto) {
        const skip = proto.skipTransition
        proto.skipTransition = function (this: unknown) {
          sessionStorage.setItem('mo3-skipped', 'yes')
          return skip.call(this)
        }
      }
      window.addEventListener('pageswap', (event) => {
        const offered = (event as Event & { viewTransition?: unknown }).viewTransition
        sessionStorage.setItem('mo3-offered', offered ? 'yes' : 'no')
        sessionStorage.removeItem('mo3-skipped')
      })
    })
    await page.emulateMedia({ reducedMotion: motion })
    await page.goto('/products')
    const supported = await page.evaluate(() => 'onpageswap' in window)
    test.skip(!supported, 'this engine has no cross-document view transitions: it simply loads')
    const slide = page.locator('.product-card .card-gallery__slide[tabindex="0"]').first()
    await slide.evaluate((el) => {
      el.setAttribute('href', '/contact')
      // A held tap does everything a tap does but leave the page, so the script can be watched.
      document.addEventListener(
        'click',
        (event) => {
          if ((window as Window & { hold?: boolean }).hold) event.preventDefault()
        },
        { capture: true },
      )
      ;(window as Window & { hold?: boolean }).hold = true
    })
    // The script is there once a held tap names the picture (the page may still be hydrating).
    await expect
      .poll(async () => {
        await slide.click()
        return slide.evaluate((el) => el.style.getPropertyValue('view-transition-name'))
      })
      .toBe(NAME)
    return slide
  }

  const named = (page: Page) =>
    page.evaluate(
      (name) =>
        [...document.querySelectorAll<HTMLElement>('*')].filter(
          (el) => el.style.getPropertyValue('view-transition-name') === name,
        ).length,
      NAME,
    )
  const release = (page: Page) =>
    page.evaluate(() => {
      ;(window as Window & { hold?: boolean }).hold = false
    })
  /** What the page that was left decided: offered by the browser, and cancelled by the script? */
  const decision = (page: Page) =>
    page.evaluate(() => ({
      offered: sessionStorage.getItem('mo3-offered'),
      cancelled: sessionStorage.getItem('mo3-skipped') === 'yes',
    }))

  test('a card tap names that one picture and lets the transition go', async ({ page }) => {
    const slide = await ready(page, 'no-preference')
    expect(await named(page), 'two names cancel the whole transition').toBe(1)
    await release(page)
    await slide.click()
    await page.waitForURL('**/contact')
    expect(await decision(page)).toEqual({ offered: 'yes', cancelled: false })
  })

  test('any other link clears the name and cancels the transition', async ({ page }) => {
    await ready(page, 'no-preference')
    await page.evaluate(() => {
      const plain = document.createElement('a')
      plain.id = 'mo3-plain'
      plain.href = '/contact'
      plain.textContent = 'Contact'
      // Over everything, so no sticky bar can sit on the link the test presses.
      plain.style.cssText =
        'position: fixed; top: 50%; left: 50%; z-index: 2147483647; padding: 12px'
      document.body.append(plain)
    })
    await release(page)
    await page.locator('#mo3-plain').click()
    await page.waitForURL('**/contact')
    expect(await decision(page)).toEqual({ offered: 'yes', cancelled: true })
  })

  test('under reduced motion even a card tap simply loads', async ({ page }) => {
    const slide = await ready(page, 'reduce')
    await release(page)
    await slide.click()
    await page.waitForURL('**/contact')
    // No opt-in under reduced motion, so the browser offers nothing to cancel.
    expect(await decision(page)).toEqual({ offered: 'no', cancelled: false })
  })
})

/**
 * MO1 (owner, 3 Oct: "each card type its own hover"): a guide card no longer lifts 4px like every
 * card did; it slides its arrow 4px, as the family cards' "View the range" does, and takes the
 * accent edge. Read off the real hover: the card stays where it is, the arrow moves.
 */
test('MO1 — a guide card slides its arrow on hover and does not lift', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/guides')
  const card = page.locator('.guide-card').first()
  const arrow = card.locator('.guide-card__cue b')
  await expect(arrow).toHaveText('→')
  const read = () =>
    card.evaluate((element) => ({
      card: getComputedStyle(element).translate,
      arrow: getComputedStyle(element.querySelector('.guide-card__cue b') as Element).translate,
    }))
  expect((await read()).arrow, 'the arrow is already moved at rest').toBe('none')
  await card.hover()
  await expect.poll(async () => (await read()).arrow).toBe('4px')
  expect((await read()).card, 'the card lifted').toBe('none')
})
