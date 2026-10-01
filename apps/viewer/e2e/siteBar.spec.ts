import { expect, type Page, test } from '@playwright/test'
import {
  SITE_BAR_WORDMARK,
  SITE_MENU_ID,
  SITE_MENU_NAME,
  siteBarAriaSnapshot,
} from '../../../packages/shared/src/siteBar'
import { contrastOf, parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'

/**
 * The phone menu has finished arriving: the bar widened, the panel dropped in on a scale from
 * 0.94 and the rows faded in (VA-51). Anything that measures the open menu waits for this — a
 * row read mid-entry was 41.4px, and even reduced motion's 0.01ms leaves one frame.
 */
const menuLanded = (page: Page) =>
  page.waitForFunction(() =>
    (document.querySelector('.notch-shell') as HTMLElement)
      .getAnimations({ subtree: true })
      .every((a) => a.playState !== 'running' || a.timeline !== document.timeline),
  )

/**
 * XS-02, XS-01, TY-08 — ONE menu bar on both hosts (owner decision 2026-09-17: "Same menu bars
 * everywhere. The one I prefer is at wear-run.help"). apps/cms/e2e/siteBar.spec.ts runs the
 * same checks against the same constants, so a bar that drifts on either host fails on THAT host.
 */
test.describe('one menu bar on both hosts — the viewer', () => {
  test('renders the shared accessibility tree: wide, and on a phone closed and open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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

test.describe('the menu says where the visitor is — the viewer (VA-37)', () => {
  test('Products is marked as the current section, underlined like a current page', async ({
    page,
  }) => {
    // Every garment page lives under the site's /products. `true`, not `page`: the link is the
    // section, not this page.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const products = page.locator('.notch__nav a[href$="/products"]')
    await expect(products).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('.notch__nav a[href$="/contact"]')).not.toHaveAttribute(
      'aria-current',
      /.*/,
    )
    expect(
      await products.evaluate((link) => getComputedStyle(link).textDecorationLine),
      'marked by colour alone',
    ).toBe('underline')
    await expect(page.locator('.notch__nav a[href$="/guides"]')).toBeHidden()
  })
})

test.describe('the focus ring in the dark bar (volt, both themes)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: every ring in the bar and the open menu reaches 4.5:1`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by preference')
      await page.goto('/n001/wine')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // WAIT FOR THE HAND-OFF (motion-and-layout.spec.ts explains why), then Tab from the top.
      await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const luminance = relativeLuminance(parseCssColour(ground).rgb)
      if (scheme === 'dark') expect(luminance, `not dark: ${ground}`).toBeLessThan(0.2)
      else expect(luminance, `not light: ${ground}`).toBeGreaterThan(0.5)
      const ring = () =>
        page.evaluate(() => {
          const element = document.activeElement as HTMLElement
          const behind =
            element.closest('.notch__menu:popover-open') ??
            element.closest('.notch') ??
            document.body
          const style = getComputedStyle(element)
          return {
            name: element.className,
            style: style.outlineStyle,
            colour: style.outlineColor,
            behind: getComputedStyle(behind).backgroundColor,
          }
        })
      const rings = []
      await page.keyboard.press('Tab') // the skip link
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the wordmark
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the menu button
      await page.keyboard.press('Enter')
      await expect(page.locator(`#${SITE_MENU_ID}:popover-open`)).toHaveCount(1)
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the first link, in the open menu
      expect(rings.map((entry) => entry.name)).toEqual([
        'notch__wordmark',
        'notch__menu-btn',
        'nav-link',
      ])
      const failing = rings
        .filter((entry) => entry.style !== 'solid' || contrastOf(entry.colour, entry.behind) < 4.5)
        .map(
          (entry) =>
            `${entry.name}: ${entry.colour} on ${entry.behind} = ${contrastOf(entry.colour, entry.behind).toFixed(2)}:1`,
        )
      expect(failing, `${scheme}: a ring in the dark bar is too faint`).toEqual([])
    })
  }
})

/**
 * SC-11, the viewer's half: the page is never left scroll-locked after the menu. The site's
 * half is in apps/cms/e2e/navbar.spec.ts. Here smooth scrolling (Lenis) is live for a real
 * visitor, and Lenis has a lock of its own (`.lenis-stopped`), so this runs as a human with
 * motion allowed and first asserts Lenis is running; otherwise it would test the other path.
 */
