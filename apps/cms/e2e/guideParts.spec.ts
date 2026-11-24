import { guideAt } from '../src/lib/guides'
import { expect, type Page, test } from './offlineMedia'
import { scriptsHaveRun } from './pageReady'

/**
 * The guides audit of 23 and 24 November 2026, drawn. The markup is unit-tested
 * (`src/components/site/GuideParts.test.ts`); this measures what a browser makes of it: the list
 * of a guide's parts and where a jump lands, the label as the way back, the in-text links' lines,
 * headings and tables with the reader's text size doubled, the Russian list's headline, and a
 * link's card for a mouse and for the keyboard.
 *
 * ⚠️ WITH REDUCED MOTION where a box is measured, as every layout suite here (guides.spec.ts says
 * why). Each check is also run against a fault planted on purpose, and must fail on it.
 */

const BALLS = '/guides/how-soccer-balls-are-made'
const SHIPPING = '/guides/shipping-and-import-duties'
const FIBERS = '/guides/sportswear-fibers'

async function open(page: Page, path: string, width: number, height = 900, extraCss?: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height })
  await page.goto(path)
  if (extraCss) await page.addStyleTag({ content: extraCss })
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

test.describe('"On this page" on a guide', () => {
  const list = (page: Page) =>
    page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLElement>('.guide-toc a')]
      const lede = document.querySelector('.site-hero .site-lede')?.getBoundingClientRect()
      const byline = document.querySelector('.site-hero .page-byline')?.getBoundingClientRect()
      const nav = document.querySelector('.guide-toc')?.getBoundingClientRect()
      const words = document.querySelector('main .spread__body')?.getBoundingClientRect()
      return {
        links: links.length,
        shortest: Math.min(...links.map((link) => link.getBoundingClientRect().height)),
        // Under the byline on a phone; beside the lede, starting level with it, on a computer.
        navTop: nav?.top ?? Number.NaN,
        navLeft: nav?.left ?? Number.NaN,
        ledeTop: lede?.top ?? Number.NaN,
        ledeBottom: lede?.bottom ?? Number.NaN,
        bylineTop: byline?.top ?? Number.NaN,
        bylineBottom: byline?.bottom ?? Number.NaN,
        wordsLeft: words?.left ?? Number.NaN,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

  for (const path of [BALLS, SHIPPING]) {
    const parts = guideAt(path).sections.length + (guideAt(path).sources ? 1 : 0)

    test(`${path} at 390px: every part listed under the byline, each row 44px`, async ({
      page,
    }) => {
      await open(page, path, 390, 844)
      const m = await list(page)
      expect(m.links).toBe(parts)
      expect(m.shortest, 'a row under 44px').toBeGreaterThanOrEqual(43.95)
      expect(m.navTop, 'the list is not under the byline').toBeGreaterThanOrEqual(m.bylineBottom)
      expect(m.sideways).toBeLessThanOrEqual(0)
    })

    test(`${path} at 1440px: beside the lede, on the words' own line, the byline where it was`, async ({
      page,
    }) => {
      await open(page, path, 1440)
      const m = await list(page)
      expect(m.links).toBe(parts)
      expect(m.shortest, 'a row under 44px').toBeGreaterThanOrEqual(43.95)
      // The list's own left edge is the words column's (`.spread`), where the sections start.
      expect(Math.abs(m.navLeft - m.wordsLeft), 'px off the words’ column').toBeLessThanOrEqual(1)
      expect(Math.abs(m.navTop - m.ledeTop), 'px below the lede’s top').toBeLessThanOrEqual(1)
      // A tall list gives its extra height to the row under the byline, never above it.
      expect(m.bylineTop - m.ledeBottom, 'px between the lede and the byline').toBeLessThanOrEqual(
        24.5,
      )
    })
  }

  const landing = (page: Page, hash: string) =>
    page.evaluate((id) => {
      const heading = document.getElementById(id)?.getBoundingClientRect()
      const bar = document.querySelector('.notch')?.getBoundingClientRect()
      return {
        hash: window.location.hash,
        headingTop: heading?.top ?? Number.NaN,
        barBottom: bar?.bottom ?? Number.NaN,
        screen: window.innerHeight,
      }
    }, hash)

  test('a jump lands its heading below the bar, on the screen', async ({ page }) => {
    await open(page, SHIPPING, 390, 844)
    const link = page.locator('.guide-toc a').nth(3)
    const href = (await link.getAttribute('href')) ?? ''
    await link.click()
    await expect.poll(async () => (await landing(page, href.slice(1))).hash).toBe(href)
    const m = await landing(page, href.slice(1))
    expect(m.headingTop, 'the heading is under the bar').toBeGreaterThanOrEqual(m.barBottom)
    expect(m.headingTop, 'the heading is off the screen').toBeLessThan(m.screen / 2)
  })

  test('NEGATIVE CONTROL: with no room kept for the bar the heading lands under it', async ({
    page,
  }) => {
    await open(page, SHIPPING, 390, 844, 'html { scroll-padding-top: 0 !important }')
    const link = page.locator('.guide-toc a').nth(3)
    const href = (await link.getAttribute('href')) ?? ''
    await link.click()
    await expect.poll(async () => (await landing(page, href.slice(1))).hash).toBe(href)
    const m = await landing(page, href.slice(1))
    expect(m.headingTop).toBeLessThan(m.barBottom)
  })

  test('NEGATIVE CONTROL: rows without their 44px are caught', async ({ page }) => {
    await open(page, BALLS, 390, 844, '.guide-toc a { min-height: 0 !important }')
    expect((await list(page)).shortest).toBeLessThan(43.95)
  })
})

