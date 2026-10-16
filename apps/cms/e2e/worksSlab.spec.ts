import { expect, type Page, test } from './offlineMedia'
import { contrastOf, parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'
import { type LatLon, parseCoordinates } from '../src/lib/globe'
import { mapPoint } from '../src/lib/worldMap'

/**
 * Polish X7 (2026-10-05): №05 "The works" ends in one slab of two halves, "Where we ship" and
 * "Certification" (FactsBento.tsx, site.css `.works-slab`).
 *
 * The audit of 3 October found the two notes lopsided: one line ("Worldwide — wherever your team
 * is.") beside a seven-line certification paragraph, a hole on the left. The shipping half now draws
 * the world, dotted, with the works pinned, and the certification half the footer's marks beside
 * one line per holder. The marks are the bodies' reversed artwork, off-white for a dark ground, so
 * the slab is dark in both themes.
 *
 * Since the owner merged №06 "Talk to us" into №05 (2026-10-16, D40), a slim row under the slab
 * holds the home page's one closing ask (`.works-ask`), and the pin breathes.
 */

const settle = async (page: Page, width: number, scheme: 'light' | 'dark' = 'light') => {
  await page.setViewportSize({ width, height: 900 })
  // Firefox loses an `emulateMedia` made before the first navigation (legibility.spec.ts).
  await page.goto('/')
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  // The pictures load lazily: bring the slab on screen, then wait for every one of them.
  await page.locator('.works-slab').scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('.works-slab img')].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)
}

/** The slab's two halves: their boxes, and how much each one holds (its parts' heights, summed). */
const halves = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.works-slab__half')].map((half) => {
      const box = half.getBoundingClientRect()
      const held = [...half.children].reduce(
        (sum, child) => sum + child.getBoundingClientRect().height,
        0,
      )
      return { top: box.top, left: box.left, right: box.right, bottom: box.bottom, held }
    }),
  )

/** How light the slab's own ground is: under 0.2 is dark. */
const slabLuminance = (page: Page) =>
  page
    .evaluate(
      () => getComputedStyle(document.querySelector('.works-slab') as Element).backgroundColor,
    )
    .then((colour) => relativeLuminance(parseCssColour(colour).rgb))