test.describe('the page still scrolls after the menu — the viewer (SC-11)', () => {
  test('after every way the menu closes, a wheel still scrolls the page', async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      'mobile WebKit has no wheel in Playwright, and a synthetic touch does not scroll ' +
        '(apps/viewer/CLAUDE.md); the three desktop engines run this',
    )
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => false,
        configurable: true,
      })
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.locator('html.lenis'),
      'smooth scrolling never started, so this would test the page without it',
    ).toHaveCount(1, { timeout: 10_000 })

    const menu = `#${SITE_MENU_ID}`
    const open = `${menu}:popover-open`
    const button = page.getByRole('button', { name: SITE_MENU_NAME, exact: true })

    const stillScrolls = async (after: string) => {
      const locked = await page.evaluate(() => ({
        overflow: [
          getComputedStyle(document.documentElement).overflowY,
          getComputedStyle(document.body).overflowY,
        ],
        lenisStopped: document.documentElement.classList.contains('lenis-stopped'),
      }))
      expect(locked.overflow, `${after}: <html> or <body> is left overflow hidden`).not.toContain(
        'hidden',
      )
      expect(locked.lenisStopped, `${after}: smooth scrolling is left stopped`).toBe(false)
      // The bar narrows back on --ui once the menu closes (VA-51). Aimed at mid-narrowing, the
      // wheel landed beside the finished bar, on the 3D stage, and turned the garment instead
      // (WebKit and Firefox, 2026-10-01). Aim where the bar ends up.
      await menuLanded(page)
      const bar = await page.locator('header.notch-shell .notch').boundingBox()
      if (!bar) throw new Error('no bar to wheel over')
      await page.mouse.move(bar.x + 8, bar.y + bar.height / 2)
      // Back to the top by wheel, not scrollTo: Lenis keeps its own target and glides the
      // page straight back to it after a scrollTo (measured 2026-09-25: 400, not 0).
      await page.mouse.wheel(0, -4000)
      await expect
        .poll(() => page.evaluate(() => Math.round(scrollY)), {
          message: `${after}: could not get back to the top to measure`,
        })
        .toBe(0)
      await page.mouse.wheel(0, 400)
      await expect
        .poll(() => page.evaluate(() => scrollY), {
          message: `${after}: a wheel no longer scrolls the page`,
        })
        .toBeGreaterThan(0)
    }

    // The instrument first: without this, a wheel that never scrolls would read as a lock.
    await stillScrolls('before the menu ever opened')

    await button.click()
    await expect(page.locator(open)).toHaveCount(1)
    await button.click()
    await expect(page.locator(open)).toHaveCount(0)
    await stillScrolls('closed by its own button')

    await button.click()
    await expect(page.locator(open)).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator(open)).toHaveCount(0)
    await stillScrolls('closed by Escape')

    await button.click()
    await expect(page.locator(open)).toHaveCount(1)
    await menuLanded(page)
    const point = await page.evaluate((selector) => {
      const panel = document.querySelector(selector)?.getBoundingClientRect()
      if (!panel) return null
      for (let y = Math.ceil(panel.bottom) + 16; y < innerHeight - 8; y += 8) {
        const hit = document.elementFromPoint(24, y)
        if (hit && !hit.closest('a, button, input, textarea, select, label, model-viewer'))
          return { x: 24, y }
      }
      return null
    }, menu)
    if (!point) throw new Error('found no inert point under the open menu to tap')
    await page.mouse.click(point.x, point.y)
    await expect(page.locator(open), 'a tap outside did not close the menu').toHaveCount(0)
    await expect(page, 'the tap outside followed a link').toHaveURL(/\/n001\/wine$/)
    await stillScrolls('closed by a tap outside')

    await button.click()
    await expect(page.locator(open)).toHaveCount(1)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator(open)).toHaveCount(0)
    await stillScrolls('closed by widening past the phone layout')
  })
})

/*
 * VA-50 (owner, 2026-10-01, from an iPhone): the strip around the clock and battery stayed paper
 * above the dark bar. Safari 26 and 27 ignore `theme-color` and take that area's colour from a
 * fixed element touching the page's top edge, found by hit-testing — so a 6px strip in the bar's
 * colour, on phones only (owner decision). Asserted where Safari looks: what the top edge holds
 * beside the bar. Android Chrome still reads `theme-color`, so that must give the same colour.
 * apps/cms/e2e/siteBar.spec.ts runs the same test on the site.
 */
test.describe('the phone status area takes the bar colour (VA-50) — the viewer', () => {
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
        await page.goto('/n001/wine')
        await expect(page.locator('.notch')).toBeVisible()
        // The loading screen covers the top edge until it has gone (WebKit, measured at 0ms).
        await expect(page.locator('.preloader')).toHaveCount(0)
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

  test.describe('on a desktop', () => {
    // Its own context: the iPhone project would otherwise report touch at any width.
    test.use({ hasTouch: false, isMobile: false })
    test('no strip, and the browser bar takes the page colour', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto('/n001/wine')
      await expect(page.locator('.notch')).toBeVisible()
      await expect(page.locator('.preloader')).toHaveCount(0)
      const top = await page.evaluate(probe)
      expect(top.touch).toBe(false)
      expect(top.display).toBe('none')
      expect(top.hit).toBe(false)
      expect(top.themeColour, 'a desktop took the phone colour').toBe(top.page)
    })
  })
})
