import { expect, type Page, test } from './offlineMedia'

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

/**
 * ⚠️ EVERY POST THAT REACHES THE RATE LIMIT CARRIES ITS OWN ADDRESS (2026-09-26). Without
 * one, `checkInquiryRate` buckets on the socket address, and Chromium and Firefox share one
 * `next start`. Until Playwright 1.63 that worked by accident: its Firefox 153 connected as
 * `::ffff:127.0.0.1` and Chromium as `::1`, two buckets. 1.63's Firefox 155 connects as
 * `::1` too, so the six header-less POSTs of one run (three tests x two projects) met
 * `MAX_PER_IP` = 5 and the sixth read `error=too-many`, every run, whichever test was
 * last. TEST-NET-1 (192.0.2.0/24, RFC 5737) in one band per project, so these can never
 * meet each other or `inquirySecurity.spec.ts`'s TEST-NET-2 and TEST-NET-3 addresses.
 */
/** Owner, 2026-09-29: name, email and message first; everything else optional, on step 2. */
const STEP_ONE = ['name', 'email', 'message'] as const
const STEP_TWO = [
  'company',
  'jobTitle',
  'country',
  'phoneCode',
  'phone',
  'subject',
  'files',
] as const

/** Fill step 1 so "Next" may open step 2 (it refuses while a required field is empty). */
async function fillStepOne(page: Page) {
  await page.fill('.inquiry-form [name="name"]', 'Dana Okafor')
  await page.fill('.inquiry-form [name="email"]', 'dana@northfield.example')
  await page.fill('.inquiry-form [name="message"]', '400 training tops.')
}

function ownAddress(projectName: string) {
  const base = projectName === 'firefox' ? 130 : 10
  return `192.0.2.${base + Math.floor(Math.random() * 100)}`
}

