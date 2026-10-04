import { join } from 'node:path'
import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { DEFAULT_SITE_SETTINGS } from '../../../packages/shared/src/defaults'
import {
  EMPTY_FOOTER,
  type FooterSettings,
  type SiteFooterContent,
  siteFooterAriaSnapshot,
} from '../../../packages/shared/src/siteFooter'
import { parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'

/**
 * VA-31 — ONE footer on both hosts (visual audit, owner-approved 2026-10-01). The garment
 * pages ended in a pale three-line footer of their own until 2026-10-02; they now draw the
 * website's. apps/cms/e2e/footer.spec.ts holds the website's footer to the same template, so
 * a block that drifts on either host fails on THAT host. WCAG 2.2 SC 3.2.6 Consistent Help asks
 * for contact details in the same order on every page of a site.
 *
 * Without its tab, question and clock since polish Q42 (owner, 2026-10-04): a garment page ends
 * on its own one prompt, "Ask about this garment" (`{ prompt: false }`). The contact details SC
 * 3.2.6 speaks of stay, in the same order as on the website.
 */

const API = '**/api/public/viewer/**'
const STANDARDS = join(import.meta.dirname, '../../cms/public/standards')

/** The fixture's answer (e2e/serve.mjs) carries no footer, like an answer cached before 2026-10. */
const content = (footer: FooterSettings): SiteFooterContent => ({
  footer,
  email: DEFAULT_SITE_SETTINGS.email,
  whatsappNumber: DEFAULT_SITE_SETTINGS.whatsappNumber,
  legalLine: DEFAULT_SITE_SETTINGS.legalLine,
  footerLine: DEFAULT_SITE_SETTINGS.footerLine,
})

const CLAIMS: FooterSettings = {
  ...EMPTY_FOOTER,
  capacity: { moq: '300 pieces', leadTime: '6 weeks', hours: null },
  worksCoordinates: '32.4945° N, 74.5229° E',
  certifications: ['Parent: SEDEX-registered, SMETA-audited', 'Suppliers: OEKO-TEX, GOTS'],
  socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel' }],
}

/** The fixture's answer with a footer of our own: the claim blocks the fixture never carries. */
async function serveFooter(page: Page, footer: FooterSettings) {
  await page.route(API, async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.siteSettings = { ...body.siteSettings, footer }
    await route.fulfill({ response, json: body })
  })
  // The marks are the website's files; on wear-run.com the site serves them to this page.
  await page.route('**/standards/*.svg', (route) =>
    route.fulfill({
      path: join(STANDARDS, new URL(route.request().url()).pathname.split('/').pop() ?? ''),
      contentType: 'image/svg+xml',
    }),
  )
}

const footer = (page: Page) => page.locator('footer.site-footer')

