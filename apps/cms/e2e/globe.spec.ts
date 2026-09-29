import { globeHarnessHtml } from './globeHarness'
import { expect, type Page, test } from './offlineMedia'

/**
 * The contact page's globe (Task 15, owner 2026-09-29).
 *
 * What would have to break for these to fail: the address and directions link leaving the
 * server's markup; a canvas that mounts blank, or on a device with no WebGL; a globe that spins
 * under reduced motion or under automation; a pin drawn on the far side of the planet; a theme
 * switch the picture ignores; a frame loop that keeps running off screen; or a request to any
 * host but our own.
 *
 * ⚠️ TWO PLACES, ON PURPOSE. `/contact` shows the globe only when the CMS holds
 * `worksCoordinates`, which has no default and which this suite's database does not hold
 * (`globeHarness.ts` has the whole reason). So `/contact` is tested for what it does WITHOUT
 * coordinates, and the canvas is tested on a harness page that mounts the same component with the
 * same stylesheets and the same cobe, coordinates passed in.
 *
 * ⚠️ A FRAME IS READ BY SCREENSHOT, NOT BY READING THE WEBGL BUFFER. cobe draws with
 * `preserveDrawingBuffer: false`, so `toDataURL()` outside the frame that drew returns blank —
 * two blank frames are "identical", which is how a reduced-motion test once passed while
 * measuring nothing (`.claude/rules/tests-and-fixtures.md`). A screenshot captures what the
 * compositor showed. And every comparison first asserts the frame is not blank, and that the
 * same comparison DOES see a difference when the globe is set turning (the negative control).
 */

// A test value, not a claim about the works: the harness passes it in.
const COORDINATES = '32.49° N · 74.52° E'
const ADDRESS = '13 Km Daska Road, Sialkot, 51040, Pakistan'
const MAPS = 'https://www.google.com/maps/search/?api=1&query='

test.describe('/contact, as the CMS is seeded here (no coordinates)', () => {
  test('the address and a directions link are there, and no canvas', async ({ page }) => {
    await page.goto('/contact')
    const globe = page.locator('.contact-globe')
    await expect(globe.locator('address')).toContainText('Sialkot')
    const link = globe.getByRole('link', { name: /Get directions/ })
    await expect(link).toHaveAttribute('href', new RegExp(`^${escapeRegExp(MAPS)}`))
    await expect(link).toHaveAttribute('rel', 'noopener')
    // The blank claim means no picture, and never a hard-coded one. If a future database
    // holds coordinates the canvas is expected instead.
    const hasCoordinates = (await globe.locator('.contact-globe__coords').count()) > 0
    await expect(globe.locator('canvas')).toHaveCount(hasCoordinates ? 1 : 0)
  })

  test('the directions link clears the 44px floor', async ({ page }) => {
    await page.goto('/contact')
    const box = await page.locator('.contact-globe__link').boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })

  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })
    test('the address and the directions link are still on the page', async ({ page }) => {
      await page.goto('/contact')
      await expect(page.locator('.contact-globe address')).toContainText('Sialkot')
      await expect(page.locator('.contact-globe__link')).toHaveAttribute(
        'href',
        /google\.com\/maps/,
      )
      await expect(page.locator('.contact-globe canvas')).toHaveCount(0)
    })
  })
})

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Options {
  /** Lift `navigator.webdriver`, as the cursor's and the counters' tests do, so it may move. */
  lift?: boolean
  coordinates?: string
}

async function openHarness(page: Page, options: Options = {}) {
  const html = await globeHarnessHtml()
  await page.route('**/__globe-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.addInitScript(
    ({ props, lift }) => {
      ;(window as unknown as { __GLOBE_PROPS: unknown }).__GLOBE_PROPS = props
      if (lift) Object.defineProperty(navigator, 'webdriver', { get: () => false })
      // A count of GPU draws, for the "stops when off screen" case.
      const w = window as unknown as { __draws: number }
      w.__draws = 0
      for (const name of ['WebGL2RenderingContext', 'WebGLRenderingContext'] as const) {
        const proto = (window as unknown as Record<string, { prototype: Record<string, unknown> }>)[
          name
        ]?.prototype
        if (!proto) continue
        for (const method of ['drawArrays', 'drawArraysInstanced'] as const) {
          const original = proto[method] as ((...args: unknown[]) => unknown) | undefined
          if (!original) continue
          proto[method] = function (this: unknown, ...args: unknown[]) {
            w.__draws += 1
            return original.apply(this, args)
          }
        }
      }
    },
    {
      props: { coordinates: options.coordinates ?? COORDINATES, address: ADDRESS },
      lift: options.lift ?? false,
    },
  )
  await page.goto('/__globe-harness')
  const hasWebgl = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  })
  test.skip(!hasWebgl, 'this browser build has no WebGL, so cobe cannot draw here')
  await expect(page.locator('.contact-globe__stage')).toHaveAttribute('data-globe', 'ready', {
    timeout: 15_000,
  })
}

