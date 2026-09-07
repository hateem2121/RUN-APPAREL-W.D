import { expect, test } from '@playwright/test'

/**
 * Motion and preference guards for `docs/AUDIT-BETA-WEBSITE-2026-09-06.md`.
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
})

test.describe('FA-F-05 — the page comes back where it was left', () => {
  /**
   * MEASURED 2026-09-06: `/products` at scrollY 1200 → client navigation to `/contact`
   * (top) → back → **1199**. `history.scrollRestoration` is `auto`.
   *
   * ⚠️ THIS IS THE ONE THAT BREAKS BY ACCIDENT. It is not implemented by anything here —
   * it is the browser's default, kept by NOT reaching for a scroll library and NOT
   * setting `scrollRestoration = 'manual'`, which is exactly what a smooth-scroll
   * integration or a scroll-progress effect asks you to do first. FA-F-06's source gate
   * covers the library; this covers the behaviour a reader notices, which is losing
   * their place in a 3,900px gallery.
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
  test('it is off-screen at rest, on-screen when focused, on the --instant duration', async ({
    page,
  }) => {
    await page.goto('/')
    const measured = await page.evaluate(() => {
      const link = document.querySelector('.skip-link') as HTMLElement
      return {
        restTop: Math.round(link.getBoundingClientRect().top),
        duration: getComputedStyle(link).transitionDuration,
        instant: getComputedStyle(document.documentElement).getPropertyValue('--instant').trim(),
      }
    })
    expect(measured.restTop, 'the skip link is visible before it is focused').toBeLessThan(-10)
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
