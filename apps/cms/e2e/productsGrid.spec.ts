import { CARD_SIZES } from '../src/lib/cardImage'
import { nameSegments } from '../src/lib/cardName'
import { expect, type Page, test } from './offlineMedia'
import { hintedWidth } from './sizesHint'

/**
 * VA-42 (visual audit, owner's choice 2026-10-02): /products on a phone ran to 36 screens because
 * each card was a screen tall, no garment was in sight on the first screen (the heading, the intro
 * and three rows of filters filled it), and at 1440px the 40 cards left one card alone on the last
 * row. Now: two cards a row on a phone with a square picture, the filters in one row that scrolls
 * sideways, and no card alone on the last row at any width. Decision D1 stands: one long page.
 * `src/productGridOrphans.test.ts` runs the last-row rule over every count from 2 to 60; this does
 * it with real cards, in a real engine.
 *
 * ⚠️ THE CARDS ARE COPIED IN THE BROWSER. CI's seed holds ONE garment (the same reason
 * `pages.spec.ts` skips whole blocks), and the live catalogue holds 40, so a test that waited for
 * the right number of cards would test nothing here and something different there. Copying the
 * first card to reach any count tests the stylesheet against 2, 6, 37 or 41 cards on every
 * machine; the copies are only measured, never clicked.
 *
 * What would have to break for these to fail: one card to a row again on a phone, the filter row
 * wrapping back into rows (or, worse, making the PAGE scroll sideways), a colour dot pushed off a
 * 134px card where it cannot be tapped, a long name clipped by its card or broken mid-word, or a
 * card alone with a hole beside it when the count is one more than a row.
 */

const PHONES = [320, 390, 430] as const

/** The first card, copied until the grid holds `count`. Returns false when there is no card to copy. */
async function fill(page: Page, count: number): Promise<boolean> {
  return page.evaluate((target) => {
    const grid = document.querySelector('.product-grid')
    const first = grid?.querySelector('.product-card')
    if (!grid || !first) return false
    while (grid.children.length > 1) grid.lastElementChild?.remove()
    while (grid.children.length < target) grid.append(first.cloneNode(true))
    return true
  }, count)
}

async function open(page: Page, width: number, height = 844) {
  await page.setViewportSize({ width, height })
  await page.goto('/products')
  // The control that the gallery exists. CI seeds a garment, so a missing grid there is the
  // regression, not an empty catalogue; a local database with none may skip.
  if ((await page.locator('.product-grid .product-card').count()) === 0) {
    if (process.env.CI) throw new Error('no card on /products, and CI seeds one')
    test.skip(true, 'no garment in this local database')
  }
}

type Box = { left: number; top: number; right: number; bottom: number }

async function cardBoxes(page: Page): Promise<{ grid: Box & { width: number }; cards: Box[] }> {
  return page.evaluate(() => {
    const box = (element: Element): Box => {
      const { left, top, right, bottom } = element.getBoundingClientRect()
      return { left, top, right, bottom }
    }
    const grid = document.querySelector('.product-grid') as HTMLElement
    return {
      grid: { ...box(grid), width: grid.getBoundingClientRect().width },
      cards: [...grid.children].map(box),
    }
  })
}

