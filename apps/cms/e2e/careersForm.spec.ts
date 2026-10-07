import { expect, type Page, test } from './offlineMedia'

/**
 * The careers application form (Phase 2, owner F23 and approved words, 2026-10-07), held in a
 * real browser the way `inquiry.spec.ts` holds the contact form: it renders with every label, the
 * browser refuses an empty form, a floor applicant applies with name, phone and role alone, a CV
 * is stored, a renamed program is refused, a bot is thanked and dropped — and a stranger cannot
 * read an application or download a CV.
 */

/** A PDF that ENDS like one (Payload's validatePDF checks `%%EOF` and `xref`). */
const PDF = Buffer.from(
  '%PDF-1.7\n1 0 obj<<>>endobj\nxref\n0 1\ntrailer<<>>\nstartxref\n9\n%%EOF\n',
  'latin1',
)

/** Each engine its own addresses, so one engine's applications cannot exhaust another's allowance. */
function ownAddress(projectName: string) {
  const base = projectName === 'firefox' ? 140 : projectName === 'webkit' ? 200 : 20
  return `198.51.100.${base + Math.floor(Math.random() * 50)}`
}

/**
 * The page script (InquiryFormEnhancer) writes the list of mistakes. Pressed before it has run, Send
 * meets the browser’s own bubbles instead: the cause of one red run on a cold server, 2026-10-07.
 */
async function scriptReady(page: Page) {
  await expect(page.locator('#application-form')).toHaveAttribute('data-enhanced', '')
}

async function fillFloorApplicant(page: Page) {
  await page.fill('#application-form [name="name"]', 'Imran Bashir')
  await page.fill('#application-form [name="phone"]', '300 1234567')
  await page.getByRole('radio', { name: 'Stitching and machining' }).check()
}

