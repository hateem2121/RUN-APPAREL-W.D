import { expect, test } from '@playwright/test'

/**
 * The contact form.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06). The page carried "NO FORM, ON PURPOSE" for
 * good reason — a form that silently drops a buyer's message is worse than a mailto link
 * that works — so that reasoning became the design: the inquiry is stored BEFORE any mail
 * is attempted, and the outcome of the send is recorded on the row.
 *
 * ⚠️ WHAT THIS FILE CANNOT PROVE, said plainly. It cannot read the `inquiries` collection
 * back — `Inquiries.read` is authenticated, deliberately, because those rows hold a named
 * person, their employer and their commercial intentions. So these tests prove the
 * request path and the visitor's experience; the storage itself is covered by the unit
 * tests around `validateInquiry` and by the route handler's own ordering, which puts the
 * `payload.create` before the `fetch` to Resend.
 */
test.describe('the inquiry form', () => {
  test('renders with a label on every field and no honeypot in reach', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await expect(form).toBeVisible()

    for (const name of ['name', 'company', 'email', 'message']) {
      const field = form.locator(`[name="${name}"]`)
      await expect(field, `${name} is missing`).toBeVisible()
      // Each control is wrapped in its own <label>, so the accessible name comes from it.
      const labelled = await field.evaluate((el) => Boolean(el.closest('label')))
      expect(labelled, `${name} has no label`).toBe(true)
    }

    /*
     * ⚠️ THE HONEYPOT MUST BE UNREACHABLE, NOT MERELY UNSEEN. A hidden field that a
     * screen-reader user is offered, or that Tab lands on, turns an anti-spam trick into
     * a trap for the people least able to work around it — which is how honeypots earned
     * their reputation.
     */
    const trap = page.locator('[name="website"]')
    /*
     * ⚠️ NOT `toBeHidden()`, AND THE DIFFERENCE IS THE POINT OF THE TECHNIQUE. Playwright
     * calls a 1px clipped element visible, because it is genuinely rendered — and it has
     * to be. `display: none` is exactly what a bot that parses CSS skips, so hiding it
     * that way would disable the trap while making this assertion pass. What matters is
     * that it is imperceptible, unreachable by keyboard, and absent from the
     * accessibility tree, and those are asserted directly below.
     */
    /*
     * ⚠️ MEASURE THE WRAPPER, NOT THE INPUT. The input keeps its own 153px layout box —
     * measured — and is invisible only because the wrapper around it is 1px with
     * `overflow: hidden` and a `clip-path`. Asserting on the input's box therefore says
     * nothing about what anyone can see, which is the mistake the first version of this
     * test made. What bounds the visible area is the wrapper.
     */
    const wrapper = page.locator('.inquiry-form__trap')
    const box = await wrapper.boundingBox()
    expect(
      box,
      'the honeypot has no box at all — it is display:none and therefore inert against ' +
        'exactly the bots it is meant to catch',
    ).not.toBeNull()
    expect(box?.width ?? 99, 'the honeypot wrapper is perceivable').toBeLessThanOrEqual(2)
    expect(box?.height ?? 99, 'the honeypot wrapper is perceivable').toBeLessThanOrEqual(2)
    expect(await wrapper.evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden')
    expect(await trap.evaluate((el) => (el as HTMLInputElement).tabIndex)).toBe(-1)
    expect(
      await trap.evaluate((el) => Boolean(el.closest('[aria-hidden="true"]'))),
      'the honeypot is not hidden from assistive technology',
    ).toBe(true)
  })

  test('every control clears the 44px touch floor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/contact')
    const small = await page.locator('.inquiry-form').evaluate((form) =>
      [...form.querySelectorAll('input, textarea, button')]
        .filter((el) => !el.closest('[aria-hidden="true"]'))
        .filter((el) => el.getBoundingClientRect().height < 43.95)
        .map((el) => (el as HTMLInputElement).name || el.tagName),
    )
    expect(small, 'a form control is under the 44px floor').toEqual([])
  })

  /**
   * ⚠️ THE BROWSER ENFORCES THIS WITHOUT JAVASCRIPT, WHICH IS WHY THE FIELDS CARRY
   * `required` AND `type="email"` RATHER THAN A CLIENT-SIDE VALIDATOR. The ordinary
   * mistakes never reach the server, so the visitor never loses what they typed to a
   * redirect that cannot carry it back.
   */
  test('an empty form is refused by the browser, not by the server', async ({ page }) => {
    await page.goto('/contact')

    /*
     * ⚠️ ASSERTED THROUGH THE CONSTRAINT API, NOT BY CLICKING AND WATCHING THE URL. The
     * first version did the latter and was FLAKY on Firefox: `click()` resolves before the
     * engine has finished refusing the submission, so the URL check raced it. `submit`
     * events are the deterministic signal — the browser fires none when validation fails,
     * so counting them proves the refusal without depending on timing.
     */
    const state = await page.locator('.inquiry-form').evaluate((form) => {
      let submitted = 0
      form.addEventListener('submit', (e) => {
        submitted += 1
        e.preventDefault()
      })
      ;(form as HTMLFormElement).requestSubmit()
      return {
        submitted,
        formValid: (form as HTMLFormElement).checkValidity(),
        nameMissing: (form.querySelector('[name="name"]') as HTMLInputElement).validity
          .valueMissing,
        emailMissing: (form.querySelector('[name="email"]') as HTMLInputElement).validity
          .valueMissing,
        companyMissing: (form.querySelector('[name="company"]') as HTMLInputElement).validity
          .valueMissing,
      }
    })

    expect(state.formValid, 'an empty form should not be valid').toBe(false)
    expect(state.submitted, 'the browser let an empty form submit').toBe(0)
    expect(state.nameMissing).toBe(true)
    expect(state.emailMissing).toBe(true)
    // The control: `company` is optional, so it must NOT be reported missing — otherwise
    // this test would pass on a form where every field had been marked required.
    expect(state.companyMissing, 'company is optional and must not be required').toBe(false)
    await expect(page).toHaveURL(/\/contact$/)
  })

  test('a complete inquiry is accepted and the visitor is told so', async ({ page }) => {
    await page.goto('/contact')
    await page.fill('.inquiry-form [name="name"]', 'Dana Okafor')
    await page.fill('.inquiry-form [name="company"]', 'Northfield Athletic')
    await page.fill('.inquiry-form [name="email"]', 'dana@northfield.example')
    await page.fill(
      '.inquiry-form [name="message"]',
      'We need 400 training tops in two colourways for a March delivery.',
    )
    await page.locator('.inquiry-form button[type="submit"]').click()

    await expect(page).toHaveURL(/\/contact\?sent=1$/)
    await expect(page.locator('.form-notice--ok')).toBeVisible()

    /*
     * ⚠️ NOTHING THE VISITOR TYPED MAY APPEAR IN THE URL. A URL is written into browser
     * history, proxy logs and outbound Referer headers, and preserving the values across
     * the redirect would otherwise need a cookie — which would end this site's measured
     * claim to store nothing on the visitor's device (FA-O-74) and put a consent banner
     * on every page.
     */
    const url = page.url()
    for (const secret of ['Dana', 'Northfield', 'dana@northfield', 'training tops']) {
      expect(url, `the URL carries "${secret}"`).not.toContain(secret)
    }
  })

  /**
   * A tripped honeypot is answered with the SAME thank-you a person sees. Telling a bot it
   * was detected is how the next version of it learns to skip the field.
   */
  test('a tripped honeypot is indistinguishable from success', async ({ request }) => {
    const res = await request.post('/contact/submit', {
      form: {
        name: 'Bot',
        company: '',
        email: 'bot@example.com',
        message: 'buy things',
        website: 'https://spam.example',
      },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('sent=1')
  })

  test('a POST with nothing in it does not 500', async ({ request }) => {
    // A hand-crafted request can send anything; the handler must answer, not crash.
    const res = await request.post('/contact/submit', { form: {}, maxRedirects: 0 })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=')
  })

  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    test('the form is a real form and still submits', async ({ page }) => {
      await page.goto('/contact')
      const action = await page.locator('.inquiry-form').getAttribute('action')
      const method = await page.locator('.inquiry-form').getAttribute('method')
      expect(action).toBe('/contact/submit')
      expect(method?.toLowerCase()).toBe('post')

      await page.fill('.inquiry-form [name="name"]', 'No Script')
      await page.fill('.inquiry-form [name="email"]', 'noscript@example.com')
      await page.fill('.inquiry-form [name="message"]', 'Sent with JavaScript disabled.')
      await page.locator('.inquiry-form button[type="submit"]').click()
      await expect(page).toHaveURL(/\/contact\?sent=1$/)
      await expect(page.locator('.form-notice--ok')).toBeVisible()
    })
  })
})
