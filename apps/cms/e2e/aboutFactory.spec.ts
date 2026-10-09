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
 * The /about hero. Where the engine has scroll timelines with ranges and motion is
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
      // WebKit reports a resting value as ±0.000073px, Chromium as 0px: unmoved, both.
      for (const value of top.partsTranslate)
        expect(Number.parseFloat(value) || 0).toBeCloseTo(0, 1)
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

/**
 * The timeline, the walkthrough and the word rows, measured where they move and where
 * they must hold still. The timeline's travel is CSS arithmetic (`100cqw - 100%`), so the check is
 * that its LAST entry ends at the stage's right edge, which a wrong travel misses at any width.
 */
async function scrollThrough(page: import('@playwright/test').Page, selector: string, f: number) {
  // Twice: measured before the scroll, a section still rising in (`site-reveal`, 24px down) put
  // the first scroll 24px past its start; measured again once it has risen, the second lands.
  for (let pass = 0; pass < 2; pass += 1) {
    await page.evaluate(
      ([sel, fraction]) => {
        const element = document.querySelector(sel as string) as HTMLElement
        const top = element.getBoundingClientRect().top + scrollY
        const run = element.getBoundingClientRect().height - innerHeight
        scrollTo(0, Math.round(top + run * (fraction as number)))
      },
      [selector, f] as const,
    )
    await page.waitForTimeout(200)
  }
}

const timelinesRun = (page: import('@playwright/test').Page) =>
  page.evaluate(() => CSS.supports('(animation-timeline: view()) and (animation-range: entry)'))

test.describe('the /about timeline', () => {
  test('runs sideways on a wide screen, its last entry ending at the stage edge', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/about')
    const entries = page.locator('.about-timeline__entry')
    if (!(await timelinesRun(page))) {
      // Firefox: the vertical list, every entry left-aligned in its column.
      const lefts = await entries.evaluateAll((all) =>
        all.map((e) => e.getBoundingClientRect().left),
      )
      expect(new Set(lefts.map(Math.round)).size).toBeLessThanOrEqual(2)
      return
    }
    await scrollThrough(page, '.about-timeline-section', 0)
    const firstLeft = await entries.first().evaluate((e) => e.getBoundingClientRect().left)
    const stage = await page.locator('.about-timeline__stage').evaluate((e) => {
      const box = e.getBoundingClientRect()
      const style = getComputedStyle(e)
      return {
        left: box.left + Number.parseFloat(style.paddingLeft),
        right: box.right - Number.parseFloat(style.paddingRight),
      }
    })
    expect(
      Math.abs(firstLeft - stage.left),
      'the track did not start at the stage edge',
    ).toBeLessThan(24)
    await scrollThrough(page, '.about-timeline-section', 1)
    await page.waitForTimeout(150)
    const lastRight = await entries.last().evaluate((e) => e.getBoundingClientRect().right)
    expect(
      Math.abs(lastRight - stage.right),
      'the last entry does not end at the edge',
    ).toBeLessThan(4)
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
  })

  for (const [label, width, motion] of [
    ['under reduced motion', 1440, 'reduce'],
    ['on a phone', 390, 'no-preference'],
  ] as const) {
    test(`is the vertical list ${label}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/about')
      const section = await page
        .locator('.about-timeline-section')
        .evaluate((e) => e.getBoundingClientRect().height / innerHeight)
      expect(section, 'the timeline section is still the tall motion one').toBeLessThan(2.5)
      expect(
        await page.locator('.about-timeline').evaluate((e) => getComputedStyle(e).display),
      ).toBe('grid')
    })
  }
})

test.describe('the factory walkthrough and the word rows', () => {
  test('a checkpoint lands as a tilted stamp where motion runs, and stays flat under reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/inside-the-factory')
    const badge = page.locator('.factory-stage__badge').nth(2)
    await badge.scrollIntoViewIfNeeded()
    await page.evaluate(() => scrollBy(0, -200))
    await page.waitForTimeout(300)
    const rotate = await badge.evaluate((e) => getComputedStyle(e).rotate)
    if (await timelinesRun(page)) expect(rotate).toBe('-3deg')
    else expect(rotate).toBe('none')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    expect(
      await page
        .locator('.factory-stage__badge')
        .nth(2)
        .evaluate((e) => getComputedStyle(e).rotate),
    ).toBe('none')
    expect(
      await page.locator('.factory-walk__rail').evaluate((e) => getComputedStyle(e).display),
    ).toBe('none')
  })

  test('the word rows are hidden from screen readers and move only with the scroll', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/about')
    const marquee = page.locator('.marquee')
    await expect(marquee).toHaveAttribute('aria-hidden', 'true')
    const track = page.locator('.marquee__track')
    await marquee.scrollIntoViewIfNeeded()
    // The row's sideways offset in px: `none` reads as 0.
    const at = () => track.evaluate((e) => Number.parseFloat(getComputedStyle(e).translate) || 0)
    // A scroll timeline catches up on the next frames: read only once the scroll has settled
    // (read at once, it gave 0 and then -12.5px, which looked like movement on its own).
    await page.waitForTimeout(400)
    const first = await at()
    await page.waitForTimeout(1200)
    expect(await at(), 'the row moved while nobody scrolled').toBeCloseTo(first, 0)
    if (await timelinesRun(page)) {
      await page.evaluate(() => scrollBy(0, 300))
      await page.waitForTimeout(200)
      expect(await at(), 'the row did not move with the scroll').toBeLessThan(first - 1)
    }
  })
})

for (const path of ['/about', '/inside-the-factory']) {
  for (const width of [320, 900, 1440]) {
    test(`${path} never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      const h = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < h; y += 900) {
        await page.evaluate((top) => scrollTo(0, top), y)
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(sideways, `at ${y}px down`).toBeLessThanOrEqual(0)
      }
    })
  }
}

