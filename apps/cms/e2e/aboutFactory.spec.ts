import { expect, test } from './offlineMedia'

/**
 * The about and factory pages (the about-factory build, 2026-10-09), in a real browser: what a
 * buyer would see broken.
 *
 * ⚠️ THE STAGE ROWS ARE MEASURED, NOT READ FROM site.css. The first build declared two columns
 * from 900px and drew them inside 584px at 1440px: each stage is an `<li>`, and the site caps every
 * `p, li` at the reading measure (34.362em), so the walkthrough sat in the left half of the page
 * with 280px photos. Only a picture showed it.
 */
test.describe('the factory page', () => {
  for (const width of [900, 1440, 1920]) {
    test(`each stage row spans the walkthrough at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/inside-the-factory')
      const list = await page.locator('.factory-stages').boundingBox()
      const rows = await page
        .locator('.factory-stage')
        .evaluateAll((all) => all.map((row) => row.getBoundingClientRect().width))
      if (!list) throw new Error('the walkthrough was not drawn')
      expect(rows, 'no stage rows were drawn, so nothing was measured').toHaveLength(5)
      for (const row of rows) expect(row).toBeCloseTo(list.width, 0)
    })
  }

  test('a stage with several photos sets them side by side at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/inside-the-factory')
    // Stage 5 has four photos; one column made them a tower four photos tall.
    const tops = await page
      .locator('.factory-stage')
      .nth(4)
      .locator('.photo-figure')
      .evaluateAll((all) => all.map((figure) => Math.round(figure.getBoundingClientRect().top)))
    expect(tops, 'stage 5 drew no photos, so nothing was measured').toHaveLength(4)
    expect(new Set(tops).size, `photo tops ${tops.join(', ')}`).toBeLessThan(4)
  })
})

/**
 * The /about hero (BUILD 8.3). Where the engine has scroll timelines with ranges and motion is
 * allowed, it is a 250svh section whose stage sticks while the building opens from a card; anywhere
 * else (Firefox in October 2026, reduced motion, a screen under 700px tall) it is the still photo
 * hero. Each check below can fail the way the first build did: the timeline began 84px early (the
 * card already 6% open at the top), and an ease-out flung the words off at a tenth of the way.
 */
type HeroState = {
  sticky: boolean
  sectionOverScreen: number
  cardWidth: number
  partsOnScreen: boolean
  partsTranslate: string[]
}

async function heroAt(page: import('@playwright/test').Page, fraction: number) {
  return page.evaluate((f) => {
    const section = document.querySelector('.about-hero') as HTMLElement
    const stage = document.querySelector('.about-hero__stage') as HTMLElement
    const run = section.getBoundingClientRect().height - innerHeight
    scrollTo(0, Math.max(0, Math.round(run * f)))
    // The visible card: the photo's clip-path inset, read back as the box it leaves. Engines keep
    // it as `calc(50% - 144px)`, so each side is resolved against the photo's width here.
    const photo = document.querySelector('.about-hero .site-hero__photo') as HTMLElement
    const clip = getComputedStyle(photo).clipPath
    const sides = clip.startsWith('inset(')
      ? (clip.slice(6).split(' round')[0] ?? '').match(/calc\([^)]*\)|[-\d.]+(?:px|%)/g)
      : null
    const resolve = (length: string) =>
      [...length.matchAll(/([-+]?)\s*([\d.]+)(px|%)/g)].reduce((sum, [, sign, n, unit]) => {
        const value = unit === '%' ? (Number(n) / 100) * photo.clientWidth : Number(n)
        return sum + (sign === '-' ? -value : value)
      }, 0)
    const horizontal = sides ? (sides[1] ?? sides[0] ?? '0px') : '0px'
    const cardWidth = photo.clientWidth - 2 * resolve(horizontal)
    const parts = [...document.querySelectorAll('.about-hero__part')] as HTMLElement[]
    return {
      sticky: getComputedStyle(stage).position === 'sticky',
      sectionOverScreen: section.getBoundingClientRect().height / innerHeight,
      cardWidth: Math.round(cardWidth),
      // The WORDS, not the boxes: each half is a full-column grid item with its words aligned
      // inside, so its box crossed the edge while every letter was still on screen (measured).
      partsOnScreen: parts.every((part) => {
        const range = document.createRange()
        range.selectNodeContents(part)
        const box = range.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth
      }),
      partsTranslate: parts.map((part) => getComputedStyle(part).translate),
    } satisfies HeroState
  }, fraction)
}

test.describe('the /about hero', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`opens from a card as it scrolls, where scroll timelines run, at ${width}x${height}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width, height })
      await page.goto('/about')
      const supported = await page.evaluate(() =>
        CSS.supports('(animation-timeline: view()) and (animation-range: entry)'),
      )
      const start = await heroAt(page, 0)
      if (!supported) {
        // Firefox: the still hero, no tall section.
        expect(start.sticky).toBe(false)
        expect(start.sectionOverScreen).toBeLessThan(1.2)
        return
      }
      await page.waitForTimeout(200)
      const top = await heroAt(page, 0)
      expect(top.sticky, 'the stage does not stick').toBe(true)
      expect(top.sectionOverScreen).toBeCloseTo(2.5, 1)
      // At the very top: a card (clamp(240px, 32vmin, 420px)), and both halves on screen, unmoved.
      const card = Math.min(420, Math.max(240, 0.32 * Math.min(width, height)))
      expect(top.cardWidth, 'the card is not closed at the top').toBeCloseTo(card, -1)
      expect(top.partsOnScreen, 'the headline is not all on screen at the top').toBe(true)
      // `none` or `0px`, depending on the engine: unmoved either way.
      expect(top.partsTranslate.map((value) => Number.parseFloat(value) || 0)).toEqual([0, 0])
      // A tenth of the way: the words have barely moved (linear, not flung).
      await heroAt(page, 0.1)
      await page.waitForTimeout(150)
      const early = await heroAt(page, 0.1)
      expect(early.partsOnScreen, 'the words left at a tenth of the way').toBe(true)
      // The end: the card is at least 90% of the screen wide and the words are gone.
      await heroAt(page, 1)
      await page.waitForTimeout(150)
      const end = await heroAt(page, 1)
      expect(end.cardWidth).toBeGreaterThanOrEqual(Math.floor(width * 0.9) - 2)
      expect(end.partsOnScreen).toBe(false)
    })
  }

  test('keeps the still hero under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/about')
    const still = await heroAt(page, 0)
    expect(still.sticky).toBe(false)
    expect(still.sectionOverScreen).toBeLessThan(1.2)
    expect(still.partsOnScreen).toBe(true)
  })

  test('keeps the still hero on a screen under 700px tall', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/about')
    const still = await heroAt(page, 0)
    expect(still.sticky).toBe(false)
    expect(still.sectionOverScreen).toBeLessThan(1.6)
  })

  test('nothing scrolls sideways at 320px, and the byline is under the opening paragraph', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/about')
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
    const lead = await page.locator('.about-lead').first().boundingBox()
    const byline = await page.locator('main .page-byline').boundingBox()
    if (!lead || !byline) throw new Error('the opening paragraph or the byline was not drawn')
    expect(byline.y).toBeGreaterThan(lead.y + lead.height - 1)
  })
})
