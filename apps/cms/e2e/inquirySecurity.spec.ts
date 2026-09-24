import { expect, test } from '@playwright/test'
import { expectedContactNotice } from '../../../scripts/contact-error-messages.mjs'

/**
 * Contact-form security and error-route robots — SE-11, SE-12, SE-13, SE-14, RO-09.
 *
 * A NEW FILE, never `apps/cms/e2e/inquiry.spec.ts` itself — that file is on Phase 1b-B's
 * File map for an unrelated comment edit, building in parallel on its own branch/worktree.
 * `inquiry.spec.ts` already covers most of SE-11/SE-12/SE-14's SURFACE; this file tags
 * those same assertions with their audit IDs, tightens one of them, and adds SE-13 (the
 * rate limit), which had no integration proof at all before this.
 *
 * SHARED-FILE NOTE for anyone extending this later (recorded 2026-09-24 per the
 * controller's own instruction): every `describe`/`test` name below is stable and may be
 * extended by name without editing this file's existing bodies. The honeypot- and
 * error-route helpers are deliberately NOT re-exported for reuse beyond
 * `scripts/contact-error-messages.mjs`, which is already a separate, shared module.
 *
 * LOCAL-ONLY, NEVER PRODUCTION, for SE-11/SE-12/SE-13/SE-14 — each of those POSTs to
 * `/contact/submit`, which the repo's hard limits forbid doing against
 * `wear-run.help`. RO-09 is the one exception: it is a plain GET reading query-string
 * state the page already renders with no submission at all, so it is safe against
 * production too — see its own section below.
 */

/** A honeypot-clear, otherwise-valid submission. Each call gets unique contact details
 * so distinct rows are easy to tell apart in the admin, though nothing here reads them
 * back — `Inquiries.read` is authenticated, same limit `inquiry.spec.ts` documents. */
function validInquiry(tag: string) {
  return {
    name: `Test Contact ${tag}`,
    company: 'Automated Test Co',
    email: `qa-${tag}@example.com`,
    message: `Automated inquiry-security check ${tag}.`,
  }
}

/**
 * A fresh TEST-NET-2 address (198.51.100.0/24, RFC 5737, never a real one) for a POST that
 * must NOT share `checkInquiryRate`'s per-IP bucket with any other test.
 *
 * Measured 2026-09-24, both Chromium and Firefox together: with no address header, every
 * fixture POST in this file and in `inquiry.spec.ts` falls back to the same socket address,
 * so the two suites' empty-POST and malformed-email checks landed in ONE bucket alongside
 * `inquiry.spec.ts`'s own empty-POST test. `MAX_PER_IP` is 5 per 10-minute window
 * (`apps/cms/src/lib/inquiryRate.ts`), so the 6th counted POST in that window was answered
 * `error=too-many` — Firefox's run of both these tests, in that order, both failed on
 * exactly that: `expect(location).toContain('error=invalid')` received `error=too-many`.
 * A disjoint block from SE-13's TEST-NET-3 (203.0.113.0/24) keeps the two describe blocks'
 * addresses from ever colliding with each other either.
 */
function freshTestAddress() {
  return `198.51.100.${1 + Math.floor(Math.random() * 254)}`
}

