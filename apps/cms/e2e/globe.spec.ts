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
// The company's name, as the seed and the Google listing carry it.
const NAME = 'RUN APPAREL (PVT) LTD'
// Directions to the Google listing, by name and address (polish X24, `lib/globe.ts`).
const MAPS = 'https://www.google.com/maps/dir/?api=1&destination='
const TO_THE_LISTING = `${MAPS}${encodeURIComponent(`${NAME}, ${ADDRESS}`)}`

test.describe('/contact, as the CMS is seeded here (no coordinates)', () => {
  test('the address and a directions link are there, and no canvas', async ({ page }) => {
    await page.goto('/contact')
    const globe = page.locator('.contact-globe')
    await expect(globe.locator('address')).toContainText('Sialkot')
    const link = globe.getByRole('link', { name: /Get directions/ })
    await expect(link).toHaveAttribute('href', new RegExp(`^${escapeRegExp(MAPS)}`))
    // To the listing, never to the rounded coordinates (polish X24).
    await expect(link).toHaveAttribute('href', TO_THE_LISTING)
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
      props: { coordinates: options.coordinates ?? COORDINATES, address: ADDRESS, name: NAME },
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

/*
 * ⚠️ NOTHING IS BUILT UNTIL THE GLOBE IS NEAR THE SCREEN (2026-09-29). Built at page load, cobe's
 * 16,000-sample sphere was one long task that blocked the main thread for 175 ms while a visitor
 * at the top of /contact was toggling the theme and typing their name — e2e/perfBudgets.spec.ts
 * PF-04 failed on it every run, and read 0 ms with the globe switched off. The contact page puts
 * the globe last, so on arrival it is screens away.
 */
test('the globe is not built until it is near the screen', async ({ page }) => {
  const html = await globeHarnessHtml()
  await page.route('**/__globe-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.addInitScript(
    (props) => {
      ;(window as unknown as { __GLOBE_PROPS: unknown }).__GLOBE_PROPS = props
      const w = window as unknown as { __draws: number }
      w.__draws = 0
      for (const name of ['WebGL2RenderingContext', 'WebGLRenderingContext'] as const) {
        const proto = (window as unknown as Record<string, { prototype: Record<string, unknown> }>)[
          name
        ]?.prototype
        if (!proto) continue
        const original = proto.drawArrays as ((...args: unknown[]) => unknown) | undefined
        if (!original) continue
        proto.drawArrays = function (this: unknown, ...args: unknown[]) {
          w.__draws += 1
          return original.apply(this, args)
        }
      }
      // Three screens of page above the globe, as /contact has above its last section.
      document.addEventListener('DOMContentLoaded', () => {
        document.body.style.paddingTop = '300vh'
      })
    },
    { coordinates: COORDINATES, address: ADDRESS },
  )
  await page.goto('/__globe-harness')
  const hasWebgl = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  })
  test.skip(!hasWebgl, 'this browser build has no WebGL, so cobe cannot draw here')
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => (window as unknown as { __draws: number }).__draws)).toBe(0)
  await expect(page.locator('.contact-globe__stage')).not.toHaveAttribute('data-globe', 'ready')
  // NEGATIVE CONTROL: once it is near, it is built and drawn.
  await page.locator('.contact-globe').scrollIntoViewIfNeeded()
  await expect(page.locator('.contact-globe__stage')).toHaveAttribute('data-globe', 'ready', {
    timeout: 15_000,
  })
})
const frame = (page: Page) => canvasOf(page).screenshot()

/**
 * Shares of the canvas that are land dots (polish X24). Measured 2026-10-05 in Chromium, Firefox and
 * WebKit alike: 1.20% on the light globe, 0.33% on the dark one (its lighter dots blend more at the
 * edge), and 0 with no land loaded (the control). The floor sits at a third of the dark globe's.
 */
