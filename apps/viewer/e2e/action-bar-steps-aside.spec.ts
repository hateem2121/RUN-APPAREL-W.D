import { expect, type Page, test } from '@playwright/test'

/**
 * VA-54 (visual audit, 2026-10-02): at the end of a garment page on a phone, "Develop this with
 * us" showed EMAIL US and WHATSAPP US, and the fixed bar at the foot of the screen showed the same
 * two buttons at the same time (402x874 and 375x667). The bar now fades away while the in-page pair
 * is on screen and comes back when it scrolls off.
 *
 * What a visitor needs from it, each asserted below:
 *   - ONE pair at a time: while the in-page pair is in view, the bar is out of the accessibility
 *     tree, so there is one "Email Us" to find, not two;
 *   - the bar is back, usable, the moment the pair scrolls away;
 *   - a keyboard visitor standing on one of the bar's buttons is not left on a button that
 *     vanished: a bar with focus inside it stays until focus leaves;
 *   - the fade is --fast (200ms) and instant under reduced motion.
 *
 * ⚠️ "NOT FOCUSABLE WHILE HIDDEN" IS ASSERTED THROUGH THE ACCESSIBILITY TREE. `getByRole` leaves
 * out an element that is `visibility: hidden`, which is exactly the property that removes it from
 * the Tab order too (`inert` would do the same; `visibility` is what the cookie card's own rule
 * uses), so one query proves both: two "Email Us" links when the bar shows, one when it does not.
 *
 * ⚠️ SCROLLED BY `scrollIntoView`, NOT BY WHEEL. The suite runs as automation, where the smooth
 * scroller (Lenis) is off and reveals are instant, so a script scroll is the page scrolling.
 */

const PHONES = [
  { name: '402x874', width: 402, height: 874 },
  { name: '375x667', width: 375, height: 667 },
] as const

const bar = (page: Page) => page.locator('.action-bar')
const emailLinks = (page: Page) => page.getByRole('link', { name: 'Email Us' })

/** Put the in-page pair in the middle of the screen, or the very top of the page again. */
const showPair = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('.contact__buttons')?.scrollIntoView({ block: 'center' }),
  )
const scrollToTop = (page: Page) => page.evaluate(() => window.scrollTo(0, 0))

const barStyle = (page: Page) =>
  bar(page).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      opacity: Number.parseFloat(style.opacity),
      visibility: style.visibility,
      duration: style.transitionDuration,
      delay: style.transitionDelay,
    }
  })

/** The bar's transition lists, one entry per transitioned property, as the browser computes them. */
const transitionLists = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.action-bar') as Element)
    const split = (list: string) => list.split(',').map((item) => item.trim())
    return {
      fast: getComputedStyle(document.documentElement).getPropertyValue('--fast').trim(),
      properties: split(style.transitionProperty),
      durations: split(style.transitionDuration),
    }
  })

test.describe('the fixed bar steps aside while the same buttons are in the page (VA-54)', () => {
  for (const phone of PHONES) {
    test(`one pair of Email and WhatsApp at a time at ${phone.name}`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(bar(page)).toBeVisible()

      // At the top the bar is the only pair in view, and the page's own pair is also in the tree.
      await expect(emailLinks(page), 'the bar and the in-page pair are both reachable').toHaveCount(
        2,
      )
      expect((await barStyle(page)).visibility).toBe('visible')

      // The in-page pair on screen: the bar fades, then leaves the accessibility tree.
      await showPair(page)
      await expect
        .poll(async () => (await barStyle(page)).visibility, {
          message: 'the bar never stepped aside while the in-page pair was on screen',
          timeout: 3_000,
        })
        .toBe('hidden')
      expect((await barStyle(page)).opacity).toBe(0)
      await expect(
        emailLinks(page),
        'two "Email Us" links are still reachable: the hidden bar is in the tab order',
      ).toHaveCount(1)
      await expect(page.getByRole('link', { name: 'WhatsApp Us' })).toHaveCount(1)

      // And it is back when the pair scrolls away, with its buttons usable.
      await scrollToTop(page)
      await expect
        .poll(async () => (await barStyle(page)).visibility, {
          message: 'the bar did not come back once the in-page pair scrolled off',
          timeout: 3_000,
        })
        .toBe('visible')
      await expect.poll(async () => (await barStyle(page)).opacity).toBe(1)
      await expect(emailLinks(page)).toHaveCount(2)
      await bar(page).getByRole('link', { name: 'Email Us' }).focus()
      await expect(bar(page).getByRole('link', { name: 'Email Us' })).toBeFocused()
    })
  }

  test('a bar with keyboard focus inside it stays until focus leaves', async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const barEmail = bar(page).getByRole('link', { name: 'Email Us' })
    await barEmail.focus()
    await showPair(page)
    // The observer has seen the pair (the attribute is the module's whole output), and the
    // stylesheet is what keeps the bar up for the visitor standing on it: no timer to guess at.
    await expect(
      bar(page),
      'the module never marked the bar while the pair was on screen',
    ).toHaveAttribute('data-tucked', '')
    expect((await barStyle(page)).visibility, 'the bar vanished under the focused visitor').toBe(
      'visible',
    )
    expect((await barStyle(page)).opacity, 'the bar faded under the focused visitor').toBe(1)
    await expect(barEmail).toBeFocused()

    // Focus moves to the in-page pair: now there is nothing to keep the bar, and it goes.
    await page.locator('.contact__buttons').getByRole('link', { name: 'Email Us' }).focus()
    await expect
      .poll(async () => (await barStyle(page)).visibility, {
        message: 'the bar did not step aside once focus left it',
        timeout: 3_000,
      })
      .toBe('hidden')
  })

  test('the fade is the --fast token, and instant under reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Reduced motion must collapse the fade and the flip to hidden (base.css sets every duration
    // to 0.01ms and every delay to 0s), so with it on the bar is gone at once.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const instant = await barStyle(page)
    expect(
      Number.parseFloat(instant.duration),
      `reduced motion left a ${instant.duration} fade on the bar`,
    ).toBeLessThanOrEqual(0.001)
    expect(Number.parseFloat(instant.delay), 'reduced motion left a delay on the bar').toBe(0)
    await showPair(page)
    // 3s, as in the tests above: "instant" is asserted by the durations, not by this wait. One
    // frame can take about a second while the garment's 3D model loads (950ms measured in
    // Chromium, 2026-10-02), and a 1s wait here failed about one run in three under load.
    await expect
      .poll(async () => (await barStyle(page)).visibility, { timeout: 3_000 })
      .toBe('hidden')
    const tuckedInstant = await transitionLists(page)
    expect(
      tuckedInstant.durations.every((duration) => Number.parseFloat(duration) <= 0.001),
      `reduced motion left a duration on the bar's way out: ${tuckedInstant.durations.join(' ')}`,
    ).toBe(true)

    // Normal motion, bar still away: opacity AND visibility last --fast (200ms), so the bar leaves
    // the Tab order only after it has finished fading, not before.
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const away = await transitionLists(page)
    // The built stylesheet is minified, so the token reads ".2s" there, not the "200ms" written in
    // tokens.css (all four engines, 2026-10-02): compare the time, never the spelling.
    const ms = (time: string) => Number.parseFloat(time) * (time.endsWith('ms') ? 1 : 1000)
    expect(ms(away.fast), `--fast is ${away.fast}`).toBe(200)
    expect(away.properties, 'the way out names both opacity and visibility').toEqual([
      'opacity',
      'visibility',
    ])
    expect(away.durations, 'the way out does not last --fast on both').toEqual(['0.2s', '0.2s'])

    // Normal motion, bar back: opacity fades up over --fast, and `visibility` is not in the list,
    // so it is `visible` from the first frame.
    await scrollToTop(page)
    await expect.poll(async () => (await barStyle(page)).visibility).toBe('visible')
    const back = await transitionLists(page)
    expect(back.properties, 'the way back delays `visibility`').toEqual(['opacity'])
    expect(back.durations, 'the bar does not fade back over --fast').toEqual(['0.2s'])
  })
})

