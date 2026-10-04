import AxeBuilder from '@axe-core/playwright'
import { FAMILY_PAGES } from '../src/lib/familyPages'
import { expect, type Page, test } from './offlineMedia'

/**
 * VA-48 (visual audit, owner's choice 2026-10-02): home and contact open on a factory photo and the
 * four buyer pages opened on plain paper with text only, so they read as less finished than the
 * pages that link to them. Each now opens on its family's picture (the one its home-page card
 * shows), as the page's largest paint: loaded first, sized before it arrives, with its own alt
 * text, and with the headline still the first heading and still on paper in both themes.
 * `src/familyHeroPicture.test.ts` holds the choice of picture and the markup; this loads the pages.
 *
 * ⚠️ WHICH PAGES HAVE A PICTURE DEPENDS ON THE DATABASE. A family gets one only from its own
 * garments (a render, else a poster) and CI's seed holds a single Sportswear garment, so there only
 * the activewear page has one; a family with none keeps its hero exactly as it was, and that is
 * checked too. At least one page must have a picture, or every check on one would pass on nothing:
 * CI seeds one, so there a missing picture is the regression; a local database with no garment may
 * skip.
 *
 * What would have to break for these to fail: a picture that never loads or has no alt text, a hero
 * that jumps when it arrives (the reason the frame has a ratio), a heading placed ahead of the h1,
 * words that lose contrast, a preload link for the picture, or a family with no picture getting an
 * empty frame.
 */

const PATHS = FAMILY_PAGES.map((page) => page.path)

/** Which of the four pages show a picture in this database. */
async function withPicture(page: Page): Promise<string[]> {
  const found: string[] = []
  for (const path of PATHS) {
    await page.goto(path)
    if ((await page.locator('.family-hero__frame').count()) > 0) found.push(path)
  }
  return found
}

test('at least one buyer page opens on a picture here', async ({ page }) => {
  const found = await withPicture(page)
  if (found.length === 0) {
    if (process.env.CI) {
      throw new Error(
        'no buyer page shows a hero picture, and CI seeds a Sportswear garment with a poster: ' +
          'this is the regression, not an empty catalogue',
      )
    }
    test.skip(true, 'no garment with a picture in this local database')
  }
  expect(found.length).toBeGreaterThan(0)
})

for (const path of PATHS) {
  test.describe(path, () => {
    test('the hero shows a loaded picture with alt text, or is the plain hero it was', async ({
      page,
    }) => {
      await page.goto(path)
      const frame = page.locator('.family-hero__frame')
      const headings = await page.evaluate(() =>
        [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => heading.tagName),
      )
      // The h1 is the first heading either way, and there is one.
      expect(headings[0], 'the first heading is not the h1').toBe('H1')
      expect(headings.filter((tag) => tag === 'H1')).toHaveLength(1)

      if ((await frame.count()) === 0) {
        // No picture for this family here: today's hero — words only, nothing drawn.
        await expect(page.locator('.site-hero img')).toHaveCount(0)
        await expect(page.locator('.family-hero__body')).toHaveCount(0)
        await expect(page.locator('.site-hero .site-lede')).toBeVisible()
        return
      }

      const img = frame.locator('img')
      await expect(img).toHaveCount(1)
      await expect(img).toHaveAttribute('loading', 'eager')
      await expect(img).toHaveAttribute('fetchpriority', 'high')
      const alt = (await img.getAttribute('alt')) ?? ''
      expect(alt.length, 'the hero picture has no alt text').toBeGreaterThan(3)
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), {
          message: 'the hero picture never loaded',
        })
        .toBe(true)

      // The frame reserves the 4:5 box the picture lands in.
      const box = await frame.boundingBox()
      if (!box) throw new Error('the hero frame has no box')
      expect(
        Math.abs(box.width / box.height - 0.8),
        `frame ${box.width} x ${box.height}`,
      ).toBeLessThan(0.02)
      await expect(img).toHaveAttribute('width', '1200')
      await expect(img).toHaveAttribute('height', '1500')
    })

    test('no <link rel=preload> is added for the picture', async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(0)
    })

    test('the hero picture causes no layout shift (Chromium)', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'only Chromium reports layout-shift entries')
      await page.addInitScript(() => {
        const w = window as unknown as { __heroShift: number }
        w.__heroShift = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number
              hadRecentInput: boolean
              sources?: Array<{ node: Node | null }>
            }
            const inHero = (shift.sources ?? []).some((source) => {
              const element =
                source.node instanceof Element ? source.node : source.node?.parentElement
              return Boolean(element?.closest('.site-hero'))
            })
            if (inHero && !shift.hadRecentInput) w.__heroShift += shift.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(path)
      if ((await page.locator('.family-hero__frame').count()) === 0)
        test.skip(true, 'no hero picture here')
      await page.waitForLoadState('load')
      await page.waitForTimeout(800)
      const shift = await page.evaluate(
        () => (window as unknown as { __heroShift: number }).__heroShift,
      )
      expect(shift, `the hero moved by ${shift}`).toBeLessThanOrEqual(0.01)
    })

    for (const scheme of ['light', 'dark'] as const) {
      test(`${scheme}: the headline and lede keep their contrast`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(path)
        const results = await new AxeBuilder({ page })
          .include('.site-hero')
          .withRules(['color-contrast'])
          .analyze()
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
          `${scheme}: text in the hero fails contrast`,
        ).toEqual([])
      })
    }
  })
}

