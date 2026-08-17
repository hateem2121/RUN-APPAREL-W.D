import { expect, test } from '@playwright/test'

test.describe('RUN APPAREL 3D viewer', () => {
  test('direct QR URL loads product with pre-selected colourway', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
    await expect(page.getByText('[ COLOURWAY 01 / WINE ]')).toBeVisible()
    // NOT "poster-first" any more — changed deliberately on 2026-08-13.
    //
    // The poster used to cover the stage for the whole download. It could never
    // fit: every poster is an opaque WebP with its background baked in at
    // #f0efeb, which on the dark `--bg` (#1c1f18) is a near-white slab. During
    // loading the stage now shows its own blueprint ground plus a readout of real
    // bytes, which is drawn from tokens and therefore correct in both themes.
    //
    // The PROMISE underneath the old assertion is unchanged, and is what this
    // checks: the stage is never blank while the visitor waits. Which of the three
    // is showing depends on the browser — headless Firefox has no WebGL, so it
    // takes the poster fallback, while Chromium loads the model — and asserting
    // any single one of them makes this a test of the runner's GPU. That mistake
    // is already documented below.
    //
    // It also removes a real flake: the old locator raced the model load, and was
    // measured failing on pristine `main` roughly one run in two.
    await expect(
      page.locator('.stage__loading, .stage__poster-fallback img, model-viewer').first(),
    ).toBeVisible()

    // The camera buttons are asserted in webgl.spec.ts, NOT here.
    //
    // They only exist when <model-viewer> is mounted, which Stage.tsx gates on
    // canRender3D(). Adding Firefox to the matrix on 2026-08-03 failed this test
    // immediately: headless Firefox has no WebGL context, so the viewer correctly
    // falls back to the poster and there are no camera controls to find.
    //
    // That is the fallback working, not a bug — and this spec runs across four
    // browsers precisely to check what every visitor sees regardless of 3D
    // support. Asserting 3D-only chrome here made it a test of the runner's GPU.
    // Chromium hid that for months by shipping SwiftShader in headless mode.
  })

  test('colourway switch updates URL without a reload', async ({ page }) => {
    await page.goto('/n001/wine')
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: boolean }).__noReload = true
    })
    /**
     * ⚠️ THE ACCESSIBLE NAME IS NOW JUST THE COLOUR — changed 2026-08-14.
     *
     * This used to match `/04\s*Black/i`, because the tab's ordinal was part of
     * its name. It is `aria-hidden` now: the ordinal is POSITIONAL information a
     * screen reader already supplies far better, announcing "tab, 4 of 5", so
     * including it made every tab read "04 Black, tab, 4 of 5". The selected
     * tab was worse — the state dot was `::after { content: "●" }`, and
     * generated content IS included in the accessible name, so it announced as
     * "04 Black ●" on top of `aria-selected`.
     *
     * The number is still VISIBLE, and it is still positional rather than the
     * `sequence` field: Black carries sequence 5 in this fixture (production's
     * numbering, with Lime at 4 deliberately absent so `/n001/lime` reaches the
     * retired-colourway notice) but is the 4th array entry, so it displays 04.
     * The UI never shows a gap — worth knowing before "fixing" either number to
     * match the other. The visible label below still asserts it.
     */
    await page.getByRole('tab', { name: /^black$/i }).click()
    await expect(page).toHaveURL(/\/n001\/black$/)
    await expect(page.getByText('[ COLOURWAY 04 / BLACK ]')).toBeVisible()
    const preserved = await page.evaluate(
      () => (window as unknown as { __noReload?: boolean }).__noReload,
    )
    expect(preserved).toBe(true) // a full reload would have wiped this flag
    // back button returns to wine client-side
    await page.goBack()
    await expect(page).toHaveURL(/\/n001\/wine$/)
    await expect(page.getByText('[ COLOURWAY 01 / WINE ]')).toBeVisible()
  })

  test('retired colourway falls back to default with notice and silent URL fix', async ({
    page,
  }) => {
    await page.goto('/n001/lime')
    await expect(page.getByText(/no longer active/i)).toBeVisible()
    await expect(page).toHaveURL(/\/n001\/wine$/)
    await expect(page.getByText('[ COLOURWAY 01 / WINE ]')).toBeVisible()
  })

  // A tag printed with only the product code, or a buyer trimming the URL back
  // to the product, used to land on "reference unavailable" for a product that
  // was published and working.
  test('product-only URL resolves to the default colourway, with no retired notice', async ({
    page,
  }) => {
    await page.goto('/n001')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
    await expect(page.getByText('[ COLOURWAY 01 / WINE ]')).toBeVisible()
    // The URL is normalised so the page can be shared and bookmarked.
    await expect(page).toHaveURL(/\/n001\/wine$/)
    // Nothing was retired — claiming otherwise tells the buyer a colour has been
    // discontinued when none has.
    await expect(page.getByText(/no longer active/i)).toHaveCount(0)
  })

  // The wordmark pointed at "/", which parses to no route at all and rendered the
  // unavailable page — so the most natural click on the page broke it.
  test('header wordmark does not lead to the unavailable state', async ({ page }) => {
    await page.goto('/n001/wine')
    const wordmark = page.locator('.header__wordmark')
    await expect(wordmark).not.toHaveAttribute('href', '/')
    await wordmark.click()
    await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toHaveCount(0)
  })

  // A published product with no finished 3D file is the worst state the viewer
  // can be in — the page looks fine and the garment simply never spins. It was
  // also the ONLY failure that reported nothing, because Stage.tsx guarded its
  // diagnostic with `if (glbUrl)`. The fixture product n002 exists purely so this
  // test can fail: without a GLB-less product it could never exercise the path.
  test('a product with no 3D file falls back to the poster AND reports it', async ({ page }) => {
    const diagnostics: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('[viewer:')) diagnostics.push(msg.text())
    })

    await page.goto('/n002/wine')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Sample Without Model/i)
    // Poster-first still works, and the page is otherwise whole.
    await expect(page.locator('.stage img').first()).toBeVisible()
    // Scoped to the in-page section. Since 2026-08-14 the mobile action bar also
    // says "Email Us" — it had dropped the verb only on the device the product is
    // actually opened with, which was the wrong surface to abbreviate — so an
    // unscoped role query matches two links on a phone viewport.
    await expect(page.locator('.contact').getByRole('link', { name: /email us/i })).toBeVisible()
    // No 3D element at all, and the calm notice instead.
    //
    // The expected copy changed 2026-08-14. "The interactive 3D view could not
    // load here" was false in the commonest case that reaches this string — a
    // lost WebGL context, where the model DID load and was then taken away — and
    // it named "the static reference", which is not a thing the visitor can see.
    // The replacement names what IS on screen and what can still be trusted.
    await expect(page.locator('model-viewer')).toHaveCount(0)
    await expect(page.getByText(/showing a photograph of the garment/i)).toBeVisible()

    expect(diagnostics.join('\n')).toContain('[viewer:model-missing]')
  })

  test('unknown product shows branded unavailable state', async ({ page }) => {
    await page.goto('/zzz9/none')
    await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible()
    await expect(page.getByRole('link', { name: /back to catalogue/i })).toBeVisible()
    // Unscoped is correct HERE: the unavailable state renders no action bar, so
    // there is only ever one "Email Us" on this page.
    await expect(page.getByRole('link', { name: /email us/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /whatsapp us/i })).toBeVisible()
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveAttribute('content', /noindex/)
  })

  test('email and WhatsApp links carry the locked enquiry template', async ({ page }) => {
    await page.goto('/n001/wine')
    const email = page.locator('.contact a', { hasText: 'Email Us' })
    const mailto = await email.getAttribute('href')
    expect(mailto).toContain('mailto:partner@wear-run.com')
    expect(mailto).toContain(
      encodeURIComponent('Product Enquiry — Velocity Performance Tee / Wine'),
    )
    expect(mailto).toContain(
      encodeURIComponent('I am interested in Velocity Performance Tee (N001) in Wine.'),
    )

    const whatsapp = page.locator('.contact a', { hasText: 'WhatsApp Us' })
    const wa = await whatsapp.getAttribute('href')
    expect(wa).toContain('https://wa.me/923361777313?text=')
    expect(wa).toContain(encodeURIComponent('Hello RUN Team,'))
  })

  test('theme toggle persists an explicit manual choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/n001/wine')
    await page.getByRole('button', { name: /switch to dark mode/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const stored = await page.evaluate(() => localStorage.getItem('run-theme'))
    expect(stored).toBe('dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('customisation section expands the four build steps', async ({ page }) => {
    await page.goto('/n001/wine')
    const toggle = page.getByRole('button', { name: /how we build your product/i })
    await toggle.click()
    await expect(page.getByText('SHARE YOUR STARTING POINT')).toBeVisible()
    await expect(page.getByText('SAMPLE, REFINE AND PRODUCE')).toBeVisible()
  })

  /**
   * The garment's own description, and the fallback for a garment without one.
   *
   * ⚠️ BOTH BRANCHES, because only one of them was reachable until 2026-08-17.
   * `shortDescription` was added to the CMS, the shared type, the projection and
   * <ProductPanel> that day — and NOTHING in this fixture set one, so every e2e
   * run, and every look at the live site (where no product has been given a
   * description yet), rendered the standard development-reference paragraph. The
   * feature could have been completely broken and the whole suite would have
   * stayed green. That is the "fixture cannot exhibit the failure" pattern
   * CLAUDE.md opens with, reached from the other direction: not a missing failure
   * mode, a missing SUCCESS mode.
   *
   * The fallback half is not padding. Every product that existed before the field
   * was added has none, so it is what the live catalogue shows today — deleting
   * it would silently strip the paragraph from every page.
   */
  test('a product with a description shows it, and one without shows the standard wording', async ({
    page,
  }) => {
    await page.goto('/n001/wine')
    const statement = page.locator('.product-info__statement')
    await expect(statement).toHaveText(/race-fit training tee built for long summer mileage/i)
    // The generic paragraph must be GONE, not merely joined — a description that
    // appends rather than replaces reads as two contradictory openings.
    await expect(statement).not.toHaveText(/development reference, not a finished stock product/i)

    await page.goto('/n002/wine')
    await expect(page.locator('.product-info__statement')).toHaveText(
      /development reference, not a finished stock product/i,
    )
  })

  test('page carries no retail/e-commerce language', async ({ page }) => {
    await page.goto('/n001/wine')
    const body = (await page.locator('body').innerText()).toLowerCase()
    for (const banned of ['add to cart', 'buy now', 'checkout', 'price', 'in stock', 'sale']) {
      expect(body).not.toContain(banned)
    }
  })
})
