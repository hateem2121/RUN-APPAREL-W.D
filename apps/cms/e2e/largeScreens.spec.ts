import { expect, type Page, test } from './offlineMedia'

/**
 * VA-12 (visual audit, 2026-10-02), the website's half: the display headlines keep growing from
 * 1920px, to 144px (hero) and 92px (section) at 3840px, and nothing below 1920px moves. The garment
 * pages' stage is asked in apps/viewer/e2e/largeScreens.spec.ts; the rules are computed in
 * apps/viewer/src/styles/largeScreens.test.ts.
 *
 * What would have to break for these to fail: a headline that does not grow, or moves at 1440 or
 * 1919, or steps at 1920; the tracking staying in px so the type loosens as it grows; a word split by
 * the larger type (the owner's 2026-09-11 rule: "PRODUCTION." is 8.9em, and the page's column is
 * 1312px); a sideways scroll; or the page column widening with the type (the owner's widths stay).
 *
 * ⚠️ NOT RUN BY ITS AUTHOR (no browser was started). Every number here is CSS arithmetic on a
 * `max()`/`min()`/`vw` expression, so the sizes are asked exactly; the hero's and the footer's heights
 * are not asked at all.
 */

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1919, height: 1080 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
] as const

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.locator('.site-hero h1.display--hero')).toBeVisible()
}

/** The home hero's size and tracking, and the first section headline's size. */
function headlines() {
  const hero = document.querySelector('.site-hero h1.display--hero') as HTMLElement
  const section = document.querySelector('.site-section .display--section') as HTMLElement
  const heroStyle = getComputedStyle(hero)
  return {
    hero: Number.parseFloat(heroStyle.fontSize),
    tracking: Number.parseFloat(heroStyle.letterSpacing),
    section: Number.parseFloat(getComputedStyle(section).fontSize),
  }
}

test.describe('the display headlines keep growing from 1920px (VA-12)', () => {
  const EXPECTED: Record<number, { hero: number; section: number; tracking: number }> = {
    // below 1920px: today's sizes, and the px tracking both tokens bottom out at (-0.03em on each)
    1440: { hero: 72, section: 46, tracking: -2.16 },
    1919: { hero: 72, section: 46, tracking: -2.16 },
    // 1920px: exactly what 1919px has, in em now (-0.03 x 72)
    1920: { hero: 72, section: 46, tracking: -2.16 },
    2560: { hero: 96, section: 61.33, tracking: -2.88 },
    3840: { hero: 144, section: 92, tracking: -4.32 },
  }

  for (const { width, height } of SIZES) {
    test(`${width}x${height}: hero ${EXPECTED[width]?.hero}px, section ${EXPECTED[width]?.section}px`, async ({
      page,
    }) => {
      await openHome(page, width, height)
      const seen = await page.evaluate(headlines)
      const want = EXPECTED[width] as { hero: number; section: number; tracking: number }
      expect(seen.hero, 'the home hero headline').toBeCloseTo(want.hero, 1)
      expect(seen.section, 'the first section headline').toBeCloseTo(want.section, 1)
      expect(seen.tracking, 'the hero tracking: -0.03em of its size').toBeCloseTo(want.tracking, 1)
    })
  }

  test('never smaller than before as the window widens: 1920 <= 2560 <= 3840', async ({ page }) => {
    const heroes: number[] = []
    for (const width of [1920, 2560, 3840]) {
      await openHome(page, width, Math.round((width * 9) / 16))
      heroes.push((await page.evaluate(headlines)).hero)
    }
    expect(heroes[0]).toBeGreaterThanOrEqual(72)
    expect(heroes[1]).toBeGreaterThan(heroes[0] as number)
    expect(heroes[2]).toBeGreaterThan(heroes[1] as number)
  })
})

test.describe('the larger type keeps the page whole (VA-12)', () => {
  /** Each hero headline word's client rects: one is a whole word, two or more is a split one. */
  function splitWords() {
    const split: string[] = []
    for (const heading of document.querySelectorAll('.site-hero h1')) {
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of (node.nodeValue ?? '').matchAll(/\S+/g)) {
          const range = document.createRange()
          range.setStart(node, match.index ?? 0)
          range.setEnd(node, (match.index ?? 0) + match[0].length)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.5)
          if (rects.length > 1) split.push(match[0])
        }
      }
    }
    return split
  }

  for (const path of ['/', '/contact', '/custom-teamwear-manufacturer', '/products']) {
    test(`${path} at 3840x2160: no sideways scroll, no word split, the column still capped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 3840, height: 2160 })
      await page.goto(path)
      await expect(page.locator('.site-hero h1.display--hero')).toBeVisible()
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const page_ = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        column: document.querySelector('.site-container')?.getBoundingClientRect().width ?? 0,
      }))
      expect(page_.scroll, 'the page scrolls sideways').toBeLessThanOrEqual(page_.client)
      expect(page_.column, 'the column widened with the type').toBeLessThanOrEqual(1440)
      expect(await page.evaluate(splitWords), 'a headline word was split').toEqual([])
    })
  }
})