test.describe('where the picture sits', () => {
  test('1440px: beside the lede and the buttons, below the full-width headline', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const found = await withPicture(page)
    if (found.length === 0) test.skip(true, 'no hero picture in this database')
    await page.goto(found[0] as string)
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`no ${selector}`)
        const { left, top, right, bottom, width } = element.getBoundingClientRect()
        return { left, top, right, bottom, width }
      }
      return {
        h1: box('.site-hero h1'),
        lede: box('.site-hero .site-lede'),
        actions: box('.site-hero .site-actions'),
        frame: box('.family-hero__frame'),
      }
    })
    expect(boxes.frame.left, 'the picture is not to the right of the lede').toBeGreaterThanOrEqual(
      boxes.lede.right,
    )
    expect(
      boxes.frame.left,
      'the picture is not to the right of the buttons',
    ).toBeGreaterThanOrEqual(boxes.actions.right)
    expect(boxes.frame.top, 'the picture starts above the headline ends').toBeGreaterThanOrEqual(
      boxes.h1.bottom,
    )
    expect(
      Math.abs(boxes.frame.top - boxes.lede.top),
      'the picture and the lede start at different heights',
    ).toBeLessThanOrEqual(24)
    expect(boxes.frame.width, 'the picture is not the 420px column').toBeLessThanOrEqual(420.5)
    // The headline keeps the whole column (1312px at 1440 since polish D1): it is not squeezed in
    // beside the picture.
    expect(boxes.h1.width, 'the headline was squeezed into half a column').toBeGreaterThan(900)
  })

  test('390px: the picture comes after the buttons, as wide as the column', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const found = await withPicture(page)
    if (found.length === 0) test.skip(true, 'no hero picture in this database')
    await page.goto(found[0] as string)
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`no ${selector}`)
        const { left, top, right, bottom, width } = element.getBoundingClientRect()
        return { left, top, right, bottom, width }
      }
      return {
        actions: box('.site-hero .site-actions'),
        frame: box('.family-hero__frame'),
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(boxes.frame.top, 'the picture is not under the buttons').toBeGreaterThanOrEqual(
      boxes.actions.bottom,
    )
    expect(boxes.frame.width, 'the picture is narrower than the column').toBeGreaterThan(300)
    expect(boxes.sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
  })
})
