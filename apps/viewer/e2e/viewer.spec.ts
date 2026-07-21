import { expect, test } from '@playwright/test'

test.describe('RUN APPAREL 3D viewer', () => {
  test('direct QR URL loads product with pre-selected colourway', async ({ page }) => {
    await page.goto('/n001/navy')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
    await expect(page.getByText('[ COLOURWAY 01 / NAVY ]')).toBeVisible()
    // poster-first: an image for the selected colourway is present immediately
    await expect(page.locator('.stage img').first()).toBeVisible()
    // camera controls
    await expect(page.getByRole('button', { name: 'front' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'back' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'side' })).toBeVisible()
  })

  test('colourway switch updates URL without a reload', async ({ page }) => {
    await page.goto('/n001/navy')
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: boolean }).__noReload = true
    })
    await page.getByRole('tab', { name: /02\s*Black/i }).click()
    await expect(page).toHaveURL(/\/n001\/black$/)
    await expect(page.getByText('[ COLOURWAY 02 / BLACK ]')).toBeVisible()
    const preserved = await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload,
    )
    expect(preserved).toBe(true) // a full reload would have wiped this flag
    // back button returns to navy client-side
    await page.goBack()
    await expect(page).toHaveURL(/\/n001\/navy$/)
    await expect(page.getByText('[ COLOURWAY 01 / NAVY ]')).toBeVisible()
  })

  test('retired colourway falls back to default with notice and silent URL fix', async ({ page }) => {
    await page.goto('/n001/lime')
    await expect(page.getByText(/no longer active/i)).toBeVisible()
    await expect(page).toHaveURL(/\/n001\/navy$/)
    await expect(page.getByText('[ COLOURWAY 01 / NAVY ]')).toBeVisible()
  })

  test('unknown product shows branded unavailable state', async ({ page }) => {
    await page.goto('/zzz9/none')
    await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible()
    await expect(page.getByRole('link', { name: /back to catalogue/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /email us/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /whatsapp us/i })).toBeVisible()
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveAttribute('content', /noindex/)
  })

  test('email and WhatsApp links carry the locked enquiry template', async ({ page }) => {
    await page.goto('/n001/navy')
    const email = page.locator('.contact a', { hasText: 'Email Us' })
    const mailto = await email.getAttribute('href')
    expect(mailto).toContain('mailto:partner@wear-run.com')
    expect(mailto).toContain(encodeURIComponent('Product Enquiry — Velocity Performance Tee / Navy'))
    expect(mailto).toContain(encodeURIComponent('I am interested in Velocity Performance Tee (N001) in Navy.'))

    const whatsapp = page.locator('.contact a', { hasText: 'WhatsApp Us' })
    const wa = await whatsapp.getAttribute('href')
    expect(wa).toContain('https://wa.me/923361777313?text=')
    expect(wa).toContain(encodeURIComponent('Hello RUN Team,'))
  })

  test('theme toggle persists an explicit manual choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/n001/navy')
    await page.getByRole('button', { name: /switch to dark mode/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const stored = await page.evaluate(() => localStorage.getItem('run-theme'))
    expect(stored).toBe('dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('customisation section expands the four build steps', async ({ page }) => {
    await page.goto('/n001/navy')
    const toggle = page.getByRole('button', { name: /how we build your product/i })
    await toggle.click()
    await expect(page.getByText('SHARE YOUR STARTING POINT')).toBeVisible()
    await expect(page.getByText('SAMPLE, REFINE AND PRODUCE')).toBeVisible()
  })

  test('page carries no retail/e-commerce language', async ({ page }) => {
    await page.goto('/n001/navy')
    const body = (await page.locator('body').innerText()).toLowerCase()
    for (const banned of ['add to cart', 'buy now', 'checkout', 'price', 'in stock', 'sale']) {
      expect(body).not.toContain(banned)
    }
  })
})
