import { expect, type Page, test } from '@playwright/test'
import {
  measureContrastInPage,
  parseCssColour,
  relativeLuminance,
  worstRatio,
} from '../../../scripts/contrast-rules.mjs'

/**
 * XS-09 — every link to the 3D viewer says it opens the 3D viewer, legibly, in both themes.
 *
 * A card on this site opens a different host: the viewer that printed QR tags lead to.
 * Measured live 2026-09-17, nothing on any of the 16 cards said so, although
 * docs/DECISIONS-BETA-WEBSITE.md D2 described its guard as checking exactly that. The owner
 * chose the caption "Opens the 3D viewer ↗" the same day; src/publicSite.test.ts pins the
 * source, and this pins what a visitor gets.
 *
 * The arrow is aria-hidden and followed by U+FE0E, so the rendered text is the words, a
 * space, the arrow and that selector.
 */
const CUE = 'Opens the 3D viewer \u{2197}\u{FE0E}'
const VIEWER_LINKS = 'a[href^="https://viewer."]'

/**
 * Emulate AFTER a navigation, then navigate again: Firefox drops emulation set on
 * about:blank (measured 2026-09-07, legibility.spec.ts). The ground's luminance is the
 * control that the scheme really applied: the light ground reads about 0.86, the dark 0.01.
 */
async function settle(page: Page, path: string, scheme: 'light' | 'dark') {
  await page.goto(path)
  await page.emulateMedia({
    colorScheme: scheme,
    reducedMotion: 'reduce',
    contrast: 'no-preference',
  })
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const luminance = relativeLuminance(parseCssColour(ground).rgb)
  if (scheme === 'dark') {
    expect(luminance, `${path} did not render dark (${ground})`).toBeLessThan(0.2)
  } else {
    expect(luminance, `${path} did not render light (${ground})`).toBeGreaterThan(0.5)
  }
}

test.describe('XS-09 — every link to the 3D viewer says so', () => {
  for (const path of ['/products', '/'] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${path} ${scheme}: the caption is on every such link, and legible`, async ({
        page,
      }) => {
        await settle(page, path, scheme)
        const links = page.locator(VIEWER_LINKS)
        const count = await links.count()
        if (count === 0) {
          if (process.env.CI) {
            throw new Error(
              `${path} links to no garment. CI seeds a published one with posters (ci.yml → ` +
                '"Seed the database the public-site suite reads"), so this is the regression, ' +
                'not an empty catalogue.',
            )
          }
          test.skip(true, 'no published garment with a poster in this local database')
        }

        for (let index = 0; index < count; index += 1) {
          const link = links.nth(index)
          const cue = link.locator('.viewer-cue')
          await expect(cue, `link ${index + 1} on ${path} does not say where it goes`).toHaveCount(
            1,
          )
          expect(await cue.innerText()).toBe(CUE)
          await expect(link).toHaveAccessibleName(/Opens the 3D viewer/)
          // The arrow is decoration: a screen reader hears the words once and no symbol.
          await expect(link).not.toHaveAccessibleName(/\u{2197}/u)
        }
        // Nothing else wears the caption; it would promise a destination it does not have.
        await expect(page.locator('.viewer-cue')).toHaveCount(count)

        const rows = await page.evaluate(measureContrastInPage, {
          selector: '.viewer-cue',
          part: 'text' as const,
        })
        expect(rows).toHaveLength(count)
        const failing = rows
          .filter((row) => worstRatio(row) < 4.5)
          .map((row) => `${row.label} ${worstRatio(row).toFixed(2)}:1`)
        expect(failing, `${scheme}: the caption is text and needs 4.5:1 (WCAG 1.4.3)`).toEqual([])
      })
    }
  }

  test('the contrast probe fails a planted pale caption (negative control)', async ({ page }) => {
    await page.goto('/products')
    await page.evaluate(() => {
      const planted = document.createElement('span')
      planted.className = 'planted-cue'
      planted.textContent = 'planted'
      planted.style.color = '#e9e7e2'
      document.querySelector('main')?.append(planted)
    })
    const [row] = await page.evaluate(measureContrastInPage, {
      selector: '.planted-cue',
      part: 'text' as const,
    })
    if (!row) throw new Error('the planted caption was not measured')
    expect(
      worstRatio(row),
      'a pale grey on the light ground did not read as a failure',
    ).toBeLessThan(1.5)
  })
})
