import { expect, test } from '@playwright/test'

/**
 * Composition guards for the 2026-09-06 beta-website audit (kept privately).
 *
 * ⚠️ EVERY CASE HERE PINS A ROW THE AUDIT SCORED 8 OR 9 — a measurement that PASSED, and
 * that lost its last point for one reason: nothing stopped the next change undoing it.
 * A number measured once is a fact about that Tuesday. These are the same numbers,
 * re-taken on every run.
 *
 * ⚠️ SUB-PIXEL TOLERANCES ARE MEASUREMENT ARTEFACTS, NOT CONCESSIONS. `getBoundingClientRect()`
 * returns floats and this page composes with fluid `clamp()` type, so a box that is
 * exactly centred by declaration reports a centre that is fractionally off. The same
 * arithmetic made a 44px control measure 43.999969 in navbar.spec.ts. Each tolerance
 * below says what it is absorbing, and every one of them is orders of magnitude smaller
 * than the defect it would have to hide.
 */

const PAGES = ['/', '/products', '/contact'] as const

/**
 * Wait for the layout to stop moving before measuring a box.
 *
 * ⚠️ ADDED AFTER A REAL FLAKE, AND IT IS A CORRECTNESS FIX RATHER THAN A LOOSENED
 * TOLERANCE. FA-D-04 at 768px went flaky on Firefox under full-suite load only, and
 * passed 3/3 in isolation — the tell for a measurement racing the page rather than a
 * wrong number. Everything here is centred on `documentElement.clientWidth`, and that
 * value MOVES by the width of a classic scrollbar the moment the document grows tall
 * enough to need one. Firefox reserves 15px for it and Chromium's headless default
 * overlay reserves none, which is why one engine saw it. Measuring after the fonts have
 * landed and the network is quiet means the scrollbar state is final.
 */
const settle = async (page: import('@playwright/test').Page) => {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
}

test.describe('FA-A-71 — the loudest thing above the fold is the headline', () => {
  /**
   * MEASURED 2026-09-06: on every page the largest, heaviest element above the fold is
   * the page's own headline, ahead of the wordmark and the navigation. Re-measured here
   * at 1280×900: `h1` 69.12px, `.notch__wordmark` 16px, `.nav-link` 10px.
   *
   * The failure this catches is not a typo. It is the ordinary drift where a bar gains a
   * larger wordmark or a "NEW" ribbon, and the first thing a visitor's eye lands on
   * stops being the thing the page is about — visible to nobody reviewing the diff.
   */
  for (const path of PAGES) {
    test(`${path} — nothing above the fold is set larger than the h1`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(path)
      await settle(page)

      const louder = await page.evaluate(() => {
        const h1 = document.querySelector('h1') as HTMLElement
        const h1Size = Number.parseFloat(getComputedStyle(h1).fontSize)
        return {
          h1Size,
          h1Top: h1.getBoundingClientRect().top,
          offenders: [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((el) => el !== h1 && !h1.contains(el) && !el.contains(h1))
            .filter((el) => {
              const box = el.getBoundingClientRect()
              // Above the fold, actually painted, and carrying text of its own.
              if (box.height === 0 || box.top >= window.innerHeight) return false
              const style = getComputedStyle(el)
              if (style.visibility === 'hidden' || style.display === 'none') return false
              const own = [...el.childNodes]
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent?.trim() ?? '')
                .join('')
              return own.length > 0
            })
            .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) >= h1Size)
            .map(
              (el) =>
                `${el.tagName}.${el.className} @ ${getComputedStyle(el).fontSize}: ` +
                `${(el.textContent ?? '').trim().slice(0, 24)}`,
            ),
        }
      })

      expect(louder.h1Top, 'the headline is not above the fold at all').toBeLessThan(900)
      expect(louder.offenders, 'something above the fold shouts louder than the headline').toEqual(
        [],
      )
      // and the headline is genuinely display-sized, not merely the biggest of six 10px things
      expect(louder.h1Size).toBeGreaterThan(28)
    })
  }
})

