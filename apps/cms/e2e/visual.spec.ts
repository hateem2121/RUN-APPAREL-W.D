import { expect, type Page, test } from './offlineMedia'

/**
 * THE SCREENSHOT SAFETY NET (visual audit 2026-10-01, owner-approved).
 *
 * Every other suite here asserts a NUMBER someone thought to measure: a gap, a contrast
 * ratio, a 44px target. A change nobody thought to measure — a section that loses its
 * padding, a colour swapped in the wrong theme, a grid that collapses — passes all of them.
 * This compares whole pages against reference pictures instead.
 *
 * ⚠️ THE PICTURES ARE MADE IN CI'S OWN IMAGE, AND ONLY COMPARED THERE. Playwright's docs
 * (read 2026-10-01): rendering differs by OS, version and hardware, so a picture made on
 * this Mac would fail in CI on font smoothing alone. The references are the `-linux` files
 * next to this spec, made inside `mcr.microsoft.com/playwright:v1.63.0-noble` — the image
 * ci.yml pins by digest. On any other platform the test SKIPS, saying so; to update the
 * pictures, run it in that image with `--update-snapshots` (docs/RUNBOOK.md has the steps).
 *
 * One engine (Chromium): the point is the layout, which the other suites already check
 * engine by engine; three engines would triple the pictures for little more.
 *
 * What would change between two runs, and how each is held still:
 * - the globe, the live 3D garment, the count-up and the cursor do nothing under
 *   `navigator.webdriver` (the site's rule), so their server-drawn state is what is shot;
 * - the footer clock shows the real time: masked;
 * - `font-display: optional` may skip a font on a cold first load: the page is loaded
 *   twice, so the second load has the fonts cached, then `document.fonts.ready`;
 * - lazy images below the fold would load or not by timing: forced eager and decoded;
 * - entrance motion: reduced motion is emulated, as every layout suite here does;
 * - the seed's pictures live on the real media host, which can stall: `./offlineMedia`
 *   answers them locally with one small image, the same on every run.
 */

const PAGES = ['/', '/products', '/contact', '/privacy', '/guides']
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
]

async function settle(page: Page, path: string) {
  await page.goto(path)
  // Second load: `font-display: optional` fonts are in the cache now, so they are used.
  await page.reload()
  await page.evaluate(async () => {
    await document.fonts.ready
    for (const img of document.images) img.loading = 'eager'
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))),
    )
  })
}

test.describe('whole pages match their reference pictures', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'one engine: the layout is the point')
  test.skip(
    process.platform !== 'linux',
    'the reference pictures are made in CI’s Linux image; on this machine fonts render differently',
  )

  for (const path of PAGES) {
    for (const size of WIDTHS) {
      test(`${path} at ${size.width}px`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.setViewportSize(size)
        await settle(page, path)
        const name = `${path === '/' ? 'home' : path.slice(1)}-${size.width}.png`
        await expect(page).toHaveScreenshot(name, {
          fullPage: true,
          mask: [page.locator('.footer-clock__time')],
          // Anti-aliasing only: a real change moves far more than 0.2% of the page.
          maxDiffPixelRatio: 0.002,
          // A full page at 390 wide is a tall capture; the default 5s ran out on the home page.
          timeout: 15_000,
        })
      })
    }
  }
})
