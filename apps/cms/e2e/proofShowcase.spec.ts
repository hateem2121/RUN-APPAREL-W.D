import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from './offlineMedia'

/**
 * Polish D2: the home page's №03 becomes a showcase (the report's recommendation, built without a
 * design stop by the owner's answer Q32). The garment is large; beside it, three short points on what
 * a visitor can do with a 3D reference, and colour dots that change the garment. Until 2026-10-05
 * the garment's column was 22rem (352px) beside about 900px of two lines and a button: "short words,
 * tall picture. Big empty corner under the button" (the report, D2).
 *
 * The live model itself is held by `e2e/liveGarment.spec.ts` (a dot switches its variant); here the
 * garment is the still picture, as a visitor without WebGL, or the automation, sees it.
 *
 * What would have to break for these to fail: the garment small again, or taller than a laptop's
 * screen; the words' half thin beside it; a point missing its icon or its words; a dot that changes
 * nothing, or changes the picture but leaves the link on another colour; a contrast or naming fault.
 */

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  if ((await page.locator('.proof__figure').count()) === 0) {
    if (process.env.CI) throw new Error('no garment in №03, and CI seeds one')
    test.skip(true, 'no published garment with a poster in this local database')
  }
  await page.locator('.proof').scrollIntoViewIfNeeded()
}

const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const { left, top, width, height } = element.getBoundingClientRect()
      return { left, top, width, height }
    })

test.describe('№03 — a large garment, and words that weigh the same (D2)', () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 760],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width}x${height} the garment takes half the row, as much as the screen's height allows`, async ({
      page,
    }) => {
      await openHome(page, width, height)
      const container = await page
        .locator('.proof')
        .evaluate((element) => element.getBoundingClientRect().width)
      const figure = await box(page, '.proof__figure')
      const frame = await box(page, '.proof__frame')
      // The words' half since D43: the words, the colours, the details and the button, top to foot.
      const top = await box(page, '.proof__copy')
      const foot = await box(page, '.proof__actions')
      const copy = { top: top.top, height: foot.top + foot.height - top.top }
      // Half the row less the gap, or 64% of the screen's height, whichever is less.
      const expected = Math.min((container - 64) / 2, 0.64 * height)
      expect(
        Math.abs(figure.width - expected),
        `figure ${figure.width}, expected ${expected}`,
      ).toBeLessThanOrEqual(1)
      // The whole garment fits on a screen, under the bar.
      expect(frame.height, 'the garment is taller than the screen').toBeLessThanOrEqual(height - 64)
      // The words sit level with it: no empty corner under them (the report's D2), and they hold the
      // points and the dots (the next tests). A ratio of heights is not asked for: a large garment
      // beside a compact block of words is the showcase; at 1920x1080 they are 418 to 864px.
      const middle = (b: { top: number; height: number }) => b.top + b.height / 2
      expect(
        Math.abs(middle(copy) - middle(figure)),
        'the two halves are not level',
      ).toBeLessThanOrEqual(32)
    })
  }

  // Two since D43: "Share a link" went (the owner: it sounded like software).
  test('two points, each with its icon and its words', async ({ page }) => {
    await openHome(page, 1440, 900)
    const points = page.locator('.proof__copy .proof__point')
    await expect(points).toHaveCount(2)
    for (const point of await points.all()) {
      await expect(point.locator('svg')).toHaveCount(1)
      await expect(point).toHaveText(/\w{3,}.*\w{3,}/)
    }
  })

  test('on a phone: the words, the garment, then its colours, details and button, with no sideways scroll', async ({
    page,
  }) => {
    await openHome(page, 390, 844)
    const points = await box(page, '.proof__points')
    const frame = await box(page, '.proof__frame')
    const pills = await box(page, '.proof__pills')
    const details = await box(page, '.proof__details')
    const actions = await box(page, '.proof__actions')
    expect(points.top + points.height).toBeLessThanOrEqual(frame.top)
    expect(frame.top + frame.height).toBeLessThanOrEqual(pills.top)
    expect(pills.top + pills.height).toBeLessThanOrEqual(details.top)
    expect(details.top + details.height).toBeLessThanOrEqual(actions.top)
    for (const pill of await page.locator('.proof__pill').all()) {
      const size = await pill.boundingBox()
      expect(size?.height ?? 0, 'a colour is under 44px tall').toBeGreaterThanOrEqual(43.95)
      // 36px wide on a phone, as the gallery's phone dots (the owner, 2026-10-16), and 44px tall.
      expect(size?.width ?? 0, 'a colour is under 36px wide').toBeGreaterThanOrEqual(35.95)
      // And its dot whole inside it: a 32px dot in the 36px button was cut by its clip (2026-10-16).
      const dot = await pill.locator('i').boundingBox()
      if (!size || !dot) throw new Error('no dot')
      expect(dot.x, 'a dot starts outside its button').toBeGreaterThanOrEqual(size.x - 0.5)
      expect(dot.x + dot.width, 'a dot runs past its button').toBeLessThanOrEqual(
        size.x + size.width + 0.5,
      )
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0)
  })

  test('the details are the garment’s own, under its colours, and the count stands beside the button', async ({
    page,
  }) => {
    await openHome(page, 1440, 900)
    await expect(page.locator('.proof__details .proof__label')).toHaveText(/^This reference/)
    await expect(page.locator('.proof__specs dt')).not.toHaveCount(0)
    await expect(page.locator('.proof__actions .btn')).toHaveText('See products in 3D')
    await expect(page.locator('.proof__count')).toHaveText(/^\d[\d,]* garments?$/)
    const button = await box(page, '.proof__actions .btn')
    const count = await box(page, '.proof__count')
    expect(count.left, 'the count is not beside the button').toBeGreaterThan(
      button.left + button.width,
    )
  })
})