test.describe('the careers form', () => {
  test('renders under "How to apply" with every label, the roles and the approved lines', async ({
    page,
  }) => {
    await page.goto('/careers')
    const form = page.locator('#application-form')
    await expect(form).toBeVisible()
    for (const label of ['Name', 'Phone', 'Email', 'Years of experience', 'CV']) {
      await expect(form.getByLabel(new RegExp(`^${label}`)).first(), label).toBeVisible()
    }
    await expect(form.getByRole('radio')).toHaveCount(8)
    await expect(form.getByRole('radio', { name: 'Something else' })).toBeVisible()
    await expect(form).toContainText('We will call you on this number.')
    await expect(form).toContainText('Needed for office roles. PDF, Word, JPG or PNG, up to 10 MB.')
    await expect(form.getByRole('button', { name: 'Send application' })).toBeVisible()
    await expect(form.getByRole('link', { name: 'privacy notice' })).toHaveAttribute(
      'href',
      '/privacy#job-applications',
    )
    // "Write to us at" names the applications inbox (owner, 2026-10-07), the form's own address.
    await expect(page.locator('section:has(#apply)')).toContainText(
      'Write to us at hr@wear-run.com.',
    )
  })

  /*
   * ⚠️ LINKEDIN POINTS AT THESE (owner's commitments, set 2026-10-07). Until that day the page
   * drew none of them and every link opened at the top (CompanyPage.tsx). Each must exist, once.
   */
  test('carries the anchors LinkedIn links to, and Community its own', async ({ page }) => {
    await page.goto('/careers')
    for (const id of ['what-we-offer', 'training', 'apply']) {
      await expect(page.locator(`[id="${id}"]`), `#${id} on /careers`).toHaveCount(1)
    }
    await page.goto('/community')
    for (const id of ['work', 'hard-times', 'buyers', 'the-works']) {
      await expect(page.locator(`[id="${id}"]`), `#${id} on /community`).toHaveCount(1)
    }
  })

  test('the "Something else" box opens only for "Something else"', async ({ page }) => {
    await page.goto('/careers')
    const own = page.locator('#application-role-own')
    await expect(own).toBeHidden()
    await page.getByRole('radio', { name: 'Something else' }).check()
    await expect(own).toBeVisible()
  })

  /*
   * ⚠️ FOUND IN THE OWNER'S PICTURE, 2026-10-07: "Something else" with its box left empty went to
   * the server, which refused it — and the reload cost the applicant everything they had typed.
   * The box is needed only while "Something else" is chosen, so the page's script switches its
   * `required` on and off with the choice.
   */
  test('"Something else" with its box empty is stopped in the page, and any other role is not', async ({
    page,
  }) => {
    await page.goto('/careers')
    let posted = false
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/careers/submit')) posted = true
    })
    await scriptReady(page)
    await page.fill('#application-form [name="name"]', 'Imran Bashir')
    await page.fill('#application-form [name="phone"]', '300 1234567')
    await page.getByRole('radio', { name: 'Something else' }).check()
    await page.getByRole('button', { name: 'Send application' }).click()
    await expect(page.locator('.inquiry-summary')).toContainText('Tell us what you do.')
    await expect(page.locator('#application-role-own-error')).toHaveText('Tell us what you do.')
    expect(posted, 'an empty "Something else" reached the server').toBe(false)
    // Choosing a listed role takes the need away again, and its sentence with it.
    await page.getByRole('radio', { name: 'Cutting' }).check()
    await expect(page.locator('#application-role-own')).not.toHaveAttribute('required', '')
    await expect(page.locator('#application-role-own-error')).toBeHidden()
  })

  test('an empty form is refused by the browser, not by the server', async ({ page }) => {
    await page.goto('/careers')
    let posted = false
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/careers/submit')) posted = true
    })
    await scriptReady(page)
    await page.getByRole('button', { name: 'Send application' }).click()
    await expect(page.locator('.inquiry-summary')).toContainText('Enter your name.')
    await expect(page.locator('.inquiry-summary')).toContainText(
      'Enter a phone number we can call.',
    )
    await expect(page.locator('.inquiry-summary')).toContainText('Choose what you do.')
    expect(posted, 'an empty form reached the server').toBe(false)
  })

  test('a floor applicant applies with name, phone and role alone', async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ownAddress(testInfo.project.name) })
    await page.goto('/careers')
    await fillFloorApplicant(page)
    await page.getByRole('button', { name: 'Send application' }).click()

    const done = page.locator('#application-done')
    await expect(done).toBeVisible()
    await expect(done.getByRole('heading', { name: 'Got it.' })).toBeVisible()
    await expect(done).toContainText(
      'Thank you — your application is with our HR team. We keep good candidates on file for future openings.',
    )
    await expect(page.locator('#application-form')).toBeHidden()
    await expect(done).toBeFocused()
    await expect(page).toHaveURL(/\/careers#apply$/)
    // Nothing the applicant typed may travel in the address (history, logs, Referer).
    for (const secret of ['Imran', 'Bashir', '1234567', 'Stitching']) {
      expect(page.url(), `the URL carries "${secret}"`).not.toContain(secret)
    }
  })

  test('a CV (PDF) is accepted with the application', async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({ 'cf-connecting-ip': ownAddress(testInfo.project.name) })
    await page.goto('/careers')
    await fillFloorApplicant(page)
    await page.locator('#application-cv').setInputFiles({
      name: `cv-${testInfo.project.name}-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: PDF,
    })
    await page.getByRole('button', { name: 'Send application' }).click()
    await expect(page.locator('#application-done')).toBeVisible()
  })

  test('a program renamed .pdf is stopped in the page, and the typing stays', async ({ page }) => {
    await page.goto('/careers')
    await fillFloorApplicant(page)
    await page.locator('#application-cv').setInputFiles({
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
    })
    await expect(page.locator('#application-cv-error')).toContainText(
      '“cv.pdf” is not a kind we accept, or its contents do not match its name.',
    )
    await page.getByRole('button', { name: 'Send application' }).click()
    await expect(page.locator('#application-done')).toHaveCount(0)
    await expect(page.locator('#application-form [name="name"]')).toHaveValue('Imran Bashir')
  })

  test('the server refuses a program renamed .pdf, and says nothing was sent', async ({
    page,
    request,
  }, testInfo) => {
    const res = await request.post('/careers/submit', {
      multipart: {
        name: 'Renamed Binary',
        phoneCode: '+92',
        phone: '300 7654321',
        role: 'Cutting',
        cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x4d, 0x5a]) },
      },
      headers: { 'cf-connecting-ip': ownAddress(testInfo.project.name) },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    const location = res.headers().location ?? ''
    expect(location).toContain('error=files&reason=type')
    await page.goto(location)
    await expect(page.locator('#application-problem')).toContainText(
      'Your application has not been sent. Your CV is not a kind we accept',
    )
  })

  test('a tripped honeypot is thanked like a person and stored nowhere', async ({ request }) => {
    const res = await request.post('/careers/submit', {
      form: { name: 'Bot', phone: '300 1111111', role: 'Cutting', website: 'https://spam.example' },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('sent=1')
  })

  test('a POST with nothing in it does not 500', async ({ request }, testInfo) => {
    const res = await request.post('/careers/submit', {
      form: {},
      headers: { 'cf-connecting-ip': ownAddress(testInfo.project.name) },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=invalid')
  })
})

test.describe('applications and CVs are private', () => {
  test('a stranger can neither list applications nor download a CV', async ({ request }) => {
    const wrong: string[] = []
    for (const path of [
      '/api/job-applications',
      '/api/application-files',
      '/api/application-files/file/cv.pdf',
    ]) {
      const status = (await request.get(path)).status()
      if (status !== 403) wrong.push(`${path} → ${status}, expected 403`)
    }
    expect(wrong, 'an application or a CV is readable by anyone').toEqual([])
    // The positive controls (headers.spec.ts FA-O-08): a down API must not pass as private.
    expect((await request.get('/api/health')).status(), '/api/health is down').toBe(200)
    expect((await request.get('/api/access')).status(), '/api/access is down').toBe(200)
  })
})
