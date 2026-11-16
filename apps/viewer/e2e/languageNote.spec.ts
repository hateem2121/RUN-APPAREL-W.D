import { expect, type Page, test } from '@playwright/test'

/**
 * THE LANGUAGE NOTE ON A GARMENT PAGE (owner's design, 2026-11-16): "this page is also in your
 * language", under the bar. The rule is unit-tested in packages/shared/src/languageNote.test.ts;
 * this suite proves, in a real browser with a real locale, what a visitor gets:
 *
 *   - a Russian-first browser on the English page is offered Russian, IN Russian, and the reverse;
 *   - never before a person touches the page, never under automation, never a redirect;
 *   - the ×, the note's link and the bar's language link each end it for good;
 *   - it floats under the bar, moves nothing, fits at 320px, and never hides a focused control.
 *
 * ⚠️ THE NOTE HIDES UNDER `navigator.webdriver`, like the cookie card and the opening screen, so
 * every test here lifts the flag (`asAPerson`) and acts like a person. The tests in "who is NOT
 * offered" would pass on a page with no note at all; the first two tests are their control, run
 * with the same steps and showing the note.
 */

const EN = '/products/n001/wine'
const RU = '/ru/products/n001/wine'
const KEY = 'run-language-note'

const asAPerson = `Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })`

/** The page's own telemetry events, kept for the test to read (`lib/analytics.ts`). */
const recordEvents = `
  window.__noteEvents = []
  document.addEventListener('run:analytics', (event) => window.__noteEvents.push(event.detail.event))
`

async function open(page: Page, path: string, options: { person?: boolean } = {}) {
  if (options.person !== false) await page.addInitScript(asAPerson)
  await page.addInitScript(recordEvents)
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // The opening screen has gone: the note waits for it, so the test must too.
  await expect(page.locator('.preloader')).toHaveCount(0)
}

/** What only a person does: a real key press (trusted, unlike `dispatchEvent`). */
const touchThePage = (page: Page) => page.keyboard.press('Shift')

const note = (page: Page) => page.locator('.language-note')
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY)

