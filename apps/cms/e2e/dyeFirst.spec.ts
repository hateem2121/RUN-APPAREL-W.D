import { expect, test } from './offlineMedia'

/** R1 (D51): a card shows its colour until its picture lands, then the colour is gone. */
test('a card has its dye behind the picture, and it leaves when the picture lands', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'one engine')
  await page.goto('/products')
  const slide = page.locator('.card-gallery__slide[style*="--dye"]').first()
  await expect(slide, 'CI seeds a garment with a colour').toBeAttached()
  const dye = await slide.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(dye).not.toBe('rgba(0, 0, 0, 0)')
  await expect(slide).toHaveAttribute('data-landed', 'true', { timeout: 15_000 })
})
