import { expect, type Page, test } from '@playwright/test'
import { SITE_MENU_ID, SITE_MENU_NAME } from '../../../packages/shared/src/siteBar'

/**
 * VA-40 (visual audit, 2026-10-02): on a phone the garment pages' bar LEAVES while the visitor
 * scrolls down and RETURNS as they scroll up; and every bar, here and on the website, has a
 * HAIRLINE. The bar and the label row under it took 92px of an 874px screen at all times.
 *
 * What would have to break for these to fail: the bar staying (or leaving only part way, or by
 * something other than a transform), staying away on a scroll up, leaving over its open menu or a
 * keyboard visitor, taking focus while away, leaving on a desktop, moving the status-area strip
 * (VA-50), shifting the page beneath it, or ignoring reduced motion. `src/lib/barAutoHide.test.ts`
 * and `src/styles/barEdge.test.ts` hold the logic and the stylesheet; this is a real browser.
 *
 * ⚠️ SCROLLED WITH `scrollTo`, NOT A TOUCH: a synthetic touch does not scroll (apps/viewer/CLAUDE.md),
 * and a wheel does not exist in mobile WebKit under Playwright. `scrollTo` fires the same `scroll`
 * event the script listens to, and Lenis is off under automation. Reduced motion is switched on
 * wherever a test reads where the bar ENDED: its slide is 220ms, and the end state is the question.
 */

const MENU = `#${SITE_MENU_ID}`
const OPEN = `${MENU}:popover-open`
const SHELL = 'header.notch-shell'
const BAR = `${SHELL} .notch`

/** Two frames: a scroll event and the style change it causes have both landed. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )

const scrollTo = (page: Page, y: number) => page.evaluate((to) => window.scrollTo(0, to), y)

/** Where the bar is, in the window: its top and bottom edges. */
const edges = (page: Page) =>
  page.locator(BAR).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom }
  })
const barBottom = async (page: Page) => (await edges(page)).bottom

async function openGarment(page: Page) {
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The loading screen covers the top edge until it has gone (WebKit, measured at 0ms).
  await expect(page.locator('.preloader')).toHaveCount(0)
}

const hasAttribute = (page: Page) =>
  page.locator(SHELL).evaluate((shell) => shell.hasAttribute('data-bar-hidden'))

/** Scroll far down and wait for the bar to be clear of the screen. */
async function sendBarAway(page: Page, y = 700) {
  await scrollTo(page, y)
  await expect
    .poll(() => barBottom(page), { message: 'the bar did not leave the screen' })
    .toBeLessThanOrEqual(0)
}

