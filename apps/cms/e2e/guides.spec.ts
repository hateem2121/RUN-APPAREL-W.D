import { GUIDES } from '../src/lib/guides'
import { expect, type Page, test } from './offlineMedia'
import { hintedWidth } from './sizesHint'

/**
 * Polish X22 (audit of 3 October 2026: "Guides are walls of text"), drawn. The words and the markup
 * are unit-tested (`src/components/site/GuidePage.test.ts`, `src/lib/guides.test.ts`); this measures
 * what a browser makes of them: the printing guide's table on a 320px phone, each factory photo in
 * the half beside the words, the links at the end in two groups, and the guides index's cards.
 *
 * ⚠️ WITH REDUCED MOTION, as every layout suite here: a section's entrance moves it 24px while it
 * arrives (`data-site-reveal`), and a factory photo's drift scales it 1.12 times while it scrolls
 * (`.photo-parallax`), so a box measured with motion on is not the layout box.
 *
 * Each check is also run against a fault planted on purpose, and must fail on it.
 */

const PRINTING = '/guides/garment-printing-methods'
const WITH_PHOTOS = GUIDES.filter((guide) => guide.sections.some((section) => section.photo)).map(
  (guide) => guide.path,
)

async function open(page: Page, path: string, width: number, extraCss?: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  await page.goto(path)
  if (extraCss) await page.addStyleTag({ content: extraCss })
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

/** How the printing guide's table sits on the page, and anything in it that does not fit. */
const tableFit = (page: Page) =>
  page.evaluate(() => {
    const table = document.querySelector<HTMLTableElement>('main table.guide-table')
    const column = table?.closest('.site-container')
    if (!table || !column) return null
    const columnBox = column.getBoundingClientRect()
    const contentRight = columnBox.right - Number.parseFloat(getComputedStyle(column).paddingRight)
    const cells = [...table.querySelectorAll<HTMLElement>('caption, th, td')]
    return {
      pageScrollsSideways:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pastTheColumn: table.getBoundingClientRect().right - contentRight,
      clipped: cells
        .filter((cell) => cell.scrollWidth > cell.clientWidth + 1)
        .map((cell) => cell.textContent?.trim() ?? ''),
      smallest: Math.min(
        ...cells.map((cell) => Number.parseFloat(getComputedStyle(cell).fontSize)),
      ),
      rows: table.tBodies[0]?.rows.length ?? 0,
    }
  })

test.describe('X22 — the printing guide’s table fits a phone', () => {
  for (const width of [320, 390, 1440]) {
    test(`at ${width}px: inside the column, nothing cut, no sideways scroll`, async ({ page }) => {
      await open(page, PRINTING, width)
      const fit = await tableFit(page)
      expect(fit, 'no table on the printing guide').not.toBeNull()
      expect(fit?.rows, 'the table has lost its rows').toBe(7)
      expect(fit?.pageScrollsSideways, 'the page scrolls sideways').toBe(false)
      expect(fit?.pastTheColumn ?? 99, 'the table runs past the column').toBeLessThanOrEqual(0.5)
      expect(fit?.clipped, 'a cell is cut').toEqual([])
      // Read, so 12px or more (VA-11): the column headers are the smallest text in it.
      expect(fit?.smallest ?? 0).toBeGreaterThanOrEqual(12)
    })
  }

  test('NEGATIVE CONTROL: a table wider than the phone is caught', async ({ page }) => {
    await open(page, PRINTING, 320, '.guide-table { min-width: 600px; max-width: none; }')
    expect((await tableFit(page))?.pastTheColumn ?? 0).toBeGreaterThan(100)
  })
})

/** Where each section's photo is drawn, against its heading and the words beside it. */
const photoPlaces = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main .spread__head')].map((head) => {
      const heading = head.querySelector('h2')?.getBoundingClientRect()
      const figure = head.querySelector('figure')?.getBoundingClientRect()
      const body = head.parentElement?.querySelector('.spread__body')?.getBoundingClientRect()
      return {
        section: head.querySelector('h2')?.textContent?.trim() ?? '',
        // From 900px: the photo starts where the heading starts and stops before the words.
        alignedLeft: heading && figure ? Math.abs(figure.left - heading.left) : 99,
        roomBeforeWords: body && figure ? body.left - figure.right : -99,
        // On a phone: heading, then photo, then words, top to bottom.
        belowHeading: heading && figure ? figure.top - heading.bottom : -99,
        wordsBelowPhoto: body && figure ? body.top - figure.bottom : -99,
        drawnWidth: figure?.width ?? 0,
      }
    }),
  )

