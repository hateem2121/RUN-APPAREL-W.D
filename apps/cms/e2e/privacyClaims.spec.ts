import { expect, test } from '@playwright/test'

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
  test('SE-09: states the no-cookie fact in the exact words the no-banner reasoning rests on', async ({
    request,
  }) => {
    const response = await request.get('/privacy')
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).toContain(
      'No cookies and no tracking identifiers, on this site or on our 3D reference pages. The ' +
        'one thing your browser keeps is the light or dark setting, and only after you press ' +
        'that switch. That is why you are not being asked to accept anything.',
    )
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
