import { expect, type Page, test } from '@playwright/test'
import { formatAddress } from '../../../packages/shared/src/company'
import {
  findBritishSpellings,
  findBuzzwords,
  findEmoji,
  GARMENT_TERMS,
  primaryActionsInPage,
  readCopyInPage,
} from '../../../scripts/copy-rules.mjs'

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

const API = '**/api/public/viewer/**'

/** The three copy rules on whatever the page shows now. Returns what it read. */
async function expectCopyRules(page: Page) {
  const copy = await page.evaluate(readCopyInPage)
  expect(
    copy.body.length,
    'the screen rendered almost no text, so every rule below would pass',
  ).toBeGreaterThan(80)
  expect(
    copy.headings.flatMap((heading) => findEmoji(heading)),
    'emoji in a heading (CT-01)',
  ).toEqual([])
  // Garment text may say "seamless" and mean the knitting method — see copy-rules.mjs.
  expect(findBuzzwords(copy.body, { allow: GARMENT_TERMS }), 'buzzwords (CT-03)').toEqual([])
  expect(
    findBritishSpellings([copy.body, ...copy.decoded].join('\n')),
    'British spelling in visible or pre-filled text (CT-05)',
  ).toEqual([])
  return copy
}

test.describe('copy rules on every screen a QR scan can land on', () => {
  test('a product page', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
    await expectCopyRules(page)
  })

  test('a colorway that has been switched off', async ({ page }) => {
    await page.goto('/n001/not-a-colorway')
    await expect(page.getByText(/linked by this QR is no longer active/i)).toBeVisible()
    await expectCopyRules(page)
  })

  test('a garment that is not published', async ({ page }) => {
    await page.goto('/not-a-garment/wine')
    await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible()
    const copy = await expectCopyRules(page)
    expect(copy.decoded.join('\n'), 'the pre-filled email was not read').toContain(
      'QR reference unavailable',
    )
  })

  test('the product failed to load', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    )
    await page.goto('/n001/wine')
    await expect(page.getByText('[ TEMPORARILY UNAVAILABLE ]')).toBeVisible()
    const copy = await expectCopyRules(page)
    expect(copy.decoded.join('\n'), 'the pre-filled email was not read').toContain(
      'QR reference unavailable',
    )
  })
})

const PRIMARY_LABELS = [/^Email Us$/, /^Try Again$/, /^Trying…$/]

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`one primary action per screen at ${viewport.width}px (CT-08)`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const screens: [string, () => Promise<void>][] = [
      [
        '/n001/wine',
        () =>
          expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i),
      ],
      [
        '/not-a-garment/wine',
        () => expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible(),
      ],
    ]
    for (const [path, ready] of screens) {
      await page.goto(path)
      await ready()
      const { primaries, windows } = await page.evaluate(primaryActionsInPage)
      expect(
        primaries.length,
        `${path}: no primary action found, so this would pass vacuously`,
      ).toBeGreaterThan(0)
      for (const { label } of primaries) {
        expect(
          PRIMARY_LABELS.some((pattern) => pattern.test(label)),
          `"${label}" on ${path}`,
        ).toBe(true)
      }
      for (const { top, destinations } of windows) {
        expect(
          destinations.length,
          `${path} at ${viewport.width}px: the screen starting at ${top}px leads to ${destinations.join(' + ')}`,
        ).toBeLessThanOrEqual(1)
      }
    }
  })
}