test.describe('SE-11 — a tripped honeypot is indistinguishable from success', () => {
  test('a tripped honeypot redirects exactly like a real success', async ({ request }) => {
    const res = await request.post('/contact/submit', {
      form: { ...validInquiry('se11-bot'), website: 'https://spam.example' },
      headers: { 'cf-connecting-ip': freshTestAddress() },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('sent=1')
  })

  /**
   * The accessibility shape `inquiry.spec.ts` already proves for the page's static HTML,
   * reasserted here under its audit ID: a bot that trips the trap must be one that reads
   * neither ARIA nor tab order, or the field would fail this same visitor first.
   */
  test('the honeypot field stays unreachable by keyboard and hidden from assistive technology', async ({
    page,
  }) => {
    await page.goto('/contact')
    const trap = page.locator('[name="website"]')
    await expect(trap).toHaveAttribute('tabindex', '-1')
    expect(
      await trap.evaluate((el) => Boolean(el.closest('[aria-hidden="true"]'))),
      'the honeypot is reachable by assistive technology — SE-11 depends on it not being',
    ).toBe(true)
  })
})

test.describe('SE-12 — a POST with nothing in it fails safely and specifically', () => {
  /**
   * ⚠️ TIGHTENED FROM `inquiry.spec.ts`'s OWN VERSION, which only checks the redirect
   * contains "error=" — true of every failure code, so it would not notice a truly empty
   * POST quietly starting to redirect to `error=storage` or `error=too-many` instead.
   *
   * ⚠️ `error=invalid` IS ONLY GUARANTEED FROM AN ADDRESS THAT STILL HAS ALLOWANCE LEFT.
   * The route checks the rate limit BEFORE validation (`contact/submit/route.ts:114-120`),
   * so `validateInquiry({})`'s own refusal never runs for an address that has already used
   * its five — that address gets `error=too-many` for an empty POST too. This request
   * carries its own address (`freshTestAddress()`) for exactly that reason, rather than
   * relying on the Playwright fixture's shared socket address staying under the limit.
   */
  test('a POST with nothing in it redirects to error=invalid specifically', async ({ request }) => {
    const res = await request.post('/contact/submit', {
      form: {},
      headers: { 'cf-connecting-ip': freshTestAddress() },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=invalid')
  })
})

test.describe('SE-14 — validation runs on both sides, independently', () => {
  /** Tagged copy of `inquiry.spec.ts`'s own browser-side assertion. */
  test('an empty form is refused by the browser, not by the server', async ({ page }) => {
    await page.goto('/contact')
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
      }
    })
    expect(state.formValid).toBe(false)
    expect(state.submitted).toBe(0)
    await expect(page).toHaveURL(/\/contact$/)
  })

  /**
   * The SERVER half: `required`/`type="email"` only stop a BROWSER submission. A
   * hand-crafted request bypasses all of it, and `validateInquiry`'s own
   * `LOOKS_LIKE_EMAIL` check (apps/cms/src/lib/inquiry.ts) is the thing that must still
   * refuse it — defence in depth, not decoration.
   */
  test('a malformed email is refused by the server even with the browser bypassed', async ({
    request,
  }) => {
    const res = await request.post('/contact/submit', {
      form: { ...validInquiry('se14-bad-email'), email: 'not-an-email-address' },
      headers: { 'cf-connecting-ip': freshTestAddress() },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(303)
    expect(res.headers().location).toContain('error=invalid')
  })
})

test.describe('SE-13 — the rate limit', () => {
  /**
   * `checkInquiryRate`'s state (apps/cms/src/lib/inquiryRate.ts) is per-ISOLATE memory,
   * shared across every test in this file and `inquiry.spec.ts` that runs in the same
   * `next start` process. A distinct, test-reserved `cf-connecting-ip` — which the route
   * reads before `x-forwarded-for` — isolates this sequence from every other test's own
   * count within that shared state, rather than needing a fresh server process.
   *
   * ⚠️ THE ADDRESS PAIR IS RANDOM PER RUN, NOT FIXED, and a planted-fault proof is why:
   * a fixed address means a Playwright RETRY of a genuinely failing attempt reuses the
   * SAME server-side counter the first attempt already consumed, so the retry's own
   * assertion failure is confusing (it fails one request earlier, for a second, different
   * reason) even though the underlying finding was already correctly caught on attempt
   * one. Measured while proving this test: `MAX_PER_IP` raised to 10 correctly failed
   * attempt 1 at "the sixth request… expected error=too-many, got sent=1", then attempt 2
   * (same IP, same still-open 10-minute window) failed at request 5/5 instead — a real
   * but avoidable confusion. A fresh, random last octet per test run keeps a retry
   * independent of whatever an earlier attempt already spent.
   */
  // Both addresses stay inside 203.0.113.0/24 — TEST-NET-3, RFC 5737, never a real one —
  // with two DISTINCT octets drawn from disjoint halves of the range so they cannot collide.
  const randomOctet = (min: number, max: number) => min + Math.floor(Math.random() * (max - min))
  const RATE_LIMIT_TEST_IP = `203.0.113.${randomOctet(10, 120)}`
  const OTHER_IP = `203.0.113.${randomOctet(130, 240)}`

  test('the sixth inquiry from one address in the window is refused; a seventh from a different address is not', async ({
    request,
  }) => {
    // MAX_PER_IP is 5 (apps/cms/src/lib/inquiryRate.ts) — five honeypot-clear, valid
    // submissions from the SAME address must all succeed.
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/contact/submit', {
        form: validInquiry(`se13-a-${i}`),
        headers: { 'cf-connecting-ip': RATE_LIMIT_TEST_IP },
        maxRedirects: 0,
      })
      expect(res.status(), `request ${i + 1}/5 from the rate-limit address`).toBe(303)
      expect(res.headers().location, `request ${i + 1}/5 from the rate-limit address`).toContain(
        'sent=1',
      )
    }

    // The sixth from the SAME address: refused.
    const sixth = await request.post('/contact/submit', {
      form: validInquiry('se13-a-6'),
      headers: { 'cf-connecting-ip': RATE_LIMIT_TEST_IP },
      maxRedirects: 0,
    })
    expect(sixth.status()).toBe(303)
    expect(sixth.headers().location).toContain('error=too-many')

    // A seventh, from a DIFFERENT address: the ceiling is per-IP, not global.
    const seventh = await request.post('/contact/submit', {
      form: validInquiry('se13-b-7'),
      headers: { 'cf-connecting-ip': OTHER_IP },
      maxRedirects: 0,
    })
    expect(seventh.status()).toBe(303)
    expect(seventh.headers().location).toContain('sent=1')
  })
})

