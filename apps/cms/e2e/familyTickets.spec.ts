import AxeBuilder from '@axe-core/playwright'
import { FAMILY_PAGES } from '../src/lib/familyPages'
import { expect, type Locator, type Page, test } from './offlineMedia'

/**
 * Polish D3, M1 and F1: the home page's family tickets (the owner's version 2 of 3 October 2026, and
 * the answer Q3), in a browser.
 *
 * What would have to break for these to fail: the row not opening for a resting pointer or for the
 * keyboard, or opening for a pointer only passing by; an opened ticket closing under the pointer that
 * moves onto it, or not closing on Escape; a click on the picture going nowhere; the keyboard ring cut
 * off by the card again (measured in PIXELS: the audit's first word on it checked the style and was
 * wrong); the notches gone; neighbours' names faded under contrast; a touch screen given cards that
 * wait for a hover; or a phone given anything but one sideways ticket a row.
 */

const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

const tickets = (page: Page) => page.locator('.family-grid > .family-card')

/** The five tickets' widths, rounded. */
const widths = (page: Page) =>
  tickets(page).evaluateAll((cards) =>
    cards.map((card) => Math.round(card.getBoundingClientRect().width)),
  )

/** Whether this ticket is drawn open: its words' title on show, its picture the full height. */
const isOpen = (ticket: Locator) =>
  ticket.evaluate((card) => {
    const title = card.querySelector('.family-card__title')
    const media = card.querySelector('.family-card__media')
    if (!title || !media) return false
    return (
      Number(getComputedStyle(title).opacity) > 0.99 &&
      media.getBoundingClientRect().height > card.getBoundingClientRect().height - 4
    )
  })

/**
 * The home page at `width`, scrolled to the tickets, the pointer away from them. With reduced
 * motion unless `motion` is asked for: that setting zeroes every delay (base.css), the pause
 * before opening included, so a test of the pause must run with motion.
 */
async function openRow(page: Page, width = 1280, motion = false) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' })
  await page.goto('/')
  await page.locator('.family-grid').scrollIntoViewIfNeeded()
  // Away from the row, so nothing is hovered.
  await page.mouse.move(2, 2)
}

