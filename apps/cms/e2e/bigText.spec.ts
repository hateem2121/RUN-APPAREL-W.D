import { expect, test } from './offlineMedia'

/**
 * Text at twice the size on the narrowest phone (site check-up, 2026-10-22): with the root font at
 * 200% on a 320px screen, the footer's tab, the home page's specs, the careers path and the about
 * page's people cards ran off the side, 22 to 143px of sideways scroll, in WebKit, Firefox and
 * Chromium. A reader who sets large text is reading at that size on every page, so every page that
 * carries one of those parts is held here. Text set through the root, as a browser's minimum or
 * default font size does; a page zoom changes the viewport instead.
 */
const PAGES = ['/', '/contact', '/products', '/about', '/faq', '/guides', '/careers']

async function sidewaysAtDoubleText(
  page: import('@playwright/test').Page,
  path: string,
  plant?: string,
) {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(path)
  await page.addStyleTag({ content: `html { font-size: 200% !important } ${plant ?? ''}` })
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('twice-size text on a 320px phone', () => {
  for (const path of PAGES) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      expect(await sidewaysAtDoubleText(page, path), 'px of sideways scroll').toBeLessThanOrEqual(1)
    })
  }

  test('NEGATIVE CONTROL: the footer tab set back to one line scrolls the page sideways', async ({
    page,
  }) => {
    const spill = await sidewaysAtDoubleText(
      page,
      '/contact',
      // On the label: its own `text-wrap: balance` turns wrapping back on under a tab set to nowrap.
      '.site-footer__tab-label { white-space: nowrap !important }',
    )
    expect(spill, 'the check cannot see a label running off the screen').toBeGreaterThan(1)
  })
})
