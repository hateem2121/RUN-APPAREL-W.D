import { expect, type Page, test } from './offlineMedia'
import {
  SITE_BAR_WORDMARK,
  SITE_MENU_ID,
  SITE_MENU_NAME,
  siteBarAriaSnapshot,
} from '../../../packages/shared/src/siteBar'

/**
 * XS-02, XS-01, TY-08 — ONE menu bar on both hosts (owner decision 2026-09-17: "Same menu bars
 * everywhere. The one I prefer is at wear-run.help"). apps/viewer/e2e/siteBar.spec.ts runs the
 * same checks against the same constants, so a bar that drifts on either host fails on THAT host.
 */
test.describe('one menu bar on both hosts — the site', () => {
  test('renders the shared accessibility tree: wide, and on a phone closed and open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const wordmark = (await page.locator('.notch__wordmark').innerText()).trim()
    const bar = page.locator('header.notch-shell')
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('wide', wordmark))
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('phone-closed', wordmark))
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(`#${SITE_MENU_ID}:popover-open`)).toHaveCount(1)
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('phone-open', wordmark))
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: sets the name exactly as the contract says (TY-08, XS-01)`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const m = await page.locator('.notch__wordmark').evaluate((element) => {
        const style = getComputedStyle(element)
        const bar = element.closest('.notch')
        return {
          family: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStretch: style.fontStretch,
          fontSize: style.fontSize,
          letterSpacing: style.letterSpacing,
          colour: style.color,
          barColour: bar ? getComputedStyle(bar).color : '',
        }
      })
      expect({
        fontWeight: m.fontWeight,
        fontStretch: m.fontStretch,
        fontSize: m.fontSize,
        letterSpacing: m.letterSpacing,
      }).toEqual(SITE_BAR_WORDMARK)
      expect(m.family).toMatch(/^"?Archivo Variable"?/)
      expect(m.colour, "the name is not in the bar's own text colour").toBe(m.barColour)
    })
  }
})

/*
 * VA-50 (owner, 2026-10-01, from an iPhone): the strip around the clock and battery stayed paper
 * above the dark bar. Safari 26 and 27 ignore `theme-color` and take that area's colour from a
 * fixed element touching the page's top edge, found by hit-testing — so a 6px strip in the bar's
 * colour, on phones only (owner decision). Asserted where Safari looks: what the top edge holds
 * beside the bar. Android Chrome still reads `theme-color`, so that must give the same colour.
 * apps/viewer/e2e/siteBar.spec.ts runs the same test on a garment page.
 */
test.describe('the phone status area takes the bar colour (VA-50) — the site', () => {
  /** What Safari and Chrome would each take for the browser's own bar, as #rrggbb. */
  const probe = () => {
    const hex = (rgb: string) =>
      `#${(rgb.match(/\d+/g) ?? [])
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`
    const strip = document.querySelector('.notch-strip') as HTMLElement
    const box = strip.getBoundingClientRect()
    const style = getComputedStyle(strip)
    const themeColour = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
      .find((tag) => !tag.media || matchMedia(tag.media).matches)
      ?.content.toLowerCase()
    return {
      touch: matchMedia('(hover: none)').matches,
      display: style.display,
      position: style.position,
      box: [box.top, box.height, box.width - innerWidth],
      hit: document.elementFromPoint(4, 2) === strip,
      strip: hex(style.backgroundColor),
      bar: hex(getComputedStyle(document.querySelector('.notch') as HTMLElement).backgroundColor),
      page: hex(getComputedStyle(document.body).backgroundColor),
      themeColour,
    }
  }

  test.describe('on a touch phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    for (const scheme of ['light', 'dark'] as const) {
      test(`${scheme}: the top edge holds a strip in the bar's colour`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/')
        await expect(page.locator('.notch')).toBeVisible()
        const top = await page.evaluate(probe)
        expect(top.touch, 'the emulated phone reports hover — this test measures nothing').toBe(
          true,
        )
        expect(top.position).toBe('fixed')
        expect(top.box, 'not a full-width 6px strip at the very top').toEqual([0, 6, 0])
        expect(top.strip, "the strip is not the bar's colour").toBe(top.bar)
        expect(
          top.hit,
          'Safari finds the strip by hit-testing, and the top edge holds something else',
        ).toBe(true)
        expect(top.themeColour, "Android's bar would not be the bar's colour").toBe(top.bar)
      })
    }
  })

  test('not on a desktop: no strip, and the browser bar takes the page colour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.locator('.notch')).toBeVisible()
    const top = await page.evaluate(probe)
    expect(top.touch).toBe(false)
    expect(top.display).toBe('none')
    expect(top.hit).toBe(false)
    expect(top.themeColour, 'a desktop took the phone colour').toBe(top.page)
  })
})

