import AxeBuilder from '@axe-core/playwright'
import { FAMILY_PAGES } from '../src/lib/familyPages'
import { answerCardPictures } from './cardPictures'
import { expect, type Locator, type Page, test } from './offlineMedia'

/**
 * Polish D3, M1 and F1, rebuilt as D44 (the owner's option C2 of 15 October 2026): the home page's
 * family cards, in a browser.
 *
 * What would have to break for these to fail: the row not opening for a resting pointer or for the
 * keyboard, or opening for a pointer only passing by; an opened card closing under the pointer that
 * moves onto its words, or not closing on Escape; a click on the picture going nowhere; the keyboard
 * ring cut off by the card again (measured in PIXELS: the audit's first word on it checked the style
 * and was wrong); an opening that lays the row out again (C2's whole point: 2–4 layout passes, not
 * 599); the words running past the picture, or the page scrolling sideways; the opened card showing
 * the colour it already had; neighbours' names faded under contrast; a touch screen given cards that
 * wait for a hover; or a phone given anything but one sideways card a row.
 */

const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

const cards = (page: Page) => page.locator('.family-grid > .family-card')

/** The five cards' layout boxes (no transform), rounded: what an opening must leave alone. */
const boxes = (page: Page) =>
  cards(page).evaluateAll((all) =>
    all.map((card) => [(card as HTMLElement).offsetWidth, (card as HTMLElement).offsetHeight]),
  )

/** Whether this card is drawn open: its words on show and itself at full size. */
const isOpen = (card: Locator) =>
  card.evaluate((element) => {
    const title = element.querySelector('.family-card__title')
    if (!title) return false
    const scale = new DOMMatrix(getComputedStyle(element).transform).a
    return Number(getComputedStyle(title).opacity) > 0.99 && Math.abs(scale - 1) < 0.01
  })

/** How far the page scrolls sideways. */
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/**
 * The home page at `width`, scrolled to the cards, the pointer away from them. With reduced motion
 * unless `motion` is asked for: that setting zeroes every delay (base.css), the pause before opening
 * included, so a test of the pause must run with motion.
 */
async function openRow(page: Page, width = 1440, motion = false) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' })
  await page.goto('/')
  await page.locator('.family-grid').scrollIntoViewIfNeeded()
  // Away from the row, so nothing is hovered.
  await page.mouse.move(2, 2)
}

/**
 * The pointer off the row, and every card back in place: under reduced motion a transition still
 * takes a frame, and a picture measured straight after moving away was still where the last opened
 * card had pushed it, so the next pointer landed on its neighbour.
 */
async function away(page: Page) {
  await page.mouse.move(2, 2)
  await expect
    .poll(() =>
      cards(page).evaluateAll((all) =>
        all.every((card) => getComputedStyle(card).transform === 'none'),
      ),
    )
    .toBe(true)
}

