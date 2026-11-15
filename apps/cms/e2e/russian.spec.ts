import { RU_PAGE_SOURCES } from '../publicViewerHeaders.mjs'
import { expect, test } from './offlineMedia'

/**
 * THE RUSSIAN SECTION IN A REAL BROWSER (2026-11-15; design in
 * docs/superpowers/specs/2026-11-15-russian-section-design.md). The unit tests prove the words and
 * the wiring; this proves what a Russian visitor and Yandex receive.
 *
 * Each check can fail the way production would: a page drawn in English, a Russian heading drawn
 * in a system font (the brand fonts have no Cyrillic), a link that sends a Russian reader back to
 * English, an English page that starts downloading the Cyrillic fonts, an unknown /ru address that
 * renders blank without scripting.
 */

const GUIDE = '/guides/aql-inspection'
const RU_GUIDE = `/ru${GUIDE}`
const CYRILLIC = /[Ѐ-ӿ]/

test.describe('a Russian guide', () => {
  test('is Russian to the browser and to a search engine', async ({ page }) => {
    const response = await page.goto(RU_GUIDE)
    expect(response?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    await expect(page.locator('h1')).toHaveText(CYRILLIC)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/ru\/guides\/aql-inspection$/,
    )
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      'href',
      /\/guides\/aql-inspection$/,
    )
    await expect(page.locator('link[rel="alternate"][hreflang="ru"]')).toHaveAttribute(
      'href',
      /\/ru\/guides\/aql-inspection$/,
    )
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      /[^u]\/guides\/aql-inspection$/,
    )
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'ru_RU')
  })

  test('sends its internal links to Russian pages, and the 3D pages stay where they are', async ({
    page,
  }) => {
    await page.goto(RU_GUIDE)
    const hrefs = await page
      .locator('main a[href^="/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    expect(hrefs.length).toBeGreaterThan(5)
    const english = hrefs.filter(
      (href) =>
        !/^\/ru(\/|$|\?|#)/.test(href) &&
        !/^\/products\/[^/?#]+/.test(href) &&
        !/^\/journal\/./.test(href),
    )
    expect(english, 'an internal link on a Russian page goes to English').toEqual([])
  })

  test('draws its Cyrillic headings in the brand-matched face, at the brand width', async ({
    page,
  }) => {
    await page.goto(RU_GUIDE)
    await page.evaluate(() => document.fonts.ready)
    const faces = await page.evaluate(() =>
      [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family),
    )
    expect(faces).toContain('Archivo Variable')
    const cyrillicFile = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .some((name) => name.includes('roboto-flex-cyrillic')),
    )
    expect(
      cyrillicFile,
      'the Cyrillic face was never fetched: Russian headings fell back to a system font',
    ).toBe(true)
  })

  test('has no horizontal scroll on a 375px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(RU_GUIDE)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test('an English guide downloads no Cyrillic font and stays English', async ({ page }) => {
  const fonts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url())
  })
  await page.goto(GUIDE)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  expect(fonts.filter((url) => /cyrillic|cormorant|roboto-flex/.test(url))).toEqual([])
})

test.describe('the language links', () => {
  test('the phone menu sends an English page to its Russian twin, and back', async ({ page }) => {
    await page.goto(GUIDE)
    await expect(page.locator('.notch__menu a[hreflang="ru"]')).toHaveAttribute('href', RU_GUIDE)
    await page.goto(RU_GUIDE)
    await expect(page.locator('.notch__menu a[hreflang="en"]')).toHaveAttribute('href', GUIDE)
  })
})

/**
 * EVERY RUSSIAN PAGE THE SITEMAP LISTS (2026-11-15), read from the same list (`RU_PAGE_SOURCES`):
 * a /ru address the sitemap names but nothing draws, or draws in English, fails here. Each must
 * answer 200 as Russian, with a Cyrillic headline, its canonical on its own /ru address, and no
 * sideways scroll on a 375px phone (Russian words run longer than English ones).
 */
test.describe('every Russian page', () => {
  for (const path of RU_PAGE_SOURCES) {
    test(`${path} is a Russian page that fits a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
      await expect(page.locator('h1').first()).toHaveText(CYRILLIC)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      )
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('the Russian contact form', () => {
  test('carries lang=ru, so the server answers on /ru/contact', async ({ page }) => {
    await page.goto('/ru/contact')
    await expect(page.locator('#inquiry-form input[name="lang"]')).toHaveValue('ru')
    await page.goto('/contact')
    await expect(page.locator('#inquiry-form input[name="lang"]')).toHaveCount(0)
  })

  test('an old ?family= address forwards to the Russian buyer page', async ({ page }) => {
    const response = await page.goto('/ru/products?family=teamwear-uniforms')
    expect(response?.url()).toMatch(/\/ru\/custom-teamwear-manufacturer$/)
  })
})

test.describe('an unknown Russian address', () => {
  test.use({ javaScriptEnabled: false })

  test('answers 404 with a visible Russian line, scripting off', async ({ page }) => {
    const response = await page.goto('/ru/nope-not-a-page')
    expect(response?.status()).toBe(404)
    await expect(page.locator('main [lang="ru"]')).toContainText('Страница не найдена')
  })
})