test.describe('a browser that asks for Russian first, on the English page', () => {
  test.use({ locale: 'ru-RU' })

  test('is offered the Russian page, in Russian, only after a person touches the page', async ({
    page,
  }) => {
    await open(page, EN)
    // Chromium and Firefox say 'ru-RU', WebKit 'ru': the rule reads the primary subtag either way.
    expect(await page.evaluate(() => navigator.languages[0])).toMatch(/^ru(-RU)?$/)

    // Before anyone touches the page: nothing, as a crawler's renderer sees it.
    await expect(note(page)).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain('Эта страница есть на русском')

    await touchThePage(page)
    const region = page.getByRole('region', { name: 'Язык страницы' })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('lang', 'ru')
    await expect(region).toHaveAttribute('translate', 'no')
    await expect(region).toHaveAttribute('data-nosnippet', '')
    await expect(region.locator('p')).toHaveText('Эта страница есть на русском.')

    // A link to the twin, never a redirect: the visitor is still on the English page.
    const link = region.getByRole('link', { name: 'Читать по-русски' })
    await expect(link).toHaveAttribute('href', `https://wear-run.com${RU}`)
    await expect(link).toHaveAttribute('hreflang', 'ru')
    expect(new URL(page.url()).pathname).toBe(EN)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    // It took no focus, and showing it stored nothing: only an answer is remembered.
    expect(await region.evaluate((el) => el.contains(document.activeElement))).toBe(false)
    expect(await stored(page)).toBeNull()

    // Right after the header in the reading order, and outside it.
    expect(
      await region.evaluate(
        (el) => el.previousElementSibling?.matches('header.notch-shell') && !el.closest('header'),
      ),
    ).toBe(true)

    // Counted by the page's own telemetry; Google's tag has nothing, as nobody accepted cookies.
    expect(
      await page.evaluate(() => (window as never as { __noteEvents: string[] }).__noteEvents),
    ).toContain('note_shown')
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false)
  })

  test('the × closes it, hands focus to the page, and it never comes back', async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    const close = note(page).getByRole('button', { name: 'Закрыть' })
    await close.focus()
    await page.keyboard.press('Enter')
    await expect(note(page)).toHaveCount(0)
    expect(await stored(page)).toBe('chosen')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content')
    expect(
      await page.evaluate(() => (window as never as { __noteEvents: string[] }).__noteEvents),
    ).toContain('note_closed')

    // The next visit: touched again, and still nothing.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.preloader')).toHaveCount(0)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test("the note's own link is remembered as the choice", async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    // The link leaves for the live site; hold the page here so the test can read what was kept.
    await page.evaluate(() =>
      document.addEventListener('click', (event) => event.preventDefault(), true),
    )
    await note(page).getByRole('link').click()
    expect(await stored(page)).toBe('chosen')
    expect(
      await page.evaluate(() => (window as never as { __noteEvents: string[] }).__noteEvents),
    ).toContain('note_used')
  })

  test("the bar's own «Русский» link counts as the choice, and the note leaves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    await page.evaluate(() =>
      document.addEventListener('click', (event) => event.preventDefault(), true),
    )
    await page.locator('header.notch-shell a[hreflang="ru"]').click()
    await expect(note(page)).toHaveCount(0)
    expect(await stored(page)).toBe('chosen')
  })

  test('on the Russian page there is nothing to offer', async ({ page }) => {
    await open(page, RU)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(page.locator('.notch-shell')).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })

  test('under automation it stays hidden, so the other suites see the page as before', async ({
    page,
  }) => {
    await open(page, EN, { person: false })
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
    expect(await stored(page)).toBeNull()
  })

  test('it is not printed', async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(note(page)).toBeHidden()
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`its words and its button pass AA contrast in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await open(page, EN)
      await touchThePage(page)
      await expect(note(page)).toBeVisible()
      // Paint each colour onto a canvas and read the pixel back: `light-dark()`, `color()` and
      // translucent borders all come out as plain sRGB numbers, whatever the engine prints.
      const ratios = await note(page).evaluate((el) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const pen = canvas.getContext('2d', { willReadFrequently: true })
        if (!pen) throw new Error('no canvas')
        const rgb = (colour: string, over = '#000') => {
          pen.globalCompositeOperation = 'copy'
          pen.fillStyle = over
          pen.fillRect(0, 0, 1, 1)
          pen.globalCompositeOperation = 'source-over'
          pen.fillStyle = colour
          pen.fillRect(0, 0, 1, 1)
          return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3)
        }
        const luminance = ([r, g, b]: number[]) => {
          const lin = (v = 0) =>
            v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4
          return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
        }
        const contrast = (a: number[], b: number[]) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
          return (hi + 0.05) / (lo + 0.05)
        }
        const card = el.querySelector('.language-note__card') as HTMLElement
        const ground = getComputedStyle(card).backgroundColor
        const groundRgb = rgb(ground)
        const on = (selector: string) =>
          contrast(
            rgb(getComputedStyle(el.querySelector(selector) as HTMLElement).color, ground),
            groundRgb,
          )
        return {
          scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          text: on('.language-note__text'),
          link: on('.language-note__action'),
          close: on('.language-note__close'),
        }
      })
      expect(ratios.scheme, 'the theme did not apply').toBe(scheme)
      // 4.5:1 for words (SC 1.4.3); the × is a graphic and needs 3:1 (SC 1.4.11), held to 4.5 too.
      expect(ratios.text, 'the sentence').toBeGreaterThanOrEqual(4.5)
      expect(ratios.link, 'the link').toBeGreaterThanOrEqual(4.5)
      expect(ratios.close, 'the ×').toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const width of [320, 375, 768, 1280] as const) {
    test(`at ${width}px it floats under the bar, moves nothing and fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page, EN)
      const measure = () =>
        page.evaluate(() => {
          const main = document.querySelector('main') as HTMLElement
          return {
            mainTop: main.getBoundingClientRect().top + window.scrollY,
            height: document.documentElement.scrollHeight,
          }
        })
      const before = await measure()
      await touchThePage(page)
      await expect(note(page)).toBeVisible()
      // No layout shift: the page is where it was, to the pixel.
      expect(await measure()).toEqual(before)

      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const r = (document.querySelector(selector) as HTMLElement).getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
        }
        const text = document.querySelector('.language-note__text') as HTMLElement
        const action = document.querySelector('.language-note__action') as HTMLElement
        return {
          bar: rect('.notch'),
          card: rect('.language-note__card'),
          action: rect('.language-note__action'),
          close: rect('.language-note__close'),
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          viewport: document.documentElement.clientWidth,
          cut:
            text.scrollWidth > text.clientWidth + 1 || action.scrollWidth > action.clientWidth + 1,
          lines: Math.round(
            text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight),
          ),
        }
      })
      expect(boxes.card.top, 'the note covers the bar').toBeGreaterThanOrEqual(boxes.bar.bottom - 1)
      expect(boxes.sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
      expect(boxes.card.left).toBeGreaterThanOrEqual(0)
      expect(boxes.card.right).toBeLessThanOrEqual(boxes.viewport)
      expect(boxes.cut, 'words are cut').toBe(false)
      expect(boxes.lines, 'the sentence broke onto too many lines').toBeLessThanOrEqual(2)
      // The site's own touch floor.
      expect(boxes.action.height).toBeGreaterThanOrEqual(44)
      expect(boxes.close.height).toBeGreaterThanOrEqual(44)
      expect(boxes.close.right - boxes.close.left).toBeGreaterThanOrEqual(44)
      // Centred: the same room either side, to a pixel.
      expect(
        Math.abs(boxes.card.left - (boxes.viewport - boxes.card.right)),
        'the note is off centre',
      ).toBeLessThanOrEqual(1)
    })
  }

  for (const width of [375, 1280] as const) {
    test(`at ${width}px no control a keyboard reaches is hidden under it (WCAG 2.4.11)`, async ({
      page,
      browserName,
    }) => {
      // Safari tabs to links only with Option held (its default setting), on a Mac and in CI alike.
      const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
      await page.setViewportSize({ width, height: 700 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page, EN)
      await touchThePage(page)
      await expect(note(page)).toBeVisible()

      const hidden: string[] = []
      let outsideTheNote = 0
      for (let stop = 0; stop < 45; stop += 1) {
        await page.keyboard.press(tab)
        const state = await page.evaluate(() => {
          const el = document.activeElement
          const card = document.querySelector('.language-note__card')
          if (!el || el === document.body || !card) return null
          const inside = card.contains(el) || !!el.closest('.notch-shell')
          const t = el.getBoundingClientRect()
          const n = card.getBoundingClientRect()
          const entirelyUnder =
            t.top >= n.top && t.bottom <= n.bottom && t.left >= n.left && t.right <= n.right
          return {
            inside,
            entirelyUnder,
            name: `${el.tagName} ${(el.textContent ?? '').trim().slice(0, 30)}`,
          }
        })
        if (!state) continue
        if (state.inside) continue
        outsideTheNote += 1
        if (state.entirelyUnder) hidden.push(state.name)
      }
      expect(outsideTheNote, 'the walk never left the bar and the note').toBeGreaterThan(5)
      expect(hidden, 'focused, and entirely under the note').toEqual([])
    })
  }
})