/**
 * The gallery's photo viewer. base-ui 1.8.0 sets no `aria-modal`, so the trap and the
 * hidden page are proved here, not assumed; and the page behind is proved still with the smooth
 * scroll RUNNING (webdriver lifted), because base-ui's overflow lock alone does not stop Lenis
 * (packages/shared/src/pageHold.ts) — the same proof as the garment pages' hd-image.spec.ts.
 */
test.describe('the factory photo viewer', () => {
  const links = (page: import('@playwright/test').Page) => page.locator('a[data-gallery-index]')

  test('without JavaScript each photo is a link to a real, larger file', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/inside-the-factory')
    const hrefs = await links(page).evaluateAll((all) =>
      all.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
    )
    expect(hrefs.length, 'no gallery links were drawn').toBeGreaterThan(3)
    for (const href of hrefs) {
      const response = await page.request.get(href)
      expect(response.status(), href).toBe(200)
      expect(response.headers()['content-type'], href).toMatch(/^image\//)
    }
    await context.close()
  })

  test('opens on the photo pressed, steps with the keys, counts, and gives focus back', async ({
    page,
  }) => {
    await page.goto('/inside-the-factory')
    const count = await links(page).count()
    const third = links(page).nth(2)
    await third.scrollIntoViewIfNeeded()
    await third.click()
    await expect(page.getByRole('dialog', { name: `Factory photo 3 of ${count}` })).toBeVisible()
    // Followed by role from here: its name moves with the photo ("4 of …").
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('.photo-viewer__count')).toHaveText(`3 / ${count}`)
    await expect(dialog.locator('.photo-viewer__count')).toHaveAttribute('aria-live', 'polite')
    await page.keyboard.press('ArrowRight')
    await expect(dialog.locator('.photo-viewer__count')).toHaveText(`4 / ${count}`)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.locator('.photo-viewer__count')).toHaveText(`2 / ${count}`)
    // Only the photo on screen and its neighbours are asked for.
    expect(await dialog.locator('.photo-viewer__img').count()).toBeLessThanOrEqual(3)
    for (const button of await dialog.locator('.photo-viewer__button').all()) {
      const box = await button.boundingBox()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(third, 'focus did not come back to the photo that opened it').toBeFocused()
  })

  test('keeps Tab inside, and hides the page behind from the accessibility tree', async ({
    page,
  }) => {
    await page.goto('/inside-the-factory')
    await links(page).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab')
      // base-ui wraps focus through an invisible guard beside the popup, for a moment: wait for
      // focus to settle. One that really escaped stays out, and this fails.
      await expect
        .poll(
          () => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null),
          { message: `Tab ${press + 1} left the viewer`, timeout: 1000 },
        )
        .toBe(true)
    }
    await expect(page.getByRole('heading', { name: /Walk the floor/i })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: /Walk the floor/i })).toHaveCount(1)
  })

  test('a swipe is the strip scrolling, and the counter follows it', async ({ page }) => {
    await page.goto('/inside-the-factory')
    const count = await links(page).count()
    await links(page).first().click()
    const strip = page.locator('.photo-viewer__strip')
    await expect(strip).toBeVisible()
    expect(await strip.evaluate((e) => getComputedStyle(e).scrollSnapType)).toContain('mandatory')
    await strip.evaluate((e) => e.scrollTo({ left: 2 * e.clientWidth, behavior: 'instant' }))
    await expect(page.locator('.photo-viewer__count')).toHaveText(`3 / ${count}`)
  })

  test('a wheel over the open viewer leaves the page behind where it was', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a phone has no wheel')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(`Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => false,
      configurable: true,
    })`)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/inside-the-factory')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
        message: 'Lenis never started, so this would pass with the lock deleted',
        timeout: 10_000,
      })
      .toBe(true)
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY + document.body.scrollTop))
    await links(page).first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    await links(page).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const start = await scrollY()
    await page.mouse.move(640, 450)
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(1500)
    expect(await scrollY(), 'the page slid behind the open viewer').toBe(start)
    await page.keyboard.press('Escape')
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(1500)
    expect(await scrollY(), 'the page stayed held after the viewer closed').toBeGreaterThan(start)
  })
})

/**
 * The /about preloader (the owner's rule of 2026-10-09: "No saving: arriving from
 * outside"). Automation never sees it unless a test lifts `navigator.webdriver`, as these do.
 */
test.describe('the /about preloader', () => {
  const liftWebdriver = (page: import('@playwright/test').Page) =>
    page.addInitScript(`Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => false,
      configurable: true,
    })`)
  const mark = (page: import('@playwright/test').Page) =>
    page.evaluate(() => document.documentElement.getAttribute('data-preload'))
  const covering = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const overlay = document.querySelector('.preloader') as HTMLElement
      const box = overlay.getBoundingClientRect()
      return getComputedStyle(overlay).display !== 'none' && box.bottom > 1
    })

  test('shows on an arrival from outside, lands on this year, and is gone by 2.2 s and the curtain', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await liftWebdriver(page)
    const started = Date.now()
    await page.goto('/about', { referer: 'https://www.google.com/' })
    expect(await covering(page), 'no curtain on a visit from a search').toBe(true)
    await expect(page.locator('.preloader')).toHaveAttribute('aria-hidden', 'true')
    // The year the counter shows as the curtain starts to lift.
    await expect.poll(() => mark(page), { timeout: 4000 }).not.toBe('on')
    const landed = await page.locator('.preloader__year').textContent()
    expect(landed).toBe(String(new Date().getFullYear()))
    // 2.2 s ceiling + the --slow curtain (0.8 s), and a margin for a busy machine.
    await expect.poll(() => covering(page), { timeout: 4000 }).toBe(false)
    expect(Date.now() - started).toBeLessThan(6000)
    // `animationend` can land a frame after the curtain has left the screen (WebKit, measured).
    await expect
      .poll(() => mark(page), { message: 'the mark stayed after the curtain', timeout: 1000 })
      .toBeNull()
    const stored = await page.evaluate(() => [localStorage.length, sessionStorage.length])
    expect(stored, 'the preloader stored something').toEqual([0, 0])
  })

  test('never on a reload, nor from another page of the site', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await liftWebdriver(page)
    await page.goto('/about', { referer: 'https://www.google.com/' })
    await expect.poll(() => covering(page), { timeout: 5000 }).toBe(false)
    await page.reload()
    expect(await mark(page), 'shown again on a reload').toBeNull()
    expect(await covering(page)).toBe(false)
    const origin = new URL(page.url()).origin
    await page.goto('/about', { referer: `${origin}/products` })
    expect(await mark(page), 'shown arriving from the site itself').toBeNull()
  })

  test('never under reduced motion, nor under automation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await liftWebdriver(page)
    await page.goto('/about', { referer: 'https://www.google.com/' })
    expect(await mark(page)).toBeNull()
    expect(await covering(page)).toBe(false)
    const plain = await page.context().newPage()
    await plain.emulateMedia({ reducedMotion: 'no-preference' })
    await plain.goto('/about', { referer: 'https://www.google.com/' })
    expect(await mark(plain), 'shown to an automated browser').toBeNull()
  })

  test('never without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    await page.goto('/about', { referer: 'https://www.google.com/' })
    const display = await page.locator('.preloader').evaluate((e) => getComputedStyle(e).display)
    expect(display).toBe('none')
    await context.close()
  })
})
