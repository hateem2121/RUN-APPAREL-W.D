import { afterCurtain } from './curtain'
import { expect, type Page, test } from './offlineMedia'

/**
 * THE LANGUAGE NOTE ON THE WEBSITE (owner's design, 2026-11-16): "this page is also in your
 * language", under the menu bar. The rule is unit-tested in
 * packages/shared/src/languageNote.test.ts; the garment pages' copy in
 * apps/viewer/e2e/languageNote.spec.ts. This suite proves what a visitor and a search engine get
 * from the website, in a real browser with a real locale:
 *
 *   - nothing in the server's HTML, nothing before a person touches the page, nothing while the
 *     first-arrival curtain is up, nothing under automation, and never a redirect;
 *   - a Russian-first browser on an English page is offered Russian, in Russian, and the reverse;
 *   - the ×, the note's link and the bar's own language link each end it for good;
 *   - no note where there is no twin page (the 404 page here; a single journal post in
 *     journal.spec.ts, which has a post to load);
 *   - it floats under the bar, moves nothing, fits at 320px, and never hides a focused control;
 *   - Google Analytics hears of it only from a visitor who accepted cookies.
 *
 * ⚠️ THE NOTE HIDES UNDER `navigator.webdriver`, like the cookie card and the curtain, so each
 * test lifts the flag and acts like a person. A test that expects NO note would pass on a page
 * that never draws one, so each such group ends with the same steps showing it: its control.
 *
 * The pages are guides: their words are in the code, so they draw without the database.
 */

const EN = '/guides/aql-inspection'
const RU = `/ru${EN}`
const KEY = 'run-language-note'
const SENTENCE_RU = 'Эта страница есть на русском.'
const SENTENCE_EN = 'This page is also in English.'

async function open(
  page: Page,
  path: string,
  options: { person?: boolean; motion?: boolean; expectStatus?: number } = {},
) {
  if (options.person !== false) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
  }
  // Reduced motion: no curtain, so the note's own rule is what each test measures. The curtain
  // has its own test below, with motion allowed.
  await page.emulateMedia({ reducedMotion: options.motion ? 'no-preference' : 'reduce' })
  const response = await page.goto(path)
  expect(response?.status()).toBe(options.expectStatus ?? 200)
  await expect(page.locator('header.notch-shell')).toBeVisible()
}

/** What only a person does: a real key press (trusted, unlike `dispatchEvent`). */
const touchThePage = (page: Page) => page.keyboard.press('Shift')

const note = (page: Page) => page.locator('.language-note')
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY)

type Queued = { name: string; params: Record<string, unknown> }
const noteEvents = (page: Page): Promise<Queued[]> =>
  page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === 'event' && String(args[1]).startsWith('note_'))
      .map((args) => ({
        name: String(args[1]),
        params: (args[2] ?? {}) as Record<string, unknown>,
      })),
  )

test('the server sends no note, in either language, to anyone', async ({ request }) => {
  // What a crawler that runs no script reads, whatever language it asks for.
  for (const path of [EN, RU]) {
    for (const language of ['ru-RU,ru;q=0.9', 'en-US,en;q=0.9']) {
      const html = await (
        await request.get(path, { headers: { 'accept-language': language } })
      ).text()
      expect(html, `${path} for ${language}`).not.toContain(SENTENCE_RU)
      expect(html, `${path} for ${language}`).not.toContain(SENTENCE_EN)
      expect(html).not.toContain('class="language-note"')
    }
  }
})