const canvasOf = (page: Page) => page.locator('.contact-globe__canvas')
const frame = (page: Page) => canvasOf(page).screenshot()

/** What a frame contains, read in the page: how much is not paper, and where the accent is. */
async function inspect(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('no 2d context to read the frame with')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const swatch = document.createElement('span')
    swatch.style.color = 'var(--dimension)'
    document.body.appendChild(swatch)
    const accent = getComputedStyle(swatch)
      .color.match(/[\d.]+/g)
      ?.map(Number) ?? [0, 0, 0]
    swatch.remove()
    const corner = [data[0], data[1], data[2]]
    const near = (i: number, target: number[], tolerance: number) =>
      Math.abs((data[i] ?? 0) - (target[0] ?? 0)) +
        Math.abs((data[i + 1] ?? 0) - (target[1] ?? 0)) +
        Math.abs((data[i + 2] ?? 0) - (target[2] ?? 0)) <
      tolerance
    const { width, height } = canvas
    let ink = 0
    const accentMask = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (!near(i, corner, 24)) ink++
        if (near(i, accent, 60)) accentMask[y * width + x] = 1
      }
    }
    // The pin is a filled disc; an arc is a line a couple of pixels wide. A pixel counts as pin
    // only if a 9x9 window around it is nearly all accent, so arcs crossing the middle of a ball
    // whose pin is on the far side are not mistaken for the pin (the first draft of this read
    // them as one, and passed with the pin on the wrong side of the planet).
    const half = 4
    let pinPixels = 0
    let sumX = 0
    let sumY = 0
    for (let y = half; y < height - half; y++) {
      for (let x = half; x < width - half; x++) {
        if (!accentMask[y * width + x]) continue
        let hits = 0
        for (let wy = -half; wy <= half; wy++) {
          for (let wx = -half; wx <= half; wx++) hits += accentMask[(y + wy) * width + x + wx] ?? 0
        }
        if (hits >= 70) {
          pinPixels++
          sumX += x
          sumY += y
        }
      }
    }
    return {
      width,
      height,
      ink,
      pinPixels,
      pinX: pinPixels ? sumX / pinPixels / width : null,
      pinY: pinPixels ? sumY / pinPixels / height : null,
    }
  }, png.toString('base64'))
}

