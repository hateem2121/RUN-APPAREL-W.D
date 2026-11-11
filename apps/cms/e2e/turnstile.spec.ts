import { expect, type Page, test } from './offlineMedia'

/**
 * Turnstile on the contact form loads ONLY once a visitor starts filling it in (owner, 2026-11-11;
 * `src/components/site/TurnstileOnInteract.tsx`). The privacy notice promises a plain visit
 * contacts nobody, and `consent.spec.ts` checks every page for that; this pins the other half:
 * that touching the form is what loads it. Cloudflare is stubbed: no test reaches the network.
 */

const TURNSTILE_HOST = 'challenges.cloudflare.com'

const liftAutomationGate = (page: Page) =>
  page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

async function watchTurnstile(page: Page) {
  const asked: string[] = []
  await page.route(
    (url) => url.host === TURNSTILE_HOST,
    (route) => {
      asked.push(new URL(route.request().url()).pathname)
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
    },
  )
  return asked
}

test.describe('Turnstile on the contact form', () => {
  test('a plain visit to /contact asks Cloudflare for nothing', async ({ page }) => {
    await liftAutomationGate(page)
    const asked = await watchTurnstile(page)
    await page.goto('/contact')
    await page.waitForLoadState('networkidle')
    expect(asked).toEqual([])
  })

  test('starting to fill in the form loads Turnstile, once', async ({ page }) => {
    await liftAutomationGate(page)
    const asked = await watchTurnstile(page)
    await page.goto('/contact')
    await page.waitForLoadState('networkidle')
    await page.locator('#inquiry-form input[name="name"]').focus()
    await expect.poll(() => asked).toEqual(['/turnstile/v0/api.js'])
    await page.locator('#inquiry-form input[name="email"]').focus()
    await page.waitForTimeout(300)
    expect(asked).toEqual(['/turnstile/v0/api.js'])
  })

  test('under automation it stays out of the way (as the site’s other scripted pieces do)', async ({
    page,
  }) => {
    const asked = await watchTurnstile(page)
    await page.goto('/contact')
    await page.locator('#inquiry-form input[name="name"]').focus()
    await page.waitForTimeout(500)
    expect(asked).toEqual([])
  })
})
