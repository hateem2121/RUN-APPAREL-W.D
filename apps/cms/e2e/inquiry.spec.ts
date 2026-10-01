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
/**
 * ONE STEP SINCE 2026-10-01 (owner, visual audit VA-02): name, email and message first, then the
 * optional details under "Optional details", every field showing. Job title and Subject left the
 * form that day, so they are absent from both lists on purpose.
 */
const REQUIRED = ['name', 'email', 'message'] as const
const OPTIONAL = ['company', 'country', 'phoneCode', 'phone', 'files'] as const

async function fillRequired(page: Page) {
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

    // Every field shows at once (VA-02), each with a <label> of its own, by wrapping or by `for`.
    const labelOf = (el: Element) =>
      [...((el as HTMLInputElement).labels ?? [])].map((label) => label.textContent ?? '').join(' ')
    for (const name of REQUIRED) {
      const field = form.locator(`[name="${name}"]`)
      await expect(field, `${name} is missing`).toBeVisible()
      expect((await field.evaluate(labelOf)).trim(), `${name} has no label`).not.toBe('')
      expect(await field.evaluate((el) => (el as HTMLInputElement).required)).toBe(true)
    }

    // The optional half: every field optional, every label SAYS so, all under "Optional details".
    await expect(form.locator('fieldset legend')).toHaveText('Optional details')
    for (const name of OPTIONAL) {
      const field = form.locator(`[name="${name}"]`)
      await expect(field, `${name} is missing`).toBeVisible()
      expect(await field.evaluate(labelOf), `${name} does not say it is optional`).toMatch(
        /\(optional\)/i,
      )
      expect(
        await field.evaluate((el) => (el as HTMLInputElement).required),
        `${name} is required`,
      ).toBe(false)
      expect(
        await field.evaluate((el) => Boolean(el.closest('fieldset'))),
        `${name} is outside the optional group`,
      ).toBe(true)
    }
    // Gone with the single step: no second step, no progress bar, no Job title or Subject.
    await expect(form.locator('[name="jobTitle"], [name="subject"]')).toHaveCount(0)
    await expect(form.getByRole('progressbar')).toHaveCount(0)
    await expect(form.locator('button[type="submit"]')).toHaveCount(1)

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
    // Every control shows at once, so one pass measures them all; the honeypot is skipped.
    const controls = await page.locator('.inquiry-form').evaluate((form) =>
      [...form.querySelectorAll('input, textarea, select, button')]
        .filter((el) => !el.closest('[aria-hidden="true"]'))
        .map((el) => ({
          name: (el as HTMLInputElement).name || el.textContent || el.tagName,
          height: el.getBoundingClientRect().height,
        })),
    )
    expect(controls.length, 'no controls were measured').toBeGreaterThanOrEqual(9)
    const small = controls.filter((c) => c.height < 43.95).map((c) => c.name)
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
    await page.fill('.inquiry-form [name="company"]', 'Northfield Athletic')
    await page.getByRole('button', { name: /^send inquiry$/i }).click()

    /*
     * VA-27 (owner, 2026-10-01): after Send the form is gone and only the confirmation shows,
     * focused so a screen reader reads it, and the page drops `?sent=1` so a reload shows a fresh
     * form. (Without scripting the code stays; that case is the last test in this file.)
     */
    const done = page.locator('.inquiry-done')
    await expect(done).toBeVisible()
    await expect(done.getByRole('heading', { name: 'Inquiry received.' })).toBeVisible()
    await expect(done).toContainText('We reply within 24 hours.')
    await expect(done).toContainText('Need us sooner?')
    await expect(page.locator('.inquiry-form')).toBeHidden()
    /*
     * ⚠️ THIS FAILED IN CHROMIUM UNTIL THE ADDRESS WAS TIDIED ONLY AFTER `load` (2026-10-01):
     * rewritten to `#inquiry` while the page was still loading, the anchor named a section that
     * cannot take focus, and Chromium dropped focus to <body>. `InquiryOutcome.tsx` explains;
     * removing the panel's `tabIndex` makes this line fail in both engines (checked both ways).
     */
    await expect(done).toBeFocused()
    await expect(page).toHaveURL(/\/contact#inquiry$/)

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

    // A reload shows the empty form again, not the confirmation.
    await page.reload()
    await expect(page.locator('.inquiry-form')).toBeVisible()
    await expect(page.locator('.inquiry-done')).toHaveCount(0)
    await expect(page.locator('.inquiry-form [name="name"]')).toHaveValue('')
  })

  test('"Send another inquiry" brings back an empty form in place', async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ownAddress(testInfo.project.name) })
    await page.goto('/contact')
    await fillRequired(page)
    await page.getByRole('button', { name: /^send inquiry$/i }).click()
    await expect(page.locator('.inquiry-done')).toBeVisible()

    await page.getByRole('link', { name: 'Send another inquiry' }).click()
    await expect(page.locator('.inquiry-done')).toHaveCount(0)
    await expect(page.locator('.inquiry-form')).toBeVisible()
    await expect(page.locator('.inquiry-form [name="name"]')).toBeFocused()
    await expect(page.locator('.inquiry-form [name="message"]')).toHaveValue('')
  })

  test('Send with mistakes lists them, links each field, and moves focus to the list', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await form.locator('[name="email"]').fill('dana-at-northfield')
    await form.getByRole('button', { name: /^send inquiry$/i }).click()

    // W6 with W2, W4 and W5, in page order; nothing was sent.
    const summary = form.locator('.inquiry-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toBeFocused()
    await expect(summary).toContainText('Check these before sending:')
    await expect(summary.getByRole('link')).toHaveText([
      'Enter your name.',
      'Enter an email address like name@company.com.',
      'Tell us what you are making. One sentence is enough.',
    ])
    await expect(page).toHaveURL(/\/contact$/)

    // Each field carries its own sentence, joined to it for screen readers.
    const email = form.locator('[name="email"]')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAccessibleDescription('Enter an email address like name@company.com.')
    // The sentence is not part of the field's name (it sits outside the label).
    await expect(email).toHaveAccessibleName('Email')

    // A link in the list takes the visitor to its field.
    await summary.getByRole('link', { name: 'Enter your name.' }).click()
    await expect(form.locator('[name="name"]')).toBeFocused()

    // NEGATIVE CONTROL: fixing a field clears its sentence and its line in the list at once.
    await form.locator('[name="name"]').fill('Dana Okafor')
    await expect(form.locator('[name="name"]')).not.toHaveAttribute('aria-invalid', 'true')
    await expect(form.locator('#inquiry-name-error')).toBeHidden()
    await expect(summary.getByRole('link')).toHaveCount(2)
  })

  test('a field left wrongly filled says why, and only once the visitor leaves it', async ({
    page,
  }) => {
    await page.goto('/contact')
    const email = page.locator('.inquiry-form [name="email"]')
    const note = page.locator('#inquiry-email-error')

    await email.fill('dana@')
    // Still typing: nothing yet (NN/g: errors after the field is left, not during typing).
    await expect(note).toBeHidden()
    await email.blur()
    await expect(note).toHaveText('Enter an email address like name@company.com.')

    // Corrected: the sentence goes as soon as the value is right.
    await email.fill('dana@northfield.example')
    await expect(note).toBeHidden()

    // NEGATIVE CONTROL: passing through an empty field without typing raises nothing.
    await page.locator('.inquiry-form [name="name"]').focus()
    await page.locator('.inquiry-form [name="message"]').focus()
    await expect(page.locator('#inquiry-name-error')).toBeHidden()
  })

  test('while sending the button says so and a second press sends nothing', async ({ page }) => {
    await page.goto('/contact')
    await fillRequired(page)
    /*
     * ⚠️ THE NAVIGATION IS STOPPED IN THE PAGE, NOT HELD AT THE NETWORK. With the POST held by
     * `page.route`, Playwright could not read the page at all while the browser was leaving it
     * (measured 2026-10-01: an empty label, then a 30s timeout). A listener on `window` runs after
     * the form's own, so it counts only the sends the form let through, then cancels each one.
     */
    await page.evaluate(() => {
      const w = window as unknown as { sends: number }
      w.sends = 0
      window.addEventListener('submit', (event) => {
        if (!event.defaultPrevented) w.sends += 1
        event.preventDefault()
      })
    })
    const send = page.locator('.inquiry-form button[type="submit"]')
    await send.click()
    await expect(send).toHaveText('Sending…')
    await expect(send).toHaveAttribute('aria-disabled', 'true')
    // `force`: Playwright will not press an `aria-disabled` control, but a person still can.
    await send.click({ force: true })
    expect(
      await page.evaluate(() => (window as unknown as { sends: number }).sends),
      'a second press sent the inquiry again',
    ).toBe(1)
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

  test('the country fills the code, and a code the buyer typed survives a change', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
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
    // The form's validity is what is asserted, so the required half is filled first.
    await fillRequired(page)
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

  // Final review, 2026-09-29: the server's refusal of a mislabelled file came after the upload and
  // cost the buyer their typed message. The page now reads the bytes first.
  test('a program renamed .pdf is stopped in the page, and the typed message stays', async ({
    page,
  }) => {
    await page.goto('/contact')
    const form = page.locator('.inquiry-form')
    await form.locator('[name="name"]').fill('Dana Okafor')
    await form.locator('[name="email"]').fill('dana@northfield.example')
    await form.locator('[name="message"]').fill('400 training tops.')
    const input = form.locator('[name="files"]')

    await input.setInputFiles({
      name: 'pack.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    })
    await expect(form.getByText(/“pack\.pdf” is not a kind we accept/)).toBeVisible()
    expect(
      await form.evaluate((f) => (f as HTMLFormElement).checkValidity()),
      'the form would still send a renamed program',
    ).toBe(false)
    await expect(form.locator('[name="message"]')).toHaveValue('400 training tops.')

    // NEGATIVE CONTROL: replacing it with a real PDF clears the block.
    await input.setInputFiles({
      name: 'pack.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nxref\n%%EOF\n'),
    })
    await expect(form.getByText(/is not a kind we accept/)).toHaveCount(0)
    await expect.poll(() => form.evaluate((f) => (f as HTMLFormElement).checkValidity())).toBe(true)
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
      // Exactly the same single-step form without scripting, and ONE way to send.
      for (const name of [...REQUIRED, ...OPTIONAL]) {
        await expect(page.locator(`.inquiry-form [name="${name}"]`), name).toBeVisible()
      }
      await expect(page.locator('.inquiry-form button[type="submit"]')).toHaveCount(1)
      await expect(page.locator('.inquiry-form [role="progressbar"]')).toHaveCount(0)

      await page.fill('.inquiry-form [name="name"]', 'No Script')
      await page.fill('.inquiry-form [name="email"]', 'noscript@example.com')
      await page.fill('.inquiry-form [name="message"]', 'Sent with JavaScript disabled.')
      await page.fill('.inquiry-form [name="company"]', 'Northfield Athletic')
      await page.selectOption('.inquiry-form [name="country"]', 'Canada')
      await page.fill('.inquiry-form [name="phoneCode"]', '+1')
      await page.fill('.inquiry-form [name="phone"]', '555 0100')

      // Storage is unreadable here by design (see the top of this file), so what is proved is
      // that the browser sent every field, in one multipart POST, and the server accepted it.
      const posted = page.waitForRequest((r) => r.url().endsWith('/contact/submit'))
      await page.locator('.inquiry-form button[type="submit"]').click()
      const body = (await posted).postData() ?? ''
      for (const value of ['Northfield Athletic', 'Canada', '555 0100', 'name="files"']) {
        expect(body, `the POST did not carry ${value}`).toContain(value)
      }
      // The confirmation replaces the form here too; only the address keeps its code.
      await expect(page).toHaveURL(/\/contact\?sent=1#inquiry-done$/)
      await expect(page.locator('.inquiry-done')).toBeVisible()
      await expect(page.locator('.inquiry-form')).toBeHidden()
    })
  })
})
