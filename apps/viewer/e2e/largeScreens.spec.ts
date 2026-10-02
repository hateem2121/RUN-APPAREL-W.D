import { expect, type Page, test } from '@playwright/test'

/**
 * VA-12 (visual audit, 2026-10-02): on a 27-inch screen the garment filled a fifth of it. From 1920px
 * the stage and the display headlines keep growing (to their 3840px sizes); below 1920px nothing moves.
 * `src/styles/largeScreens.test.ts` computes the rules; this asks a browser, at the three sizes the
 * audit named and at the two windows below the seam that are pinned.
 *
 * What would have to break for these to fail: a size that moves at 1440 or 1919, a step at 1920, a
 * stage that does not grow at 2560x1440 and 3840x2160, a page that scrolls sideways, or the product's
 * Email and WhatsApp pushed below the screen by the larger stage (VA-60's rule, at the longest
 * description any garment has).
 *
 * ⚠️ AT 1920x1080 THE STAGE IS NOT LARGER THAN 800x980, AND THAT IS CORRECT. A 1080px-tall window leaves
 * the canvas under the 980px cap (the band is one screen less the bar and label row, and the plinth and
 * colour rail come out of that), so what can grow there is only its width, and the garment is limited by
 * height. This file asks of 1920x1080 that it is exactly what 1919px is. "Larger than the cap" is asked
 * of 2560x1440 and 3840x2160, where the window has the room.
 *
 * ⚠️ NOT RUN BY ITS AUTHOR (no browser was started): the canvas WIDTHS are CSS arithmetic and are
 * asserted tightly; the HEIGHTS depend on the page's own chrome and are asserted only against the old
 * 980px cap and against each other.
 */

test.use({ hasTouch: false, isMobile: false })
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

/** Longer than any live garment's description (454 characters at most, measured 2026-10-02). */
const LONG_DESCRIPTION =
  'A heavyweight training shell cut for cold early starts and long blocks of work. Every seam is ' +
  'taped, the collar sits high without rubbing, and a brushed inner face keeps its warmth when the ' +
  'wind picks up. Reflective trims run across the shoulders, cuffs and hem for low light, the chest ' +
  'pocket takes a phone without bouncing, and a longer back keeps the cold off while the wearer leans ' +
  'forward for hours, in rain, in grit and in the dark.'

async function serveLongestDescription(page: Page) {
  await page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { product: Record<string, unknown> }
    Object.assign(body.product, {
      productName: 'THE VELOCITY MATRIX JACKET',
      shortDescription: LONG_DESCRIPTION,
    })
    await route.fulfill({ response, json: body })
  })
}

async function openGarment(page: Page, width: number, height: number) {
  // One navigation per size: a resize leaves viewport units stale (apps/viewer/CLAUDE.md).
  await page.setViewportSize({ width, height })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.preloader')).toHaveCount(0)
}

/** The stage canvas's box and its CSS cap, and the section headlines' sizes. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.stage__canvas') as HTMLElement
    const box = canvas.getBoundingClientRect()
    const size = (selector: string) =>
      Number.parseFloat(getComputedStyle(document.querySelector(selector) as Element).fontSize)
    return {
      width: box.width,
      height: box.height,
      // A number: the minifier rounds `51.0417vw`, so the cap at 1920px reads 980.001px, not 980px.
      cap: Number.parseFloat(getComputedStyle(canvas).maxHeight),
      customisation: size('.customise .display--section'),
      contact: size('.contact .display--section'),
    }
  })
}

/** Whether an email AND a WhatsApp control are wholly on screen, unscrolled (LA-11's own measure). */
function contactOnScreen() {
  const inView = (element: Element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight
  }
  const links = [
    ...document.querySelectorAll('.contact-rail a, .action-bar a, .stage__contact a'),
  ].filter(inView)
  return {
    email: links.some((link) => link.getAttribute('href')?.startsWith('mailto:')),
    whatsapp: links.some((link) => link.getAttribute('href')?.includes('wa.me')),
  }
}

