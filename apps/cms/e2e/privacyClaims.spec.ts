import { expect, test } from './offlineMedia'

/**
 * Pin the privacy notice's substantive claims (SE-09, SE-10).
 *
 * SE-09's honest shape: whether UK/Pakistan law requires a consent banner is a
 * judgement call, not a testable fact. What IS testable, and what the whole judgement
 * rests on, is that the site still (a) sets zero cookies/storage on a plain visit —
 * already covered by `apps/cms/e2e/headers.spec.ts`'s FA-O-13 test — and (b) still SAYS
 * so, in the exact words the reasoning cites. This file covers (b), in a NEW file so
 * nothing here touches `headers.spec.ts`, which is being edited in parallel on its own
 * branch for an unrelated comment.
 *
 * SE-10 wants the page's substance robotted more generally — what is collected and by
 * whom. Built in the same file as SE-09 rather than a second one: they are the same page.
 *
 * Every string below is copied verbatim from `apps/cms/src/app/(frontend)/privacy/page.tsx`
 * (read in full, not just the one paragraph fetched while planning) — a substring match on
 * the live-confirmed text, not a paraphrase, matching `headers.spec.ts`'s own argument for
 * asserting whole values rather than presence-only checks.
 */

test.describe('the privacy notice says what it does (SE-09, SE-10)', () => {
  /*
   * ⚠️ REWRITTEN 2026-09-30, WHEN THE FACT CHANGED. Until then this pinned "No cookies and no
   * tracking identifiers ... That is why you are not being asked to accept anything." The
   * owner then added Google Analytics and Apollo behind a choice shown to every visitor, so
   * that sentence would have been false. What the page promises now is narrower and still
   * testable: nothing is stored and no tracker runs UNLESS the visitor chooses it.
   * `e2e/consent.spec.ts` holds the site to it in a real browser; this holds the words.
   */
  test('SE-09: states that nothing is stored and no tracker runs without the visitor choosing it', async ({
    request,
  }) => {
    const response = await request.get('/privacy')
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).toContain(
      'Nothing is stored on your device, and no tracker runs, unless you choose it. We ask ' +
        'once, on this site and on our 3D reference pages alike.',
    )
    expect(body).toContain('if you decline, or do not answer, none of them ever loads.')
    // The sentence that was true until 2026-09-30 must not survive beside the new one.
    expect(body).not.toContain('No cookies and no tracking identifiers')
    expect(body).not.toContain('you are not being asked to accept anything')
  })

  test('names the three consent-only services, what each learns, and that people are not identified', async ({
    request,
  }) => {
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain('Three more services start, and only then.')
    expect(body).toContain('Google Analytics, from Google, sets cookies named')
    expect(body).toContain('We have switched off its advertising features.')
    expect(body).toContain(
      'Apollo, a service based in the United States, stores an identifier in your browser and ' +
        'tells us which companies visited',
    )
    // True only while the page policy refuses LiveIntent; see TRACKER_CSP's own test.
    expect(body).toContain('our pages block the part of it that identifies individuals')
    expect(body).toContain(
      'PostHog, a service based in the United States, stores an identifier in your browser and ' +
        'records how you use our pages',
    )
    // True only while consent.ts masks every input and never names a visitor.
    expect(body).toContain('Anything you type into a form is hidden in your browser')
    expect(body).toContain('we never tell PostHog who you are')
    expect(body).toContain('Declining after accepting removes what the three services stored')
  })

  test('SE-10: names what is collected on a plain visit, and by whom', async ({ request }) => {
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain(
      'Our hosting provider, Cloudflare, processes your IP address, the page you asked ' +
        'for and your browser type in order to serve the site and protect it from abuse.',
    )
  })

  test('SE-10: names the error-reporting third party and its location', async ({ request }) => {
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain(
      'Our 3D reference pages report technical faults to Sentry, a service based in the ' +
        'United States, so that we can fix them.',
    )
  })

  test('SE-10: names what is kept when a visitor makes contact', async ({ request }) => {
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain(
      'If you email us, message us on WhatsApp or send an inquiry through this site, we ' +
        'keep what you send — your name, company, contact details and the inquiry itself',
    )
  })

  /*
   * Owner-approved 2026-09-29, with the form's new optional details and attached files. The
   * files claim is the one that must stay TRUE, not just present: the bucket has no public
   * address and every download goes through the admin's sign-in (`collections/InquiryFiles.ts`).
   */
  test('names the new form details, and says where attached files go and when they go', async ({
    request,
  }) => {
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain(
      'An inquiry sent through this site can also include your job title, country, phone ' +
        'number, a subject and any files you attach. Attached files are stored privately with ' +
        'Cloudflare, never at a public address, and only our team can open them.',
    )
    expect(body).toContain(
      'Inquiry correspondence, including any files you attached, for as long as our business ' +
        'relationship needs it; when we delete an inquiry, its files are deleted with it.',
    )
  })

  test('names Resend, which carries every inquiry to the owner', async ({ request }) => {
    // Owner, 2026-09-29: the notification email holds the inquiry, so its carrier is named.
    const body = await (await request.get('/privacy')).text()
    expect(body).toContain(
      'Cloudflare, Sentry and Resend (which delivers our inquiry notifications to us) process ' +
        'data outside Pakistan',
    )
  })
})

/**
 * CROSS-REFERENCE, DOCUMENTATION ONLY — not an enforced assertion. A real shared check
 * would mean importing across files that different tasks/PRs may touch independently, so
 * this comment is the cheapest version that still says the two facts must not silently
 * drift apart: SE-08's zero-cookie ROBOT lives in `apps/cms/e2e/headers.spec.ts`
 * ("FA-O-13 — nothing is stored, and nothing is told"), and this file's SE-09 test above
 * pins the SENTENCE that fact justifies. If one changes without the other, a human
 * reading both files side by side is what catches it — recorded here rather than as a
 * test that would always pass and prove nothing.
 */