test.describe('RO-09 — every contact-form error route renders its own message', () => {
  /**
   * PURE GETS, SAFE AGAINST PRODUCTION TOO (unlike every describe block above): the page
   * renders these messages from `searchParams` alone
   * (`apps/cms/src/app/(frontend)/contact/page.tsx`), server-rendered on a plain page
   * load with no form submission at all — confirmed live 2026-09-23 by GET, before this
   * batch started. Built here for proximity to the rest of the form's behaviour, using
   * the SAME mapping (`scripts/contact-error-messages.mjs`) a live check would reuse.
   */
  const CASES: { name: string; query: string; params: { sent?: string; error?: string } }[] = [
    { name: 'sent=1', query: '?sent=1', params: { sent: '1' } },
    { name: 'error=invalid', query: '?error=invalid', params: { error: 'invalid' } },
    { name: 'error=too-many', query: '?error=too-many', params: { error: 'too-many' } },
    { name: 'error=storage', query: '?error=storage', params: { error: 'storage' } },
    // Deliberately the SAME text as error=invalid — the page's own `else` branch covers
    // both, confirmed live; asserting it here pins that it stays that way on purpose
    // rather than drifting into "no message at all" for an unrecognised code.
    { name: 'error=unreadable', query: '?error=unreadable', params: { error: 'unreadable' } },
  ]

  for (const { name, query, params } of CASES) {
    test(`${name} renders the expected notice`, async ({ page }) => {
      await page.goto(`/contact${query}`)
      const expected = expectedContactNotice(params)
      if (!expected) throw new Error(`test case "${name}" has no expected notice — fix the fixture`)
      const notice = page.locator(params.sent ? '.form-notice--ok' : '.form-notice--bad')
      await expect(notice).toBeVisible()
      await expect(notice).toHaveText(expected)
    })
  }

  test('a plain visit with neither param shows no notice at all', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('.form-notice')).toHaveCount(0)
  })
})