test.describe('FA-B-71 — proximity says what belongs to what', () => {
  /**
   * MEASURED 2026-09-06 across 60 measurements on 4 pages at 5 widths: a label sits
   * closer to its heading than the heading does to its body. Re-measured at 1280:
   * hero label→h1 **10px** against h1→lede **22px**; section number→h2 **8px** against
   * h2→lede **22px**.
   *
   * ⚠️ THIS IS THE EXACT ROW THE AUDIT'S FA-A-02 AND FA-B-01 FAILED ON, AT 3/10 — an
   * eyebrow sat closer to the headline's own second line than to the headline. The
   * ordering was then fixed, and nothing held it. It is one `margin-block` edit from
   * reversing, and a reversed ordering does not look broken; it just reads as a heading
   * belonging to the wrong paragraph.
   */
  const PAIRS = [
    { label: '.site-hero .label', heading: '.site-hero h1', body: '.site-hero .site-lede' },
    {
      label: '.site-section .section-number',
      heading: '.site-section h2',
      body: '.site-section .site-lede',
    },
  ]

  for (const width of [390, 768, 1280]) {
    test(`the eyebrow is closer to its heading than the heading is to its body at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await settle(page)

      const measured = await page.evaluate((pairs) => {
        const gap = (a: string, b: string) => {
          const A = document.querySelector(a)?.getBoundingClientRect()
          const B = document.querySelector(b)?.getBoundingClientRect()
          return A && B ? Number((B.top - A.bottom).toFixed(2)) : Number.NaN
        }
        return pairs.map((pair) => ({
          pair: `${pair.label} / ${pair.heading}`,
          toHeading: gap(pair.label, pair.heading),
          toBody: gap(pair.heading, pair.body),
        }))
      }, PAIRS)

      for (const row of measured) {
        expect(row.toHeading, `${row.pair}: no eyebrow or no heading rendered`).not.toBeNaN()
        expect(row.toBody, `${row.pair}: no body rendered`).not.toBeNaN()
        expect(
          row.toHeading,
          `${row.pair}: the eyebrow (${row.toHeading}px) is no closer to its heading than ` +
            `the heading is to its body (${row.toBody}px) — the grouping now reads wrong`,
        ).toBeLessThan(row.toBody)
      }
    })
  }
})

test.describe('FA-D-04 — the two carved shapes read as one system', () => {
  /**
   * MEASURED 2026-09-06: the header notch and the footer tab are both centred on the
   * VIEWPORT — not on the content column — at every width. Re-measured at 1280: notch
   * centre 640.0, tab centre 640.0, viewport centre 640.
   *
   * The trap is specific. The page is centred inside `--site-max` and the footer is
   * full-bleed; the audit's FA-D-01 recorded what happens when two things that should
   * share an edge are computed from different containers — they missed each other by
   * 370px at 1920 and nobody saw it, because at the widths people check the miss was
   * five pixels. Centring on the content column instead of the viewport would reproduce
   * exactly that, for exactly the same reason.
   */
  for (const width of [390, 768, 1280, 1920]) {
    test(`both are on the viewport centre at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await settle(page)
      const centres = await page.evaluate(() => {
        const centre = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect()
          return box ? box.x + box.width / 2 : Number.NaN
        }
        return {
          viewport: document.documentElement.clientWidth / 2,
          notch: centre('.notch'),
          tab: centre('.site-footer__tab'),
        }
      })
      // 0.5px: both shapes are laid out from `50%` of a container whose own width can be
      // fractional. The miss this guards against was 370px.
      expect(
        Math.abs(centres.notch - centres.viewport),
        'the notch left the viewport centre',
      ).toBeLessThan(0.5)
      expect(
        Math.abs(centres.tab - centres.viewport),
        'the footer tab left the viewport centre',
      ).toBeLessThan(0.5)
    })
  }
})

