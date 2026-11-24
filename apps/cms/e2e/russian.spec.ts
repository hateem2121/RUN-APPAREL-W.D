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
   * ⚠️ THE TIMING IS TAKEN OUT, SO THIS JUDGES THE FACES AND NOT THE CACHE. A no-swap face
   * (`font-display: optional`) is used only when the browser has it within about a tenth of a
   * second of first paint. Measured 24 Nov 2026: on this Mac it took until the second reload, and in
   * CI's Linux image five reloads never got there (Liberation Sans and Serif, CI run 45390662839),
   * so a version of this test that reloaded until the face appeared failed there. The defect it is
   * here for is not timing: the no-swap families had NO Cyrillic face, so no load could ever draw
   * one. So the page's own no-swap faces are told to swap in for this check, which a family with
   * a Cyrillic face answers with that face and a family without one cannot.
   */
  /** The page's own no-swap rules, told to swap; `dropCyrillic` first removes the rules the fix added. */
  const swapTheNoSwapFaces = (page: Page, dropCyrillic = false) =>
    page.evaluate(async (drop) => {
      const rules: CSSFontFaceRule[] = []
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          if (
            rule instanceof CSSFontFaceRule &&
            rule.style.getPropertyValue('font-family').includes('Optional')
          )
            rules.push(rule)
        }
      }
      let dropped = 0
      for (const rule of rules) {
        const cyrillic = /U\+0?4/i.test(rule.style.getPropertyValue('unicode-range'))
        if (drop && cyrillic) {
          const sheet = rule.parentStyleSheet
          if (sheet) sheet.deleteRule([...sheet.cssRules].indexOf(rule))
          dropped += 1
        } else rule.style.setProperty('font-display', 'swap')
      }
      await Promise.all([...document.fonts].map((face) => face.load().catch(() => null)))
      await document.fonts.ready
      await new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      )
      return { rules: rules.length, dropped }
    }, dropCyrillic)

  test('the guide headline’s own families have Cyrillic faces: no system font draws it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'read through Chromium’s DevTools protocol')
    await page.goto(RU_GUIDE)
    const changed = await swapTheNoSwapFaces(page)
    // Five in site.css and the two Cyrillic companions in cyrillic.css.
    expect(changed.rules, 'the no-swap rules were not found, so nothing was tested').toBe(7)
    const fonts = await headlineFonts(page)
    expect(fonts.length).toBeGreaterThan(0)
    expect(
      fonts.filter((font) => !font.web),
      'a system font drew part of the headline',
    ).toEqual([])
    expect(fonts.map((font) => font.name)).toContain('Roboto Flex')
  })

  test('NEGATIVE CONTROL: with the Cyrillic no-swap faces taken away, a system font draws it', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'read through Chromium’s DevTools protocol')
    await page.goto(RU_GUIDE)
    // The page as it was before the fix: the two no-swap families with no Cyrillic face.
    const changed = await swapTheNoSwapFaces(page, true)
    expect(changed.dropped, 'the rules to take away were not found, so nothing was tested').toBe(2)
    const fonts = await headlineFonts(page)
    expect(fonts.some((font) => !font.web)).toBe(true)
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