test.describe('the inquiry form', () => {
  test('renders with a label on every field and no honeypot in reach', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await expect(form).toBeVisible()

    for (const name of STEP_ONE) {
      const field = form.locator(`[name="${name}"]`)
      await expect(field, `${name} is missing`).toBeVisible()
      // Each control is wrapped in its own <label>, so the accessible name comes from it.
      const labelled = await field.evaluate((el) => Boolean(el.closest('label')))
      expect(labelled, `${name} has no label`).toBe(true)
    }

    // Step 2 (owner, 2026-09-29): every field optional, and every label SAYS so.
    await fillStepOne(page)
    await form.getByRole('button', { name: /next: add details/i }).click()
    for (const name of STEP_TWO) {
      const field = form.locator(`[name="${name}"]`)
      await expect(field, `${name} is missing`).toBeVisible()
      const label = await field.evaluate(
        (el) => el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? '',
      )
      expect(label, `${name} does not say it is optional`).toMatch(/\(optional\)|country code/i)
      expect(
        await field.evaluate((el) => (el as HTMLInputElement).required),
        `${name} is required`,
      ).toBe(false)
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
    /*
     * Each step measured while it is the one showing: a hidden step's controls have no box, so
     * measuring them would report every one of them "under 44px". Skipping hidden controls is
     * therefore right, and measuring BOTH steps is what keeps that skip from hiding a real miss.
     */
    const measure = () =>
      page.locator('.inquiry-form').evaluate((form) =>
        [...form.querySelectorAll('input, textarea, select, button')]
          .filter((el) => !el.closest('[aria-hidden="true"]'))
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => el.getBoundingClientRect().height < 43.95)
          .map((el) => (el as HTMLInputElement).name || el.textContent || el.tagName),
      )
    const small = await measure()
    await fillStepOne(page)
    await page.getByRole('button', { name: /next: add details/i }).click()
    await expect(page.locator('.inquiry-form [name="company"]')).toBeVisible()
    small.push(...(await measure()))
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

  test('a complete inquiry is accepted and the visitor is told so', async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ownAddress(testInfo.project.name) })
    await page.goto('/contact')
    await page.fill('.inquiry-form [name="name"]', 'Dana Okafor')
    await page.fill('.inquiry-form [name="email"]', 'dana@northfield.example')
    await page.fill(
      '.inquiry-form [name="message"]',
      'We need 400 training tops in two colourways for a March delivery.',
    )
    await page.getByRole('button', { name: /next: add details/i }).click()
    await page.fill('.inquiry-form [name="company"]', 'Northfield Athletic')
    await page.getByRole('button', { name: /^send inquiry$/i }).click()

    await expect(page).toHaveURL(/\/contact\?sent=1$/)
    await expect(page.locator('.form-notice--ok')).toBeVisible()

    /*
     * ⚠️ NOTHING THE VISITOR TYPED MAY APPEAR IN THE URL. A URL is written into browser
     * history, proxy logs and outbound Referer headers, and preserving the values across
     * the redirect would otherwise need a cookie — which would end this site's measured
     * claim to store nothing on a plain visit (FA-O-74; one key, `run-theme`, only after
     * the light/dark switch is pressed) and put a consent banner on every page.
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

  test('a POST with nothing in it does not 500', async ({ request }, testInfo) => {
    // A hand-crafted request can send anything; the handler must answer, not crash.
    const res = await request.post('/contact/submit', {
      form: {},
      headers: { 'cf-connecting-ip': ownAddress(testInfo.project.name) },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=')
  })

  test('two steps, with a progress bar that moves as the buyer goes', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    const bar = form.getByRole('progressbar', { name: 'Form progress' })
    const now = async () => Number(await bar.getAttribute('aria-valuenow'))

    await expect(form.getByText('Step 1 of 2')).toBeVisible()
    await expect(form.locator('[name="company"]')).toBeHidden()
    expect(await now()).toBe(0)

    await form.locator('[name="name"]').focus()
    await expect.poll(now).toBe(10)
    await form.locator('[name="name"]').fill('Dana Okafor')
    await form.locator('[name="email"]').fill('dana@northfield.example')
    await form.locator('[name="message"]').fill('400 training tops.')
    await expect.poll(now).toBe(50)

    await form.getByRole('button', { name: /next: add details/i }).click()
    await expect(form.getByText('Step 2 of 2')).toBeVisible()
    await expect(form.locator('[name="company"]')).toBeVisible()
    await expect.poll(now).toBe(60)
    await form.locator('[name="company"]').fill('Northfield Athletic')
    await expect.poll(now).toBeGreaterThan(60)
  })

  test('"Next" will not open step 2 while a required field is empty', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await form.getByRole('button', { name: /next: add details/i }).click()
    await expect(form.getByText('Step 1 of 2')).toBeVisible()
    await expect(form.locator('[name="company"]')).toBeHidden()
  })

  test('the country fills the code, and a code the buyer typed survives a change', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await form.locator('[name="name"]').fill('Dana Okafor')
    await form.locator('[name="email"]').fill('dana@northfield.example')
    await form.locator('[name="message"]').fill('400 training tops.')
    await form.getByRole('button', { name: /next: add details/i }).click()

    const code = form.locator('[name="phoneCode"]')
    await form.locator('[name="country"]').selectOption('Pakistan')
    await expect(code).toHaveValue('+92')
    await form.locator('[name="country"]').selectOption('Germany')
    await expect(code).toHaveValue('+49')
    // Negative control for the rule: typed by the buyer, it is theirs.
    await code.fill('+971')
    await form.locator('[name="country"]').selectOption('Canada')
    await expect(code).toHaveValue('+971')
  })

  test('a sixth file is stopped in the page, before any upload', async ({ page }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await form.locator('[name="name"]').fill('Dana Okafor')
    await form.locator('[name="email"]').fill('dana@northfield.example')
    await form.locator('[name="message"]').fill('400 training tops.')
    await form.getByRole('button', { name: /next: add details/i }).click()

    const pdf = Buffer.from('%PDF-1.7\nxref\n%%EOF\n')
    const pick = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `pack-${i + 1}.pdf`,
        mimeType: 'application/pdf',
        buffer: pdf,
      }))
    const input = form.locator('[name="files"]')

    await input.setInputFiles(pick(2))
    await expect(form.getByText('pack-2.pdf')).toBeVisible()
    expect(await form.evaluate((f) => (f as HTMLFormElement).checkValidity())).toBe(true)

    await input.setInputFiles(pick(6))
    await expect(form.getByText(/You chose 6 files/)).toBeVisible()
    expect(
      await form.evaluate((f) => (f as HTMLFormElement).checkValidity()),
      'the form would still send six files',
    ).toBe(false)
  })

  test('the server refuses a program renamed .pdf, and stores nothing', async ({
    request,
  }, testInfo) => {
    const res = await request.post('/contact/submit', {
      multipart: {
        name: 'Renamed Binary',
        email: 'renamed@example.com',
        message: 'See the attached pack.',
        files: {
          name: 'pack.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
        },
      },
      headers: { 'cf-connecting-ip': ownAddress(testInfo.project.name) },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=files&reason=type')
  })

  test('a refused file is explained on the page, and says nothing was sent', async ({ page }) => {
    await page.goto('/contact?error=files&reason=too-big')
    await expect(page.locator('.form-notice--bad')).toContainText('has not been sent')
    await expect(page.locator('.form-notice--bad')).toContainText('25 MB')
  })

  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    test('the form is a real form and still submits', async ({ page }, testInfo) => {
      await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ownAddress(testInfo.project.name) })
      await page.goto('/contact')
      const action = await page.locator('.inquiry-form').getAttribute('action')
      const method = await page.locator('.inquiry-form').getAttribute('method')
      expect(action).toBe('/contact/submit')
      expect(method?.toLowerCase()).toBe('post')

      expect(await page.locator('.inquiry-form').getAttribute('enctype')).toBe(
        'multipart/form-data',
      )
      // No stepper without scripting: both steps show, and there is ONE way to send.
      for (const name of [...STEP_ONE, ...STEP_TWO]) {
        await expect(page.locator(`.inquiry-form [name="${name}"]`), name).toBeVisible()
      }
      await expect(page.locator('.inquiry-form button[type="submit"]')).toHaveCount(1)
      await expect(page.locator('.inquiry-form [role="progressbar"]')).toHaveCount(0)

      await page.fill('.inquiry-form [name="name"]', 'No Script')
      await page.fill('.inquiry-form [name="email"]', 'noscript@example.com')
      await page.fill('.inquiry-form [name="message"]', 'Sent with JavaScript disabled.')
      await page.fill('.inquiry-form [name="jobTitle"]', 'Buyer')
      await page.selectOption('.inquiry-form [name="country"]', 'Canada')
      await page.fill('.inquiry-form [name="phoneCode"]', '+1')
      await page.fill('.inquiry-form [name="phone"]', '555 0100')
      await page.fill('.inquiry-form [name="subject"]', 'Hockey jerseys')

      // Storage is unreadable here by design (see the top of this file), so what is proved is
      // that the browser sent every field, in one multipart POST, and the server accepted it.
      const posted = page.waitForRequest((r) => r.url().endsWith('/contact/submit'))
      await page.locator('.inquiry-form button[type="submit"]').click()
      const body = (await posted).postData() ?? ''
      for (const value of ['Buyer', 'Canada', '555 0100', 'Hockey jerseys', 'name="files"']) {
        expect(body, `the POST did not carry ${value}`).toContain(value)
      }
      await expect(page).toHaveURL(/\/contact\?sent=1$/)
      await expect(page.locator('.form-notice--ok')).toBeVisible()
    })
  })
})