/*
 * Polish F3 and X26 (2026-10-04): while the phone menu is open, the page behind it holds still
 * and is dimmed, and the bar is not. In the audit's second check a wheel beside the open menu
 * scrolled the page away under it. These run AS A HUMAN with smooth scroll on, because a wheel
 * that Lenis takes is exactly what slipped past the page's overflow (pageHold.ts), and in a
 * phone-width window on a computer, because a wheel is how a computer scrolls.
 *
 * As a human the cookie card shows (it hides under automation), and it sits above the bar's
 * layer at the foot of the screen, so every point here is taken from the page: on a link, below
 * the open panel and above the card.
 */
test.describe('the open phone menu holds the page still and dims it (polish F3, X26) — the site', () => {
  test.skip(({ isMobile }) => isMobile, 'a wheel: a narrow window on a computer')

  const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => false,
    configurable: true,
  })`
  const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY))
  const menuOpen = (page: Page) =>
    page.evaluate(
      (id) => document.getElementById(id)?.matches(':popover-open') ?? false,
      SITE_MENU_ID,
    )
  const openMenu = async (page: Page) => {
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect.poll(() => menuOpen(page)).toBe(true)
  }

  /** /products in a 600px window, scrolled a little, with smooth scroll proven running. */
  async function openProducts(page: Page) {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(asAHuman)
    await page.setViewportSize({ width: 600, height: 800 })
    await page.goto('/products')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
        message: 'Lenis never started, so a wheel here would test native scrolling only',
        timeout: 10_000,
      })
      .toBe(true)
    await page.evaluate(() => window.scrollTo(0, 300))
    await page.waitForTimeout(300)
  }

  /**
   * A point on a link of the page, below where the open panel reaches and above the cookie card,
   * found BEFORE the menu opens: a grid scan, because a card's links are taller than that band
   * and their centres fall outside it. Null if the page offers none, which the tests refuse.
   */
  const pagePoint = (page: Page) =>
    page.evaluate(() => {
      const card = document.querySelector('.consent')?.getBoundingClientRect().top ?? innerHeight
      for (let y = 420; y < card - 16; y += 12) {
        for (let x = 40; x < innerWidth - 40; x += 40) {
          if (document.elementFromPoint(x, y)?.closest('main a[href]')) return { x, y }
        }
      }
      return null
    })

  async function pointOnThePage(page: Page) {
    const point = await pagePoint(page)
    expect(
      point,
      'no link between the panel and the cookie card, so this measures nothing',
    ).not.toBeNull()
    return point ?? { x: 0, y: 0 }
  }

  /** A wheel at `point`; longer than the 1.1 s glide, so a slow one cannot hide in the wait. */
  async function wheelAt(page: Page, point: { x: number; y: number }) {
    await page.mouse.move(point.x, point.y)
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(1500)
  }

  test('a wheel beside the open menu moves nothing, and scrolls again once it closes', async ({
    page,
  }) => {
    await openProducts(page)
    const point = await pointOnThePage(page)
    const start = await scrollY(page)
    await openMenu(page)
    await wheelAt(page, point)
    // WebKit is the engine that scrolled a page held on the wrong element (pageHold.ts).
    expect(await scrollY(page), 'the page scrolled behind the open menu').toBe(start)
    await page.keyboard.press('Escape')
    await expect.poll(() => menuOpen(page)).toBe(false)
    await wheelAt(page, point)
    expect(await scrollY(page), 'the hold outlived the menu').toBeGreaterThan(start)
  })

  test('NEGATIVE CONTROL: with the hold taken off, the same wheel scrolls the page under the menu', async ({
    page,
  }) => {
    await openProducts(page)
    const point = await pointOnThePage(page)
    const start = await scrollY(page)
    await openMenu(page)
    const lifted = await page.evaluate(() => {
      const held = [document.documentElement, document.body].filter(
        (element) => element.style.overflowY === 'hidden',
      )
      for (const element of held) {
        element.style.overflowX = ''
        element.style.overflowY = ''
      }
      return held.length
    })
    expect(lifted, 'the menu held nothing, so there was no hold to lift').toBe(1)
    await wheelAt(page, point)
    expect(await scrollY(page)).toBeGreaterThan(start)
  })

  test('the dim covers the page and not the bar, and the page does not move sideways', async ({
    page,
  }) => {
    await openProducts(page)
    const point = await pointOnThePage(page)
    const width = await page.evaluate(() => document.documentElement.clientWidth)
    await openMenu(page)
    await expect
      .poll(() =>
        page
          .locator('header.notch-shell')
          .evaluate((shell) => getComputedStyle(shell, '::before').opacity),
      )
      .toBe('1')
    const hits = await page.evaluate(({ x, y }) => {
      const bar = (document.querySelector('.notch') as HTMLElement).getBoundingClientRect()
      const onBar = document.elementFromPoint(bar.left + 24, bar.top + bar.height / 2)
      return {
        bar: Boolean(onBar?.closest('.notch')),
        page: document.elementFromPoint(x, y)?.matches('header.notch-shell') ?? false,
      }
    }, point)
    expect(hits.bar, 'the dim lies over the bar').toBe(true)
    expect(hits.page, 'the dim does not cover the page').toBe(true)
    // A classic scrollbar (Firefox here) keeps its space while the page is held.
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(width)
  })

  /*
   * The tap. A card's link goes to the live garment page, which a test must not visit, so the
   * page records where each click lands and cancels it. Tapped the moment the menu reports open:
   * the dim once arrived a frame late, and a tap in that frame reached the link (notch.css).
   */
  for (const dim of [true, false]) {
    test(
      dim
        ? 'a tap on the dim only closes the menu'
        : 'NEGATIVE CONTROL: without the dim, the same tap reaches the link under it',
      async ({ page }) => {
        await openProducts(page)
        const point = await pointOnThePage(page)
        if (!dim)
          await page.addStyleTag({ content: '.notch-shell::before{display:none!important}' })
        await page.evaluate(() => {
          const clicks: boolean[] = []
          ;(window as unknown as { __linkClicks: boolean[] }).__linkClicks = clicks
          window.addEventListener(
            'click',
            (event) => {
              const target = event.target instanceof Element ? event.target : null
              // The bar's own controls, the menu button among them, keep their clicks.
              if (target?.closest('.notch')) return
              clicks.push(target?.closest('a') != null)
              event.preventDefault()
            },
            { capture: true },
          )
        })
        await openMenu(page)
        await page.mouse.click(point.x, point.y)
        await expect.poll(() => menuOpen(page)).toBe(false)
        const clicks = await page.evaluate(
          () => (window as unknown as { __linkClicks: boolean[] }).__linkClicks,
        )
        expect(clicks, 'the tap did not arrive as one click').toHaveLength(1)
        expect(
          clicks[0],
          dim ? 'the tap went through the dim to a link' : 'the control tap missed the link',
        ).toBe(!dim)
      },
    )
  }

  /*
   * Polish F5 (2026-10-04): the menu is drawn in the browser's top layer, above every z-index, so
   * the dot and ring passed under it, and over its links, where the browser's pointer is hidden
   * too, there was no pointer at all. Between top-layer elements the last one added is drawn on
   * top (CSS Positioned Layout 4), so the ORDER they arrive in is what puts the pointer above the
   * menu: recorded from the `toggle` events, which fire as each one arrives.
   */
  test('the dot and ring stay above the open menu, which still takes its taps (F5)', async ({
    page,
  }) => {
    await openProducts(page)
    await page.locator('.cursor-dot').waitFor({ state: 'attached' })
    const point = await pointOnThePage(page)
    await page.mouse.move(point.x, point.y)
    await page.mouse.move(point.x + 6, point.y, { steps: 3 })
    await page.evaluate(() => {
      const order: string[] = []
      ;(window as unknown as { __order: string[] }).__order = order
      document.addEventListener(
        'toggle',
        (event) => {
          if ((event as Event & { newState?: string }).newState !== 'open') return
          order.push(String((event.target as Element).className).split(' ')[0] ?? '')
        },
        true,
      )
    })
    await openMenu(page)
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __order: string[] }).__order))
      .toEqual(['notch__menu', 'cursor-dot', 'cursor-ring'])

    const ring = () =>
      page.evaluate(() => {
        const element = document.querySelector('.cursor-ring')
        return {
          lifted: element?.matches(':popover-open') ?? false,
          hidden: element?.getAttribute('data-hidden'),
          grows: element?.getAttribute('data-pointer'),
        }
      })
    await page.locator(`#${SITE_MENU_ID} .nav-link`).first().hover()
    await expect.poll(ring).toEqual({ lifted: true, hidden: 'false', grows: 'true' })

    await page.locator(`#${SITE_MENU_ID}`).getByRole('link', { name: 'Contact' }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect
      .poll(ring, { message: 'the dot and ring stayed in the top layer after the menu closed' })
      .toMatchObject({ lifted: false })
  })
})