test.describe('FA-D-06 / FA-E-05 — nothing scrolls sideways, in 30 conditions', () => {
  /**
   * MEASURED 2026-09-06: `scrollWidth === clientWidth` and zero elements outside the
   * viewport on all three pages at 320 (400% zoom of 1280), 640 (200%), 390 at a root
   * font size of 16/20/24px, 1440 at 24px, two landscape phones and two short screens —
   * with positive clearance under the fixed bar in every one.
   *
   * ⚠️ navbar.spec.ts ALREADY CHECKS WIDTHS, AND THAT IS NOT THIS. It sweeps viewport
   * widths on `/products` at the default text size. The conditions that actually break a
   * fluid layout are the ones a developer never sits in: an enlarged root font size
   * (which is what browser zoom and the OS text-size setting both do to a `rem` layout),
   * a landscape phone, and a 500px-tall window. The audit's own instrument named the
   * offending element; so does this, because "sideways scrolling at 390px" sends the next
   * reader hunting.
   */
  const CONDITIONS = [
    { name: '320w (400% zoom of 1280)', width: 320, height: 800, root: 16 },
    { name: '640w (200% zoom)', width: 640, height: 800, root: 16 },
    { name: '390w, 20px root text', width: 390, height: 844, root: 20 },
    { name: '390w, 24px root text', width: 390, height: 844, root: 24 },
    { name: '1440w, 24px root text', width: 1440, height: 900, root: 24 },
    { name: 'iPhone landscape 844x390', width: 844, height: 390, root: 16 },
    { name: 'iPhone landscape 932x430', width: 932, height: 430, root: 16 },
    { name: 'short desktop 1280x500', width: 1280, height: 500, root: 16 },
    { name: 'short laptop 1024x600', width: 1024, height: 600, root: 16 },
    { name: 'wide 1920x1080', width: 1920, height: 1080, root: 16 },
  ] as const

  for (const condition of CONDITIONS) {
    test(`${condition.name}`, async ({ page }) => {
      await page.setViewportSize({ width: condition.width, height: condition.height })
      for (const path of PAGES) {
        await page.goto(path)
        const result = await page.evaluate((root) => {
          document.documentElement.style.fontSize = `${root}px`
          const doc = document.documentElement
          // Read after the write, in the same task, so the reflow has happened.
          const overflowing = [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((el) => {
              const box = el.getBoundingClientRect()
              if (box.width === 0 || box.height === 0) return false
              return box.right > doc.clientWidth + 1 || box.left < -1
            })
            .map((el) => `${el.tagName}.${String(el.className).slice(0, 30)}`)
          const bar = document.querySelector('.notch')?.getBoundingClientRect()
          const first =
            document.querySelector('.site-hero .label') ?? document.querySelector('main h1')
          const content = first?.getBoundingClientRect()
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            overflowing: overflowing.slice(0, 5),
            clearance: bar && content ? Math.round(content.top - bar.bottom) : Number.NaN,
          }
        }, condition.root)

        expect(
          result.scrollWidth,
          `${path} @ ${condition.name}: the document is ${result.scrollWidth - result.clientWidth}px wider than the viewport`,
        ).toBeLessThanOrEqual(result.clientWidth)
        expect(
          result.overflowing,
          `${path} @ ${condition.name}: elements sit outside the viewport`,
        ).toEqual([])
        expect(
          result.clearance,
          `${path} @ ${condition.name}: the fixed bar covers the first line`,
        ).toBeGreaterThan(0)
      }
    })
  }
})

test.describe('FA-R-09 / FA-H-12 — the footer tab reserves its arrow and never resizes', () => {
  /**
   * MEASURED 2026-09-06 and called "the single best-crafted interaction on the site":
   * the label is pre-nudged by half the arrow's reserved slot at rest and slides to 0 on
   * hover while the arrow fades in — so the tab's width never changes, and the two
   * concave fillets carved either side of it never move.
   *
   * ⚠️ THE OBVIOUS "SIMPLIFICATION" IS THE DEFECT. Dropping `width: var(--arrow-w)` and
   * letting the arrow take its natural width makes the CSS shorter and the tab grow by
   * 24px on hover — which drags both fillets across the slab's edge. site.css records
   * that this is also why the tab presses with COLOUR and not `scale`: a transform would
   * take the fillets with it. Two independent forces pushing at the same seam, so the
   * seam is what gets measured.
   */
  test('its width, its fillets and its arrow all behave on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await settle(page)
    const tab = page.locator('.site-footer__tab')
    await tab.scrollIntoViewIfNeeded()

    const rest = await page.evaluate(() => {
      const el = document.querySelector('.site-footer__tab') as HTMLElement
      const box = el.getBoundingClientRect()
      const label = document.querySelector('.site-footer__tab-label') as HTMLElement
      const arrow = document.querySelector('.site-footer__tab-arrow') as HTMLElement
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        labelShift: Number(
          new DOMMatrixReadOnly(
            getComputedStyle(label).transform === 'none'
              ? 'matrix(1, 0, 0, 1, 0, 0)'
              : getComputedStyle(label).transform,
          ).m41.toFixed(2),
        ),
        arrowOpacity: Number(getComputedStyle(arrow).opacity),
        arrowWidth: getComputedStyle(arrow).width,
        arrowText: (arrow.textContent ?? '').trim(),
      }
    })

    await tab.hover()
    /*
     * The label slides on `--ui`; poll for the outcome rather than waiting a fixed time.
     * ⚠️ `translateX(0)` COMPUTES TO `matrix(1, 0, 0, 1, 0, 0)`, NOT `none` — the first
     * version of this compared against `'none'` and timed out in both engines against a
     * label that had arrived. Read the translation out of the matrix.
     */
    const labelShift = () =>
      page.evaluate(() => {
        const value = getComputedStyle(
          document.querySelector('.site-footer__tab-label') as HTMLElement,
        ).transform
        if (value === 'none') return 0
        return Number(new DOMMatrixReadOnly(value).m41.toFixed(2))
      })
    await expect.poll(labelShift).toBe(0)

    const hovered = await page.evaluate(() => {
      const box = (
        document.querySelector('.site-footer__tab') as HTMLElement
      ).getBoundingClientRect()
      const arrow = document.querySelector('.site-footer__tab-arrow') as HTMLElement
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        arrowOpacity: Number(getComputedStyle(arrow).opacity),
      }
    })

    // 0.05px absorbs the float subtraction in `right - left`; the regression this looks
    // for is the arrow's own 24px slot appearing.
    expect(Math.abs(hovered.width - rest.width), 'the tab resized on hover').toBeLessThan(0.05)
    expect(Math.abs(hovered.left - rest.left), 'the left fillet moved').toBeLessThan(0.05)
    expect(Math.abs(hovered.right - rest.right), 'the right fillet moved').toBeLessThan(0.05)

    // FA-H-12: the tab hints in the direction of travel, and can only do that if the
    // arrow is reserved at rest and revealed on hover.
    expect(rest.arrowText, 'the tab no longer points anywhere').toBe('→')
    expect(rest.arrowWidth, 'the arrow no longer reserves a fixed slot').toBe('14px')
    expect(rest.arrowOpacity, 'the arrow is already visible, so hover says nothing').toBeLessThan(
      0.05,
    )
    expect(hovered.arrowOpacity, 'the arrow never arrives on hover').toBeGreaterThan(0.95)
    /*
     * The pre-nudge is half the reserved slot: (14px arrow + 10px gap) / 2 = 12px. That
     * exact number is what keeps the label optically centred while the slot is empty.
     */
    expect(
      rest.labelShift,
      'the label is not pre-nudged by half the arrow slot, so the tab must resize on hover',
    ).toBeCloseTo(12, 1)
  })
})

