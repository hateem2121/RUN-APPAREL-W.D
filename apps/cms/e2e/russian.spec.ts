import { RU_PAGE_SOURCES } from '../publicViewerHeaders.mjs'
import { expect, type Page, test } from './offlineMedia'

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

  /*
   * The check above passes when the file is fetched for ANY text on the page. This one reads which
   * font drew the headline itself. Measured on the live site, 24 Nov 2026: this guide's headline
   * drew 22 letters in Arial and 15 in Georgia, because its no-swap families had no Cyrillic face
   * (packages/ui/src/cyrillic.css). Chromium only: the reading is its DevTools protocol's.
   */
  const headlineFonts = async (page: Page, plant = '') => {
    if (plant) await page.addStyleTag({ content: plant })
    await page.evaluate(() => document.fonts.ready)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument')
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'h1' })
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    await cdp.detach()
    return fonts.map((font) => ({ name: font.familyName, web: font.isCustomFont }))
  }

  /*
   * ⚠️ A NO-SWAP FACE IS USED ONLY ONCE IT IS CACHED, SO THE PAGE IS LOADED UNTIL IT IS. Measured
   * here 24 Nov 2026 on a cold server: the first load and the first reload drew the whole headline
   * in Arial and Georgia (that is the promise: no jump on a cold visit), and every load from the
   * second reload on drew Roboto Flex and Cormorant. Before the fix no reload ever could, which is
   * what this still fails on.
   */
  test('draws the guide headline itself in the brand-matched faces once they are cached', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'read through Chromium’s DevTools protocol')
    await page.goto(RU_GUIDE)
    let fonts = await headlineFonts(page)
    for (let load = 0; load < 5 && fonts.some((font) => !font.web); load++) {
      await page.reload()
      await page.waitForLoadState('networkidle')
      fonts = await headlineFonts(page)
    }
    expect(fonts.length).toBeGreaterThan(0)
    expect(
      fonts.filter((font) => !font.web),
      'a system font still drew part of the headline after five reloads',
    ).toEqual([])
    expect(fonts.map((font) => font.name)).toContain('Roboto Flex')
  })

  test('NEGATIVE CONTROL: a headline forced to a system font is read as one', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'read through Chromium’s DevTools protocol')
    await page.goto(RU_GUIDE)
    const fonts = await headlineFonts(
      page,
      'h1, h1 * { font-family: Arial, sans-serif !important }',
    )
    expect(fonts.some((font) => !font.web)).toBe(true)
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
  // The bar and its phone menu had a link to the twin until 2026-11-18 (owner). The Russian footer
  // keeps «English», to the English home; the head's hreflang lines (above) serve search engines.
  test('no bar or phone menu offers the other language; the Russian footer offers English', async ({
    page,
  }) => {
    await page.goto(GUIDE)
    await expect(page.locator('header a[hreflang]')).toHaveCount(0)
    await expect(page.locator('footer a[hreflang]')).toHaveCount(0)
    await page.goto(RU_GUIDE)
    await expect(page.locator('header a[hreflang]')).toHaveCount(0)
    await expect(page.locator('footer a[hreflang="en"]')).toHaveAttribute('href', '/')
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