test.describe('X7 — №05 ends in one slab: where we ship | certification', () => {
  test('on a computer the two halves sit side by side, level, and hold about as much as each other', async ({
    page,
  }) => {
    await settle(page, 1280)
    const [ship, cert] = await halves(page)
    expect(ship && cert, 'the slab does not have two halves').toBeTruthy()
    if (!ship || !cert) return
    expect(Math.abs(ship.top - cert.top), 'the halves do not start level').toBeLessThanOrEqual(1)
    expect(ship.right, 'the halves overlap').toBeLessThanOrEqual(cert.left + 1)
    // Before X7: one line beside seven, about a quarter. Now the map balances the marks.
    const balance = Math.min(ship.held, cert.held) / Math.max(ship.held, cert.held)
    expect(balance, `the halves hold ${ship.held}px and ${cert.held}px`).toBeGreaterThan(0.6)

    // NEGATIVE CONTROL: without its map, the shipping half is the one line it was again.
    await page.addStyleTag({ content: '.ship-map { display: none !important; }' })
    await expect
      .poll(async () => {
        const [a, b] = await halves(page)
        return a && b ? Math.min(a.held, b.held) / Math.max(a.held, b.held) : 1
      })
      .toBeLessThan(0.6)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the marks sit on a dark ground, every one of them drawn, beside the holder that holds it`, async ({
      page,
    }) => {
      await settle(page, 1280, scheme)
      expect(await slabLuminance(page), 'the slab is not dark').toBeLessThan(0.2)
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll('.cert')].map((row) => ({
          marks: [...row.querySelectorAll<HTMLImageElement>('.cert__mark')].map((img) => img.alt),
          line: (row.querySelector('.works-slab__line')?.textContent ?? '').trim(),
        })),
      )
      expect(rows.flatMap((row) => row.marks)).toEqual([
        'Sedex',
        'SMETA',
        'ISO 9001',
        'OEKO-TEX',
        'GOTS',
        'GRS',
      ])
      for (const row of rows) {
        for (const mark of row.marks) {
          expect(row.line.toUpperCase(), `"${mark}" beside a line that does not name it`).toContain(
            mark.toUpperCase(),
          )
        }
      }
      // The parent's marks name the parent, and the registry stands as text, with no mark.
      expect(rows[0]?.line).toContain('DURUS INDUSTRIES')
      expect(rows.at(-1)?.marks).toEqual([])

      // NEGATIVE CONTROL: on the light page's paper, where the off-white marks would vanish, the
      // reading sees a light slab.
      await page.addStyleTag({ content: '.works-slab { --slab-bg: var(--paper) !important; }' })
      await expect.poll(() => slabLuminance(page)).toBeGreaterThan(0.5)
    })
  }

  test('the pin stands where the projection puts the works, inside the map', async ({ page }) => {
    await settle(page, 1280)
    // The pin is drawn only from the CMS's `worksCoordinates`, never a default, and neither this
    // database nor CI's holds them (production does). So where the page has none, one is planted
    // with the projection's own values: what is tested is where the slab's styles put a pin.
    const { x, y } = mapPoint(parseCoordinates('32.41° N · 74.46° E') as LatLon)
    const planted = await page.evaluate(
      ({ x, y }) => {
        if (document.querySelector('.ship-map__pin')) return false
        const pin = document.createElement('span')
        pin.className = 'ship-map__pin'
        pin.setAttribute('aria-hidden', 'true')
        pin.style.setProperty('--pin-x', `${(x * 100).toFixed(2)}%`)
        pin.style.setProperty('--pin-y', `${(y * 100).toFixed(2)}%`)
        const name = document.createElement('span')
        name.className = 'ship-map__name'
        name.textContent = 'Sialkot'
        pin.append(name)
        document.querySelector('.ship-map')?.append(pin)
        return true
      },
      { x, y },
    )
    test.info().annotations.push({
      type: 'X7',
      description: planted
        ? 'no works coordinates here: the pin was planted'
        : 'the page’s own pin',
    })
    const map = await page.evaluate(() => {
      const land = document.querySelector('.ship-map__land')?.getBoundingClientRect()
      const pin = document.querySelector('.ship-map__pin')?.getBoundingClientRect()
      return {
        land: land
          ? { left: land.left, right: land.right, top: land.top, bottom: land.bottom }
          : null,
        pin: pin ? { x: pin.left + pin.width / 2, y: pin.top + pin.height / 2 } : null,
        name: document.querySelector('.ship-map__name')?.textContent ?? '',
        hidden: document.querySelector('.ship-map__pin')?.getAttribute('aria-hidden'),
        alt: document.querySelector('.ship-map__land')?.getAttribute('alt'),
      }
    })
    expect(map.land && map.pin, 'no map, or no pin').toBeTruthy()
    if (!map.land || !map.pin) return
    // The pin's centre is the projected point on the drawn map, to the pixel.
    const width = map.land.right - map.land.left
    const height = map.land.bottom - map.land.top
    expect(Math.abs(map.pin.x - (map.land.left + x * width))).toBeLessThanOrEqual(1)
    expect(Math.abs(map.pin.y - (map.land.top + y * height))).toBeLessThanOrEqual(1)
    expect(map.name).toBe('Sialkot')
    // Decoration: the picture is empty to a screen reader, and so is the page's own pin (a planted
    // one says nothing about the page; FactsBento.test.ts holds the attribute); the line says it.
    expect(map.alt).toBe('')
    if (!planted) expect(map.hidden).toBe('true')
    await expect(page.locator('.works-slab')).toContainText('Worldwide — wherever your team is.')
  })

  test('on a phone the halves stack, and nothing runs past the screen', async ({ page }) => {
    await settle(page, 390)
    const [ship, cert] = await halves(page)
    expect(ship && cert).toBeTruthy()
    if (!ship || !cert) return
    expect(
      cert.top,
      'the certification half is not under the shipping half',
    ).toBeGreaterThanOrEqual(ship.bottom - 1)
    const overflow = await page.evaluate(() => {
      const slab = document.querySelector('.works-slab')?.getBoundingClientRect()
      return {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        slab: slab ? slab.right - document.documentElement.clientWidth : 0,
      }
    })
    expect(overflow.page, 'the page scrolls sideways').toBe(0)
    expect(overflow.slab, 'the slab runs past the screen').toBeLessThanOrEqual(0)
  })

  /*
   * The pin breathes (owner, 2026-10-16), by scale and fade alone, and never for someone who asked
   * for less motion. What would have to break: the loop running under reduced motion, or its
   * keyframes reaching for a property that costs a layout pass. The control plants a second
   * `ship-map-breathe` that animates `width`, and the same reading must see it.
   */
  test('the pin breathes by scale and fade alone, and not under reduced motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    const ring = () =>
      page.evaluate(() => {
        const pin = document.createElement('span')
        pin.className = 'ship-map__pin'
        document.querySelector('.ship-map')?.append(pin)
        const name = getComputedStyle(pin, '::after').animationName
        pin.remove()
        return name
      })
    const keyframeProperties = () =>
      page.evaluate(() => {
        const properties = new Set<string>()
        const walk = (rules: CSSRuleList) => {
          for (const rule of rules) {
            if (rule instanceof CSSKeyframesRule && rule.name === 'ship-map-breathe') {
              for (const frame of rule.cssRules) {
                const style = (frame as CSSKeyframeRule).style
                for (let i = 0; i < style.length; i++) properties.add(style.item(i))
              }
            } else if ('cssRules' in rule) {
              walk((rule as CSSGroupingRule).cssRules)
            }
          }
        }
        for (const sheet of document.styleSheets) {
          try {
            walk(sheet.cssRules)
          } catch {
            // a cross-origin sheet: not ours
          }
        }
        return [...properties].sort()
      })

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    expect(await ring()).toBe('ship-map-breathe')
    expect(await keyframeProperties()).toEqual(['opacity', 'transform'])
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await ring()).toBe('none')

    // NEGATIVE CONTROL: a breath that animates width is seen.
    await page.addStyleTag({
      content: '@keyframes ship-map-breathe { to { width: 40px; } }',
    })
    expect(await keyframeProperties()).toContain('width')
  })
})

/** The row's parts: their boxes, the slab's, and the colours of each against the ground under it. */
const askRow = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      return rect
        ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
        : null
    }
    // The row has no ground of its own: the first painted ancestor's is the one the words sit on.
    const ground = (selector: string) => {
      for (let el = document.querySelector(selector); el; el = el.parentElement) {
        const colour = getComputedStyle(el).backgroundColor
        if (colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') return colour
      }
      return getComputedStyle(document.documentElement).backgroundColor
    }
    const colour = (selector: string) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).color : ''
    }
    const link = (selector: string) => {
      const el = document.querySelector(selector)
      return { text: el?.textContent?.trim() ?? '', href: el?.getAttribute('href') ?? '' }
    }
    return {
      slab: box('.works-slab'),
      words: box('.works-ask__words'),
      actions: box('.works-ask__actions'),
      ground: ground('.works-ask'),
      heading: colour('.works-ask__heading'),
      clock: colour('.works-clock'),
      button: link('.works-ask .btn--primary'),
      call: link('.works-ask .btn--ghost'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })

test.describe('D40 — under the slab, one slim row holds the home page’s closing ask', () => {
  test('on a computer the words take the left and the buttons the right, under the slab', async ({
    page,
  }) => {
    await settle(page, 1280)
    const row = await askRow(page)
    expect(row.slab && row.words && row.actions, 'no slab, or no row').toBeTruthy()
    if (!row.slab || !row.words || !row.actions) return
    expect(row.words.top, 'the row is not under the slab').toBeGreaterThanOrEqual(row.slab.bottom)
    expect(row.actions.left, 'the buttons are not beside the words').toBeGreaterThanOrEqual(
      row.words.right,
    )
    expect(row.actions.right, 'the row runs past the slab').toBeLessThanOrEqual(row.slab.right + 1)
    expect(row.button).toEqual({ text: 'Start a conversation', href: '/contact#inquiry' })
    expect(row.call.text).toMatch(/^Or book a call/)
    expect(row.call.href).toBe('https://wear-run.com/meeting')

    // NEGATIVE CONTROL: put inside the slab, the row is no longer under it.
    await page.evaluate(() => {
      const ask = document.querySelector('.works-ask')
      if (ask) document.querySelector('.works-slab')?.prepend(ask)
    })
    const inside = await askRow(page)
    expect(inside.words && inside.slab && inside.words.top < inside.slab.bottom).toBe(true)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: the heading and the clock read on the page's own ground`, async ({ page }) => {
      await settle(page, 1280, scheme)
      const row = await askRow(page)
      expect(contrastOf(row.heading, row.ground), 'the heading').toBeGreaterThanOrEqual(4.5)
      expect(contrastOf(row.clock, row.ground), 'the clock').toBeGreaterThanOrEqual(4.5)

      // NEGATIVE CONTROL: a heading in the page's wash is caught. Polled, as the slab's control is:
      // measured in Chromium, the planted colour read as the old ink straight after the tag landed
      // and as the wash 1.5 s later.
      await page.addStyleTag({ content: '.works-ask__heading { color: var(--wash) !important; }' })
      await expect
        .poll(async () => {
          const washed = await askRow(page)
          return contrastOf(washed.heading, washed.ground)
        })
        .toBeLessThan(4.5)
    })
  }

  /*
   * The works' live clock moved from the footer's question into the row (2026-10-16). It is honest
   * before it hydrates ("--:--", tested in FactsBento.test.ts) and reads the real time once it has;
   * this suite's database holds no opening hours, so no open or closed light is drawn.
   */
  test("the row's clock reads the works' time once it runs", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await expect(page.locator('.works-clock')).toHaveText(/Local time\s*\d\d:\d\d PKT/)
  })

  test('on a phone the buttons come under the words, and nothing runs past the screen', async ({
    page,
  }) => {
    await settle(page, 390)
    const row = await askRow(page)
    expect(row.words && row.actions).toBeTruthy()
    if (!row.words || !row.actions) return
    expect(row.actions.top, 'the buttons are not under the words').toBeGreaterThanOrEqual(
      row.words.bottom - 1,
    )
    expect(row.overflow, 'the page scrolls sideways').toBe(0)
  })
})
