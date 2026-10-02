import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
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
    await expect(footer(page)).toMatchAriaSnapshot(siteFooterAriaSnapshot(content(EMPTY_FOOTER)))
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
    await expect(footer(page)).toMatchAriaSnapshot(siteFooterAriaSnapshot(content(CLAIMS)))
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

  test("is the website's dark slab, one screen tall from tablet width up, its tab on the edge", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const geometry = await page.evaluate(() => {
      const slab = document.querySelector('.site-footer__slab') as HTMLElement
      const tab = document.querySelector('.site-footer__tab') as HTMLElement
      const s = slab.getBoundingClientRect()
      const t = tab.getBoundingClientRect()
      return {
        background: getComputedStyle(slab).backgroundColor,
        slabHeight: s.height,
        tabStraddles: t.top < s.top && t.bottom >= s.top,
        viewport: innerHeight,
      }
    })
    // An unstyled footer (the shared stylesheet not loaded) is a transparent box on paper.
    // Opaque first: transparent parses as black at alpha 0 and would pass the darkness check.
    const ground = parseCssColour(geometry.background)
    expect(ground.alpha, `slab background ${geometry.background}`).toBe(1)
    expect(relativeLuminance(ground.rgb)).toBeLessThan(0.05)
    expect(geometry.slabHeight).toBeGreaterThanOrEqual(geometry.viewport - 1)
    expect(geometry.tabStraddles, 'the tab must sit on the slab’s top edge').toBe(true)
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
 * website before 2026-10-01. The two rules moved into the shared footer.css with the footer;
 * apps/cms/e2e/consent.spec.ts holds the website to the same two checks.
 */
test.describe('the room under the footer on the garment pages (VA-25, VA-31)', () => {
  test("with the question open, the room kept at the foot is the footer's colour", async ({
    page,
    context,
  }) => {
    // The cookie question honours navigator.webdriver; lift it, as consent.spec.ts does.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.locator('.consent')).toBeVisible()
    const look = await page.evaluate(() => {
      const room = getComputedStyle(document.body, '::after')
      const slab = document.querySelector('.site-footer__slab') as HTMLElement
      return {
        height: room.blockSize,
        room: room.backgroundColor,
        footer: getComputedStyle(slab).backgroundColor,
      }
    })
    expect(look.height, 'the room is not the 11rem the card needs').toBe('176px')
    // Polled: WebKit runs the theme's colour transition once as the page loads (the website's
    // copy of this test records it), and one run in six read the room mid-way on 2026-10-02.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body, '::after').backgroundColor), {
        message: 'the room under the footer is not the footer colour',
      })
      .toBe(look.footer)
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
  })
})
