import { expect, type Page, test } from './offlineMedia'

/**
 * The /products hero film (owner, 2026-10-01; `src/components/site/ProductsFilm.tsx`,
 * `src/lib/productsFilm.ts`). What a visitor needs from it, each asserted below:
 *   - the hero is complete with scripting off: the still, the words, no film, no button;
 *   - the film adds no height: the garment cards start where they did;
 *   - an ordinary visit plays it, muted and looping, with NO pause button: the owner's choice
 *     (polish D5, 2026-10-04; ProductsFilm.tsx has the WCAG 2.2.2 account);
 *   - it never starts by itself under reduced motion, on Data Saver or under automation, and stops
 *     the moment reduced motion is switched on: the part of 2.2.2 that is kept;
 *   - it pauses when scrolled away;
 *   - the words keep 4.5:1 over the film's lightest pixels, and the probe that says so fails when
 *     the dark wash is taken away.
 *
 * ⚠️ `next start` ANSWERS RANGE REQUESTS ITSELF; production's static files do not, which is why
 * worker.mjs serves the film (filmRange.mjs). This suite cannot see that half: `src/filmRange.test.ts`
 * and the local Cloudflare preview check in docs/DESIGN.md do.
 *
 * Chromium and Firefox both decode the AV1 file, which the page offers first.
 */

/** As the site's other pieces: a test that wants the film lifts the automation flag. */
const asAVisitor = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

const film = (page: Page) => page.locator('.site-hero--film video')
/** Any button in the hero: there must be none (polish D5). */
const heroButton = (page: Page) => page.locator('.site-hero--film button')
const isPlaying = (page: Page) =>
  film(page).evaluate((video: HTMLVideoElement) => !video.paused && video.currentTime > 0.1)