test.describe("the website's footer on the garment pages (VA-31)", () => {
  /*
   * Service workers blocked: the garment page registers one (scripts/sw.mjs), and once it
   * controls a WebKit page, page.route never sees that page's requests — measured 2026-10-02, the
   * marks came back as the test server's fallback page (200 text/html) instead of the files. The
   * worker itself never answers /standards/ (it hands everything outside its immutable folders to
   * the network), so on wear-run.com the website serves the marks; only this test needs it off.
   */
  test.use({ serviceWorkers: 'block' })

  test('renders the shared accessibility tree, with the default copy when the answer has none', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(footer(page)).toMatchAriaSnapshot(
      siteFooterAriaSnapshot(content(EMPTY_FOOTER), { prompt: false }),
    )
  })

  // VA-44 (the owner's choice, 2026-10-02): the address is in normal letters. An accessibility
  // snapshot reads the words, never the capitals CSS draws, and the first rule lost to
  // `.footer-block li` unseen; this asks the computed style (apps/cms/e2e/composition.spec.ts too).
  test('sets the address in normal letters, while the email link beside it keeps its capitals', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const address = footer(page).locator('.footer-block__address')
    await expect(address).toHaveCount(1)
    const facts = await address.evaluate((el) => ({
      address: getComputedStyle(el).textTransform,
      link: getComputedStyle(el.closest('.footer-block')?.querySelector('a') ?? el).textTransform,
    }))
    expect(facts.address, 'the address is still set in capitals').toBe('none')
    expect(facts.link, 'the email link lost its capitals, or the block was not found').toBe(
      'uppercase',
    )
  })

  test('adds each claim block the website has, in the shared order, marks included', async ({
    page,
  }) => {
    await serveFooter(page, CLAIMS)
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(footer(page)).toMatchAriaSnapshot(
      siteFooterAriaSnapshot(content(CLAIMS), { prompt: false }),
    )
    // Every mark arrived and decodes: the files are the website's, by the same path.
    const marks = footer(page).locator('.footer-marks img')
    await expect(marks).toHaveCount(4)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    for (const img of await marks.all()) {
      const name = await img.getAttribute('alt')
      await expect
        .poll(
          () =>
            img.evaluate((el: HTMLImageElement) =>
              el.decode().then(
                () => true,
                () => false,
              ),
            ),
          { message: `${name} never decoded` },
        )
        .toBe(true)
    }
  })

  /*
   * Polish Q42 (owner, 2026-10-04): no tab and no question on a garment page, so no room kept
   * above the slab for a tab, no full screen of slab for a question to stand in, and the first
   * block starts where the question did. Until then this asked for a one-screen slab with its tab
   * straddling the top edge, which the website's footer still is (apps/cms/e2e/footer.spec.ts).
   */
  test("is the website's dark slab, without the tab or the screen its question stood in", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const geometry = await page.evaluate(() => {
      const footer = document.querySelector('footer.site-footer') as HTMLElement
      const slab = document.querySelector('.site-footer__slab') as HTMLElement
      const inner = document.querySelector('.site-footer__inner') as HTMLElement
      return {
        background: getComputedStyle(slab).backgroundColor,
        tabs: document.querySelectorAll('.site-footer__tab').length,
        roomAbove: slab.getBoundingClientRect().top - footer.getBoundingClientRect().top,
        slabMinHeight: getComputedStyle(slab).minHeight,
        firstBlockAt: Number.parseFloat(getComputedStyle(inner).paddingTop),
        // Bottom-right answered the question at the top-left; with none, the facts start left.
        factsFromLeft:
          (document.querySelector('.footer-facts') as HTMLElement).getBoundingClientRect().left -
          inner.getBoundingClientRect().left,
      }
    })
    // An unstyled footer (the shared stylesheet not loaded) is a transparent box on paper.
    // Opaque first: transparent parses as black at alpha 0 and would pass the darkness check.
    const ground = parseCssColour(geometry.background)
    expect(ground.alpha, `slab background ${geometry.background}`).toBe(1)
    expect(relativeLuminance(ground.rgb)).toBeLessThan(0.05)
    expect(geometry.tabs).toBe(0)
    expect(geometry.roomAbove, 'room kept above the slab for a tab that is not there').toBe(0)
    expect(geometry.slabMinHeight, 'a full screen of slab for a question that is not there').toBe(
      '0px',
    )
    // The question's own top spacing, clamp(44px, 6vw, 84px): 76.8px at 1280px, rounded to 76.
    expect(geometry.firstBlockAt).toBeGreaterThanOrEqual(44)
    expect(geometry.firstBlockAt).toBeLessThanOrEqual(84)
    expect(
      Math.abs(geometry.factsFromLeft),
      'the facts sit right, under a question that is gone',
    ).toBeLessThan(1)
  })

  /*
   * Polish D1 (2026-10-04): the website's column is 1440px from a 1280px screen, and the footer
   * centres its words in the column `--site-max` and `--site-gutter` name. A garment page keeps its
   * own 1200px column, so `.page` sets both to it and `.content` is drawn from them (page.css).
   * Nothing compared the two before, and they had missed each other by 26px at 1440 since the
   * footer came to these pages (VA-31). What would have to break for this to fail: the override
   * gone (planted 2026-10-04: off by 4px at 390, 14px at 1280, 104px from 1440), or `.content`
   * given a width or padding of its own again.
   */
  test("the footer's words line up with the garment page's own column", async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const misses: string[] = []
    for (const width of [390, 768, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const edges = await page.evaluate(() => {
        const column = document.querySelector('.content') as HTMLElement
        const inner = document.querySelector('.site-footer__inner') as HTMLElement
        const box = column.getBoundingClientRect()
        const style = getComputedStyle(column)
        const words = inner.getBoundingClientRect()
        return {
          left: words.left - (box.left + Number.parseFloat(style.paddingLeft)),
          right: words.right - (box.right - Number.parseFloat(style.paddingRight)),
        }
      })
      if (Math.abs(edges.left) > 1 || Math.abs(edges.right) > 1) {
        misses.push(`${width}px: left ${edges.left.toFixed(1)}, right ${edges.right.toFixed(1)}`)
      }
    }
    expect(misses, "the footer's words miss the page's column").toEqual([])
  })

  for (const width of [320, 390, 1440]) {
    test(`fits its wordmark to the slab and scrolls nothing sideways at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const fit = await page.evaluate(() => {
        const mark = document.querySelector('.footer-mark') as HTMLElement
        const layer = mark.querySelector('.footer-mark__layer') as HTMLElement
        return {
          needed: layer.scrollWidth,
          room: mark.clientWidth,
          page: document.documentElement.scrollWidth,
          viewport: document.documentElement.clientWidth,
        }
      })
      // FITTED: the name spans the slab (the website's FooterWordmark rule), never past it.
      expect(fit.needed).toBeLessThanOrEqual(fit.room + 1)
      expect(fit.needed).toBeGreaterThan(fit.room * 0.9)
      expect(fit.page).toBeLessThanOrEqual(fit.viewport)
    })
  }
})

/*
 * VA-25 on the garment pages: with the website's dark footer last on the page, the room kept for
 * the cookie question and an iPhone's bounce would show a pale band under it, as they did on the
 * website before 2026-10-01. The rules moved into the shared footer.css with the footer.
 * Polish M2 (2026-10-04, the owner's iPhone): painted the footer's colour, the room was still an
 * empty band under the RUN APPAREL wordmark, so it is the wordmark's top margin since, and the
 * wordmark is the last thing on the page, question or not. apps/cms/e2e/consent.spec.ts holds the
 * website to the same checks.
 */
/** The room above the wordmark, and how far the page runs on past the footer (0: none). */
const readFoot = (page: Page) =>
  page.evaluate(() => {
    const slab = document.querySelector('.site-footer__slab') as HTMLElement
    return {
      aboveMark: getComputedStyle(document.querySelector('.footer-mark') as Element)
        .marginBlockStart,
      underFooter: Math.round(
        document.documentElement.scrollHeight -
          (slab.getBoundingClientRect().bottom + window.scrollY),
      ),
    }
  })

/** The cookie question honours navigator.webdriver; lift it, as consent.spec.ts does. */
const showTheQuestion = (context: BrowserContext) =>
  context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

test.describe('the room kept for the cookie question on the garment pages (VA-25, VA-31, M2)', () => {
  /*
   * ⚠️ POLLED: under reduced motion base.css gives every element a 0.01ms transition on every
   * property, so the margin the open question adds reads as its old value until the next frame.
   */
  test('with the question open the room is above the wordmark, and the page ends at the footer', async ({
    page,
    context,
  }) => {
    await showTheQuestion(context)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.locator('.consent')).toBeVisible()
    await expect
      .poll(async () => (await readFoot(page)).aboveMark, {
        message: 'the room is not the 11rem the card needs',
      })
      .toBe('176px')
    // One pixel of rounding: `scrollHeight` is an integer and the slab's edge is not.
    expect(
      Math.abs((await readFoot(page)).underFooter),
      'the page runs on under the footer',
    ).toBeLessThanOrEqual(1)

    // Answered, the room goes and the footer still ends the page.
    await page.locator('.consent').getByRole('button', { name: 'Decline' }).click()
    await expect(page.locator('.consent')).toBeHidden()
    await expect
      .poll(async () => (await readFoot(page)).aboveMark, {
        message: 'the room outlived the question',
      })
      .toBe('0px')
    expect(Math.abs((await readFoot(page)).underFooter)).toBeLessThanOrEqual(1)
  })

  test('the check sees a room under the footer (negative control: the room at the foot, as before M2)', async ({
    page,
    context,
  }) => {
    await showTheQuestion(context)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.locator('.consent')).toBeVisible()
    await page.addStyleTag({
      content:
        ':root:has(.consent) body::after { content: ""; display: block; block-size: var(--consent-reserve); }',
    })
    await expect
      .poll(async () => (await readFoot(page)).underFooter, {
        message: 'the planted room did not land',
      })
      .toBeGreaterThanOrEqual(175)
  })

  test.describe('on a touch phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    test("the canvas a bounce shows below the page is the footer's colour too", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const look = await page.evaluate(() => ({
        touch: matchMedia('(hover: none)').matches,
        page: getComputedStyle(document.body).backgroundColor,
        footer: getComputedStyle(document.querySelector('.site-footer__slab') as HTMLElement)
          .backgroundColor,
      }))
      expect(look.touch, 'the emulated phone reports hover — this test measures nothing').toBe(true)
      // Polled: the root's background may run its theme transition once as the page loads.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe(look.footer)
      // NEGATIVE CONTROL: the page itself keeps its paper; only the canvas beyond it changed.
      expect(look.page).not.toBe(look.footer)
    })

    /*
     * ⚠️ THE CHECK ABOVE IS CHROMIUM'S RULE; SAFARI'S ADDS `body` (owner's iPhone, 2026-10-02: the
     * band was still there on every page). WebKit takes the colour beyond the page from
     * `LocalFrameView::documentBackgroundColor()`, body's background COLOUR painted over html's
     * (WebKit source, read 2026-10-03), so html's alone proved nothing about an iPhone. On a phone
     * body's colour is see-through, leaving html's, and its paper is an image layer instead.
     */
    test("Safari's colour beyond the page is the footer's too: body's own colour is see-through", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const look = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.background = 'var(--bg)'
        document.body.append(probe)
        const paper = getComputedStyle(probe).backgroundColor
        probe.remove()
        const body = getComputedStyle(document.body)
        return {
          touch: matchMedia('(hover: none)').matches,
          bodyColour: body.backgroundColor,
          bodyImage: body.backgroundImage,
          paper,
        }
      })
      expect(look.touch, 'the emulated phone reports hover — this test measures nothing').toBe(true)
      expect(look.bodyColour, "body's colour would be painted over the footer's").toBe(
        'rgba(0, 0, 0, 0)',
      )
      // NEGATIVE CONTROL for the change itself: the page still paints its paper, as an image.
      expect(look.bodyImage).toBe(`linear-gradient(${look.paper}, ${look.paper})`)
    })
  })
})
