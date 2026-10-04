import { expect, type Page, test } from '@playwright/test'

/**
 * VA-18, the garment-description half (visual audit, 2026-10-02): on a phone held sideways the
 * description ran 76–83 characters a line, where 45–75 is comfortable. A cap was already in the
 * stylesheet — `max-width: 60ch` — but `ch` is the width of the digit "0", and ordinary words
 * average narrower than that, so 60ch held more than 60 characters. It is now
 * `max-inline-size: 50ch`.
 *
 * The visitor's measure is characters per LINE, so that is what is counted: a Range laid over every
 * word of the real paragraph, the words grouped by the line they landed on, and each line's length
 * taken from its first word's start to its last word's end. Not a width, and not a computed `ch`.
 *
 * ⚠️ THE COPY IS LONG ON PURPOSE. The fixture's own description is 145 characters — two lines at
 * most widths — and a layout that holds for short words is the defect this repo keeps shipping
 * (tests-and-fixtures.md). These 340 characters give five or six lines, so there are several FULL
 * lines to measure and one short last line to leave out. Invented, so a test does not carry a
 * product's words.
 *
 * ⚠️ WHERE IT RUNS LONG. In the side column (the identity beside the garment, from 1024px wide and
 * 620px tall, sideways: polish D8) the column is at most 400px, narrower than the cap, so the cap
 * is not what limits it there and must not start to: the last test asserts the paragraph is still
 * as wide as that column, because a cap that narrowed it would make its three lines hold less and
 * the column taller (the floors are in `useIdentityInAside.ts`). Since D8 the laptop windows this
 * file once walked (1024x768, 1100x720) have the description beside the garment, so the cases
 * below are the windows where it is still under it: 900-1023px wide, and under the 620px floor.
 */

const DESCRIPTION =
  'A four-way stretch shell cut for cold early starts and long training blocks. Bonded seams ' +
  'keep the weight down, laser-cut vents open under the arms and across the back, and a brushed ' +
  'inner face holds warmth without trapping heat. Reflective trims sit on the cuffs, hem and ' +
  'shoulders for low light, and the zipped chest pocket takes a phone.'

/** Serve the fixture garment with another description (the same route trick as the layout spec). */
function serveDescription(page: Page, shortDescription: string) {
  return page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { product: Record<string, unknown> }
    body.product.shortDescription = shortDescription
    await route.fulfill({ response, json: body })
  })
}

/** RUNS IN THE PAGE. The characters on each line of the description, top to bottom. */
function measureLines() {
  const paragraph = document.querySelector('.product-info__statement')
  const text = paragraph?.firstChild
  if (!paragraph || !(text instanceof Text)) return null
  const range = document.createRange()
  const lines = new Map<number, { start: number; end: number }>()
  for (const word of text.data.matchAll(/\S+/g)) {
    const start = word.index ?? 0
    range.setStart(text, start)
    range.setEnd(text, start + word[0].length)
    const top = Math.round(range.getClientRects()[0]?.top ?? Number.NaN)
    const line = lines.get(top)
    lines.set(top, { start: line?.start ?? start, end: start + word[0].length })
  }
  return {
    lengths: [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, line]) => line.end - line.start),
    shown: getComputedStyle(paragraph).display !== 'none',
  }
}

const WHERE_IT_RUNS_LONG = [
  { name: 'a phone held sideways (iPhone SE)', width: 667, height: 375 },
  { name: 'a phone held sideways (iPhone 14 Pro Max)', width: 844, height: 390 },
  { name: 'a phone held sideways (iPhone 16 Pro Max)', width: 932, height: 430 },
  { name: 'a tablet held upright', width: 768, height: 1024 },
  { name: 'a large tablet held upright, one column since F11', width: 1024, height: 1366 },
  { name: 'a window 900-1023px wide, identity still under the garment', width: 960, height: 700 },
  {
    name: 'a laptop window under the 620px floor, identity under the garment',
    width: 1280,
    height: 600,
  },
] as const

test.describe('the garment description keeps a comfortable line length (VA-18)', () => {
  for (const viewport of WHERE_IT_RUNS_LONG) {
    test(`no line is longer than 75 characters on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await serveDescription(page, DESCRIPTION)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measured = await page.evaluate(measureLines)
      expect(measured, 'no description paragraph to measure').not.toBeNull()
      if (!measured) return
      expect(measured.shown, 'the description is not on screen').toBe(true)
      // The instrument's own check: a paragraph this long must wrap, or it measured nothing.
      expect(
        measured.lengths.length,
        `only ${measured.lengths.length} line(s): the copy did not wrap`,
      ).toBeGreaterThan(2)
      const full = measured.lengths.slice(0, -1)
      expect(
        Math.max(...full),
        `a line runs ${Math.max(...full)} characters (lines: ${measured.lengths.join(', ')})`,
      ).toBeLessThanOrEqual(75)
      expect(
        Math.min(...full),
        `a full line is only ${Math.min(...full)} characters (lines: ${measured.lengths.join(', ')})`,
      ).toBeGreaterThanOrEqual(45)
    })
  }

  test('the cap leaves the side column alone, so the buttons stay on screen (VA-60, D8)', async ({
    page,
  }) => {
    await serveDescription(page, DESCRIPTION)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const widths = await page.evaluate(() => {
      const paragraph = document.querySelector('.stage__aside .product-info__statement')
      const section = paragraph?.closest('.product-info')
      return paragraph && section
        ? {
            paragraph: paragraph.getBoundingClientRect().width,
            section: section.getBoundingClientRect().width,
          }
        : null
    })
    expect(widths, 'the identity is not in the side column at 1280x800').not.toBeNull()
    expect(
      widths?.paragraph,
      'the description is narrower than the side column: the cap now binds there',
    ).toBeGreaterThanOrEqual((widths?.section ?? 0) - 1)
  })
})
