import { expect, type Page, test } from './offlineMedia'
import { parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'
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
})