test.describe('the globe, on a page of its own', () => {
  test('a canvas with a size, hidden from assistive technology, at a capped resolution', async ({
    page,
  }) => {
    await openHarness(page)
    const canvas = canvasOf(page)
    await expect(canvas).toHaveAttribute('aria-hidden', 'true')
    const box = await canvas.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(0)
    expect(box?.height ?? 0).toBeGreaterThan(0)
    const backing = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      css: el.getBoundingClientRect().width,
    }))
    expect(backing.width).toBeGreaterThan(0)
    expect(backing.width).toBeLessThanOrEqual(Math.ceil(backing.css * 2) + 1)
    // Server-first content survives hydration, beside the picture.
    await expect(page.locator('.contact-globe__coords')).toHaveText(COORDINATES)
    await expect(page.getByRole('link', { name: /Get directions/ })).toHaveAttribute(
      'href',
      `${MAPS}32.49,74.52`,
    )
  })

  test('the frame is a real picture, not a blank canvas', async ({ page }) => {
    await openHarness(page)
    const seen = await inspect(page, await frame(page))
    // A globe of dots and arcs covers well over one pixel in fifty of its square.
    expect(seen.ink, 'the canvas is blank').toBeGreaterThan(seen.width * seen.height * 0.02)
  })

  test('the works pin faces the viewer, and a drag turns it away', async ({ page }) => {
    await openHarness(page)
    const facing = await inspect(page, await frame(page))
    expect(facing.pinPixels, 'no pin in the first frame').toBeGreaterThan(20)
    expect(Math.abs((facing.pinX ?? 0) - 0.5), 'the pin is not in the middle across').toBeLessThan(
      0.15,
    )
    expect(Math.abs((facing.pinY ?? 0) - 0.5), 'the pin is not in the middle down').toBeLessThan(
      0.25,
    )

    // 0.006 rad a pixel: three sweeps of about 480px turn it 132 degrees, past the edge.
    const box = await canvasOf(page).boundingBox()
    if (!box) throw new Error('no canvas box')
    const y = box.y + box.height / 2
    for (let pass = 0; pass < 3; pass++) {
      await page.mouse.move(box.x + 20, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 20, y, { steps: 10 })
      await page.mouse.up()
    }
    const away = await inspect(page, await frame(page))
    expect(
      away.pinPixels,
      'dragging did not turn the pin out of sight (the drag is dead)',
    ).toBeLessThan(facing.pinPixels / 4)
  })

  test('the page picks the colours up again when the theme changes', async ({ page }) => {
    await openHarness(page)
    const light = await frame(page)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await expect
      .poll(async () => (await frame(page)).equals(light), {
        message: 'the picture did not change when the page went dark',
      })
      .toBe(false)
    const dark = await inspect(page, await frame(page))
    expect(dark.ink).toBeGreaterThan(0)
  })

  test('it asks for nothing outside this origin and stores nothing', async ({ page, context }) => {
    const hosts = new Set<string>()
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.protocol.startsWith('http')) hosts.add(url.host)
    })
    await openHarness(page)
    expect([...hosts], 'a request left this origin').toEqual([new URL(page.url()).host])
    expect(await context.cookies()).toEqual([])
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  })

  test.describe('motion', () => {
    /*
     * ⚠️ THE CONTROL COMES FIRST, AND IT IS THE POINT. "Two frames 500ms apart are identical" is
     * true of a blank canvas, a crashed loop and a screenshot of nothing. So the same two-frame
     * read is first run on a globe that IS allowed to turn, and must see it turn.
     */
    async function twoFrames(page: Page) {
      const first = await frame(page)
      await page.waitForTimeout(500)
      const second = await frame(page)
      return { first, second }
    }

    test('CONTROL: allowed to move, the two frames differ', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await openHarness(page, { lift: true })
      await canvasOf(page).scrollIntoViewIfNeeded()
      const { first, second } = await twoFrames(page)
      expect((await inspect(page, first)).ink).toBeGreaterThan(0)
      expect(
        first.equals(second),
        'the globe is not turning, so the still tests below prove nothing',
      ).toBe(false)
    })

    test('reduced motion: two frames 500ms apart are identical', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // The flag is lifted so that only the preference can be what holds it still.
      await openHarness(page, { lift: true })
      await canvasOf(page).scrollIntoViewIfNeeded()
      const { first, second } = await twoFrames(page)
      expect((await inspect(page, first)).ink, 'a blank frame proves nothing').toBeGreaterThan(0)
      expect(first.equals(second), 'the globe turned under prefers-reduced-motion').toBe(true)
    })

    test('under automation, with the flag left as it is, it does not move either', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await openHarness(page)
      await canvasOf(page).scrollIntoViewIfNeeded()
      const { first, second } = await twoFrames(page)
      expect((await inspect(page, first)).ink).toBeGreaterThan(0)
      expect(first.equals(second), 'the globe turned under navigator.webdriver').toBe(true)
    })

    test('it stops drawing while it is off screen, and starts again when seen', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await openHarness(page, { lift: true })
      const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws)
      await canvasOf(page).scrollIntoViewIfNeeded()
      const before = await draws()
      await page.waitForTimeout(300)
      expect(await draws(), 'the globe is not drawing on screen').toBeGreaterThan(before)

      await page.evaluate(() => {
        const spacer = document.createElement('div')
        spacer.style.height = '6000px'
        document.querySelector('.contact-globe__stage')?.before(spacer)
        window.scrollTo(0, 0)
      })
      await page.waitForTimeout(400)
      const parked = await draws()
      await page.waitForTimeout(400)
      expect(await draws(), 'the globe kept drawing while it was off screen').toBe(parked)

      await canvasOf(page).scrollIntoViewIfNeeded()
      await expect.poll(draws).toBeGreaterThan(parked)
    })
  })
})
