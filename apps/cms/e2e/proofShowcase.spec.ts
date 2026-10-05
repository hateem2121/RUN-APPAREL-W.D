import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from './offlineMedia'

/**
 * Polish D2: the home page's №03 becomes a showcase (the report's recommendation, built without a
 * design stop by the owner's answer Q32). The garment is large; beside it, three short points on what
 * a visitor can do with a 3D reference, and colour dots that change the garment. Until 2026-10-05
 * the garment's column was 22rem (352px) beside about 900px of two lines and a button: "short words,
 * tall picture. Big empty corner under the button" (the report, D2).
 *
 * The live model itself is held by `e2e/liveGarment.spec.ts` (a dot switches its variant); here the
 * garment is the still picture, as a visitor without WebGL, or the automation, sees it.
 *
 * What would have to break for these to fail: the garment small again, or taller than a laptop's
 * screen; the words' half thin beside it; a point missing its icon or its words; a dot that changes
 * nothing, or changes the picture but leaves the link on another colour; a contrast or naming fault.
 */

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  if ((await page.locator('.proof__figure').count()) === 0) {
    if (process.env.CI) throw new Error('no garment in №03, and CI seeds one')
    test.skip(true, 'no published garment with a poster in this local database')
  }
  await page.locator('.proof').scrollIntoViewIfNeeded()
}

const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect()
      return { left, top, width, height }
    })

test.describe('№03 — a large garment, and words that weigh the same (D2)', () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 760],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width}x${height} the garment takes half the row, as much as the screen's height allows`, async ({
      page,
    }) => {
      await openHome(page, width, height)
      const container = await page
        .locator('.proof')
        .evaluate((element) => element.getBoundingClientRect().width)
      const figure = await box(page, '.proof__figure')
      const frame = await box(page, '.proof__frame')
      const copy = await box(page, '.proof__copy')
      // Half the row less the gap, or 64% of the screen's height, whichever is less.
      const expected = Math.min((container - 64) / 2, 0.64 * height)
      expect(
        Math.abs(figure.width - expected),
        `figure ${figure.width}, expected ${expected}`,
      ).toBeLessThanOrEqual(1)
      // The whole garment fits on a screen, under the bar.
      expect(frame.height, 'the garment is taller than the screen').toBeLessThanOrEqual(height - 64)
      // The words sit level with it: no empty corner under them (the report's D2), and they hold the
      // points and the dots (the next tests). A ratio of heights is not asked for: a large garment
      // beside a compact block of words is the showcase; at 1920x1080 they are 418 to 864px.
      const middle = (b: { top: number; height: number }) => b.top + b.height / 2
      expect(
        Math.abs(middle(copy) - middle(figure)),
        'the two halves are not level',
      ).toBeLessThanOrEqual(32)
    })
  }

  test('three points, each with its icon and its words', async ({ page }) => {
    await openHome(page, 1440, 900)
    const points = page.locator('.proof__copy .proof__point')
    await expect(points).toHaveCount(3)
    for (const point of await points.all()) {
      await expect(point.locator('svg')).toHaveCount(1)
      await expect(point).toHaveText(/\w{3,}.*\w{3,}/)
    }
  })

  test('on a phone the points and the dots come before the garment, with no sideways scroll', async ({
    page,
  }) => {
    await openHome(page, 390, 844)
    const points = await box(page, '.proof__points')
    const dots = await box(page, '.proof__colours')
    const frame = await box(page, '.proof__frame')
    expect(points.top + points.height).toBeLessThanOrEqual(frame.top)
    expect(dots.top + dots.height).toBeLessThanOrEqual(frame.top)
    for (const dot of await page.locator('.proof__colours .card-gallery__dot').all()) {
      const size = await dot.boundingBox()
      expect(size?.height ?? 0, 'a dot is under 44px tall').toBeGreaterThanOrEqual(43.95)
      expect(size?.width ?? 0, 'a dot is under 24px wide').toBeGreaterThanOrEqual(23.95)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)
  })
})

test.describe('№03 — the colour dots (D2)', () => {
  test('a dot changes the garment’s picture, its name and its link, and is the one pressed', async ({
    page,
  }) => {
    await openHome(page, 1440, 900)
    const dots = page.locator('.proof__colours .card-gallery__dot')
    const count = await dots.count()
    if (count < 2) test.skip(true, 'the garment here has one colour')
    // Clicks need React: wait for it to own a dot.
    await page.waitForFunction(() => {
      const dot = document.querySelector('.proof__colours .card-gallery__dot')
      return !!dot && Object.keys(dot).some((key) => key.startsWith('__reactProps'))
    })
    await expect(dots.first()).toHaveAttribute('aria-pressed', 'true')
    const before = {
      href: await page.locator('.proof__link').getAttribute('href'),
      src: await page.locator('.proof__frame img').first().getAttribute('src'),
      name: await page.locator('.proof__colours-name').textContent(),
    }
    const target = dots.nth(count - 1)
    const label = (await target.getAttribute('aria-label')) ?? ''
    await target.click()
    await expect(target).toHaveAttribute('aria-pressed', 'true')
    await expect(dots.first()).toHaveAttribute('aria-pressed', 'false')
    // The name shown is the dot's colour ("Show Black" → "Black").
    await expect(page.locator('.proof__colours-name')).toHaveText(label.replace(/^Show /, ''))
    const href = await page.locator('.proof__link').getAttribute('href')
    expect(href, 'the link stayed on the first colour').not.toBe(before.href)
    expect(href).toMatch(/^https:\/\/[^/]+\/products\/[^/]+\/[^/]+$/)
    await expect
      .poll(() =>
        page
          .locator('.proof__frame img, .proof__frame .product-card__placeholder')
          .first()
          .evaluate((element) => element.getAttribute('src') ?? element.className),
      )
      .not.toBe(before.src)
    expect(before.name).not.toBe(label.replace(/^Show /, ''))
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe finds no contrast or naming fault in №03`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openHome(page, 1440, 900)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const results = await new AxeBuilder({ page })
        .include('.proof')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
})