test.describe('the row of five, where a pointer can hover (D3)', () => {
  test('closed, five equal tickets 380px tall, the notches on the sides at the fold', async ({
    page,
  }) => {
    await openRow(page)
    const all = await widths(page)
    expect(all).toHaveLength(5)
    expect(Math.max(...all) - Math.min(...all), JSON.stringify(all)).toBeLessThanOrEqual(1)
    for (const ticket of await tickets(page).all()) expect(await isOpen(ticket)).toBe(false)
    expect(
      await page
        .locator('.family-grid')
        .evaluate((grid) => Math.round(grid.getBoundingClientRect().height)),
    ).toBe(380)
  })

  test('a resting pointer opens one, after a pause; it widens and its neighbours’ pictures fade', async ({
    page,
  }) => {
    await openRow(page, 1280, true)
    const second = tickets(page).nth(1)
    await second.hover()
    await expect.poll(() => isOpen(second)).toBe(true)
    const all = await widths(page)
    // 2.7 shares against 1: the opened one is well over twice the others.
    expect(all[1] ?? 0, JSON.stringify(all)).toBeGreaterThan(2.4 * (all[0] ?? 0))
    // The pause before opening, none before closing (the version 2 demo's asymmetry).
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDelay)).toContain(
      '0.12s',
    )
    // The neighbours step back by their pictures; their names keep full strength.
    const first = tickets(page).first()
    await expect
      .poll(() =>
        first.evaluate(
          (card) => getComputedStyle(card.querySelector('.family-card__media') as Element).opacity,
        ),
      )
      .toBe('0.62')
    expect(
      await first.evaluate(
        (card) => getComputedStyle(card.querySelector('.family-card__stub') as Element).opacity,
      ),
    ).toBe('1')
  })

  test('the pointer moving onto the opened part keeps it open; leaving the row closes it at once', async ({
    page,
  }) => {
    await openRow(page, 1280, true)
    const second = tickets(page).nth(1)
    await second.hover({ position: { x: 20, y: 40 } })
    await expect.poll(() => isOpen(second)).toBe(true)
    // Across to the far side of the words, inside the same ticket.
    const box = await second.boundingBox()
    if (!box) throw new Error('no box')
    await page.mouse.move(box.x + box.width - 24, box.y + box.height - 24, { steps: 8 })
    expect(await isOpen(second)).toBe(true)
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDelay)).toContain(
      '0.12s',
    )
    await page.mouse.move(2, 2)
    await expect.poll(() => isOpen(second)).toBe(false)
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDelay)).not.toContain(
      '0.12s',
    )
  })

  test('a click on the picture opens the family’s page: the title’s link covers the card', async ({
    page,
  }) => {
    await openRow(page)
    const teamwear = FAMILY_PAGES.find((entry) => entry.familySlug === 'teamwear-uniforms')?.path
    // The second ticket is Teamwear's (`FAMILIES` order). A mouse press at its picture, as a person
    // makes it: Playwright's own click on the picture refuses, because the link covers it.
    const picture = await tickets(page).nth(1).locator('.family-card__media').boundingBox()
    if (!picture) throw new Error('no picture')
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.className ?? null,
        { x: picture.x + 30, y: picture.y + 30 },
      ),
    ).toBe('family-card__link')
    await page.mouse.click(picture.x + 30, picture.y + 30)
    await expect(page).toHaveURL(new RegExp(`${teamwear}$`))
  })

  test('the keyboard opens one at once, Escape closes it, and leaving lets it open again', async ({
    page,
    browserName,
  }) => {
    await openRow(page)
    const first = tickets(page).first()
    await first.locator('.family-card__link').focus()
    // `focus()` from a script is not keyboard focus in every engine: arrive by the key.
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await page.keyboard.press(tabKey(browserName))
    await expect(first.locator('.family-card__link')).toBeFocused()
    await expect.poll(() => isOpen(first)).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => isOpen(first)).toBe(false)
    await expect(first.locator('.family-card__link')).toBeFocused()
    // On to the next: it opens; back again: the first opens again, its dismissal over.
    await page.keyboard.press(tabKey(browserName))
    await expect.poll(() => isOpen(tickets(page).nth(1))).toBe(true)
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await expect.poll(() => isOpen(first)).toBe(true)
  })

  test('Escape closes one the pointer opened, until the pointer leaves it', async ({ page }) => {
    await openRow(page)
    const third = tickets(page).nth(2)
    await third.hover()
    await expect.poll(() => isOpen(third)).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => isOpen(third)).toBe(false)
    await page.mouse.move(2, 2)
    await third.hover()
    await expect.poll(() => isOpen(third)).toBe(true)
  })
})

test.describe('the keyboard ring, drawn inside the ticket (F1)', () => {
  /*
   * In PIXELS. The audit's "a visible ring every time" had checked the style, and inside a card the
   * ring was cut off (F1). Each engine's screenshot is read 3px inside the ticket's left edge, halfway
   * down: the ring's colour there, and the ticket's own ground there when it has no focus. That spot
   * is the PICTURE's side, and it caught the ring's first version: drawn on the card, it had the
   * right style and showed round the words only, under the picture everywhere else.
   */
  for (const [label, width] of [
    ['in the row', 1280],
    ['sideways, on a phone', 390],
  ] as const) {
    test(`${label}: the ring shows inside the edge, and only with focus`, async ({
      page,
      browserName,
    }) => {
      await openRow(page, width)
      const first = tickets(page).first()
      const pixel = async () => {
        const box = await first.boundingBox()
        if (!box) throw new Error('no box')
        const shot = await page.screenshot({
          clip: { x: box.x + 3, y: box.y + Math.round(box.height / 2), width: 1, height: 1 },
        })
        return shot.toString('base64')
      }
      const before = await pixel()
      await first.locator('.family-card__link').focus()
      await page.keyboard.press(`Shift+${tabKey(browserName)}`)
      await page.keyboard.press(tabKey(browserName))
      const link = first.locator('.family-card__link')
      await expect(link).toBeFocused()
      // Drawn by the link's stretched `::after`, which covers the card and is painted last.
      await expect
        .poll(() => link.evaluate((element) => getComputedStyle(element, '::after').outlineStyle))
        .toBe('solid')
      // Polled: reduced motion gives every property a 0.01ms transition (base.css), and a read
      // straight after the focus caught the offset still at 0px.
      await expect
        .poll(() => link.evaluate((element) => getComputedStyle(element, '::after').outlineOffset))
        .toBe('-4px')
      expect(await pixel(), 'no ring drawn 3px inside the ticket').not.toBe(before)
      // The title's own ring would be a second one.
      expect(
        await first
          .locator('.family-card__link')
          .evaluate((link) => getComputedStyle(link).outlineStyle),
      ).toBe('none')
    })
  }
})