const LAND = 0.001
const LAND_NONE = 0.0001

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
    // The page behind the canvas says the theme: paper is light, the dark ground is not.
    const dark = ((corner[0] ?? 0) + (corner[1] ?? 0) + (corner[2] ?? 0)) / 3 < 100
    let ink = 0
    // A land dot is grey: dark on the light globe's pale sphere, light on the dark one's black.
    // The arcs and the pin are the accent, olive or volt, never grey, so they are not counted.
    let land = 0
    const accentMask = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (!near(i, corner, 24)) ink++
        if (near(i, accent, 60)) accentMask[y * width + x] = 1
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        const grey = Math.max(r, g, b) - Math.min(r, g, b) < 30
        if (grey && (dark ? Math.min(r, g, b) > 120 : Math.max(r, g, b) < 130)) land++
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
      dark,
      ink,
      land,
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
      TO_THE_LISTING,
    )
  })

  /*
   * Polish F4 (owner Q19, 2026-10-04): with the dot and ring drawn, the globe shows no second
   * pointer. Its own `cursor: grab` used to win over the page's `cursor: none` by coming later;
   * base.css's rule is `!important` under `.has-custom-cursor` now. Without that class (a touch
   * screen, reduced motion, where the dot and ring never draw) the grab hand is still the pointer.
   */
  test('one pointer: no grab hand beside the dot and ring, and the grab hand without them', async ({
    page,
  }) => {
    await openHarness(page)
    const pointer = () => canvasOf(page).evaluate((element) => getComputedStyle(element).cursor)
    expect(await pointer(), 'without the dot and ring the globe lost its grab hand').toBe('grab')
    await page.evaluate(() => document.documentElement.classList.add('has-custom-cursor'))
    expect(await pointer(), 'a second pointer over the globe').toBe('none')
  })

  test('the frame is a real picture, not a blank canvas', async ({ page }) => {
    await openHarness(page)
    const seen = await inspect(page, await frame(page))
    // A globe of dots and arcs covers well over one pixel in fifty of its square.
    expect(seen.ink, 'the canvas is blank').toBeGreaterThan(seen.width * seen.height * 0.02)
  })

  /*
   * ⚠️ POLISH X24 (2026-10-05): A STILL GLOBE HAD NO LAND. cobe draws its first frame on a 1x1
   * placeholder and swaps the land in when its image loads, without drawing again. This harness's
   * globe is still (automation), so every frame here was an empty sphere with arcs, and so was the
   * page of every visitor who asks for less motion: the "pale globe" of the audit of 3 October.
   * The globe now paints the land in once it has loaded, before it is marked ready
   * (ContactGlobe.tsx, `createWithLand`).
   */
  test('a still globe draws its land, in both themes', async ({ page }) => {
    await openHarness(page)
    const light = await inspect(page, await frame(page))
    expect(light.dark).toBe(false)
    expect(light.land, `no land on the light globe (${light.land} grey pixels)`).toBeGreaterThan(
      light.width * light.height * LAND,
    )
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await expect.poll(async () => (await inspect(page, await frame(page))).dark).toBe(true)
    const dark = await inspect(page, await frame(page))
    expect(dark.land, `no land on the dark globe (${dark.land} grey pixels)`).toBeGreaterThan(
      dark.width * dark.height * LAND,
    )
  })

  test('CONTROL: with no land to load, the same reading finds none', async ({ page }) => {
    // cobe's land is a 1,091-byte PNG data URI: give it one black pixel instead, which is what its
    // placeholder draws. The frames this suite reads are far longer, and load as they are.
    await page.addInitScript(() => {
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
      const pixel =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=='
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...source,
        set(value: string) {
          const land = value.startsWith('data:image/png') && value.length < 4000
          source?.set?.call(this, land ? pixel : value)
        },
      })
    })
    await openHarness(page)
    const seen = await inspect(page, await frame(page))
    expect(seen.ink, 'the control drew nothing at all').toBeGreaterThan(
      seen.width * seen.height * 0.02,
    )
    expect(seen.land, `land was found where none was loaded (${seen.land})`).toBeLessThan(
      seen.width * seen.height * LAND_NONE,
    )
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

    // Polish F7 (the owner's answer Q20): it turns until a visitor takes hold of it, then stays.
    test('a press stops it turning by itself, for good', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await openHarness(page, { lift: true })
      await canvasOf(page).scrollIntoViewIfNeeded()
      const turning = await twoFrames(page)
      expect(turning.first.equals(turning.second), 'not turning before the press').toBe(false)

      const box = await canvasOf(page).boundingBox()
      if (!box) throw new Error('no canvas box')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.up()
      // Past the arcs' drawing-in (`--showpiece`), so only a spin could still change the frame.
      await page.waitForTimeout(3000)
      const still = await twoFrames(page)
      expect(
        (await inspect(page, still.first)).ink,
        'a blank frame proves nothing',
      ).toBeGreaterThan(0)
      expect(still.first.equals(still.second), 'it turned by itself after being touched').toBe(true)
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