test.describe('the guide’s label is the way back', () => {
  const label = (page: Page) =>
    page.evaluate(() => {
      const way = document.querySelector<HTMLElement>('.label__way')
      const chip = document.querySelector<HTMLElement>('.site-hero .label')
      const headline = document.querySelector<HTMLElement>('.site-hero h1')
      if (!way || !chip || !headline) throw new Error('the hero has no label link')
      const box = way.getBoundingClientRect()
      // Any other control whose box meets the link's: a tap there would be a coin toss.
      const overlapping = [...document.querySelectorAll<HTMLElement>('a[href], button')]
        .filter((other) => other !== way)
        .filter((other) => {
          const b = other.getBoundingClientRect()
          return (
            b.width > 1 &&
            b.height > 1 &&
            b.left < box.right &&
            b.right > box.left &&
            b.top < box.bottom &&
            b.bottom > box.top
          )
        })
        .map((other) => (other.textContent ?? '').trim().slice(0, 30))
      return {
        linkHeight: box.height,
        chipHeight: chip.getBoundingClientRect().height,
        gapToHeadline: headline.getBoundingClientRect().top - chip.getBoundingClientRect().bottom,
        fontSize: Number.parseFloat(getComputedStyle(chip).fontSize),
        overlapping,
      }
    })

  for (const width of [320, 390, 1440]) {
    test(`at ${width}px the link is 44px tall, the chip and the headline where they were`, async ({
      page,
    }) => {
      await open(page, BALLS, width)
      const m = await label(page)
      expect(m.linkHeight, 'the label link is under 44px').toBeGreaterThanOrEqual(43.95)
      // The chip itself is still a chip: its line and 4px above and below, not the link's reach.
      expect(m.chipHeight).toBeLessThan(30)
      expect(m.fontSize, 'the label is under 12px').toBeGreaterThanOrEqual(12)
      expect(m.overlapping, 'another control is within the link’s reach').toEqual([])
    })
  }

  test('it goes to the list of guides', async ({ page }) => {
    await open(page, BALLS, 1440)
    await scriptsHaveRun(page)
    await page.locator('.label__way').click()
    await expect(page).toHaveURL(/\/guides$/)
  })

  test('NEGATIVE CONTROL: a link the size of its words is caught', async ({ page }) => {
    await open(
      page,
      BALLS,
      390,
      900,
      '.label__way { padding-block: 0 !important; margin-block: 0 !important }',
    )
    expect((await label(page)).linkHeight).toBeLessThan(43.95)
  })
})