test.describe('the notches and the tear line (D3)', () => {
  test('closed in the row: the page’s ground shows through the notch at the fold', async ({
    page,
  }) => {
    await openRow(page)
    const first = tickets(page).first()
    const colours = await first.evaluate((card) => ({
      mask: getComputedStyle(card).maskImage || getComputedStyle(card).webkitMaskImage,
    }))
    expect(colours.mask).toMatch(/radial-gradient/)
    const box = await first.boundingBox()
    if (!box) throw new Error('no box')
    // The notch is centred on the left edge at 64% of the height; 2px in is inside it. The card's
    // own ground is read in the stub below it (the picture's ground is the page's colour).
    const at = async (x: number, y: number) =>
      (await page.screenshot({ clip: { x, y, width: 1, height: 1 } })).toString('base64')
    const inNotch = await at(box.x + 2, box.y + box.height * 0.64)
    const onCard = await at(box.x + 2, box.y + box.height * 0.85)
    const offCard = await at(box.x - 6, box.y + box.height * 0.64)
    expect(inNotch, 'the notch shows the ground, not the card').toBe(offCard)
    expect(onCard).not.toBe(offCard)
  })
})

test.describe('everywhere else, the sideways ticket (M1)', () => {
  test('a phone: one ticket a row, its picture left, its name, kinds and way in on the right', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const all = await widths(page)
    const grid = await page
      .locator('.family-grid')
      .evaluate((element) => element.getBoundingClientRect().width)
    for (const width of all) expect(Math.abs(width - grid)).toBeLessThanOrEqual(1)
    const first = tickets(page).first()
    const layout = await first.evaluate((card) => {
      const r = (selector: string) => card.querySelector(selector)?.getBoundingClientRect()
      const box = card.getBoundingClientRect()
      const media = r('.family-card__media')
      const title = r('.family-card__title')
      return {
        pictureShare: media ? media.width / box.width : 0,
        titleRightOfPicture: media && title ? title.left >= media.right : false,
        stub: getComputedStyle(card.querySelector('.family-card__stub') as Element).display,
      }
    })
    expect(layout.pictureShare).toBeGreaterThan(0.35)
    expect(layout.pictureShare).toBeLessThan(0.45)
    expect(layout.titleRightOfPicture).toBe(true)
    expect(layout.stub).toBe('none')
    // Out of sight, not out of reach: a screen reader still has the description.
    await expect(first.locator('.family-card__desc')).toHaveText(/\S/)
    await expect(first.locator('.family-card__types')).toBeVisible()
  })

  // Its own context: Firefox refuses a mobile one before a test could skip itself.
  test('a touch screen as wide as a computer gets the sideways tickets, none waiting to be opened', async ({
    browser,
    browserName,
    baseURL,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium emulates a touch screen this wide')
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 1366, height: 1024 },
    })
    try {
      const page = await context.newPage()
      await page.goto(`${baseURL}/`)
      expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(false)
      const all = await widths(page)
      expect(all[0]).toBe(all[1])
      expect(all[4] ?? 0).toBeGreaterThan(1.9 * (all[0] ?? 0))
      await expect(tickets(page).first().locator('.family-card__types')).toBeVisible()
      for (const ticket of await tickets(page).all()) {
        expect(
          await ticket
            .locator('.family-card__stub')
            .evaluate((stub) => getComputedStyle(stub).display),
        ).toBe('none')
      }
    } finally {
      await context.close()
    }
  })
})

test.describe('contrast, opened and closed, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe finds no contrast or naming fault in the row, one ticket open`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openRow(page)
      const second = tickets(page).nth(1)
      await second.hover()
      await expect.poll(() => isOpen(second)).toBe(true)
      const results = await new AxeBuilder({ page })
        .include('.family-grid')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
})
