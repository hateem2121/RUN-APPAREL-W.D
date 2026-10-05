import { expect, type Page, test } from './offlineMedia'

/**
 * Polish F4 (the owner's answer to Q19, 2026-10-04): ONE pointer. With the dot and ring drawn,
 * the browser's own pointer is hidden everywhere, not just on links and buttons; the second check
 * found it beside the dot over the form's boxes (the I-beam), the country list, the file box, the
 * globe (`grab`) and the footer's wordmark (`default`). And the ring grows over everything a
 * visitor can click, type in or pick from. The 3D window, the one place the browser's grab hand
 * stays, is tested where a model is drawn: apps/viewer/e2e/webgl.spec.ts.
 *
 * Run AS A HUMAN with motion allowed: under automation the cursor never mounts, by design
 * (Cursor.tsx), so a test without the spoof would measure nothing.
 */
const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

/** /contact on a computer, with the dot and ring drawn (the pointer has moved once). */
async function armed(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(asAHuman)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/contact')
  await page.locator('.cursor-dot').waitFor({ state: 'attached' })
  const heading = await page.getByRole('heading', { level: 1 }).boundingBox()
  const x = (heading?.x ?? 0) + 20
  const y = (heading?.y ?? 0) + (heading?.height ?? 40) / 2
  await page.mouse.move(x, y)
  await page.mouse.move(x + 6, y, { steps: 3 })
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.classList.contains('has-custom-cursor')),
      {
        message: 'the custom cursor never drew, so this would measure nothing',
        timeout: 10_000,
      },
    )
    .toBe(true)
}

const pointerOver = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).cursor)

const HIDDEN_THERE = [
  'input[name="name"]',
  'textarea',
  // The country is a box that suggests as you type since polish D7, where a list was.
  'input[name="country"]',
  'input[type="file"]',
  // D7's subject pills and the place to drop files: labels, which the ring treats as controls.
  '.inquiry-form__answer',
  '.inquiry-form__drop',
  // The globe draws only with coordinates, which this suite's database has none of: its pointer
  // is tested on the globe's own page (globe.spec.ts).
  '.footer-mark',
  'h1',
]

test.describe('one pointer (polish F4)', () => {
  test.skip(({ isMobile }) => isMobile, 'the cursor never mounts on a coarse pointer, by design')

  test('the browser hides its own pointer everywhere the dot and ring are drawn', async ({
    page,
  }) => {
    await armed(page)
    for (const selector of HIDDEN_THERE) {
      expect(await pointerOver(page, selector), `a second pointer over ${selector}`).toBe('none')
    }
  })

  test('NEGATIVE CONTROL: a planted pointer of its own is read as one, so the reading is real', async ({
    page,
  }) => {
    await armed(page)
    await page.addStyleTag({
      content: '.has-custom-cursor input[name="name"] { cursor: text !important; }',
    })
    expect(await pointerOver(page, 'input[name="name"]')).toBe('text')
  })

  test('the ring grows over the form’s boxes and its list, and not over plain words', async ({
    page,
  }) => {
    await armed(page)
    const decline = page.getByRole('button', { name: /^decline$/i })
    if (await decline.isVisible()) await decline.click()
    const grows = () =>
      page.evaluate(() => document.querySelector('.cursor-ring')?.getAttribute('data-pointer'))
    for (const selector of [
      'input[name="name"]',
      'textarea',
      'input[name="country"]',
      '.inquiry-form__answer',
      '.inquiry-form__drop',
    ]) {
      await page.locator(selector).first().hover()
      await expect.poll(grows, { message: `the ring did not grow over ${selector}` }).toBe('true')
    }
    await page.getByRole('heading', { level: 1 }).hover()
    await expect.poll(grows, { message: 'the ring grew over a heading' }).toBe('false')
  })
})
