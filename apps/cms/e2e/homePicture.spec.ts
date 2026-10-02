import { ORDER_PHASES } from '../src/lib/orderProcess'
import { expect, type Page, test } from './offlineMedia'

/**
 * IM-12 — the home page's pictures are real garments and the owner's factory, and nothing
 * else: no stock image, no picture from a stylesheet. (Since 2026-09-29 the hero carries one
 * factory photo, by the owner's choice — see the first test.)
 *
 * What the audit found, and what is kept: the hero is words and the blueprint grid; the
 * garment picture is `ProofGarment` (`src/app/(frontend)/page.tsx`) in section №02 — a
 * poster read from the CMS, a still rather than a live model by the owner's decision of
 * 2026-09-07 (FA-A-04), linked to the viewer, which decision D2 keeps as the product detail
 * page (docs/DECISIONS-BETA-WEBSITE.md). Its comment says why it is a real product and not a
 * file: a fixed picture goes stale the first time a garment is retired, and nothing would say
 * so.
 *
 * ⚠️ UNTIL 2026-09-25 THIS PINNED EXACTLY ONE PICTURE. The owner then chose a strip of their
 * own factory photos below The works (OI-3), so the count was the poster plus the strip's list.
 * On 2026-10-02 the owner removed that strip (visual audit VA-29): the factory pictures are now
 * the building and its roof in №01 and one photo per step of the order timeline in №04
 * (`src/lib/orderProcess.ts`), each served from `/factory/`. A picture anywhere else still
 * fails — which is the point the one-picture rule was making.
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

test.describe('IM-12 — the home page shows a garment and the factory, nothing else', () => {
  /*
   * ⚠️ REVERSED BY THE OWNER ON 2026-09-29: "each section must also have their media", and a
   * factory photo for the hero. So the hero now carries exactly ONE photograph — the stitching
   * floor, the page's largest paint — and nothing else.
   */
  test('the hero carries the stitching-floor photo and nothing else, loaded first', async ({
    page,
  }) => {
    await page.goto('/')
    // The control that the region exists: an empty match would pass on nothing.
    await expect(page.locator('.site-hero')).toHaveCount(1)
    await expect(page.locator('.site-hero h1')).toBeVisible()

    expect(
      await picturesUnder(page, '.site-hero'),
      'the hero paints something besides its one photo (IM-12)',
    ).toEqual(['picture.site-hero__photo', 'img.site-hero__img'])
    const hero = page.locator('.site-hero__img')
    await expect(hero).toHaveAttribute('src', /^\/factory\/hero-wide-\d+\.webp$/)
    await expect(hero).toHaveAttribute('loading', 'eager')
    await expect(hero).toHaveAttribute('fetchpriority', 'high')
  })

  /*
   * Since 2026-09-29 pictures sit in most sections — the hero, who we are, the family cards,
   * the 3D garment, the order timeline and the gallery. The rule the audit made is unchanged:
   * every one is the owner's factory (`/factory/`) or a real garment from the media host, and
   * nothing arrives as a CSS background. Since 2026-09-30 a family card with no garment yet may
   * show the owner's own product photo instead (`public/families/`, `FAMILY_PHOTOS`).
   */
  test('every picture is the factory or a real garment, and none is a background', async ({
    page,
  }) => {
    await page.goto('/')
    const everything = await picturesUnder(page, 'body')
    expect(
      everything.filter((entry) => entry.includes(' background ')),
      'a picture arrives as a CSS background (IM-12)',
    ).toEqual([])
    const images = await page.locator('main img').evaluateAll((all) =>
      all.map((img) => ({
        src: img.getAttribute('src') ?? '',
        // A garment picture sits in a family card or the 3D section; its host is whatever
        // the environment serves media from (production: the media host; the suite: itself).
        garmentSlot: Boolean(img.closest('.family-card, .proof__figure')),
      })),
    )
    expect(images.length, 'the home page shows no pictures at all').toBeGreaterThan(10)
    expect(
      images
        .filter((image) => !image.src.startsWith('/factory/') && !image.garmentSlot)
        .map((image) => image.src),
      'a picture that is neither the factory nor a garment from the CMS (IM-12)',
    ).toEqual([])

    const timeline = await page
      .locator('.timeline img')
      .evaluateAll((images) => images.map((img) => img.getAttribute('src') ?? ''))
    expect(
      timeline,
      "the order timeline's pictures are not the steps' photos in src/lib/orderProcess.ts",
    ).toEqual(
      ORDER_PHASES.flatMap((phase) => phase.steps).map((step) =>
        expect.stringMatching(new RegExp(`^/factory/${step.photo}-`)),
      ),
    )
  })

  test('the garment poster links to its garment page', async ({ page }) => {
    await page.goto('/')
    const posters = page.locator('main .proof__figure img')
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
    const poster = posters.first()
    await expect(poster).toHaveAttribute('src', /^https:\/\/media\./)
    const link = poster.locator('xpath=ancestor::a[1]')
    await expect(link).toHaveCount(1)
    // `/products/<product>/<colour>` — the same shape the gallery links to (domain move,
    // 2026-09-28; it was the viewer's own host until then).
    await expect(link).toHaveAttribute('href', /^https:\/\/[^/]+\/products\/[^/]+\/[^/]+$/)
  })
})