test.describe('a link inside a guide’s words is marked by a line a reader can see', () => {
  /** The line's colour over the page's ground, as a WCAG contrast ratio. */
  const lineContrast = (page: Page) =>
    page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('main a.prose__link')
      if (!link) throw new Error('no link in the guide’s words')
      // Paint each colour on a canvas, so any notation (`color(srgb …)`, `rgb()`) reads the same.
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('no canvas')
      const paint = (colors: string[]) => {
        context.clearRect(0, 0, 1, 1)
        for (const color of colors) {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
        }
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      const ground = getComputedStyle(document.body).backgroundColor
      const line = getComputedStyle(link).textDecorationColor
      const luminance = (rgb: number[]) => {
        const [r = 0, g = 0, b = 0] = rgb.map((value) => {
          const c = value / 255
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const a = luminance(paint([ground]))
      const b = luminance(paint([ground, line]))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })

  for (const scheme of ['light', 'dark'] as const) {
    test(`3:1 or more in the ${scheme} scheme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page, FIBERS, 1440)
      expect(await lineContrast(page)).toBeGreaterThanOrEqual(3)
    })
  }

  test('NEGATIVE CONTROL: the 45% line it had is under 3:1', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await open(
      page,
      FIBERS,
      1440,
      900,
      '.prose__link { text-decoration-color: color-mix(in srgb, currentColor 45%, transparent) !important }',
    )
    expect(await lineContrast(page)).toBeLessThan(3)
  })
})

/**
 * The reader's text size doubled (WCAG 1.4.4), set through the root as a browser's own setting
 * does (bigText.spec.ts). Measured on the live site, 23 Nov 2026: three English guides' headings
 * ran 15 to 47px past a 390px phone, and two English and nine Russian guides' tables 9 to 818px
 * past a 1440px screen.
 */
test.describe('twice-size text on a guide', () => {
  const sideways = async (page: Page, path: string, width: number, plant = '') => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    /*
     * ⚠️ THE TEXT SIZE IS SET BEFORE THE PAGE IS LAID OUT, AS A READER'S OWN SETTING IS. Added to a
     * page already on screen (`addStyleTag`, as bigText.spec.ts does for parts that need no query),
     * Firefox 157 kept a heading's old container-query answer in one load of two: the same guide
     * read 47px of sideways scroll with "duty-free?" still on one line, then 0px with it broken,
     * and three of this suite's checks failed in Firefox three runs out of three (24 Nov 2026). A
     * reader does not change the root size after the page is drawn; the browser applies it first.
     */
    await page.addInitScript((css) => {
      const add = () => {
        const style = document.createElement('style')
        style.textContent = css
        document.documentElement.append(style)
      }
      if (document.documentElement) add()
      else
        new MutationObserver((_records, observer) => {
          if (!document.documentElement) return
          observer.disconnect()
          add()
        }).observe(document, { childList: true })
    }, `html { font-size: 200% !important } ${plant}`)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    // Two frames after the fonts: the guide headline's font is `optional`, so its words settle late.
    await page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    )
    const applied = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    )
    expect(applied, 'the doubled text size did not apply, so nothing was measured').toBe(32)
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  const HEADINGS = [
    '/guides/shipping-and-import-duties',
    '/guides/yarn-count-and-denier',
    '/guides/apparel-design-software',
  ]
  const TABLES = [
    '/guides/sportswear-compliance-by-market',
    '/guides/what-sportswear-buyers-ask',
    '/ru/guides/apparel-design-software',
    '/ru/guides/apparel-manufacturing-machinery',
    '/ru/guides/apparel-manufacturing-technology',
    '/ru/guides/clothing-labels',
    '/ru/guides/how-to-vet-a-clothing-manufacturer',
    '/ru/guides/sportswear-compliance-by-market',
    '/ru/guides/sportswear-fibers',
    '/ru/guides/stitch-and-seam-types',
    '/ru/guides/what-sportswear-buyers-ask',
  ]

  for (const path of HEADINGS) {
    test(`${path} at 390px: a hyphenated heading word breaks, the page does not scroll sideways`, async ({
      page,
    }) => {
      expect(await sideways(page, path, 390), 'px of sideways scroll').toBeLessThanOrEqual(1)
    })
  }

  for (const path of TABLES) {
    test(`${path} at 1440px: a wide table stacks, the page does not scroll sideways`, async ({
      page,
    }) => {
      expect(await sideways(page, path, 1440), 'px of sideways scroll').toBeLessThanOrEqual(1)
    })
  }

  // Measured 24 Nov 2026 before the fix: 8, 31 and 28px of sideways scroll, each from one long
  // Russian word in a paragraph or a list.
  const LONG_WORDS = [
    '/ru/guides/sportswear-fabrics-and-weights',
    '/ru/guides/yarn-count-and-denier',
    '/ru/guides/tech-pack-template',
  ]
  for (const path of LONG_WORDS) {
    test(`${path} at 390px: a long word breaks, the page does not scroll sideways`, async ({
      page,
    }) => {
      expect(await sideways(page, path, 390), 'px of sideways scroll').toBeLessThanOrEqual(1)
    })
  }

  test('NEGATIVE CONTROL: a long word that may not break runs off the phone', async ({ page }) => {
    const spill = await sideways(
      page,
      '/ru/guides/yarn-count-and-denier',
      390,
      '.prose--guide .spread__body :is(p, li) { overflow-wrap: normal !important }',
    )
    expect(spill).toBeGreaterThan(1)
  })

  test('NEGATIVE CONTROL: a heading word held on one line runs off the phone', async ({ page }) => {
    const spill = await sideways(
      page,
      '/guides/shipping-and-import-duties',
      390,
      '.whole-word { white-space: nowrap !important }',
    )
    expect(spill).toBeGreaterThan(1)
  })

  test('NEGATIVE CONTROL: a wide table that cannot stack runs off the screen', async ({ page }) => {
    const spill = await sideways(
      page,
      '/guides/sportswear-compliance-by-market',
      1440,
      '.guide-table-wrap { container-type: normal !important }',
    )
    expect(spill).toBeGreaterThan(1)
  })

  test('at the default size a hyphenated heading word is still whole', async ({ page }) => {
    await open(page, '/guides/shipping-and-import-duties', 320)
    const split = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main .whole-word')]
        .filter((word) => word.getClientRects().length > 1)
        .map((word) => word.textContent ?? ''),
    )
    expect(split, 'a hyphenated word broke at its hyphen').toEqual([])
  })
})

test.describe('the Russian list of guides: a headline that does not jump', () => {
  const headlineFont = (page: Page) =>
    page.evaluate(() => {
      const headline = document.querySelector('.site-hero h1')
      if (!headline) throw new Error('no headline')
      return getComputedStyle(headline).fontFamily
    })

  test('its headline uses the fonts that never swap', async ({ page }) => {
    await open(page, '/ru/guides', 1440)
    const family = await headlineFont(page)
    expect(family.startsWith('"Archivo Optional"'), family).toBe(true)
    // ⚠️ Not the swapping family anywhere in the stack: a face that missed the first paint would
    // fall through to it and jump after all (site.css, "Archivo Optional").
    expect(family).not.toContain('Archivo Variable')
  })

  test('the English list is as it was', async ({ page }) => {
    await open(page, '/guides', 1440)
    expect(await headlineFont(page)).toContain('Archivo Variable')
  })
})

test.describe('a link’s card says where it goes', () => {
  // The card's code arrives after the page is idle (LinkPreview.tsx); a link met before then is a
  // plain link, so each check waits for the page's own signal first.
  const cardsReady = async (page: Page) => {
    await scriptsHaveRun(page)
    await expect(page.locator('html')).toHaveAttribute('data-link-cards', 'ready')
  }
  const first = (page: Page) => page.locator('main a.prose__link[href^="/guides/"]').first()

  test('a mouse resting on a guide link opens that guide’s title and description beside it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(FIBERS)
    await cardsReady(page)
    const link = first(page)
    const href = (await link.getAttribute('href')) ?? ''
    await link.scrollIntoViewIfNeeded()
    await expect(page.locator('.link-preview')).toHaveCount(0)
    await link.hover()
    const card = page.locator('.link-preview')
    await expect(card).toBeVisible()
    const linked = guideAt(href.split('#')[0] ?? href)
    await expect(card).toContainText(linked.title)
    await expect(card).toContainText(linked.description)
    // Wholly on the screen, and never over the link it belongs to.
    const fits = await card.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= 0 && box.right <= window.innerWidth && box.top >= 0
    })
    expect(fits, 'the card runs off the screen').toBe(true)
    await page.mouse.move(4, 400)
    await expect(card).toHaveCount(0)
  })

  test('the keyboard opens it too, and Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(FIBERS)
    await cardsReady(page)
    await first(page).focus()
    await expect(page.locator('.link-preview')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.link-preview')).toHaveCount(0)
  })

  test('the link still goes where it says', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(FIBERS)
    await cardsReady(page)
    const link = first(page)
    const href = (await link.getAttribute('href')) ?? ''
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href.split('#')[0]}$`))
  })

  test('NEGATIVE CONTROL: a link to a page that is not a guide has no card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(FIBERS)
    await cardsReady(page)
    const other = page.locator('main a.prose__link:not([href^="/guides/"])').first()
    await expect(other).toHaveCount(1)
    await other.scrollIntoViewIfNeeded()
    await other.hover()
    // Longer than the card's own opening delay (600ms, Base UI's default).
    await page.waitForTimeout(1200)
    await expect(page.locator('.link-preview')).toHaveCount(0)
  })
})

