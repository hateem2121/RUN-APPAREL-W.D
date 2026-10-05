import { expect, type Page, test } from './offlineMedia'

/**
 * Polish X4 (2026-10-04): the privacy and terms pages, with their parts named.
 *
 * The audit of 3 October found each part's title a small code-style label, smaller than the words
 * under it, and the right half of a computer's page empty. Each part is a real heading now, and
 * "On this page" lists them: beside the text from 900px, where it stays in view as the page scrolls,
 * and above the text on a phone (site.css, `.legal`; components/site/OnThisPage.tsx).
 */

const PAGES = ['/privacy', '/terms'] as const

const settle = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => document.fonts.ready)
}

const read = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => el?.getBoundingClientRect() ?? null
    const body = document.querySelector('.legal__body')
    const nav = document.querySelector('nav.legal__toc')
    const firstText = body?.querySelector('p')
    return {
      headings: [...(body?.querySelectorAll('h2') ?? [])].map((h) => ({
        id: h.id,
        text: (h.textContent ?? '').trim(),
        size: Number.parseFloat(getComputedStyle(h).fontSize),
      })),
      textSize: firstText ? Number.parseFloat(getComputedStyle(firstText).fontSize) : 0,
      links: [...(nav?.querySelectorAll('a') ?? [])].map((a) => ({
        href: a.getAttribute('href') ?? '',
        text: (a.textContent ?? '').trim(),
      })),
      nav: box(nav),
      body: box(body),
      label: nav?.getAttribute('aria-labelledby')
        ? (document.getElementById(nav.getAttribute('aria-labelledby') ?? '')?.textContent ?? '')
        : '',
    }
  })

test.describe('X4 — the legal pages name their parts, and list them', () => {
  for (const path of PAGES) {
    test(`${path}: each part is a real heading, as large as its words, and the list names them all`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(path)
      await settle(page)
      const m = await read(page)
      expect(m.headings.length, 'no part headings').toBeGreaterThanOrEqual(5)
      for (const heading of m.headings) {
        expect(heading.id, `"${heading.text}" has no id to jump to`).not.toBe('')
        expect(
          heading.size,
          `"${heading.text}" is smaller than the words under it`,
        ).toBeGreaterThan(m.textSize)
      }
      expect(m.label).toBe('On this page')
      // One link per heading, in order, each to that heading.
      expect(m.links).toEqual(m.headings.map((h) => ({ href: `#${h.id}`, text: h.text })))
    })

    test(`${path}: a link lands its heading below the fixed bar`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(path)
      await settle(page)
      const last = (await read(page)).links.at(-1)
      expect(last, 'no links').toBeTruthy()
      await page.locator(`nav.legal__toc a[href="${last?.href}"]`).click()
      const at = await page.evaluate(
        (id) => {
          const heading = document.getElementById(id)?.getBoundingClientRect()
          const bar = document.querySelector('.notch-shell')?.getBoundingClientRect()
          return { top: heading?.top ?? -1, barBottom: bar?.bottom ?? 0 }
        },
        (last?.href ?? '#').slice(1),
      )
      expect(at.top, 'the heading is under the bar').toBeGreaterThanOrEqual(at.barBottom)
      expect(at.top).toBeLessThan(900)
    })
  }

  test('on a computer the list is beside the text and stays in view; on a phone it is above it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/privacy')
    await settle(page)
    const top = await read(page)
    expect(top.nav?.left ?? 0, 'the list is not beside the text').toBeGreaterThan(
      top.body?.right ?? Number.POSITIVE_INFINITY,
    )
    // Scrolled to a part in the middle, the list is held whole on screen, below the bar (sticky).
    // Not the last part: at the page's end a sticky box leaves with the end of its section, as it
    // should, and slides under the bar.
    await page.evaluate(() => document.getElementById('why-we-are-allowed')?.scrollIntoView())
    const scrolled = await read(page)
    const barBottom = await page.evaluate(
      () => document.querySelector('.notch-shell')?.getBoundingClientRect().bottom ?? 0,
    )
    expect(scrolled.nav?.top ?? -1, 'the list is not held below the bar').toBeGreaterThanOrEqual(
      barBottom,
    )
    expect(scrolled.nav?.bottom ?? 9999).toBeLessThanOrEqual(900)

    // NEGATIVE CONTROL: unstuck, the same scroll leaves the list above the screen.
    await page.addStyleTag({ content: '.legal__toc { position: static !important; }' })
    await expect.poll(async () => (await read(page)).nav?.bottom ?? 9999).toBeLessThan(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/privacy')
    await settle(page)
    const phone = await read(page)
    expect(
      phone.nav?.bottom ?? 9999,
      'on a phone the list is not above the text',
    ).toBeLessThanOrEqual(phone.body?.top ?? 0)
  })
})
