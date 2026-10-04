import { expect, type Page, test } from '@playwright/test'

/**
 * "More from this category" at the end of a garment page (polish S6, 2026-10-04): four cards from
 * the garment's category, sent with its answer (e2e/serve.mjs, `RELATED`), each one link to that
 * garment's page on wear-run.com, then "See all … in 3D".
 *
 * What would have to break for these to fail: a card linking somewhere else, the section moving
 * after the contact prompt (the page must end on it, Q42), the cards losing their columns, a
 * `sizes` that no longer matches the drawn card (a phone then fetches a copy too small, which is
 * blurred, or too large, which is slow; `RELATED_CARD_SIZES` says how it is derived), or a long
 * garment name split mid-word on a phone, which the owner ruled out on 2026-10-02.
 *
 * The pictures come from this server's stand-in for Cloudflare's resizer, which answers a picture
 * exactly the requested copy's size and refuses any copy the production firewall refuses.
 */

/**
 * The page, once its cards have arrived: they are fetched after the first paint, with their own
 * stylesheet (`RelatedGarments.tsx` says why), so a measurement taken at the heading alone could
 * see the section without them.
 */
async function open(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.related__card')).toHaveCount(4)
}

/** Each card picture once it has arrived: the width drawn, and the width `sizes` promised. */
async function pictureWidths(page: Page) {
  const pictures = page.locator('.related__img')
  await expect(pictures).toHaveCount(4)
  await pictures.first().scrollIntoViewIfNeeded()
  await expect
    .poll(() =>
      pictures.evaluateAll((list) =>
        list.every(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true)
  return pictures.evaluateAll((list) =>
    list.map((img) => {
      const picture = img as HTMLImageElement
      // A copy chosen by its `w` is drawn at `w / density`, so its density-corrected natural
      // width IS the slot `sizes` gave it (HTML, "density-corrected natural width").
      return {
        drawn: Math.round(picture.getBoundingClientRect().width),
        promised: picture.naturalWidth,
        copy: picture.currentSrc.match(/width=(\d+)/)?.[1] ?? 'none',
      }
    }),
  )
}

/**
 * Allowed difference: 4px or 3%. `sizes` is 3px wide at 320px, where the gutter stops shrinking
 * with the window, and the gutters are rounded to 2px where `vw` is not. A forgotten 1px border
 * each side (5px at 320px) failed here, measured in all four engines on 2026-10-04.
 */
const mismatched = (widths: { drawn: number; promised: number }[]) =>
  widths.filter(({ drawn, promised }) => Math.abs(promised - drawn) > Math.max(4, drawn * 0.03))

test.describe('More from this category (polish S6)', () => {
  test.beforeEach(async ({ page }) => {
    // The reveal's transform would otherwise sit in every box measured here (viewer-layout rule).
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('four cards, each one link to its garment’s page on the website, then "See all"', async ({
    page,
  }) => {
    await open(page, 1280)
    const section = page.getByRole('region', { name: /More sportswear in 3D/i })
    await expect(section).toBeVisible()
    const cards = section.locator('.related__card')
    expect(
      await cards.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href)),
    ).toEqual([
      'https://wear-run.com/products/zrel-jacket/black',
      'https://wear-run.com/products/zrel-vneck/wine',
      'https://wear-run.com/products/zrel-hoodie/navy',
      'https://wear-run.com/products/zrel-short/black',
    ])
    await expect(cards.first()).toHaveAccessibleName(/^THE VELOCITY MATRIX JACKET\s*ZREL-01$/)
    const all = section.getByRole('link', { name: 'See all sportswear in 3D' })
    // The category's own page, its only list since polish S1.
    await expect(all).toHaveAttribute('href', 'https://wear-run.com/custom-activewear-manufacturer')
  })

  test('every card picture names its size, as every picture on the page does (SZ-10)', async ({
    page,
  }) => {
    await open(page, 390)
    const missing = await page
      .locator('.related__img')
      .evaluateAll(
        (list) =>
          list.filter((img) => !img.getAttribute('width') || !img.getAttribute('height')).length,
      )
    expect(missing).toBe(0)
  })

  /*
   * The cards' rules load with the cards, never in the stylesheet the first paint waits for: in it,
   * 242 compressed bytes made the slow-3G first paint ~150 ms later (RO-08, 2026-10-04). Asked of
   * the stylesheets the shell itself links, so it holds whatever the build names its files.
   */
  test('the first paint does not wait for the cards’ styles: they are in no stylesheet the shell links', async ({
    page,
    request,
  }) => {
    await open(page, 1280)
    const shell = await (await request.get('/n001/wine')).text()
    const linked = [...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
      (match) => match[1] ?? '',
    )
    expect(linked.length, 'the shell links no stylesheet, so this checks nothing').toBeGreaterThan(
      0,
    )
    for (const href of linked) {
      expect(await (await request.get(href)).text(), href).not.toContain('.related__card')
    }
    // …and they did arrive, from a stylesheet of their own: the card is drawn as a card.
    const border = await page
      .locator('.related__card')
      .first()
      .evaluate((card) => getComputedStyle(card).borderTopStyle)
    expect(border).toBe('solid')
  })

  test('sits after the customisation section and before the contact section, which ends the page', async ({
    page,
  }) => {
    await open(page, 1280)
    const order = await page.evaluate(() => {
      const [customise, related, contact] = ['.customise', '.related', '.contact'].map((selector) =>
        document.querySelector(selector),
      )
      const precedes = (a: Element | null | undefined, b: Element | null | undefined) =>
        Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
      return {
        customiseFirst: precedes(customise, related),
        contactAfter: precedes(related, contact),
        contactLast: document.querySelector('.content')?.lastElementChild === contact,
      }
    })
    expect(order).toEqual({ customiseFirst: true, contactAfter: true, contactLast: true })
  })

  test('a garment whose answer carries no cards draws no section at all', async ({ page }) => {
    await page.goto('/n002/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.contact')).toBeVisible()
    await expect(page.locator('.related')).toHaveCount(0)
  })

  for (const [width, perRow] of [
    [390, 2],
    [899, 2],
    [900, 4],
    [1280, 4],
  ] as const) {
    test(`${perRow} cards to a row at ${width}px, each the same width`, async ({ page }) => {
      await open(page, width)
      const boxes = await page
        .locator('.related__card')
        .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect()))
      const firstRow = boxes.filter((box) => Math.abs(box.top - (boxes[0]?.top ?? 0)) < 1)
      expect(firstRow).toHaveLength(perRow)
      const widths = boxes.map((box) => Math.round(box.width))
      expect(new Set(widths).size, `widths ${widths.join(', ')}`).toBe(1)
    })
  }

  for (const width of [320, 390, 768, 900, 1024, 1280, 1920]) {
    test(`at ${width}px each picture is the copy its card needs: sizes matches the drawn card`, async ({
      page,
    }, testInfo) => {
      await open(page, width)
      const widths = await pictureWidths(page)
      testInfo.annotations.push({ type: 'pictures', description: JSON.stringify(widths) })
      expect(mismatched(widths), JSON.stringify(widths)).toEqual([])
    })
  }

  test('the measure sees a wrong sizes: the desktop width on a phone is caught (negative control)', async ({
    page,
  }) => {
    await open(page, 390)
    await pictureWidths(page)
    // As if the phone half of `sizes` were dropped: every card is then promised 264px, not ~170.
    // Each picture is replaced by a copy carrying the planted value, so the browser chooses
    // afresh, rather than relying on how an engine reacts to `sizes` changing under it.
    await page.locator('.related__img').evaluateAll((list) => {
      for (const img of list) {
        const planted = img.cloneNode() as HTMLImageElement
        planted.sizes = '264px'
        planted.loading = 'eager'
        img.replaceWith(planted)
      }
    })
    const widths = await pictureWidths(page)
    expect(mismatched(widths), JSON.stringify(widths)).toHaveLength(4)
  })

  /*
   * The owner's rule from the website's cards (2026-10-02): on a phone a garment name shrinks
   * rather than split a word, and V-NECK and ZIP-UP stay whole (site.css, `.product-card__name`;
   * packages/shared/src/cardName.ts). The fixture's names carry the catalogue's widest word,
   * PERFORMANCE, and its hyphenated ones. A word is split when its letters sit on more than one
   * line, the website's detector (apps/cms/e2e/productsGrid.spec.ts).
   */
  const splitWords = (page: Page) =>
    page.locator('.related__name').evaluateAll((names) => {
      const split: string[] = []
      let overflow = 0
      for (const name of names) {
        overflow = Math.max(overflow, name.scrollWidth - name.clientWidth)
        const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const value = node.nodeValue ?? ''
          for (const match of value.matchAll(/\S+/g)) {
            const at = match.index ?? 0
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + match[0].length)
            const tops = new Set(
              [...range.getClientRects()]
                .filter((rect) => rect.width > 0)
                .map((rect) => Math.round(rect.top)),
            )
            if (tops.size > 1) split.push(match[0])
          }
        }
      }
      return { split, overflow }
    })

  for (const width of [320, 360, 375, 390, 430]) {
    test(`at ${width}px no word of a garment's name is split, and no name runs past its card`, async ({
      page,
    }) => {
      await open(page, width)
      await page.evaluate(() => document.fonts.ready)
      const { split, overflow } = await splitWords(page)
      expect(split, `${width}px: words split across two lines`).toEqual([])
      expect(overflow, `${width}px: a name runs past its card`).toBeLessThanOrEqual(1)
    })
  }

  test('the check sees a split word: the names at a fixed 18px split at 320px (negative control)', async ({
    page,
  }) => {
    await open(page, 320)
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({
      content: '.related__body .related__name { font-size: 18px !important }',
    })
    /*
     * ⚠️ WAIT FOR THE NEW SIZE BEFORE MEASURING. Under reduced motion, which this file emulates,
     * base.css gives every element `transition-duration: 0.01ms !important`, and with the initial
     * `transition-property: all` that makes ANY style change a transition: the name reads its old
     * size until the next frame. Measured 2026-10-04 in Chromium, WebKit and Firefox (`all
     * 1e-05s`; 13.776px at once, 18px two frames later). Read at once, this control passed in 2
     * runs of 6 a page it should have failed.
     */
    await expect
      .poll(() =>
        page
          .locator('.related__name')
          .evaluateAll((names) => names.map((name) => getComputedStyle(name).fontSize)),
      )
      .toEqual(['18px', '18px', '18px', '18px'])
    const { split } = await splitWords(page)
    expect(split.length).toBeGreaterThan(0)
  })
})