test.describe('nothing below 1920px changes (VA-12)', () => {
  for (const [width, height] of [
    [1440, 900],
    [1919, 1080],
  ] as const) {
    test(`${width}x${height}: an 800px canvas under a 980px cap, section headlines at 46px`, async ({
      page,
    }) => {
      await openGarment(page, width, height)
      const stage = await measure(page)
      expect(stage.width, 'the canvas is not 800px wide').toBeCloseTo(800, 0)
      expect(stage.cap).toBeCloseTo(980, 0)
      expect(stage.customisation).toBeCloseTo(46, 2)
      expect(stage.contact).toBeCloseTo(46, 2)
    })
  }
})

test.describe('from 1920px the stage and the headlines keep growing (VA-12)', () => {
  test('1920x1080 is exactly what 1919x1080 was: no step at the seam', async ({ page }) => {
    await openGarment(page, 1920, 1080)
    const stage = await measure(page)
    expect(stage.width).toBeCloseTo(800, 0)
    expect(stage.cap).toBeCloseTo(980, 0)
    expect(stage.customisation).toBeCloseTo(46, 2)
  })

  test('2560x1440: larger than 800x980, with the canvas 1160px wide and the headlines grown', async ({
    page,
  }) => {
    await openGarment(page, 2560, 1440)
    const stage = await measure(page)
    expect(stage.width, 'the canvas did not grow to the measure 1600px leaves it').toBeCloseTo(
      1160,
      0,
    )
    expect(stage.width).toBeGreaterThan(800)
    expect(stage.height, 'the canvas is no taller than today’s 980px cap').toBeGreaterThan(980)
    expect(stage.cap).toBeGreaterThan(980)
    expect(stage.customisation).toBeCloseTo(61.33, 1)
    expect(stage.contact).toBeCloseTo(61.33, 1)
  })

  test('3840x2160: larger again, at the 4K ceiling', async ({ page }) => {
    await openGarment(page, 3840, 2160)
    const stage = await measure(page)
    expect(stage.width, 'the canvas did not reach the 4K measure').toBeCloseTo(1960, 0)
    expect(stage.height).toBeGreaterThan(980)
    expect(stage.cap).toBeCloseTo(1960, 0)
    expect(stage.customisation).toBeCloseTo(92, 1)
  })

  test('grows with the window: 1920 < 2560 < 3840 in width and in height', async ({ page }) => {
    const seen: { width: number; height: number }[] = []
    for (const [width, height] of [
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ] as const) {
      await openGarment(page, width, height)
      const stage = await measure(page)
      seen.push({ width: stage.width, height: stage.height })
    }
    const [a, b, c] = seen as [(typeof seen)[0], (typeof seen)[0], (typeof seen)[0]]
    expect(b.width).toBeGreaterThan(a.width)
    expect(c.width).toBeGreaterThan(b.width)
    expect(b.height).toBeGreaterThan(a.height)
    expect(c.height).toBeGreaterThan(b.height)
  })
})

test.describe('the larger stage keeps the page whole (VA-12)', () => {
  for (const [width, height] of [
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ] as const) {
    test(`${width}x${height}: no sideways scroll, and Email and WhatsApp stay on screen with the longest description`, async ({
      page,
    }) => {
      await serveLongestDescription(page)
      await openGarment(page, width, height)
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(overflow.scroll, 'the page scrolls sideways').toBeLessThanOrEqual(overflow.client)
      const seen = await page.evaluate(contactOnScreen)
      expect(seen.email, 'Email is off the screen').toBe(true)
      expect(seen.whatsapp, 'WhatsApp is off the screen').toBe(true)
    })
  }

  test('the content column below the stage keeps its 1200px', async ({ page }) => {
    await openGarment(page, 3840, 2160)
    const content = await page.evaluate(
      () => document.querySelector('.content')?.getBoundingClientRect().width ?? 0,
    )
    expect(content).toBeLessThanOrEqual(1200)
  })
})