/**
 * FA-A-04 — the page that sells "see it in 3D" now shows a garment.
 *
 * Section №02 argued for the one differentiator this company has and showed nothing at
 * all: four lines of prose and a link. Owner's decision 2026-09-07 was a STILL from a
 * real garment rather than a live `<model-viewer>` — the live garment is a 3.9 MB GLB and
 * the viewer measured its own page at 4.37 s to a picture, against ~40 KB for a poster.
 */
test.describe('FA-A-04 — a real garment on the home page', () => {
  /**
   * ⚠️ THE CATALOGUE CAN BE EMPTY, AND ON CI IT ALWAYS IS. `ProofGarment` renders the
   * first published product that has a publicly-fetchable poster, and NOTHING when there
   * is none — deliberately, because an empty band is honest and a broken image on the
   * home page is not. CI has no seeded database (`no such table: products` in the server
   * log), so `getProductCards()` returns `[]` and the block is correctly absent.
   *
   * These five tests asserted it was present and failed all five on the runner while
   * passing on every local machine, which has a seeded D1. Reproduced here by moving
   * `apps/cms/.wrangler` aside: 5 failed, the same signatures.
   *
   * So the empty case is ASSERTED rather than skipped past — the designed absence is a
   * real state with a real requirement (nothing rendered, no empty box, no broken image)
   * — and the geometry tests below skip with a reason that names why.
   */
  const hasProof = async (page: import('@playwright/test').Page) =>
    (await page.locator('.proof__figure').count()) > 0

  test('the empty catalogue renders NOTHING, not an empty box', async ({ page }) => {
    await page.goto('/')
    if (await hasProof(page)) {
      test.skip(true, 'this database has a garment — the populated case is covered below')
      return
    }
    // The section itself still exists and still makes its argument…
    await expect(page.locator('.proof__copy')).toBeVisible()
    // …and nothing half-rendered is left behind.
    await expect(page.locator('.proof__frame')).toHaveCount(0)
    await expect(page.locator('.proof__caption')).toHaveCount(0)
    await expect(page.locator('.proof__figure')).toHaveCount(0)
  })

  test('the picture is there, and it opens the 3D reference', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasProof(page)), 'no published garment with a poster in this database')
    const figure = page.locator('.proof__figure')
    await expect(figure).toHaveCount(1)

    /*
     * The link goes to the VIEWER's host, not this one. Nothing here serves
     * `/{slug}/{colour}`, so a same-origin href would 404 — the same trap the gallery
     * cards carry a warning about.
     */
    const href = await figure.locator('a.proof__link').getAttribute('href')
    expect(href).toMatch(/^https?:\/\/[^/]+\/[^/]+\/[^/]+$/)
    expect(new URL(href ?? '').origin).not.toBe(new URL(page.url()).origin)
  })

  /*
   * ⚠️ THE SPACE MUST EXIST BEFORE THE IMAGE DOES. The home page failed Cumulative
   * Layout Shift in this audit (FA-L-51) and was fixed in the same release; an unsized
   * picture in section two would have re-opened it silently, because a poster loads fast
   * on a developer's machine and late on a phone.
   *
   * Asserted on the FRAME rather than the image, and that is the point: the frame holds
   * its 4/5 box whether the poster arrives, fails, or was never there. The seeded local
   * database serves Payload-relative poster URLs which 403 (audit FA-O-10), so this test
   * runs in the degraded state by default — which is the state that would show a
   * collapse.
   */
  test('the frame reserves a 4:5 box whether or not the poster loads', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasProof(page)), 'no published garment with a poster in this database')
    const box = await page.locator('.proof__frame').boundingBox()
    if (!box) throw new Error('the proof frame has no box at all')
    expect(box.width).toBeGreaterThan(100)
    expect(box.width / box.height).toBeCloseTo(0.8, 2)
  })

  /*
   * ⚠️ THE PICTURE MUST FILL ITS COLUMN, AND THE DEFAULT SAYS OTHERWISE. The UA
   * stylesheet gives `<figure>` `margin: 1em 40px`. Measured 2026-09-07 at 1440px before
   * the reset: the grid track was 352px and the figure rendered at 272 — 80px narrower,
   * off-centre in its own column, with the caption following it. Nothing overflowed,
   * nothing looked broken, and it simply was not the layout that had been written. That
   * is the class of defect no other assertion here can see.
   */
  test('the picture fills its column, with no inherited figure margin', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    test.skip(!(await hasProof(page)), 'no published garment with a poster in this database')
    const measured = await page.evaluate(() => {
      const figure = document.querySelector('.proof__figure') as HTMLElement | null
      const grid = document.querySelector('.proof') as HTMLElement | null
      if (!figure || !grid) return null
      const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').map(Number.parseFloat)
      return { figure: figure.getBoundingClientRect().width, track: tracks[tracks.length - 1] ?? 0 }
    })
    if (!measured) throw new Error('the proof grid did not render')
    expect(measured.track, 'the grid is not in two columns at 1440px').toBeGreaterThan(200)
    expect(
      measured.figure,
      `the figure is ${Math.round(measured.figure)}px inside a ${Math.round(measured.track)}px ` +
        'column — something is adding a margin, most likely the UA default on <figure>',
    ).toBeCloseTo(measured.track, 0)
  })

  test('on a phone the argument comes before the evidence, with no sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    test.skip(!(await hasProof(page)), 'no published garment with a poster in this database')
    const copy = await page.locator('.proof__copy').boundingBox()
    const frame = await page.locator('.proof__frame').boundingBox()
    if (!copy || !frame) throw new Error('the proof block did not lay out')

    // Stacked, picture second. The DOM order is the reading order, so no `order` juggling.
    expect(frame.y).toBeGreaterThanOrEqual(copy.y + copy.height - 1)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'the proof block pushed the page sideways on a phone').toBe(0)
  })

  /*
   * The degraded path, and it is not hypothetical here: this domain has served CACHED
   * media errors for up to 30 days (the cached-404 trap in CLAUDE.md). What must never
   * happen is a broken-image icon and sprawled alt text on the home page.
   */
  test('a poster that fails becomes the designed placeholder, not a broken image', async ({
    page,
  }) => {
    await page.route('**/*poster*', (route) => route.fulfill({ status: 404, body: '' }))
    await page.goto('/')
    test.skip(!(await hasProof(page)), 'no published garment with a poster in this database')
    const frame = page.locator('.proof__frame')
    await expect(frame).toBeVisible()

    /*
     * ⚠️ SCROLL TO IT FIRST, OR THIS TEST MEASURES NOTHING IN FIREFOX. The poster is
     * `loading="lazy"` and sits a screen below the fold. Chromium's lazy threshold is
     * generous enough that it fetches anyway; Firefox does not, so the image reported
     * `complete: false` and `currentSrc: ""` — it had never been requested, the
     * component correctly did not mark it failed, and the assertion failed against
     * working code. Measured 2026-09-07, both engines side by side.
     */
    await frame.scrollIntoViewIfNeeded()
    await expect(frame.locator('.product-card__placeholder')).toHaveText(/3D reference/i)
    // and the box is still the right shape, so nothing above or below it moved
    const box = await frame.boundingBox()
    if (!box) throw new Error('the frame collapsed when the poster failed')
    expect(box.width / box.height).toBeCloseTo(0.8, 2)
  })
})
