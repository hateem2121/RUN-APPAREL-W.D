import { expect, test } from '@playwright/test'
import { formatAddress } from '../../../packages/shared/src/company'

/**
 * Copy on the 3D pages, read the way a visitor reads it.
 *
 * The footer test lives with the copy rules because what a footer prints IS copy: the
 * privacy notice, the terms and the postal address are what a buyer holding the garment
 * looks for, and the unit test sees only the component, not the page it ends up on.
 */

test.describe('the footer', () => {
  test('links the privacy notice and the terms, and prints the postal address', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    const meta = page.locator('.footer__meta')
    await expect(meta.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
      'href',
      'https://wear-run.help/privacy',
    )
    await expect(meta.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute(
      'href',
      'https://wear-run.help/terms',
    )
    await expect(meta).toContainText(formatAddress())
  })
})
