import { expect, type Page, test } from './offlineMedia'

/**
 * XS-06 / OI-2 — the site's smooth scroll (components/site/SmoothScroll.tsx), with the
 * viewer's guards, each proven in a browser. Every case runs AS A HUMAN with motion allowed:
 * under automation the layer is off by design, so a test without the spoof measures the
 * browser's own scrolling and passes with SmoothScroll.tsx deleted. Each case therefore
 * first proves Lenis started (it adds `lenis` to <html> in its constructor).
 */
const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

async function openAsHuman(page: Page, path: string) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(asAHuman)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(path)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
      message:
        'Lenis never started, so this case would measure native scrolling and pass with ' +
        'SmoothScroll.tsx deleted. Check the webdriver spoof and the reduced-motion emulation.',
      timeout: 10_000,
    })
    .toBe(true)
}

/** Waits until scrollY has held still for three reads 100ms apart and no glide is running. */
async function waitForStill(page: Page) {
  let last = -1
  let same = 0
  for (let i = 0; i < 60 && same < 3; i++) {
    await page.waitForTimeout(100)
    const now = await page.evaluate(() =>
      document.documentElement.classList.contains('lenis-smooth') ? -2 : Math.round(window.scrollY),
    )
    same = now >= 0 && now === last ? same + 1 : 0
    last = now
  }
  if (same < 3) throw new Error('the page never came to rest within 6s')
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY))