/** The pills, once React owns them and they have been measured (`data-measured`). */
async function pillsReady(page: Page) {
  const pills = page.locator('.proof__pill')
  if ((await pills.count()) < 2) test.skip(true, 'the garment here has one colour')
  await page.waitForSelector('.proof__pills[data-measured]')
  await page.waitForFunction(() => {
    const pill = document.querySelector('.proof__pill')
    return !!pill && Object.keys(pill).some((key) => key.startsWith('__reactProps'))
  })
  return pills
}

test.describe('№03 — the colours, a growing pill (D43)', () => {
  test('a colour changes the garment’s picture and its link, and is the one chosen, named', async ({
    page,
  }) => {
    await openHome(page, 1440, 900)
    const pills = await pillsReady(page)
    const count = await pills.count()
    await expect(page.locator('.proof__pills')).toHaveAttribute('role', 'radiogroup')
    await expect(pills.first()).toHaveAttribute('aria-checked', 'true')
    const before = {
      href: await page.locator('.proof__link').getAttribute('href'),
      src: await page.locator('.proof__frame img').first().getAttribute('src'),
    }
    const target = pills.nth(count - 1)
    // On its dot, as a person clicks it: an unchosen pill's box is wider than the dot it shows.
    await target.click({ position: { x: 22, y: 22 } })
    await expect(target).toHaveAttribute('aria-checked', 'true')
    await expect(pills.first()).toHaveAttribute('aria-checked', 'false')
    // Its name shows on the pill, and only the chosen one's.
    await expect
      .poll(() => target.locator('span').evaluate((name) => getComputedStyle(name).opacity))
      .toBe('1')
    expect(
      await pills
        .first()
        .locator('span')
        .evaluate((name) => getComputedStyle(name).opacity),
    ).toBe('0')
    const href = await page.locator('.proof__link').getAttribute('href')
    expect(href, 'the link stayed on the first colour').not.toBe(before.href)
    expect(href).toMatch(/^https:\/\/[^/]+\/products\/[^/]+\/[^/]+$/)
    await expect
      .poll(() =>
        page
          .locator('.proof__frame img, .proof__frame .product-card__placeholder')
          .first()
          .evaluate((element) => element.getAttribute('src') ?? element.className),
      )
      .not.toBe(before.src)
  })

  /*
   * Home page audit, 2026-10-17: with the 3D off (this suite: automation), a pick threw the old
   * picture away and the box stood empty for 0.4–1.2 s on the live site; and the first colour's
   * picture was named "Olive / Sage" under a pill reading "Bay Leaf / Matcha". Every frame is read
   * from the click until the change has settled: at least one loaded picture must be showing in each.
   */
  test('with the 3D off, a colour change never leaves the box empty, and the picture is named by its colour', async ({
    page,
  }) => {
    await openHome(page, 1440, 900)
    const pills = await pillsReady(page)
    const firstName = (await pills.first().locator('span').textContent())?.trim() ?? ''
    expect(await page.locator('.proof__frame img').first().getAttribute('alt')).toMatch(
      new RegExp(` in ${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    )
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number[]; __done: boolean }
      w.__frames = []
      w.__done = false
      const start = performance.now()
      const tick = () => {
        const showing = [...document.querySelectorAll<HTMLImageElement>('.proof__frame > img')]
          .filter((img) => img.complete && img.naturalWidth > 0)
          .filter((img) => Number(getComputedStyle(img).opacity) > 0.05).length
        w.__frames.push(showing)
        if (performance.now() - start < 2000) requestAnimationFrame(tick)
        else w.__done = true
      }
      requestAnimationFrame(tick)
    })
    await pills.nth((await pills.count()) - 1).click({ position: { x: 22, y: 22 } })
    await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done)
    const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)
    expect(frames.length, 'no frames were read').toBeGreaterThan(20)
    expect(frames.filter((showing) => showing === 0).length, 'frames with an empty box').toBe(0)
    // Settled: one picture, the new colour's.
    await expect(page.locator('.proof__frame > img')).toHaveCount(1)
  })

  // WAI-ARIA APG, "Radio Group" (read 2026-10-16): Tab lands on the chosen one; the arrows move and
  // choose, wrapping at the ends.
  test('the keyboard: the arrows move and choose, wrapping at both ends', async ({ page }) => {
    await openHome(page, 1440, 900)
    const pills = await pillsReady(page)
    const count = await pills.count()
    await pills.first().focus()
    await page.keyboard.press('ArrowLeft')
    await expect(pills.nth(count - 1)).toBeFocused()
    await expect(pills.nth(count - 1)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(pills.first()).toBeFocused()
    await expect(pills.first()).toHaveAttribute('aria-checked', 'true')
    // Only the chosen one is in the tab order.
    expect(
      await pills.evaluateAll((all) => all.map((pill) => (pill as HTMLElement).tabIndex)),
    ).toEqual(Array.from({ length: count }, (_, index) => (index === 0 ? 0 : -1)))
  })

  /*
   * Polish N1's names run up to 27 characters ("Podium Lilac / Night Indigo") where the seed's are one
   * short word, and the hoodie's longest is "Black Cherry / Cranberry". Written in by the test, so the
   * seed's short words cannot hide it: the row stays inside its column, the pill holds its name in at
   * most three lines in its 44px (the owner, 2026-10-16, with 36px dots on a phone), and the dots
   * after it keep clear of it.
   */
  // The hoodie's own longest on the narrowest phone; the catalogue's longest from 390px, where a
  // 27-character name in a 360px phone's pill took four lines in Firefox (2026-10-16).
  for (const [width, height, colour] of [
    [360, 780, 'Black Cherry / Cranberry'],
    [390, 844, 'Podium Lilac / Night Indigo'],
    [1440, 900, 'Podium Lilac / Night Indigo'],
  ] as const) {
    test(`at ${width}px "${colour}" stays inside the column, in its pill`, async ({ page }) => {
      await openHome(page, width, height)
      await pillsReady(page)
      await page.evaluate((text) => {
        const name = document.querySelector('.proof__pill[aria-checked="true"] span')
        if (name) name.textContent = text
      }, colour)
      const row = await box(page, '.proof__pills')
      // Polled: the pills measure the new name and move after it is written in.
      await expect
        .poll(() =>
          page.evaluate((edge) => {
            const problems: string[] = []
            const pills = [...document.querySelectorAll('.proof__pill')].map((pill) =>
              pill.getBoundingClientRect(),
            )
            for (const [index, pill] of pills.entries()) {
              if (pill.right > edge + 1) problems.push(`pill ${index + 1} past the column`)
              const before = pills[index - 1]
              if (before && pill.left < before.right + 4)
                problems.push(`pills ${index} and ${index + 1} overlap`)
            }
            const chosen = document.querySelector('.proof__pill[aria-checked="true"]')
            const name = chosen?.querySelector('span')
            if (!chosen || !name) return ['no chosen pill']
            const box = chosen.getBoundingClientRect()
            const words = name.getBoundingClientRect()
            const lines = words.height / Number.parseFloat(getComputedStyle(name).lineHeight)
            if (Math.round(lines) > 3) problems.push(`the name takes ${Math.round(lines)} lines`)
            if (words.bottom > box.bottom + 0.5 || words.right > box.right + 0.5)
              problems.push('the name runs out of its pill')
            if (Math.round(box.height) !== 44) problems.push(`the pill is ${box.height}px tall`)
            return problems
          }, row.left + row.width),
        )
        .toEqual([])
    })
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe finds no contrast or naming fault in №03`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openHome(page, 1440, 900)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const results = await new AxeBuilder({ page })
        .include('.proof')
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