/*
 * The footer too (2026-10-03, the owner's iPhone screenshot). Over the dark footer the paper bar,
 * which iPhone Safari extends into the strip behind its own toolbar, was a white block a fifth of
 * the screen tall. Now the bar steps aside while any of the footer is above it, and the room kept
 * for the bar under the footer (`.page`'s padding) is the footer's colour, so the page ends in the
 * footer's colour. Asserted on the PIXELS at the foot of the screen: a computed style can name the
 * right colour while something else is painted there.
 */
type Rgb = { r: number; g: number; b: number }

const rgbOf = (css: string): Rgb => {
  const [r = 0, g = 0, b = 0] = (css.match(/[\d.]+/g) ?? []).map(Number)
  return { r, g, b }
}
const distance = (a: Rgb, b: Rgb) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))

/** The mean colour of the bottom `rows` pixels of the screen, decoded in the page (no image library). */
async function footOfScreen(page: Page, rows: number): Promise<Rgb> {
  const size = page.viewportSize()
  if (!size) throw new Error('no viewport')
  const shot = (
    await page.screenshot({
      clip: { x: 0, y: size.height - rows, width: size.width, height: rows },
    })
  ).toString('base64')
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, img.width, img.height)
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] ?? 0
      g += data[i + 1] ?? 0
      b += data[i + 2] ?? 0
    }
    const n = data.length / 4
    return { r: r / n, g: g / n, b: b / n }
  }, shot)
}

test.describe('at the end of the page the bar steps aside and the footer runs to the bottom edge', () => {
  for (const phone of PHONES) {
    test(`at ${phone.name} the foot of the screen is the footer's colour, not paper`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(bar(page)).toBeVisible()
      const colours = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.background = 'var(--bg)'
        document.body.append(probe)
        const paper = getComputedStyle(probe).backgroundColor
        probe.remove()
        const slab = document.querySelector('.site-footer__slab') as HTMLElement
        return { paper, footer: getComputedStyle(slab).backgroundColor }
      })
      const footer = rgbOf(colours.footer)
      const paper = rgbOf(colours.paper)
      expect(
        distance(footer, paper),
        'the footer and the paper are the same colour',
      ).toBeGreaterThan(100)

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect
        .poll(async () => (await barStyle(page)).visibility, {
          message: 'the bar stayed up over the footer',
          timeout: 3_000,
        })
        .toBe('hidden')
      // The bottom 48px are inside the room kept for the bar (74px here), under the footer.
      const foot = await footOfScreen(page, 48)
      expect(
        distance(foot, footer),
        `the foot of the screen is ${JSON.stringify(foot)}`,
      ).toBeLessThan(8)

      // NEGATIVE CONTROL: with the room left unpainted, the same pixels are the page's paper — the
      // check sees the white band the owner reported.
      await page.addStyleTag({ content: '.page { background-image: none !important; }' })
      const plain = await footOfScreen(page, 48)
      expect(
        distance(plain, paper),
        `unpainted, the foot is ${JSON.stringify(plain)}`,
      ).toBeLessThan(8)

      // And the bar is back, usable, once the footer has scrolled off.
      await scrollToTop(page)
      await expect
        .poll(async () => (await barStyle(page)).visibility, {
          message: 'the bar did not come back once the footer scrolled off',
          timeout: 3_000,
        })
        .toBe('visible')
    })
  }
})