test.describe('on a touch phone, the bar leaves and returns (VA-40)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('scrolling down takes it fully off the screen by a transform; scrolling up brings it back; at the top it shows', async ({
    page,
  }) => {
    await openGarment(page)
    expect(
      await page.evaluate(() => matchMedia('(hover: none)').matches),
      'the emulated phone reports hover — this test measures nothing',
    ).toBe(true)
    expect((await edges(page)).bottom, 'at the top the bar is on screen').toBeGreaterThan(0)

    await sendBarAway(page, 700)
    expect(
      await page.locator(BAR).evaluate((bar) => getComputedStyle(bar).transform),
      'it left by something other than a transform',
    ).not.toBe('none')

    await scrollTo(page, 640) // 60px up
    await expect
      .poll(() => barBottom(page), { message: 'the bar did not return on a scroll up' })
      .toBeGreaterThan(0)

    await sendBarAway(page, 900)
    await scrollTo(page, 0)
    await expect
      .poll(async () => (await edges(page)).top, { message: 'the bar did not return at the top' })
      .toBeGreaterThanOrEqual(0)
    expect(await barBottom(page)).toBeGreaterThan(0)
  })

  test('the bar leaving shifts nothing: the page beneath keeps its place', async ({ page }) => {
    await openGarment(page)
    const placeOfStage = () =>
      page.locator('.stage-block').evaluate((stage) => stage.getBoundingClientRect().top + scrollY)
    const before = await placeOfStage()
    await sendBarAway(page, 700)
    expect(await placeOfStage(), 'the stage moved when the bar left').toBeCloseTo(before, 1)
  })

  test('while away it takes no focus; a Tab press brings it back', async ({ page }) => {
    await openGarment(page)
    await sendBarAway(page)
    const focused = await page.evaluate(() => {
      const link = document.querySelector('.notch__wordmark') as HTMLElement
      link.focus()
      return document.activeElement === link
    })
    expect(focused, 'a bar nobody can see took focus').toBe(false)
    await expect(page.locator('.notch__wordmark')).toBeHidden()
    await page.keyboard.press('Tab')
    await expect
      .poll(() => barBottom(page), { message: 'a Tab press did not bring the bar back' })
      .toBeGreaterThan(0)
    await expect(page.locator('.notch__wordmark')).toBeVisible()
  })

  test('it never leaves while its menu is open, and can once the menu is closed', async ({
    page,
  }) => {
    await openGarment(page)
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(OPEN)).toHaveCount(1)
    await scrollTo(page, 700)
    await frames(page)
    expect(await hasAttribute(page), 'the bar left over its own open menu').toBe(false)
    expect(await barBottom(page)).toBeGreaterThan(0)
    await expect(page.locator(OPEN)).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(page.locator(OPEN)).toHaveCount(0)
    await scrollTo(page, 800)
    await scrollTo(page, 1000)
    await expect
      .poll(() => barBottom(page), { message: 'the bar could not leave after the menu closed' })
      .toBeLessThanOrEqual(0)
  })

  test('it never leaves while keyboard focus is inside it', async ({ page }) => {
    await openGarment(page)
    // Focus the menu button by script, with no pointer touch before it: the browser then
    // calls it keyboard focus. If an engine does not, there is nothing to measure here.
    const keyboardFocus = await page.evaluate(() => {
      const button = document.querySelector('.notch__menu-btn') as HTMLElement
      button.focus()
      return button.matches(':focus-visible')
    })
    test.skip(!keyboardFocus, 'this engine does not call a script focus keyboard focus')
    await scrollTo(page, 700)
    await frames(page)
    expect(await hasAttribute(page), 'the bar left over a focused control').toBe(false)
    expect(await barBottom(page)).toBeGreaterThan(0)

    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
    await scrollTo(page, 800)
    await scrollTo(page, 1000)
    await expect
      .poll(() => barBottom(page), { message: 'the bar could not leave once focus had gone' })
      .toBeLessThanOrEqual(0)
  })

  test('the status-area strip stays where it is while the bar is away (VA-50)', async ({
    page,
  }) => {
    await openGarment(page)
    await sendBarAway(page)
    const strip = await page.evaluate(() => {
      const element = document.querySelector('.notch-strip') as HTMLElement
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        position: style.position,
        display: style.display,
        top: box.top,
        height: box.height,
        spare: box.width - innerWidth,
        hit: document.elementFromPoint(4, 2) === element,
      }
    })
    expect(
      strip,
      'Safari finds the strip by hit-testing at the top edge; the clock and battery lose the bar colour if it goes',
    ).toEqual({ position: 'fixed', display: 'block', top: 0, height: 6, spare: 0, hit: true })
  })

  test('the slide is --ui on a transform with motion, and instant with reduced motion', async ({
    page,
  }) => {
    const durations = () =>
      page.locator(BAR).evaluate((bar) => {
        const style = getComputedStyle(bar)
        const properties = style.transitionProperty.split(',').map((value) => value.trim())
        const times = style.transitionDuration.split(',').map((value) => value.trim())
        const at = (name: string) => Number.parseFloat(times[properties.indexOf(name)] ?? 'NaN')
        return { transform: at('transform'), visibility: at('visibility') }
      })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openGarment(page)
    expect(
      await page.evaluate(() => matchMedia('(prefers-reduced-motion: no-preference)').matches),
    ).toBe(true)
    expect(await durations(), 'the slide is not on --ui (220ms)').toEqual({
      transform: 0.22,
      visibility: 0.22,
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    )
    const reduced = await durations()
    expect(reduced.transform, 'the slide still takes time under reduced motion').toBeLessThan(0.001)
    expect(reduced.visibility).toBeLessThan(0.001)
    // And it is on screen, or off it, within two frames of the scroll — not part way.
    await scrollTo(page, 700)
    await frames(page)
    expect(
      await barBottom(page),
      'with reduced motion the bar was not gone in two frames',
    ).toBeLessThanOrEqual(0)
  })
})

test.describe('on a desktop, the bar never leaves (VA-40)', () => {
  // Their own contexts: the iPhone project would otherwise report touch at any width.
  test.use({ hasTouch: false, isMobile: false })
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  for (const [name, viewport] of [
    ['1280x800', { width: 1280, height: 800 }],
    ['a narrow window, 390x844, with a mouse', { width: 390, height: 844 }],
  ] as const) {
    test(`${name}: however far the page scrolls`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openGarment(page)
      expect(
        await page.evaluate(() => matchMedia('(hover: hover)').matches),
        'this context reports no hover — it is not a desktop',
      ).toBe(true)
      await scrollTo(page, 600)
      await scrollTo(page, 1200)
      await frames(page)
      expect(await hasAttribute(page), 'the desktop bar was told to leave').toBe(false)
      const bar = await edges(page)
      expect(bar.top).toBeGreaterThanOrEqual(0)
      expect(bar.bottom).toBeGreaterThan(0)
    })
  }
})

/**
 * The hairline is in the shared bar stylesheet, so it is the bar on both hosts
 * (apps/cms/e2e/barEdge.spec.ts asks the website). Asked in the page the way a browser reports it:
 * the first shadow is a ring of 1px with no blur and no offset, over the soft shadow.
 */
test.describe('the bar has a hairline (VA-40) — the garment pages', () => {
  const alphaOf = (colour: string) => {
    const slash = colour.match(/\/\s*([\d.]+)\s*\)/)
    if (slash?.[1]) return Number(slash[1])
    const numbers = colour.match(/[\d.]+/g) ?? []
    return numbers.length > 3 ? Number(numbers[3]) : 1
  }

  for (const [scheme, alpha] of [
    ['light', 0.22],
    ['dark', 0.12],
  ] as const) {
    test(`${scheme}: a 1px ring over the soft shadow, paper at ${alpha * 100}%`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openGarment(page)
      const shadow = await page.locator(BAR).evaluate((bar) => getComputedStyle(bar).boxShadow)
      const layers = shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim())
      expect(layers, `the bar's shadow is not two layers: ${shadow}`).toHaveLength(2)
      expect(layers[0], 'the first layer is not a 1px ring').toMatch(/0px 0px 0px 1px/)
      expect(layers[1], 'the soft shadow is gone').toMatch(/0px 8px 24px/)
      expect(alphaOf(layers[0] ?? '')).toBeCloseTo(alpha, 2)
    })
  }
})