test.describe('X22 — a factory photo in the heading’s half, beside the words', () => {
  for (const path of WITH_PHOTOS) {
    test(`${path} at 1440px: under the heading, 64px clear of the words`, async ({ page }) => {
      await open(page, path, 1440)
      const places = await photoPlaces(page)
      expect(places.length, 'no section with a photo').toBe(1)
      for (const place of places) {
        expect(place.alignedLeft, place.section).toBeLessThanOrEqual(0.5)
        expect(place.roomBeforeWords, place.section).toBeGreaterThanOrEqual(63.5)
        expect(place.belowHeading, place.section).toBeGreaterThan(0)
        expect(place.drawnWidth, place.section).toBeGreaterThan(400)
      }
    })

    test(`${path} at 390px: heading, photo, then the words`, async ({ page }) => {
      await open(page, path, 390)
      for (const place of await photoPlaces(page)) {
        expect(place.belowHeading, place.section).toBeGreaterThan(0)
        expect(place.wordsBelowPhoto, place.section).toBeGreaterThan(0)
      }
    })
  }

  test('NEGATIVE CONTROL: a photo pushed into the words’ half is caught', async ({ page }) => {
    await open(page, PRINTING, 1440, '.spread__head > .photo-figure { width: 160%; }')
    const [place] = await photoPlaces(page)
    expect(place?.roomBeforeWords ?? 99).toBeLessThan(63.5)
  })

  /*
   * A browser picks the photo's file from its `sizes` before layout, so a hint smaller than the box
   * hands a sharp screen a file to stretch (polish D1's check, `e2e/homePicture.spec.ts`).
   */
  for (const width of [390, 899, 900, 1179, 1279, 1280, 1439, 1440, 1919, 1920, 2560]) {
    test(`at ${width}px each guide photo asks for at least what it draws`, async ({ page }) => {
      const misses: string[] = []
      for (const path of WITH_PHOTOS) {
        await open(page, path, width)
        const pictures = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLImageElement>('main .spread__head img[sizes]')].map(
            (img) => ({ sizes: img.sizes, drawn: img.getBoundingClientRect().width }),
          ),
        )
        expect(pictures.length, `${path}: no photo with a sizes hint`).toBe(1)
        for (const picture of pictures) {
          const hinted = await hintedWidth(page, picture.sizes)
          if (!(hinted >= picture.drawn - 0.5)) {
            misses.push(`${path}: asks ${hinted.toFixed(1)}, draws ${picture.drawn.toFixed(1)}`)
          }
        }
      }
      expect(misses).toEqual([])
    })
  }
})

/** The two groups at the end of a guide: where each sits, and any link under the 44px floor. */
const endGroups = (page: Page) =>
  page.evaluate(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('main .see-also__group')]
    return {
      titles: groups.map((group) => group.querySelector('h3')?.textContent?.trim() ?? ''),
      boxes: groups.map((group) => {
        const box = group.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
      }),
      // 43.95, not 44: `navbar.spec.ts` measured 3.1e-5px lost to floating point at fractional tops.
      small: [...document.querySelectorAll<HTMLElement>('main .see-also__list a')]
        .filter((link) => link.getBoundingClientRect().height < 43.95)
        .map((link) => link.textContent?.trim() ?? ''),
      links: document.querySelectorAll('main .see-also__list a').length,
    }
  })

/*
 * Three groups since 2026-10-07 (PLAN.md Task 3.4): "Answers" — the guide's FAQ topic, all the
 * questions and the glossary — joins the two of polish X22, in the same row.
 */
test.describe('X22 — the end of a guide: three labelled groups', () => {
  test('at 1440px side by side, every link 44px tall', async ({ page }) => {
    await open(page, PRINTING, 1440)
    const end = await endGroups(page)
    expect(end.titles).toEqual(['Buyer guides', 'What we make', 'Answers'])
    const [guides, families, answers] = end.boxes
    expect(Math.abs((guides?.top ?? 0) - (families?.top ?? 99))).toBeLessThanOrEqual(0.5)
    expect(Math.abs((families?.top ?? 0) - (answers?.top ?? 99))).toBeLessThanOrEqual(0.5)
    expect((families?.left ?? 0) - (guides?.right ?? 0)).toBeGreaterThanOrEqual(63.5)
    expect((answers?.left ?? 0) - (families?.right ?? 0)).toBeGreaterThanOrEqual(63.5)
    expect(end.links).toBeGreaterThanOrEqual(14)
    expect(end.small).toEqual([])
  })

  test('at 390px one above the other, every link 44px tall', async ({ page }) => {
    await open(page, PRINTING, 390)
    const end = await endGroups(page)
    const [guides, families] = end.boxes
    expect((families?.top ?? 0) - (guides?.bottom ?? 0)).toBeGreaterThan(0)
    expect(end.small).toEqual([])
  })

  test('NEGATIVE CONTROL: links without their 44px rows are caught', async ({ page }) => {
    await open(page, PRINTING, 390, '.see-also__list a { min-height: 0 !important; }')
    expect((await endGroups(page)).small.length).toBeGreaterThan(0)
  })
})

test.describe('X22 — the guides index uses the width', () => {
  /** The card grid's width against the column's content box. */
  const gridGap = (page: Page) =>
    page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('main .guide-grid')
      const column = grid?.closest('.site-container')
      if (!grid || !column) return null
      const style = getComputedStyle(column)
      const content =
        column.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      return content - grid.getBoundingClientRect().width
    })

  for (const width of [1280, 1440, 1920]) {
    test(`at ${width}px the cards fill the column, and the families have a heading`, async ({
      page,
    }) => {
      await open(page, '/guides', width)
      expect(await gridGap(page), 'the cards leave part of the column empty').toBeLessThanOrEqual(
        0.5,
      )
      await expect(
        page
          .getByRole('navigation', { name: 'What we make' })
          .getByRole('heading', { level: 2, name: 'What we make' }),
      ).toBeVisible()
    })
  }

  test('NEGATIVE CONTROL: a grid held to 60% of the column is caught', async ({ page }) => {
    await open(page, '/guides', 1440, '.guide-grid { max-width: 60%; }')
    expect((await gridGap(page)) ?? 0).toBeGreaterThan(400)
  })
})
