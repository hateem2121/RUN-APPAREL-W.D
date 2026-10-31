import { expect, test } from '@playwright/test'

/**
 * The Working block on every screen size (owner, 31 Oct 2026: "perfect for each size"). The approved
 * demo's fixed sizes failed 50 of 162 plays across 27 screens, mostly numbers cut off and boxes off
 * screen. Holds the download open at a known moment, then measures what a visitor would see.
 */
const SCREENS: Array<[number, number]> = [
  [280, 653],
  [320, 568],
  [344, 882],
  [360, 640],
  [375, 667],
  [390, 844],
  [440, 956],
  [568, 320],
  [667, 375],
  [844, 390],
  [673, 841],
  [744, 1133],
  [1024, 600],
  [1024, 1366],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [3840, 2160],
]

test.describe('the Working block fits the screen', () => {
  for (const [width, height] of SCREENS) {
    test(`${width}x${height}: inside the screen, nothing cut off, nothing overlapping`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'layout rule; the other engines run the live check')
      await page.setViewportSize({ width, height })
      // Never answers, so the block stays up in its first state with the longest name in it.
      await page.route('**/fixtures/n001.glb*', () => {})
      await page.goto('/n001/wine')
      const block = page.locator('.stage__loading.working')
      await expect(block).toBeVisible({ timeout: 30_000 })
      await block.scrollIntoViewIfNeeded()
      const found = await page.evaluate(() => {
        const root = document.querySelector('.stage__loading.working') as HTMLElement
        const box = root.getBoundingClientRect()
        const meta = root.querySelector('.working__meta') as HTMLElement
        const kids = [...meta.children].filter((k) => k.textContent?.trim())
        const overlaps = kids.some((a, i) =>
          kids.slice(i + 1).some((b) => {
            const p = a.getBoundingClientRect()
            const q = b.getBoundingClientRect()
            return (
              p.right > q.left + 1 &&
              q.right > p.left + 1 &&
              p.bottom > q.top + 1 &&
              q.bottom > p.top + 1
            )
          }),
        )
        const stage = root.parentElement?.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          docWidth: document.documentElement.scrollWidth,
          inner: innerWidth,
          cut: meta.scrollWidth > meta.clientWidth + 1 || root.scrollWidth > root.clientWidth + 1,
          overlaps,
          inStage: stage ? box.bottom <= stage.bottom + 1 && box.top >= stage.top - 1 : false,
          share: stage ? box.height / stage.height : 1,
        }
      })
      expect(found.left).toBeGreaterThanOrEqual(0)
      expect(found.right).toBeLessThanOrEqual(found.inner)
      expect(found.docWidth).toBeLessThanOrEqual(found.inner)
      expect(found.cut, 'text cut off').toBe(false)
      expect(found.overlaps, 'numbers overlap').toBe(false)
      expect(found.inStage, 'block leaves the 3D window').toBe(true)
      expect(found.share, 'block leaves the garment no room').toBeLessThan(0.6)
    })
  }

  // iPhone simulator, live, 31 Oct: the old "Preparing · 3D garment" took two lines at 402 px, so the block grew
  // and the garment above it shrank just as the model arrived. The fixture's `Preparing` state is forced
  // by writing the longer words: only the lines they take matter here.
  for (const width of [280, 320, 360, 390, 402, 440, 768]) {
    test(`${width} px: the title holds one line in both states`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'layout rule; the other engines run the live check')
      await page.setViewportSize({ width, height: 844 })
      await page.route('**/fixtures/n001.glb*', () => {})
      await page.goto('/n001/wine')
      const title = page.locator('.stage__loading-title')
      await expect(title).toBeVisible({ timeout: 30_000 })
      const measure = (word: string) =>
        title.evaluate((el, text) => {
          if (el.firstElementChild) el.firstElementChild.textContent = text
          else el.textContent = `${text} · 3D view`
          const block = el.closest('.working') as HTMLElement
          const line = Number.parseFloat(getComputedStyle(el).lineHeight)
          return {
            lines: Math.round(el.getBoundingClientRect().height / line),
            h: block.offsetHeight,
          }
        }, word)
      const working = await measure('Working')
      const preparing = await measure('Preparing')
      expect(working.lines).toBe(1)
      expect(preparing.lines).toBe(1)
      expect(preparing.h, 'the block must not change height').toBe(working.h)
    })
  }

  test('control: a block pushed off the screen is caught', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine proves the instrument')
    await page.setViewportSize({ width: 320, height: 568 })
    await page.route('**/fixtures/n001.glb*', () => {})
    await page.goto('/n001/wine')
    await expect(page.locator('.stage__loading.working')).toBeVisible({ timeout: 30_000 })
    // Through the CSS object model: the page's CSP refuses an added <style>.
    const block = page.locator('.stage__loading.working')
    await block.evaluate((el: HTMLElement) => {
      el.style.transition = 'none'
      el.style.translate = '900px'
    })
    await expect
      .poll(() => block.evaluate((el) => el.getBoundingClientRect().right))
      .toBeGreaterThan(320)
  })
})

/**
 * The fixture's posters are opaque, so the seam correctly draws nothing on them, and a suite using
 * only those could never see it work. Production's are transparent (rxps-wine-poster.webp: 56% clear,
 * read 31 Oct 2026), so this serves a transparent one. Run both ways.
 */
const TEE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><path d="M120 60 L280 60 L380 160 L320 220 L300 200 L300 460 L100 460 L100 200 L80 220 L20 160 Z" fill="#825353"/></svg>'

async function seamPixels(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.stage__seam') as HTMLCanvasElement | null
    if (!canvas || !canvas.width) return { drawn: 0, sized: false }
    const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
    let drawn = 0
    for (let i = 3; data && i < data.length; i += 4) if ((data[i] ?? 0) > 0) drawn++
    return { drawn, sized: canvas.width !== 300 || canvas.height !== 150 }
  })
}

test.describe('the seam round the garment', () => {
  test('draws the dyed piece on a transparent picture', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine: canvas pixels are not engine-specific here')
    await page.route('**/fixtures/n001.glb*', () => {})
    await page.route('**/*-poster.webp*', (route) =>
      route.fulfill({ contentType: 'image/svg+xml', body: TEE }),
    )
    await page.goto('/n001/wine')
    await expect(page.locator('.stage__seam')).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => (await seamPixels(page)).drawn, { timeout: 10_000 })
      .toBeGreaterThan(1000)
  })

  test('control: an opaque picture draws nothing, and the photo stays', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'one engine: canvas pixels are not engine-specific here')
    await page.route('**/fixtures/n001.glb*', () => {})
    await page.route('**/*-poster.webp*', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#825353"/></svg>',
      }),
    )
    await page.goto('/n001/wine')
    await expect(page.locator('.stage__placeholder')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(800)
    // One picture: a seam sharing the picture's React key once multiplied it to 6 on this page (31 Oct).
    await expect(page.locator('.stage__placeholder')).toHaveCount(1)
    expect((await seamPixels(page)).drawn).toBe(0)
  })
})