test.describe('a browser that asks for Russian first, on an English page', () => {
  test.use({ locale: 'ru-RU' })

  test('is offered the Russian page, in Russian, only after a person touches the page', async ({
    page,
  }) => {
    await open(page, EN)
    expect(await page.evaluate(() => navigator.languages[0])).toMatch(/^ru(-RU)?$/)

    // Before anyone touches the page: nothing, as a crawler's renderer sees it.
    await expect(note(page)).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain('Эта страница есть')

    await touchThePage(page)
    const region = page.getByRole('region', { name: 'Язык страницы' })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('lang', 'ru')
    await expect(region).toHaveAttribute('translate', 'no')
    await expect(region).toHaveAttribute('data-nosnippet', '')
    await expect(region.locator('p')).toHaveText(SENTENCE_RU)

    // A link to the twin, never a redirect: the visitor is still on the English page.
    const link = region.getByRole('link', { name: 'Читать по-русски' })
    await expect(link).toHaveAttribute('href', RU)
    await expect(link).toHaveAttribute('hreflang', 'ru')
    expect(new URL(page.url()).pathname).toBe(EN)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    // It took no focus, announces nothing, and showing it stored nothing.
    expect(await region.evaluate((el) => el.contains(document.activeElement))).toBe(false)
    expect(
      await region.evaluate((el) => el.closest('[aria-live], [role="alert"], [role="status"]')),
    ).toBeNull()
    expect(await stored(page)).toBeNull()

    // Right after the header in the reading order, and outside it.
    expect(
      await region.evaluate(
        (el) => el.previousElementSibling?.matches('header.notch-shell') && !el.closest('header'),
      ),
    ).toBe(true)
  })

  test('the × closes it, hands focus to the page, and it never comes back', async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    await note(page).getByRole('button', { name: 'Закрыть' }).focus()
    await page.keyboard.press('Enter')
    await expect(note(page)).toHaveCount(0)
    expect(await stored(page)).toBe('chosen')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main')

    // The next visit, and another English page with a twin: touched, and still nothing.
    for (const path of [EN, '/privacy']) {
      await page.goto(path)
      await touchThePage(page)
      await page.mouse.move(200, 300)
      await expect(page.locator('header.notch-shell')).toBeVisible()
      await expect(note(page)).toHaveCount(0)
    }
  })

  test("the note's link opens the Russian page, and is remembered as the choice", async ({
    page,
  }) => {
    await open(page, EN)
    await touchThePage(page)
    await note(page).getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`${RU}$`))
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
    expect(await stored(page)).toBe('chosen')
    // Back on the English page later: not asked again.
    await page.goto(EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test("the bar's own «Русский» link counts as the choice", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    await page.locator('header.notch-shell a[hreflang="ru"]').click()
    await expect(page).toHaveURL(new RegExp(`${RU}$`))
    expect(await stored(page)).toBe('chosen')
    await page.goto(EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('while the first-arrival curtain is up there is no note; after it, there is', async ({
    page,
  }) => {
    await open(page, EN, { motion: true })
    const curtainUp = () =>
      page.evaluate(() => document.documentElement.hasAttribute('data-preload'))
    expect(await curtainUp(), 'the curtain never showed, so this test proves nothing').toBe(true)
    await touchThePage(page)
    if (await curtainUp()) await expect(note(page)).toHaveCount(0)
    await afterCurtain(page)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
  })

  test('on a Russian page there is nothing to offer', async ({ page }) => {
    await open(page, RU)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('the 404 page has no twin, so it offers nothing', async ({ page }) => {
    await open(page, '/no-such-page-anywhere', { expectStatus: 404 })
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(page.locator('header.notch-shell')).toBeVisible()
    await expect(note(page)).toHaveCount(0)
  })

  test('under automation it stays hidden, and nothing is stored', async ({ page }) => {
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

  test('Google Analytics hears nothing from a visitor who has not accepted cookies', async ({
    page,
  }) => {
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    await note(page).getByRole('button').click()
    expect(await noteEvents(page)).toEqual([])
  })

  test('after Accept it is told: shown, then closed, and nothing personal', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { runTrackersStarted: boolean }).runTrackersStarted = true
    })
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
    await note(page).getByRole('button').click()
    const params = { page_language: 'en', offered: 'ru' }
    expect(await noteEvents(page)).toEqual([
      { name: 'note_shown', params },
      { name: 'note_closed', params },
    ])
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`its words and its button pass AA contrast in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, EN)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await touchThePage(page)
      await expect(note(page)).toBeVisible()
      // Paint each colour onto a canvas and read the pixel back: `light-dark()`, `color()` and
      // translucent colours all come out as plain sRGB numbers, whatever the engine prints.
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
      expect(ratios.text, 'the sentence').toBeGreaterThanOrEqual(4.5)
      expect(ratios.link, 'the link').toBeGreaterThanOrEqual(4.5)
      expect(ratios.close, 'the ×').toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const width of [320, 375, 768, 1280] as const) {
    test(`at ${width}px it floats under the bar, moves nothing and fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
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
      // Safari tabs to links only with Option held (its default setting).
      const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
      await page.setViewportSize({ width, height: 700 })
      await open(page, EN)
      await touchThePage(page)
      await expect(note(page)).toBeVisible()

      const hidden: string[] = []
      let outsideTheNote = 0
      for (let stop = 0; stop < 60; stop += 1) {
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
        if (!state || state.inside) continue
        outsideTheNote += 1
        if (state.entirelyUnder) hidden.push(state.name)
      }
      expect(outsideTheNote, 'the walk never left the bar and the note').toBeGreaterThan(5)
      expect(hidden, 'focused, and entirely under the note').toEqual([])
    })
  }
})

test.describe('a browser with no Russian, on a Russian page', () => {
  test.use({ locale: 'en-US' })

  test('is offered the English page, in English', async ({ page }) => {
    await open(page, RU)
    await expect(note(page)).toHaveCount(0)
    await touchThePage(page)
    const region = page.getByRole('region', { name: 'Page language' })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('lang', 'en')
    await expect(region.locator('p')).toHaveText(SENTENCE_EN)
    const link = region.getByRole('link', { name: 'Read in English' })
    await expect(link).toHaveAttribute('href', EN)
    await expect(link).toHaveAttribute('hreflang', 'en')
    await expect(region.getByRole('button', { name: 'Close' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(RU)
  })

  test('on an English page there is nothing to offer', async ({ page }) => {
    await open(page, EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })
})

test.describe('who is NOT offered', () => {
  test.use({ locale: 'en-US' })

  const languages = (page: Page, list: string[]) =>
    page.addInitScript((value) => {
      Object.defineProperty(Navigator.prototype, 'languages', { get: () => value })
    }, list)

  test('Russian listed SECOND, on an English page: nothing', async ({ page }) => {
    await languages(page, ['en-US', 'ru-RU'])
    await open(page, EN)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('Russian listed anywhere, on a Russian page: nothing', async ({ page }) => {
    await languages(page, ['en-US', 'ru-RU'])
    await open(page, RU)
    await touchThePage(page)
    await page.mouse.move(200, 300)
    await expect(note(page)).toHaveCount(0)
  })

  test('the same steps with Russian listed FIRST do show it (the control for this group)', async ({
    page,
  }) => {
    await languages(page, ['ru-RU', 'en-US'])
    await open(page, EN)
    await touchThePage(page)
    await expect(note(page)).toBeVisible()
  })
})