test.describe('the /products film', () => {
  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    test('the hero shows the still and the words, and no film or button', async ({ page }) => {
      // Read from the network, not the page: with scripting off Firefox answers no property read.
      const stillArrives = page.waitForResponse(
        (response) =>
          /\/film\/tie-dye-hoodie-\d+\.(avif|webp)$/.test(response.url()) &&
          response.status() === 200,
      )
      await page.goto('/products')
      await stillArrives
      await expect(page.locator('.site-hero--film img')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Every garment/)
      await expect(film(page)).toHaveCount(0)
      await expect(heroButton(page)).toHaveCount(0)
    })
  })

  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`the hero is exactly as tall as its words at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/products')
      await expect(page.locator('.site-hero--film img')).toBeVisible()
      const m = await page.evaluate(() => {
        const hero = document.querySelector('.site-hero--film') as HTMLElement
        const words = hero.querySelector('.site-container') as HTMLElement
        const style = getComputedStyle(hero)
        return {
          hero: hero.getBoundingClientRect().height,
          words:
            words.getBoundingClientRect().height +
            Number.parseFloat(style.paddingTop) +
            Number.parseFloat(style.paddingBottom) +
            Number.parseFloat(style.borderBottomWidth),
        }
      })
      // The still and the film are absolutely placed, so they fill the hero without sizing it: the
      // garment cards below start where they did before the film (662px at 390x844 and 798px at
      // 1440x900, measured on this Mac on 2026-10-02 before the change).
      expect(Math.abs(m.hero - m.words), JSON.stringify(m)).toBeLessThan(1)
    })
  }

  test('an ordinary visit plays it, muted and looping, with no pause button', async ({ page }) => {
    await asAVisitor(page)
    await page.goto('/products')
    await expect(film(page)).toHaveCount(1)
    await expect.poll(() => isPlaying(page), { timeout: 10_000 }).toBe(true)
    const flags = await film(page).evaluate((video: HTMLVideoElement) => ({
      muted: video.muted,
      loop: video.loop,
      inline: video.hasAttribute('playsinline'),
      hidden: video.getAttribute('aria-hidden'),
      source: video.currentSrc.split('/').pop(),
    }))
    expect(flags).toEqual({
      muted: true,
      loop: true,
      inline: true,
      hidden: 'true',
      source: 'tie-dye-hoodie-av1.mp4',
    })
    // The owner's choice (polish D5): the film loops, and nothing in the hero offers to pause it.
    await expect(heroButton(page)).toHaveCount(0)
  })

  // What is kept of WCAG 2.2.2 without the button: a visitor who asks for less motion gets none.
  test('it stops the moment reduced motion is switched on', async ({ page }) => {
    await asAVisitor(page)
    await page.goto('/products')
    await expect.poll(() => isPlaying(page), { timeout: 10_000 }).toBe(true)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect
      .poll(() => film(page).evaluate((video: HTMLVideoElement) => video.paused))
      .toBe(true)
  })

  test('it pauses when scrolled away and plays again on return', async ({ page }) => {
    await asAVisitor(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/products')
    await expect.poll(() => isPlaying(page), { timeout: 10_000 }).toBe(true)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    await expect
      .poll(() => film(page).evaluate((video: HTMLVideoElement) => video.paused))
      .toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect
      .poll(() => film(page).evaluate((video: HTMLVideoElement) => !video.paused))
      .toBe(true)
  })

  for (const { why, setUp } of [
    {
      why: 'under reduced motion',
      setUp: (page: Page) => page.emulateMedia({ reducedMotion: 'reduce' }),
    },
    {
      why: 'on Data Saver',
      setUp: (page: Page) =>
        page.addInitScript(() => {
          Object.defineProperty(navigator, 'connection', { value: { saveData: true } })
        }),
    },
  ]) {
    test(`it never starts by itself ${why}: the still stays`, async ({ page }) => {
      await asAVisitor(page)
      await setUp(page)
      await page.goto('/products')
      await page.waitForLoadState('load')
      await expect(page.locator('.site-hero--film img')).toBeVisible()
      await expect(film(page), 'the film loaded although it was not wanted').toHaveCount(0)
      await expect(heroButton(page)).toHaveCount(0)
    })
  }

  test('under automation it stays a still, honestly (the default every other test sees)', async ({
    page,
  }) => {
    await page.goto('/products')
    await page.waitForLoadState('load')
    await expect(film(page)).toHaveCount(0)
    await expect(heroButton(page)).toHaveCount(0)
  })
})

/**
 * The lightest tenth of the pixels behind one element, with the words hidden, as relative luminance.
 * Decoded in the page (a data: image is allowed by the site's img-src), so no image library is needed.
 */
async function lightestBehind(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`${selector} has no box`)
  // ⚠️ HIDDEN FOR CERTAIN BEFORE THE PICTURE. The first version hid the words with a plain style
  // change under reduced motion, and the headline still computed `visible` right after it, so the
  // probe photographed the words themselves and read 1.00:1 (2026-10-02). Transitions off, and a wait
  // for `hidden`, make the picture the background alone.
  const hide = await page.addStyleTag({
    content:
      '.site-hero--film .site-container { visibility: hidden !important; transition: none !important; }',
  })
  await expect
    .poll(() => page.locator(selector).evaluate((element) => getComputedStyle(element).visibility))
    .toBe('hidden')
  const png = (await page.screenshot({ clip: box })).toString('base64')
  await hide.evaluate((style) => style.remove())
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d') as CanvasRenderingContext2D
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const linear = (value: number) => {
      const c = value / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const luminance: number[] = []
    for (let i = 0; i < pixels.length; i += 4) {
      luminance.push(
        0.2126 * linear(pixels[i]!) +
          0.7152 * linear(pixels[i + 1]!) +
          0.0722 * linear(pixels[i + 2]!),
      )
    }
    luminance.sort((a, b) => a - b)
    return luminance[Math.floor(luminance.length * 0.9)] ?? 1
  }, png)
}

const textLuminance = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const [r, g, b] = (getComputedStyle(element).color.match(/[\d.]+/g) ?? []).map(Number)
    const linear = (value = 0) => {
      const c = value / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
  })

const ratio = (light: number, dark: number) => (light + 0.05) / (dark + 0.05)

test.describe('the words over the film (WCAG 1.4.3, measured from real pixels)', () => {
  // Automation keeps the still (the film never starts by itself under it), and the still is the
  // loop's first frame: its average brightness is 106.9 of 255, against 107.2 for the lightest frame
  // of the 108 (signalstats, 2026-10-02).
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`the headline and the paragraph keep 4.5:1 at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/products')
      await expect(page.locator('.site-hero--film img')).toBeVisible()
      await page.locator('.site-hero--film img').evaluate((img: HTMLImageElement) => img.decode())
      for (const selector of ['.site-hero--film h1', '.site-hero--film .site-lede']) {
        const behind = await lightestBehind(page, selector)
        const contrast = ratio(await textLuminance(page, selector), behind)
        expect(
          contrast,
          `${selector} at ${width}px: ${contrast.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  test('the probe fails when the dark wash is taken away (negative control)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/products')
    await page.locator('.site-hero--film img').evaluate((img: HTMLImageElement) => img.decode())
    await page.addStyleTag({
      content: '.site-hero--film .site-hero__photo::after { background: none }',
    })
    const behind = await lightestBehind(page, '.site-hero--film .site-lede')
    const contrast = ratio(await textLuminance(page, '.site-hero--film .site-lede'), behind)
    expect(
      contrast,
      `without the wash the paragraph still read ${contrast.toFixed(2)}:1`,
    ).toBeLessThan(4.5)
  })
})