/**
 * The card's code reaches only a device that can open a card (LinkPreview.tsx). Measured 24 Nov
 * 2026 on this guide: 213,909 bytes of compressed script with the card imported directly, 179,043
 * on a phone with it fetched on demand; the live page that day was 178,158.
 */
test.describe('the link card’s code is fetched only where a card can open', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'phone emulation is Chromium’s')

  // A context of its own, so the device is set before the page exists. A guide with no garment
  // links asks the media host for nothing, so the suite's local media answers are not needed here.
  const scripts = async (page: Page, device: 'phone' | 'computer') => {
    const context = await page
      .context()
      .browser()
      ?.newContext(
        device === 'phone'
          ? { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true }
          : { viewport: { width: 1440, height: 900 } },
      )
    if (!context) throw new Error('no browser to open a context in')
    const fresh = await context.newPage()
    let files = 0
    fresh.on('request', (request) => {
      if (request.resourceType() === 'script') files += 1
    })
    await fresh.goto(FIBERS)
    await fresh.waitForLoadState('networkidle')
    // Past the idle wait and the fetch that follows it (LinkPreview.tsx).
    await fresh.waitForTimeout(1_500)
    const canHover = await fresh.evaluate(
      () => matchMedia('(any-hover: hover), (any-pointer: fine)').matches,
    )
    await context.close()
    return { canHover, files }
  }

  test('a touch-only phone fetches fewer script files than a computer with a mouse', async ({
    page,
  }) => {
    const phone = await scripts(page, 'phone')
    const computer = await scripts(page, 'computer')
    expect(phone.canHover, 'the phone was not emulated, so nothing was measured').toBe(false)
    expect(computer.canHover).toBe(true)
    expect(phone.files).toBeGreaterThan(0)
    expect(phone.files).toBeLessThan(computer.files)
  })
})