test.describe('a browser with no Russian, on the Russian page', () => {
  test.use({ locale: 'en-US' })

  test('is offered the English page, in English', async ({ page }) => {
    await open(page, RU)
    await expect(note(page)).toHaveCount(0)
    await touchThePage(page)
    const region = page.getByRole('region', { name: 'Page language' })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('lang', 'en')
    await expect(region.locator('p')).toHaveText('This page is also in English.')
    const link = region.getByRole('link', { name: 'Read in English' })
    await expect(link).toHaveAttribute('href', `https://wear-run.com${EN}`)
    await expect(link).toHaveAttribute('hreflang', 'en')
    await expect(region.getByRole('button', { name: 'Close' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(RU)
  })

  test('on the English page there is nothing to offer', async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(page.locator('.notch-shell')).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })
})

test.describe('who is NOT offered', () => {
  test.use({ locale: 'en-US' })

  test('Russian listed SECOND, on the English page: nothing', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['en-US', 'ru-RU'] })
    })
    await open(page, EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('Russian listed anywhere, on the Russian page: nothing', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['en-US', 'ru-RU'] })
    })
    await open(page, RU)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('the same steps with Russian listed FIRST do show it (the control for the two above)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'languages', { get: () => ['ru-RU', 'en-US'] })
    })
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
  })
})
