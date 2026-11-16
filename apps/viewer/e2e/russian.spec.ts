import { expect, test } from '@playwright/test'

/**
 * THE RUSSIAN GARMENT PAGE (owner, 2026-11-16): `/ru/products/<product>/<colour>` is the same
 * garment with the page's own words in Russian; the garment's CMS text stays as the team types it.
 * Each check here fails on the English page, which is the negative control at the bottom.
 */

const RU = '/ru/products/n001/wine'
const CYRILLIC = /[Ѐ-ӿ]/

test('the Russian page speaks Russian around an untranslated garment', async ({ page }) => {
  await page.goto(RU)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru')

  // The page's own words.
  await expect(page.locator('#contact-heading')).toHaveText('Разработаем это вместе.')
  await expect(page.locator('.contact__buttons')).toContainText('Написать на почту')
  await expect(page.getByRole('navigation', { name: 'Навигационная цепочка' })).toBeAttached()
  await expect(page.locator('.product-info__colour-note').first()).toHaveText(
    'Эти расцветки — примеры. Мы подберём цвета под ваши требования.',
  )

  // The site's links lead to the Russian site; the bar's links too.
  const hrefs = await page
    .locator('header a[href^="https://wear-run.com/"], footer a[href^="https://wear-run.com/"]')
    .evaluateAll((all) => all.map((a) => new URL(a.getAttribute('href') ?? '').pathname))
  expect(hrefs.length).toBeGreaterThan(5)
  for (const path of hrefs) expect(path, path).toMatch(/^\/ru(\/|$)/)
})

test('a colour change keeps the visitor on the Russian page', async ({ page }) => {
  await page.goto(RU)
  const tabs = page.getByRole('tab')
  await expect(tabs.first()).toBeVisible()
  await tabs.nth(1).click()
  await expect(page).toHaveURL(/\/ru\/products\/n001\/[a-z0-9-]+$/)
  expect(new URL(page.url()).pathname).not.toBe(RU)
})

for (const width of [320, 375, 768, 1280]) {
  test(`at ${width}px the longer Russian words fit: no sideways scroll, bar one row`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/products/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const englishBar = await page
      .locator('header')
      .evaluate((el) => el.getBoundingClientRect().height)

    await page.goto(RU)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
    const russianBar = await page
      .locator('header')
      .evaluate((el) => el.getBoundingClientRect().height)
    expect(russianBar, 'the Russian bar wrapped to a second row').toBeLessThanOrEqual(
      englishBar + 1,
    )

    // Every button's words stay inside it.
    const spilled = await page
      .locator('main button:visible, main a.btn:visible')
      .evaluateAll((all) =>
        all
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el.textContent ?? '').trim()),
      )
    expect(spilled, 'a button cuts its Russian words').toEqual([])
  })
}

test('the English page is untouched: no Russian word, lang="en"', async ({ page }) => {
  await page.goto('/products/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(CYRILLIC)
})