/** Cards grouped into rows by their top edge. */
const rowsOf = (cards: Box[]): Box[][] => {
  const rows: Box[][] = []
  for (const card of [...cards].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows[rows.length - 1]
    if (row && Math.abs((row[0] as Box).top - card.top) <= 2) row.push(card)
    else rows.push([card])
  }
  return rows
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('VA-42 — two cards a row on a phone, with a square picture', () => {
  for (const width of PHONES) {
    test(`at ${width}px: two columns, two cards on each row, each picture square, no sideways page scroll`, async ({
      page,
    }) => {
      await open(page, width)
      await fill(page, 6)
      const columns = await page
        .locator('.product-grid')
        .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length)
      expect(columns, `${width}px: the grid has ${columns} columns`).toBe(2)

      const { grid, cards } = await cardBoxes(page)
      const rows = rowsOf(cards)
      expect(
        rows.map((row) => row.length),
        `${width}px: cards on each row`,
      ).toEqual([2, 2, 2])
      for (const row of rows) {
        const [left, right] = row as [Box, Box]
        expect(
          Math.abs(left.right - left.left - (right.right - right.left)),
          'the two cards differ in width',
        ).toBeLessThanOrEqual(1)
        expect(left.left, 'the first card is off the column').toBeGreaterThanOrEqual(grid.left - 1)
        expect(right.right, 'the second card is off the column').toBeLessThanOrEqual(grid.right + 1)
      }

      const pictures = await page.locator('.product-card__figure').evaluateAll((all) =>
        all.map((figure) => {
          const { width: w, height: h } = figure.getBoundingClientRect()
          return { w, h }
        }),
      )
      for (const [index, picture] of pictures.entries()) {
        expect(
          Math.abs(picture.w - picture.h),
          `card ${index + 1}: picture ${picture.w} x ${picture.h}`,
        ).toBeLessThanOrEqual(1)
      }
      expect(
        await noSidewaysScroll(page),
        `${width}px: the page scrolls sideways`,
      ).toBeLessThanOrEqual(0)
    })
  }

  /*
   * "VISIBLE" MEANS MOST OF THE PICTURE, NOT ITS TOP EDGE: at least 70% of the first card's picture is
   * inside the 844px screen. The audit's wording was "no garment is visible on the first screen"; a
   * picture whose top edge peeks in at the foot of the screen would pass a weaker test and still show
   * no garment. The numbers are recorded on every run (the annotation), so a drift towards the line
   * is visible long before it crosses it. Worked out from the stylesheet, the picture ends near 700px.
   */
  test('at 390x844 most of a garment picture is on the first screen', async ({
    page,
  }, testInfo) => {
    await open(page, 390, 844)
    const first = page.locator('.product-card__figure').first()
    const box = await first.boundingBox()
    if (!box) throw new Error('the first card has no picture')
    const visible = Math.max(0, Math.min(box.y + box.height, 844) - Math.max(box.y, 0))
    testInfo.annotations.push({
      type: 'first card picture',
      description: `top ${Math.round(box.y)}px, bottom ${Math.round(box.y + box.height)}px of an 844px screen: ${Math.round((visible / box.height) * 100)}% visible`,
    })
    expect(box.y, 'the picture starts above the screen').toBeGreaterThanOrEqual(0)
    expect(
      visible / box.height,
      'less than 70% of the first picture is on the first screen',
    ).toBeGreaterThanOrEqual(0.7)
  })

  test('the card’s own parts still work at 390px: the dots fit the card, stay tappable and change the colour', async ({
    page,
  }) => {
    await open(page, 390)
    const card = page.locator('.product-card', { has: page.locator('.card-gallery__dot') }).first()
    if ((await card.count()) === 0) test.skip(true, 'no card with more than one colour here')
    const measured = await card.evaluate((element) => {
      const frame = element.getBoundingClientRect()
      const dots = [...element.querySelectorAll('.card-gallery__dot')].map((dot) => {
        const { left, right, top, width, height } = dot.getBoundingClientRect()
        return { left, right, top, width, height }
      })
      return { frame: { left: frame.left, right: frame.right }, dots }
    })
    expect(measured.dots.length, 'the card has no dots').toBeGreaterThan(1)
    for (const dot of measured.dots) {
      // WCAG 2.2 SC 2.5.8 asks 24 x 24 at least; the site holds every button to 44px tall.
      expect(dot.width, 'a dot is under 24px wide').toBeGreaterThanOrEqual(23.95)
      expect(dot.height, 'a dot is under 44px tall').toBeGreaterThanOrEqual(43.95)
      expect(dot.left, 'a dot is past the card’s left edge').toBeGreaterThanOrEqual(
        measured.frame.left,
      )
      expect(dot.right, 'a dot is past the card’s right edge').toBeLessThanOrEqual(
        measured.frame.right,
      )
    }
    // Up to five colours share one row; more would wrap, which is not what a five-colour card does.
    if (measured.dots.length <= 5) {
      expect(
        new Set(measured.dots.map((dot) => Math.round(dot.top))).size,
        'the dots are on two rows',
      ).toBe(1)
    }

    // A tap on the second dot shows the second colour. Clicks need the card's script.
    const second = card.locator('.card-gallery__dot').nth(1)
    await page.waitForFunction(
      (el) => !!el && Object.keys(el).some((key) => key.startsWith('__reactProps')),
      await second.elementHandle(),
    )
    await second.click()
    await expect(second).toHaveAttribute('aria-pressed', 'true')
  })

  test('at 320px a long name wraps inside its card, a long colour wraps, and nothing makes the page scroll sideways', async ({
    page,
  }) => {
    await open(page, 320)
    await fill(page, 4)
    await page.evaluate(() => {
      const name = document.querySelector('.product-card__name')
      if (name) name.textContent = 'Compression-Tights-Performance-Pro'
      const colour = document.querySelector('.card-gallery__colour')
      if (colour) colour.textContent = 'LAVENDER / INDIGO'
    })
    const overflow = await page.evaluate(() => {
      const wide = (element: Element) => element.scrollWidth - element.clientWidth
      const name = document.querySelector('.product-card__name')
      const colour = document.querySelector('.card-gallery__colour')
      return {
        name: name ? wide(name) : 0,
        colour: colour ? wide(colour) : 0,
        cards: [...document.querySelectorAll('.product-card')].map(wide),
      }
    })
    expect(overflow.name, 'the name runs past its box').toBeLessThanOrEqual(1)
    expect(overflow.colour, 'the colour name runs past its box').toBeLessThanOrEqual(1)
    expect(Math.max(...overflow.cards), 'a card clips something sideways').toBeLessThanOrEqual(1)
    expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('VA-42 — on a phone a garment name shrinks rather than split a word', () => {
  /*
   * The live catalogue's longest words (its 40 names, read off wear-run.com/products on 2026-10-02),
   * in names that use them. PERFORMANCE is the widest: 140.1px at 18px on a Mac and 139.0px in CI's
   * Linux, against 108px of card at 320px. At a fixed 18px, eight of these words broke mid-word at
   * 320px, three or four at 375, and V-NECK and ZIP-UP at their hyphen at 390; CI's seeded name
   * caught one of them. Each name is set the way the card renders it, through `nameSegments`: its
   * words, every hyphenated one in a `.product-card__word` (site.css, `.product-card__name`).
   */
  const NAMES = [
    'PERFORMANCE WINDBREAKER JACKET',
    'METRO-SHIELD SWEATSHIRT',
    'CLASSIC V-NECK ZIP-UP TEE',
    'SCUBA-NECK ARMOR-TECH AGGRESSOR',
    'ENDURANCE HYDRA-FIT SKIN-SUIT',
  ]

  /** Each name in turn in the first card's heading: the words a line breaks, and any overflow. */
  const brokenWords = (page: Page) =>
    page.evaluate((names) => {
      const heading = document.querySelector('.product-card__name') as HTMLElement
      const broken: string[] = []
      let overflow = 0
      for (const segments of names) {
        heading.replaceChildren(
          ...segments.map((part) => {
            if (!part.whole) return document.createTextNode(part.text)
            const word = document.createElement('span')
            word.className = 'product-card__word'
            word.textContent = part.text
            return word
          }),
        )
        overflow = Math.max(overflow, heading.scrollWidth - heading.clientWidth)
        // A word is broken when its letters sit on more than one line (the TY-12 detector).
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.nodeValue ?? ''
          const words = /\S+/g
          for (let match = words.exec(value); match; match = words.exec(value)) {
            const range = document.createRange()
            range.setStart(node, match.index)
            range.setEnd(node, match.index + match[0].length)
            const tops = new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 0)
                .map((rect) => Math.round(rect.top)),
            )
            if (tops.size > 1) broken.push(match[0])
          }
        }
      }
      return { broken, overflow, size: getComputedStyle(heading).fontSize }
    }, NAMES.map(nameSegments))

  for (const width of [320, 340, 360, 375, 390, 414, 430]) {
    test(`at ${width}px no word of a long name breaks, and no name runs past its card`, async ({
      page,
    }, testInfo) => {
      await open(page, width)
      await page.evaluate(() => document.fonts.ready)
      const { broken, overflow, size } = await brokenWords(page)
      testInfo.annotations.push({ type: 'name size', description: `${size} at ${width}px` })
      expect(broken, `${width}px: words broken across two lines`).toEqual([])
      expect(overflow, `${width}px: a name runs past its card`).toBeLessThanOrEqual(1)
    })
  }

  test('the check sees a broken word: the same names at a fixed 18px break at 320px (negative control)', async ({
    page,
  }) => {
    await open(page, 320)
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({
      content: '.product-card__body .product-card__name { font-size: 18px !important }',
    })
    const { broken } = await brokenWords(page)
    expect(broken, broken.join(', ')).toContain('PERFORMANCE')
  })
})

test.describe('VA-42 — the filters are one row that scrolls sideways on a phone', () => {
  for (const width of PHONES) {
    test(`at ${width}px: one row, a sideways scroller, 44px chips, and the page itself does not scroll sideways`, async ({
      page,
    }) => {
      await open(page, width)
      const bar = page.locator('.filter-bar--scroll')
      await expect(bar).toHaveCount(1)
      const measured = await bar.evaluate((element) => {
        const style = getComputedStyle(element)
        const chips = [...element.querySelectorAll('.filter-chip')].map((chip) => {
          const { top, height } = chip.getBoundingClientRect()
          return { top, height }
        })
        return {
          wrap: style.flexWrap,
          overflowX: style.overflowX,
          scrolls: element.scrollWidth > element.clientWidth,
          chips,
        }
      })
      expect(measured.wrap, 'the chips wrap into rows').toBe('nowrap')
      expect(measured.overflowX).toBe('auto')
      expect(measured.chips.length, 'the family chips are missing').toBeGreaterThanOrEqual(6)
      const tops = measured.chips.map((chip) => chip.top)
      expect(
        Math.max(...tops) - Math.min(...tops),
        'the chips are not on one row',
      ).toBeLessThanOrEqual(1)
      expect(measured.scrolls, 'the row does not scroll: it is wider than nothing').toBe(true)
      for (const chip of measured.chips)
        expect(chip.height, 'a chip is under 44px tall').toBeGreaterThanOrEqual(43.95)
      expect(
        await noSidewaysScroll(page),
        `${width}px: the page scrolls sideways`,
      ).toBeLessThanOrEqual(0)
    })

    test(`at ${width}px: the keyboard reaches the last chip, the row scrolls to it and the page stays put`, async ({
      page,
    }) => {
      await open(page, width)
      const last = page.locator('.filter-bar--scroll .filter-chip').last()
      await last.focus()
      const state = await page.evaluate(() => {
        const bar = document.querySelector('.filter-bar--scroll') as HTMLElement
        const chip = document.activeElement as HTMLElement
        const { left, right } = chip.getBoundingClientRect()
        return {
          focused: chip.classList.contains('filter-chip'),
          barScroll: bar.scrollLeft,
          left,
          right,
          width: document.documentElement.clientWidth,
          pageScroll: window.scrollX,
        }
      })
      expect(state.focused, 'the last chip did not take focus').toBe(true)
      expect(state.barScroll, 'the row did not scroll to the focused chip').toBeGreaterThan(0)
      expect(state.left, 'the focused chip is off the left edge').toBeGreaterThanOrEqual(-1)
      expect(state.right, 'the focused chip is off the right edge').toBeLessThanOrEqual(
        state.width + 1,
      )
      expect(state.pageScroll, 'focusing a chip scrolled the PAGE sideways').toBe(0)
      expect(await noSidewaysScroll(page)).toBeLessThanOrEqual(0)
    })
  }

  test('from 560px the chips wrap again, as they always did', async ({ page }) => {
    await open(page, 700, 900)
    const wrap = await page
      .locator('.filter-bar--scroll')
      .evaluate((element) => getComputedStyle(element).flexWrap)
    expect(wrap).toBe('wrap')
  })
})

test.describe('VA-42 — no card is left alone on the last row, at any width', () => {
  /*
   * 40 is the audit's own count (3 x 13 + 1 at 1440px, which had three columns then; four since the
   * owner's call of 2026-10-02, so three are checked at 1280px); 37 and 41 are one-over a row at
   * three and four columns, and 41 at five too (from 1920px since polish D1); 38 and 39 are the
   * counts either side. The phone is held to the weaker promise two columns can keep: two cards, or
   * one card that fills the row.
   */
  const COUNTS = [37, 38, 39, 40, 41]

  for (const { width, columns } of [
    { width: 1280, columns: 3 },
    { width: 1440, columns: 4 },
    { width: 1919, columns: 4 },
    { width: 1920, columns: 5 },
  ]) {
    test(`at ${width}px (${columns} columns): the last row holds two cards or more, for ${COUNTS.join(', ')} cards`, async ({
      page,
    }) => {
      await open(page, width, 1000)
      for (const count of COUNTS) {
        await fill(page, count)
        const { cards } = await cardBoxes(page)
        const rows = rowsOf(cards)
        const last = rows[rows.length - 1] ?? []
        expect(cards.length, 'the copy did not reach the count').toBe(count)
        expect(
          last.length,
          `${count} cards at ${width}px: the last row holds ${last.length}`,
        ).toBeGreaterThanOrEqual(2)
        // Nothing above the last two rows has a hole in it.
        for (const row of rows.slice(0, -2))
          expect(row.length, `${count} cards: a row above the end is not full`).toBe(columns)
      }
    })
  }

  test('at 390px (two columns): the last row holds two cards, or one card that lies down across the row', async ({
    page,
  }) => {
    await open(page, 390)
    for (const count of COUNTS) {
      await fill(page, count)
      const { grid, cards } = await cardBoxes(page)
      const rows = rowsOf(cards)
      const last = rows[rows.length - 1] ?? []
      if (last.length === 1) {
        const [card] = last as [Box]
        expect(
          card.right - card.left,
          `${count} cards: the lone last card leaves a hole beside it`,
        ).toBeGreaterThanOrEqual(grid.width - 2)
      } else {
        expect(last.length, `${count} cards`).toBe(2)
      }
    }
  })

  test('at 390px the odd last card lies down: its picture on the left and its words on the right, the picture no wider than half', async ({
    page,
  }) => {
    await open(page, 390)
    await fill(page, 5)
    const parts = await page.evaluate(() => {
      const last = document.querySelector('.product-grid > .product-card:last-child') as HTMLElement
      const grab = (selector: string) => {
        const element = last.querySelector(selector)
        if (!element) throw new Error(`the last card has no ${selector}`)
        const { left, right, top, bottom } = element.getBoundingClientRect()
        return { left, right, top, bottom }
      }
      const first = document.querySelector('.product-card__figure')?.getBoundingClientRect()
      return {
        card: last.getBoundingClientRect().width,
        figure: grab('.product-card__figure'),
        words: grab('.product-card__link'),
        neighbour: first ? first.width : 0,
      }
    })
    expect(parts.words.left, 'the words are not beside the picture').toBeGreaterThanOrEqual(
      parts.figure.right - 1,
    )
    expect(
      Math.abs(parts.words.top - parts.figure.top),
      'the words do not start at the picture’s top',
    ).toBeLessThanOrEqual(1)
    // The same size of picture as its neighbours', give or take the borders.
    expect(
      Math.abs(parts.figure.right - parts.figure.left - parts.neighbour),
      'the picture is not neighbour-sized',
    ).toBeLessThanOrEqual(12)
  })

  test('a single card on a page is left as it is, half the row, not stretched', async ({
    page,
  }) => {
    await open(page, 390)
    await fill(page, 1)
    const { grid, cards } = await cardBoxes(page)
    expect(cards).toHaveLength(1)
    const [card] = cards as [Box]
    expect(card.right - card.left, 'a single card was stretched across the row').toBeLessThan(
      grid.width * 0.6,
    )
  })
})

test.describe('a card never asks for a smaller picture than it draws (polish D1)', () => {
  /*
   * The page widened (1440px from a 1280px screen, 1600px from 1920px) and a fifth column came in,
   * so the card's width changed at every computer size while `sizes` still said 340px: between 1280
   * and 1439px a card draws 368-421px, and a sharp screen would have been handed the 720px file for
   * a card needing 842. The browser chooses a file from this hint alone, so the hint has to follow
   * the card. CI's seed stores its pictures locally, so its cards carry no `sizes` at all
   * (`cardImage` resizes only the media host's pictures); the hint is therefore checked against
   * real cards here, not read off them.
   * What would have to break for this to fail: a column count or the page's width changing without
   * `CARD_SIZES` (src/lib/cardImage.ts) following, in either direction (past 40% too large).
   */
  for (const width of [390, 899, 900, 1179, 1279, 1280, 1439, 1440, 1919, 1920, 2560]) {
    test(`at ${width}px`, async ({ page }) => {
      await open(page, width, 900)
      await fill(page, 6)
      const drawn = await page
        .locator('.product-grid .product-card__figure')
        .first()
        .evaluate((figure) => figure.getBoundingClientRect().width)
      const hinted = await hintedWidth(page, CARD_SIZES)
      const said = `${width}px: asks for ${hinted}px, the card draws ${drawn}px`
      expect(hinted, said).toBeGreaterThanOrEqual(drawn - 0.5)
      expect(hinted, said).toBeLessThanOrEqual(drawn * 1.4)
    })
  }
})
