import type { Page } from '@playwright/test'

/**
 * The card asks Cloudflare for a resized copy of its picture (`/cdn-cgi/image/…width=W,height=H…`,
 * `lib/cardImage.ts`). This answers that copy with a flat picture of exactly the box it asks for.
 *
 * ⚠️ WITHOUT IT THE PHONE CARDS HAD NO PICTURE TO MEASURE (CI, 2026-10-02). `offlineMedia.ts`
 * answers every media request, the resized ones included, with its 2 x 2 picture, and a browser
 * divides a srcset picture's width by its density: at 390px the 400-wide copy fills a 169.5px slot,
 * so the 2px picture reports a `naturalWidth` of 0 (measured in Chromium: 0 at 390px, 1 at 1440px,
 * 2 with no srcset). `ProductPoster` reads `complete && naturalWidth === 0` as a failed load and puts
 * its placeholder where the picture was, so at 390px these tests skipped on the Mac and failed in
 * CI. A real resized render is hundreds of pixels wide. A page route wins over the context route
 * `offlineMedia.ts` sets (Playwright, BrowserContext.route, read 2026-10-02), and it answers
 * locally too, so this suite still never reaches the media host.
 *
 * Shared since 2026-10-05: productsGrid.spec.ts's picture-size test (polish D1) failed at 375-559px in CI
 * on PR #128 for exactly this reason; at wider widths it had passed only because it copied the card
 * before the placeholder replaced the picture.
 */
const answered = new WeakSet<Page>()
export async function answerCardPictures(page: Page) {
  if (answered.has(page)) return
  answered.add(page)
  await page.route('**/cdn-cgi/image/**', async (route) => {
    const url = route.request().url()
    const width = Number(/width=(\d+)/.exec(url)?.[1] ?? 400)
    const height = Number(/height=(\d+)/.exec(url)?.[1] ?? width * 1.25)
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#888"/></svg>`,
    })
  })
}
