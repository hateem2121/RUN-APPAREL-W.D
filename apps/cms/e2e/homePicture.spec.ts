import { expect, type Page, test } from './offlineMedia'

/**
 * IM-12 — the home page carries no photograph, and its one picture is a real garment
 * that opens the 3D viewer.
 *
 * What the audit found, and what is kept: the hero is words and the blueprint grid; the
 * one picture on the page is `ProofGarment` (`src/app/(frontend)/page.tsx`) in section
 * №02 — a poster read from the CMS, a still rather than a live model by the owner's
 * decision of 2026-09-07 (FA-A-04), linked to the viewer, which decision D2 keeps as the
 * product detail page (docs/DECISIONS-BETA-WEBSITE.md). Its comment says why it is a
 * real product and not a file: a fixed picture goes stale the first time a garment is
 * retired, and nothing would say so.
 *
 * src/publicSite.test.ts pins that every viewer link carries the caption (XS-09); this
 * pins what is ON the page. Counted in the rendered DOM, not in source, because a
 * picture can arrive as a CSS `background-image` from a stylesheet that no scan of the
 * page's own source would read.
 */

/** Every element under `root` (itself included) that paints a picture, with its pseudo-elements. */
async function picturesUnder(page: Page, selector: string) {
  return page.locator(selector).evaluate((root) => {
    const found: string[] = []
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().replace(/\s+/g, '.')}` : ''}`
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.matches('img, picture, video, canvas, object, embed, iframe, image')) {
        found.push(name(el))
      }
      for (const pseudo of [null, '::before', '::after'] as const) {
        const background = getComputedStyle(el, pseudo).backgroundImage
        // Gradients (the blueprint grid) are drawn, not photographs; `url(` is a file.
        if (background.includes('url(')) {
          found.push(`${name(el)}${pseudo ?? ''} background ${background.slice(0, 80)}`)
        }
      }
    }
    return found
  })
}

test.describe('IM-12 — one picture on the home page, and it is a garment', () => {
  test('the hero carries no photograph', async ({ page }) => {
    await page.goto('/')
    // The control that the region exists: an empty match would pass on nothing.
    await expect(page.locator('.site-hero')).toHaveCount(1)
    await expect(page.locator('.site-hero h1')).toBeVisible()

    expect(
      await picturesUnder(page, '.site-hero'),
      "the home page hero paints a picture. The page's only picture is the garment " +
        'poster in section №02, linked to the 3D viewer (IM-12).',
    ).toEqual([])
  })

  test('the whole page paints exactly one picture: a poster that opens the 3D viewer', async ({
    page,
  }) => {
    await page.goto('/')
    const posters = page.locator('main img')
    if ((await posters.count()) === 0) {
      if (process.env.CI) {
        throw new Error(
          'the home page shows no garment. CI seeds a published one with posters (ci.yml → ' +
            '"Seed the database the public-site suite reads"), so this is the regression, ' +
            'not an empty catalogue.',
        )
      }
      test.skip(true, 'no published garment with a poster in this local database')
    }

    const everything = await picturesUnder(page, 'body')
    expect(everything, `the home page paints ${everything.length} pictures`).toHaveLength(1)

    const poster = posters.first()
    await expect(poster).toHaveAttribute('src', /^https:\/\/media\./)
    const link = poster.locator('xpath=ancestor::a[1]')
    await expect(link).toHaveCount(1)
    // `/<product>/<colour>` on the viewer host — the same shape the gallery links to.
    await expect(link).toHaveAttribute('href', /^https:\/\/viewer\.[^/]+\/[^/]+\/[^/]+$/)
  })
})
