import AxeBuilder from '@axe-core/playwright'
import { FACTORY_PHOTOS } from '../src/lib/factoryPhotos'
import { expect, test } from './offlineMedia'

/**
 * The factory gallery, large (owner, 2026-09-29: "tap to enlarge, swipe through").
 *
 * What would have to break for these to fail: a tap that does nothing, a dialog a keyboard
 * cannot leave or step through, focus lost to the top of the page when it closes, a dialog a
 * screen reader cannot name — or, with scripting off, a tile that no longer opens its photo.
 */
const count = FACTORY_PHOTOS.length

test.describe('the factory lightbox', () => {
  test('a tap opens that photo, the arrows step, Escape closes and focus returns', async ({
    page,
  }) => {
    await page.goto('/')
    const third = page.locator('.factory-tile__open').nth(2)
    await third.click()
    const dialog = page.getByRole('dialog', { name: 'Inside the factory' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.lightbox__count')).toContainText(`3 / ${count}`)

    await page.keyboard.press('ArrowRight')
    await expect(dialog.locator('.lightbox__count')).toContainText(`4 / ${count}`)
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.locator('.lightbox__count')).toContainText(`2 / ${count}`)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(third).toBeFocused()
  })

  test('the buttons wrap round the ends', async ({ page }) => {
    await page.goto('/')
    await page.locator('.factory-tile__open').first().click()
    const dialog = page.getByRole('dialog', { name: 'Inside the factory' })
    await dialog.getByRole('button', { name: /Previous/ }).click()
    await expect(dialog.locator('.lightbox__count')).toContainText(`${count} / ${count}`)
    await dialog.getByRole('button', { name: /Next/ }).click()
    await expect(dialog.locator('.lightbox__count')).toContainText(`1 / ${count}`)
  })

  test('the open dialog has no accessibility violations', async ({ page }) => {
    await page.goto('/')
    await page.locator('.factory-tile__open').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include('.lightbox')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('with scripting off, a tile is a link to its large photo', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')
    const hrefs = await page
      .locator('.factory-tile__open')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toHaveLength(count)
    for (const href of hrefs) expect(href).toMatch(/^\/factory\/[a-z-]+-\d+\.webp$/)
    await context.close()
  })
})
