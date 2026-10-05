import { expect, test } from './offlineMedia'

/**
 * Polish D7: the contact form in the owner's own layout (2026-10-03, answers Q15-Q17), with F10
 * (one height for every box and button), X6 (no plain grey browser control) and MO5 (the form
 * feels alive). Kept apart from `inquiry.spec.ts` so it runs in WebKit too, the engine of the
 * owner's iPhone check: nothing here sends an inquiry, so it cannot meet the per-address rate
 * limit that keeps the sending tests to one band per engine.
 *
 * What would have to break for these to fail: the pairs stacking on a tablet or side by side on a
 * phone, boxes and buttons of different heights again, the browser's grey file button or country
 * list showing once the script runs, "Something else…" opening nothing, a drop that lists nothing
 * or a × that removes nothing from what will be sent, and a form that no longer glows, ticks or
 * shakes.
 */

test.describe("the contact form in the owner's layout (D7)", () => {
  /*
   * D7 + Q16: the pairs sit side by side on a tablet and a computer, and stack on a phone, in
   * reading order: Name before Job title, Company before Country, Email before Phone.
   */
  for (const [width, height, beside] of [
    [390, 844, false],
    [768, 1024, true],
    [1000, 800, true],
    [1440, 900, true],
  ] as const) {
    test(`at ${width}px the pairs ${beside ? 'sit side by side' : 'stack'} (D7, Q16)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/contact')
      const rows = await page.locator('.inquiry-form').evaluate((form) => {
        const box = (name: string) => {
          const field = form.querySelector(`[name="${name}"]`) as HTMLElement
          const { left, top, right } = (
            field.closest('.inquiry-form__field') ?? field
          ).getBoundingClientRect()
          return { left, top, right }
        }
        return [
          ['name', 'jobTitle'],
          ['company', 'country'],
          ['email', 'phone'],
        ].map(([a, b]) => ({ pair: `${a}+${b}`, a: box(a ?? ''), b: box(b ?? '') }))
      })
      for (const { pair, a, b } of rows) {
        if (beside) {
          expect(Math.abs(a.top - b.top), `${pair} is not one row`).toBeLessThanOrEqual(1)
          expect(a.right, `${pair} overlap`).toBeLessThanOrEqual(b.left)
        } else {
          expect(b.top, `${pair} did not stack`).toBeGreaterThan(a.top + 20)
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        'the page scrolls sideways',
      ).toBeLessThanOrEqual(0)
    })
  }

  // F10 (second check): boxes measured 45, 47 and 51px and the buttons 49px. Side by side in
  // pairs (D7) the difference would show, so every box and button is one height.
  for (const width of [390, 1440]) {
    test(`at ${width}px every box and button is one height (F10)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/contact')
      const heights = await page.locator('.inquiry-form').evaluate((form) => {
        const parts = [
          ...['name', 'jobTitle', 'company', 'country', 'email'].map(
            (name) => form.querySelector(`[name="${name}"]`) as Element,
          ),
          form.querySelector('.inquiry-form__phone') as Element,
          ...form.querySelectorAll('.inquiry-form__answer'),
          ...form.querySelectorAll('.site-actions .btn'),
        ]
        return parts.map((part) => [
          part.getAttribute('name') ?? part.className.split(' ')[0] ?? part.tagName,
          Math.round(part.getBoundingClientRect().height * 10) / 10,
        ])
      })
      expect(heights.length).toBeGreaterThanOrEqual(14)
      const sizes = new Set(heights.map(([, size]) => size))
      expect(sizes.size, `heights ${JSON.stringify(heights)}`).toBe(1)
    })
  }

  /*
   * X6: the browser's own grey controls were the only plain grey parts of the site ("Choose
   * Files / No file chosen" and the country list). The file input stays in the page, focusable and
   * labelled, but out of sight once the page's script runs; the drop area is what shows.
   */
  test('no plain grey browser control shows (X6)', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await expect(form).toHaveAttribute('data-enhanced', '')
    await expect(form.locator('select')).toHaveCount(0)
    const file = form.locator('input[type="file"]')
    const box = await file.boundingBox()
    expect(box?.width ?? 99, 'the grey file button shows').toBeLessThanOrEqual(2)
    const drop = form.locator('label.inquiry-form__drop')
    await expect(drop).toBeVisible()
    await expect(drop).toContainText('Drop sketches, tech packs or photos here')
    expect(await file.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.className)).toContain(
      'inquiry-form__drop',
    )
  })

  test('"Something else…" opens a box for the buyer’s own subject, and only that answer does', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    const own = form.locator('[name="subjectOther"]')
    await expect(own).toBeHidden()
    await form.locator('.inquiry-form__subject label', { hasText: 'Samples' }).click()
    await expect(own).toBeHidden()
    await form.locator('.inquiry-form__subject label', { hasText: 'Something else…' }).click()
    await expect(own).toBeVisible()
    await own.fill('Football socks for a club')
    expect(
      (await own.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent)) ?? '',
    ).not.toBe('')
    // Changing one's mind closes it again.
    await form.locator('.inquiry-form__subject label', { hasText: 'Request a quote' }).click()
    await expect(own).toBeHidden()
  })

  /*
   * D7: files dropped on the area join the ones already chosen, each listed with its size and a
   * button to take it off again. The drop is built from real File objects in the page, as a
   * browser builds it.
   */
  test('dropped files are listed with their size, and one can be taken off again', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await expect(form).toHaveAttribute('data-enhanced', '')
    await form.locator('label.inquiry-form__drop').evaluate((drop) => {
      const data = new DataTransfer()
      data.items.add(
        new File(['%PDF-1.7\nxref\n%%EOF\n'], 'tech-pack.pdf', { type: 'application/pdf' }),
      )
      data.items.add(
        new File(['%PDF-1.7\nxref\n%%EOF\n'], 'sketch.pdf', { type: 'application/pdf' }),
      )
      for (const type of ['dragenter', 'dragover', 'drop'])
        drop.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }),
        )
    })
    const items = form.locator('.inquiry-files__item')
    await expect(items).toHaveCount(2)
    await expect(items.first()).toContainText('tech-pack.pdf')
    await expect(items.first()).toContainText(/\d+(\.\d+)? (B|KB|MB)/)
    expect(
      await form.locator('[name="files"]').evaluate((el) => (el as HTMLInputElement).files?.length),
    ).toBe(2)
    await items.first().getByRole('button', { name: 'Remove tech-pack.pdf' }).click()
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText('sketch.pdf')
    expect(
      await form.locator('[name="files"]').evaluate((el) => (el as HTMLInputElement).files?.length),
    ).toBe(1)
  })

  /*
   * MO5 (owner, 3 Oct: "the form feels alive"): the box being typed in glows in the accent, a box
   * the buyer filled correctly shows a tick, and Send pressed too early gives the button one
   * small shake. With reduced motion the shake is not played; the glow and tick stay.
   */
  test('the box in use glows, a right one shows a tick, and an early Send shakes once (MO5)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    const name = form.locator('[name="name"]')
    const resting = await name.evaluate((el) => getComputedStyle(el).boxShadow)
    await name.focus()
    await expect.poll(() => name.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(resting)
    const tick = form.locator('[name="name"] ~ .inquiry-form__tick')
    await expect(tick).toBeHidden()
    await name.fill('Dana Okafor')
    await form.locator('[name="jobTitle"]').focus()
    await expect(tick).toBeVisible()
    // Negative control: an email left wrong gets no tick.
    await form.locator('[name="email"]').fill('dana@')
    await form.locator('[name="jobTitle"]').focus()
    await expect(form.locator('[name="email"] ~ .inquiry-form__tick')).toBeHidden()

    const send = form.locator('button[type="submit"]')
    await send.click()
    await expect
      .poll(() =>
        send.evaluate((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName)),
      )
      .toContain('inquiry-shake')
  })
})