/** A pointer straight onto a card's picture (no path across the others). */
async function restOn(page: Page, card: Locator) {
  const box = await card.locator('.family-card__media').boundingBox()
  if (!box) throw new Error('no picture')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

test.describe('the row of five, from 1440px where a pointer can hover (D3; D44)', () => {
  test('closed, five equal cards, each a picture and its name, none open', async ({ page }) => {
    await openRow(page)
    const all = await boxes(page)
    expect(all).toHaveLength(5)
    const widths = all.map(([width]) => width ?? 0)
    expect(Math.max(...widths) - Math.min(...widths), JSON.stringify(all)).toBeLessThanOrEqual(1)
    for (const card of await cards(page).all()) {
      expect(await isOpen(card)).toBe(false)
      await expect(card.locator('.family-card__stub-name')).toBeVisible()
    }
    expect(await sideways(page), 'the closed cards’ words push the page sideways').toBe(0)
  })

  test('a resting pointer opens one at once; the others step back and their pictures fade', async ({
    page,
  }) => {
    await openRow(page, 1440, true)
    const second = cards(page).nth(1)
    await restOn(page, second)
    await expect.poll(() => isOpen(second)).toBe(true)
    // No pause before opening (home page audit, 2026-10-17; the owner removed polish #128's 120 ms):
    // the card moves at once.
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDelay)).not.toContain(
      '0.12s',
    )
    // Slower open than close (owner, 2026-10-19: "too fast"): the card moves over --settle (0.5 s)
    // while open, and its words arrive one after another, 40 ms apart, from a fifth of the way in.
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDuration)).toMatch(
      /^0\.5s/,
    )
    const delays = await second
      .locator('.family-card__more > *')
      .evaluateAll((all) =>
        all.map((words) => Number.parseFloat(getComputedStyle(words).transitionDelay)),
      )
    expect(delays[0], 'the first words start a fifth of the way into the open').toBeCloseTo(0.1, 3)
    for (let at = 1; at < Math.min(delays.length, 7); at++) {
      expect((delays[at] ?? 0) - (delays[at - 1] ?? 0), `words ${at} and ${at + 1}`).toBeCloseTo(
        0.04,
        3,
      )
    }
    // The others are drawn at 0.7, their pictures faded, their names at full strength.
    const first = cards(page).first()
    await expect
      .poll(() => first.evaluate((card) => new DOMMatrix(getComputedStyle(card).transform).a))
      .toBeCloseTo(0.7, 2)
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
    // And it closes on --ui (0.22 s), with no word waiting: the row is clear at once.
    await page.mouse.move(2, 2)
    expect(await second.evaluate((card) => getComputedStyle(card).transitionDuration)).toMatch(
      /^0\.22s/,
    )
    expect(
      await second.locator('.family-card__more > *').evaluateAll((all) =>
        all.every((words) =>
          getComputedStyle(words)
            .transitionDelay.split(', ')
            .every((delay) => delay === '0s'),
        ),
      ),
    ).toBe(true)
  })

  /*
   * ⚠️ NOTHING IS LAID OUT AGAIN (C2, 2026-10-15). The cards move by `transform` and the words' sheet
   * by `clip-path`: every card keeps its layout box, and the row its height, whichever card is open.
   */
  test('opening any card leaves every card’s box and the row’s height as they were', async ({
    page,
  }) => {
    await openRow(page)
    const before = await boxes(page)
    const height = () =>
      page.locator('.family-grid').evaluate((grid) => (grid as HTMLElement).offsetHeight)
    const rowBefore = await height()
    for (const index of [0, 2, 4]) {
      await away(page)
      const card = cards(page).nth(index)
      await restOn(page, card)
      await expect.poll(() => isOpen(card)).toBe(true)
      expect(await boxes(page), `card ${index + 1} open`).toEqual(before)
      expect(await height()).toBe(rowBefore)
      expect(await sideways(page), `card ${index + 1} open`).toBe(0)
    }
  })

  // The words sit beside the picture, inside its height, and the row ends where the page's column does.
  for (const width of [1440, 1920]) {
    test(`at ${width}px an opened card’s words fit beside its picture`, async ({ page }) => {
      await openRow(page, width)
      for (const index of [0, 1, 3, 4]) {
        await away(page)
        const card = cards(page).nth(index)
        await restOn(page, card)
        await expect.poll(() => isOpen(card)).toBe(true)
        const fit = await card.evaluate((element) => {
          const face = element.querySelector('.family-card__face')?.getBoundingClientRect()
          const cue = element.querySelector('.family-card__cue')?.getBoundingClientRect()
          const words = element.querySelector('.family-card__more')?.getBoundingClientRect()
          const grid = element.parentElement?.getBoundingClientRect()
          if (!face || !cue || !words || !grid) return null
          return {
            below: Math.round(cue.bottom - face.bottom),
            past: Math.round(words.right - grid.right),
          }
        })
        expect(fit, `card ${index + 1}`).not.toBeNull()
        expect(
          fit?.below ?? 1,
          `card ${index + 1}: the way in is below the picture`,
        ).toBeLessThanOrEqual(0)
        expect(fit?.past ?? 1, `card ${index + 1}: the words run past the row`).toBeLessThanOrEqual(
          1,
        )
      }
    })
  }

  test('an opened card shows another colour of its garment, named over its dots', async ({
    page,
  }) => {
    await openRow(page)
    const first = cards(page).first()
    if ((await first.locator('.family-card__img--open').count()) === 0) {
      if (process.env.CI) throw new Error('the seeded garment has no second colour to show')
      test.skip(true, 'no garment with a second colour in this local database')
    }
    const opacity = (selector: string) =>
      first
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).opacity)
    expect(await opacity('.family-card__img--open')).toBe('0')
    await restOn(page, first)
    await expect.poll(() => isOpen(first)).toBe(true)
    await expect.poll(() => opacity('.family-card__img--open')).toBe('1')
    expect(await opacity('.family-card__img:not(.family-card__img--open)')).toBe('0')
    // Under the picture, the garment; over the dots, the colour shown, its dot the one marked.
    await expect.poll(() => opacity('.family-card__garment')).toBe('1')
    await expect(first.locator('.family-card__garment')).toHaveText(/\S/)
    await expect(first.locator('.family-card__colour .family-card__label')).toHaveText(/\S/)
    await expect(first.locator('.family-card__dots i.is-shown')).toHaveCount(1)
  })

  /*
   * The dye (owner, 2026-10-26: one dye everywhere a garment changes colour; FamilyDye.tsx): an
   * opening soaks the other colour in from its dot, a closing soaks it back, and nothing is left. What
   * would have to break: the two pictures cross-fading again (no dye running over many frames), a
   * layer left showing, or any dye for a visitor who asked for less motion.
   */
  test('opening a card soaks its other colour in, closing soaks it back, and nothing is left', async ({
    page,
  }) => {
    await answerCardPictures(page)
    await openRow(page, 1440, true)
    const first = cards(page).first()
    if ((await first.locator('.family-card__img--open').count()) === 0) {
      if (process.env.CI) throw new Error('the seeded garment has no second colour to show')
      test.skip(true, 'no garment with a second colour in this local database')
    }
    const pictures = first.locator('.family-card__img')
    await expect
      .poll(() =>
        pictures.evaluateAll((all) =>
          all.every(
            (img) =>
              (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
          ),
        ),
      )
      .toBe(true)
    // Its script must own the card before the pointer arrives.
    await page.waitForFunction(() => document.readyState === 'complete')
    const layer = first.locator('.family-card__media > .dye-layer')
    await layer.evaluate((element) => {
      const w = window as unknown as { __frames: number }
      w.__frames = 0
      const tick = () => {
        if (element.hasAttribute('data-running')) w.__frames++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames)
    const reset = () =>
      page.evaluate(() => {
        ;(window as unknown as { __frames: number }).__frames = 0
      })
    await restOn(page, first)
    await expect.poll(() => isOpen(first)).toBe(true)
    await expect.poll(frames).toBeGreaterThan(5)
    await expect(layer).not.toHaveAttribute('data-running', { timeout: 3000 })
    expect(await layer.evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
    await reset()
    await away(page)
    await expect.poll(frames).toBeGreaterThan(2)
    await expect(layer).not.toHaveAttribute('data-running', { timeout: 3000 })
    expect(await layer.evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
  })

  test('under reduced motion a card opens with no dye', async ({ page }) => {
    await answerCardPictures(page)
    await openRow(page)
    const first = cards(page).first()
    if ((await first.locator('.family-card__img--open').count()) === 0) {
      if (process.env.CI) throw new Error('the seeded garment has no second colour to show')
      test.skip(true, 'no garment with a second colour in this local database')
    }
    await page.evaluate(() => {
      const w = window as unknown as { __dyed: boolean }
      w.__dyed = false
      new MutationObserver(() => {
        if (document.querySelector('.family-card .dye-layer[data-running]')) w.__dyed = true
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-running'] })
    })
    await restOn(page, first)
    await expect.poll(() => isOpen(first)).toBe(true)
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => (window as unknown as { __dyed: boolean }).__dyed)).toBe(false)
  })

  test('the pointer moving onto the opened words keeps it open; leaving the row closes it at once', async ({
    page,
  }) => {
    await openRow(page, 1440, true)
    const second = cards(page).nth(1)
    await restOn(page, second)
    await expect.poll(() => isOpen(second)).toBe(true)
    // Across to the far side of the words, beside the picture.
    const words = await second.locator('.family-card__more').boundingBox()
    if (!words) throw new Error('no words')
    await page.mouse.move(words.x + words.width - 24, words.y + words.height - 24, { steps: 8 })
    expect(await isOpen(second)).toBe(true)
    await page.mouse.move(2, 2)
    await expect.poll(() => isOpen(second)).toBe(false)
  })

  test('a click on the picture opens the family’s page: the title’s link covers the card', async ({
    page,
  }) => {
    await openRow(page)
    const teamwear = FAMILY_PAGES.find((entry) => entry.familySlug === 'teamwear-uniforms')?.path
    // The second card is Teamwear's (`FAMILIES` order). A mouse press at its picture, as a person
    // makes it: Playwright's own click on the picture refuses, because the link covers it.
    const picture = await cards(page).nth(1).locator('.family-card__media').boundingBox()
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
    const first = cards(page).first()
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
    await expect.poll(() => isOpen(cards(page).nth(1))).toBe(true)
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await expect.poll(() => isOpen(first)).toBe(true)
  })

  test('Escape closes one the pointer opened, until the pointer leaves it', async ({ page }) => {
    await openRow(page)
    const third = cards(page).nth(2)
    await restOn(page, third)
    await expect.poll(() => isOpen(third)).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => isOpen(third)).toBe(false)
    await away(page)
    await restOn(page, third)
    await expect.poll(() => isOpen(third)).toBe(true)
  })
})

test.describe('the keyboard ring, drawn inside the card (F1)', () => {
  /*
   * In PIXELS. The audit's "a visible ring every time" had checked the style, and inside a card the
   * ring was cut off (F1). Each engine's screenshot is read 3px inside the card's left edge, halfway
   * down: the ring's colour there, and the card's own ground there when it has no focus. That spot is
   * the PICTURE's side, and it caught the ring's first version: drawn on the card, it had the right
   * style and showed round the words only, under the picture everywhere else.
   */
  for (const [label, width] of [
    ['in the row', 1440],
    ['sideways, on a phone', 390],
  ] as const) {
    test(`${label}: the ring shows inside the edge, and only with focus`, async ({
      page,
      browserName,
    }) => {
      await openRow(page, width)
      const first = cards(page).first()
      // The card itself in view: on a phone the five sideways cards are a tall column, and the grid's
      // scroll can leave the first one's middle off the screen.
      await first.scrollIntoViewIfNeeded()
      const pixel = async () => {
        const box = await first.locator('.family-card__face').boundingBox()
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
      // WebKit's Shift+Tab focused the element before the card and scrolled the page up 504px, and
      // the Tab back did not scroll down again, so the card's middle sat below the screen (2026-10-16).
      await first.scrollIntoViewIfNeeded()
      // Drawn by the link's stretched `::after`, which covers the card and is painted last.
      await expect
        .poll(() => link.evaluate((element) => getComputedStyle(element, '::after').outlineStyle))
        .toBe('solid')
      // Polled: reduced motion gives every property a 0.01ms transition (base.css), and a read
      // straight after the focus caught the offset still at 0px.
      await expect
        .poll(() => link.evaluate((element) => getComputedStyle(element, '::after').outlineOffset))
        .toBe('-4px')
      await expect.poll(pixel, { message: 'no ring drawn 3px inside the card' }).not.toBe(before)
      // The title's own ring would be a second one.
      expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none')
    })
  }
})

test.describe('everywhere else, the sideways card (M1; D44)', () => {
  // The owner, 2026-10-16: below 1440px an opened card's words were taller than its picture, so a
  // laptop that narrow gets the cards a tablet gets, two a row, nothing waiting to be opened.
  test('a 1280px laptop with a pointer: two sideways cards a row, the fifth across both', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true)
    const all = (await boxes(page)).map(([width]) => width ?? 0)
    expect(all[0]).toBe(all[1])
    expect(all[4] ?? 0).toBeGreaterThan(1.9 * (all[0] ?? 0))
    for (const card of await cards(page).all()) {
      await expect(card.locator('.family-card__title')).toBeVisible()
      expect(
        await card
          .locator('.family-card__under')
          .evaluate((under) => getComputedStyle(under).display),
      ).toBe('none')
    }
    expect(await sideways(page)).toBe(0)
  })

  test('a phone: one card a row, its picture left, and on the right its name, list and way in', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const grid = await page
      .locator('.family-grid')
      .evaluate((element) => element.getBoundingClientRect().width)
    for (const [width] of await boxes(page))
      expect(Math.abs((width ?? 0) - grid)).toBeLessThanOrEqual(1)
    const first = cards(page).first()
    const layout = await first.evaluate((card) => {
      const r = (selector: string) => card.querySelector(selector)?.getBoundingClientRect()
      const box = card.getBoundingClientRect()
      const media = r('.family-card__media')
      const title = r('.family-card__title')
      return {
        pictureShare: media ? media.width / box.width : 0,
        titleRightOfPicture: media && title ? title.left >= media.right : false,
        under: getComputedStyle(card.querySelector('.family-card__under') as Element).display,
        colour: getComputedStyle(card.querySelector('.family-card__colour') ?? card).display,
      }
    })
    expect(layout.pictureShare).toBeGreaterThan(0.35)
    expect(layout.pictureShare).toBeLessThan(0.45)
    expect(layout.titleRightOfPicture).toBe(true)
    // No line under the picture and no dots: the words beside it say everything (C2's phone).
    expect(layout.under).toBe('none')
    expect(layout.colour).toBe('none')
    await expect(first.locator('.family-card__desc')).toBeVisible()
    await expect(first.locator('.family-card__list')).toBeVisible()
    expect(await sideways(page)).toBe(0)
  })

  /*
   * Home page audit, 2026-10-17: a Pixel 7 downloaded the four "other colour" pictures (101 KB) that
   * only the row's opened card ever shows. Every request is watched from the first byte while the
   * page is scrolled past the cards; none may be for an other-colour picture. The control: the row
   * of five draws them (display: block, fetched once the row is in view), so this check can see one.
   */
  test('a phone never downloads the other-colour pictures; the row of five does', async ({
    page,
  }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'image') requested.push(request.url())
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    // Every address a picture may be fetched from: the browser picks one size from `srcset`, and the
    // first version of this check watched `src` alone, so it could not see the fetch it was for.
    // Split on ", " only: the resize addresses carry bare commas (`fit=scale-down,width=400`), and
    // `cardImage.ts` joins the sizes with a comma and a space.
    const addresses = (images: HTMLImageElement[]) =>
      images.flatMap((image) => [
        image.getAttribute('src') ?? '',
        ...(image.getAttribute('srcset') ?? '')
          .split(/,\s+/)
          .map((candidate) => candidate.trim().split(/\s+/)[0] ?? ''),
      ])
    const others = (await page.locator('.family-card__img--open').evaluateAll(addresses)).filter(
      Boolean,
    )
    test.skip(others.length === 0, 'no family here shows a second colour')
    await page.locator('.family-grid').scrollIntoViewIfNeeded()
    await page.locator('.proof').scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)
    const fetched = (address: string) => requested.some((url) => url.includes(address))
    expect(others.filter(fetched), 'other-colour pictures fetched on a phone').toEqual([])

    // The control, in the row of five, where they are drawn and so fetched.
    await openRow(page, 1440, false)
    await expect.poll(() => others.some(fetched), 'the row of five fetched none').toBe(true)
  })

  // Its own context: Firefox refuses a mobile one before a test could skip itself.
  test('a touch screen as wide as a computer gets the sideways cards, none waiting to be opened', async ({
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
      const all = (await boxes(page)).map(([width]) => width ?? 0)
      expect(all[0]).toBe(all[1])
      expect(all[4] ?? 0).toBeGreaterThan(1.9 * (all[0] ?? 0))
      await expect(cards(page).first().locator('.family-card__list')).toBeVisible()
      for (const card of await cards(page).all()) {
        expect(
          await card
            .locator('.family-card__under')
            .evaluate((under) => getComputedStyle(under).display),
        ).toBe('none')
      }
    } finally {
      await context.close()
    }
  })
})

test.describe('contrast, opened and closed, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe finds no contrast or naming fault in the row, one card open`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openRow(page)
      const second = cards(page).nth(1)
      await restOn(page, second)
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