test.describe('the site smooth-scrolls like the viewer (XS-06, OI-2)', () => {
  test.skip(({ isMobile }) => isMobile, 'a phone has no wheel; touch stays native (below)')

  test('it is off under reduced motion, and the library is never downloaded there', async ({
    page,
  }) => {
    const bodies: string[] = []
    page.on('response', async (response) => {
      if (!/javascript/.test(response.headers()['content-type'] ?? '')) return
      try {
        bodies.push(await response.text())
      } catch {
        // an abandoned response has no body
      }
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(asAHuman)
    await page.goto('/products', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    expect(
      await page.evaluate(() => document.documentElement.classList.contains('lenis')),
      'smooth scroll started for a visitor who asked for reduced motion',
    ).toBe(false)
    // `lenis-smooth` is a class name only the library itself writes.
    expect(
      bodies.filter((b) => b.includes('lenis-smooth')),
      'a reduced-motion visitor downloaded the smooth-scroll library',
    ).toEqual([])
  })

  test('a wheel nobody rolled is refused; a real wheel glides', async ({ page }) => {
    await openAsHuman(page, '/products')
    const after = await page.evaluate(async () => {
      window.scrollTo(0, 0)
      document.body.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 4000, bubbles: true, cancelable: true }),
      )
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return Math.round(window.scrollY)
    })
    expect(after, 'an untrusted wheel event scrolled the page (FA-F-12 predicate)').toBe(0)
    const header = await page.locator('header').first().boundingBox()
    if (!header) throw new Error('no header to wheel over')
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
    await page.mouse.wheel(0, 800)
    await expect.poll(() => scrollY(page), { timeout: 5_000 }).toBeGreaterThan(100)
  })

  test('one wheel tick glides for the designed 1.1s, then stops (SC-05)', async ({ page }) => {
    await openAsHuman(page, '/products')
    const header = await page.locator('header').first().boundingBox()
    if (!header) throw new Error('no header to wheel over')
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
    await page.evaluate(() => {
      const w = window as unknown as { __sc05: { t: number; y: number }[] }
      w.__sc05 = []
      const t0 = performance.now()
      const tick = () => {
        const t = performance.now() - t0
        w.__sc05.push({ t, y: window.scrollY })
        if (t < 3000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(3200)
    const samples = await page.evaluate(
      () => (window as unknown as { __sc05: { t: number; y: number }[] }).__sc05,
    )
    const final = samples.at(-1)?.y ?? 0
    const firstMove = samples.find((s) => s.y !== samples[0]?.y)?.t ?? 0
    let lastFar = firstMove
    for (const s of samples) if (s.t >= firstMove && Math.abs(s.y - final) >= 1) lastFar = s.t
    const settleMs = Math.round(lastFar - firstMove)
    console.log(`SC-05 (site, human) measured: moved ${final}px, settled ${settleMs}ms`)
    expect(final, 'the wheel tick moved nothing at all').toBeGreaterThan(0)
    // Both bounds carry weight: over 300ms proves a glide ran (the native tick lands in
    // one frame, 0ms, measured 2026-09-25); under 1.5s is the viewer's own SC-05 ceiling.
    expect(settleMs, 'the tick landed at once: the smooth layer did nothing').toBeGreaterThan(300)
    expect(settleMs, 'the glide outlasted the designed 1.1s').toBeLessThan(1500)
  })

  test('End, Home and PageDown stay the keyboard’s, including End pressed mid-glide', async ({
    page,
  }) => {
    await openAsHuman(page, '/products')
    await page.locator('body').click({ position: { x: 5, y: 400 } })
    const bottomGap = () =>
      page.evaluate(() =>
        Math.round(document.documentElement.scrollHeight - window.innerHeight - window.scrollY),
      )
    await page.keyboard.press('End')
    await expect
      .poll(bottomGap, { message: 'End did not reach the bottom', timeout: 5_000 })
      .toBeLessThanOrEqual(1)
    await waitForStill(page)
    await page.keyboard.press('Home')
    await expect
      .poll(() => scrollY(page), { message: 'Home did not reach the top', timeout: 5_000 })
      .toBe(0)
    await waitForStill(page)
    await page.keyboard.press('PageDown')
    await expect
      .poll(() => scrollY(page), { message: 'PageDown did not move', timeout: 5_000 })
      .toBeGreaterThan(200)
    await waitForStill(page)

    // Mid-glide: start a long wheel glide from the top, then press End while it runs.
    await page.keyboard.press('Home')
    await waitForStill(page)
    const header = await page.locator('header').first().boundingBox()
    if (!header) throw new Error('no header to wheel over')
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(120)
    await page.keyboard.press('End')
    await waitForStill(page)
    expect(await bottomGap(), 'End pressed mid-glide was lost to the glide').toBeLessThanOrEqual(1)
  })

  test('Back returns to the gallery position; Reload keeps it (FA-F-05, SC-01)', async ({
    page,
  }) => {
    await openAsHuman(page, '/products')
    expect(await page.evaluate(() => history.scrollRestoration)).toBe('auto')
    await page.evaluate(() => window.scrollTo(0, 1000))
    await waitForStill(page)
    expect(await scrollY(page)).toBeGreaterThan(900)
    await page.locator('.notch__nav a', { hasText: /contact/i }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await waitForStill(page)
    await page.goBack()
    await expect(page).toHaveURL(/\/products$/)
    await expect.poll(() => scrollY(page), { timeout: 5_000 }).toBeGreaterThan(940)
    await waitForStill(page)
    expect(await scrollY(page), 'the position drifted after Back').toBeGreaterThan(940)

    await page.reload()
    await expect.poll(() => scrollY(page), { timeout: 5_000 }).toBeGreaterThan(940)
  })

  test('a link clicked mid-glide lands at the top of the new page and stays there', async ({
    page,
  }) => {
    await openAsHuman(page, '/products')
    const header = await page.locator('header').first().boundingBox()
    if (!header) throw new Error('no header to wheel over')
    await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2)
    await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(150)
    expect(
      await page.evaluate(() => document.documentElement.classList.contains('lenis-smooth')),
      'no glide was running when the link was clicked, so this case tests nothing',
    ).toBe(true)
    await page.locator('.notch__nav a', { hasText: /contact/i }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await waitForStill(page)
    expect(await scrollY(page), 'the old page’s glide carried on into the new page').toBe(0)
  })

  test('the browser’s back-forward cache brings the page back where it was', async ({ page }) => {
    await openAsHuman(page, '/products')
    await page.evaluate(() => window.scrollTo(0, 1000))
    await waitForStill(page)
    // A FULL navigation away (not a client-side one), so Back is a document restore.
    await page.goto('/terms')
    await page.goBack()
    await expect(page).toHaveURL(/\/products$/)
    await expect.poll(() => scrollY(page), { timeout: 5_000 }).toBeGreaterThan(940)
    await waitForStill(page)
    expect(await scrollY(page)).toBeGreaterThan(940)
  })
})

test.describe('touch stays the browser’s own scroll (XS-06)', () => {
  /*
   * ⚠️ THIS CASE CAN ONLY RUN WHERE THE BROWSER SCROLLS ON A SYNTHESIZED TOUCH. Measured
   * 2026-09-25: CI's Linux Chromium (mcr.microsoft.com/playwright:v1.62.1-noble, reproduced
   * on this Mac in that image) moves the page 0px for `Input.synthesizeScrollGesture` with a
   * touch source, with and without `hasTouch`; macOS Chromium scrolls it. A 0px gesture is
   * the setup not landing, so the case skips WITH that number rather than asserting on a
   * page that never moved (the rule .github/CLAUDE.md records for CI's WebKit). On macOS it
   * is a real check: `syncTouch: true` planted in SmoothScroll.tsx turned it red.
   */
  test.use({ hasTouch: true })

  test('a finger scroll never runs a smooth glide; a wheel does (the control)', async ({
    page,
    browserName,
    context,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP synthesizes the touch gesture')
    await openAsHuman(page, '/products')
    const watchGlide = () =>
      page.evaluate(() => {
        const w = window as unknown as { __glided: boolean }
        w.__glided = false
        const t0 = performance.now()
        const tick = () => {
          if (document.documentElement.classList.contains('lenis-smooth')) w.__glided = true
          if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
    const glided = () => page.evaluate(() => (window as unknown as { __glided: boolean }).__glided)

    const cdp = await context.newCDPSession(page)
    await watchGlide()
    await cdp.send('Input.synthesizeScrollGesture', {
      x: 640,
      y: 500,
      yDistance: -400,
      gestureSourceType: 'touch',
    })
    await page.waitForTimeout(1600)
    const moved = await scrollY(page)
    test.skip(moved === 0, 'this browser moved 0px for a synthesized touch; nothing to judge')
    expect(moved, 'the touch gesture barely scrolled').toBeGreaterThan(100)
    expect(await glided(), 'a finger scroll was taken over by the smooth layer').toBe(false)

    await waitForStill(page)
    await watchGlide()
    await page.mouse.move(640, 30)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(1600)
    expect(await glided(), 'the control: a wheel should glide, or this case sees nothing').toBe(
      true,
    )
  })
})
