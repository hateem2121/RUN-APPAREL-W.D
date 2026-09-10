import { expect, test } from '@playwright/test'

/**
 * Security-header and privacy guards for the 2026-09-06 beta-website audit (kept privately).
 *
 * ⚠️ MEASURED ON THE WIRE, NOT READ OUT OF next.config.mjs — AND THIS REPO HAS THE
 * INCIDENT THAT MAKES THE DIFFERENCE. `Vary: Origin` shipped green and INERT twice
 * because `withPayload` appends its own header rule last and silently overrode the one
 * the handler set. `src/nextConfig.test.ts` asserts the six header NAMES appear in the
 * config; nothing asserted a single value ever reached a response. That is the shape of
 * gate this codebase has shipped four times.
 */

const DOCUMENTS = ['/', '/products', '/contact'] as const

test.describe('FA-O-05 / FA-O-02 — the three cheap headers are on everything', () => {
  /**
   * MEASURED 2026-09-06 across five hosts: `X-Content-Type-Options: nosniff` everywhere,
   * `Referrer-Policy: strict-origin-when-cross-origin` on the viewer, the CMS and the
   * site, and a `Permissions-Policy` that is byte-identical across all three.
   *
   * The value of asserting the WHOLE VALUE rather than its presence: `Permissions-Policy`
   * is a list, and a list is the one thing an editor shortens. Dropping `camera=()` from
   * it is not a diff anyone questions.
   */
  const SURFACES = [
    '/',
    '/products',
    '/contact',
    '/admin',
    '/sitemap.xml',
    '/robots.txt',
    '/this-route-does-not-exist',
  ] as const

  for (const path of SURFACES) {
    test(`${path}`, async ({ request }) => {
      const headers = (await request.get(path)).headers()
      expect(headers['x-content-type-options'], `${path} can be MIME-sniffed`).toBe('nosniff')
      expect(headers['referrer-policy'], `${path} leaks its URL cross-origin`).toBe(
        'strict-origin-when-cross-origin',
      )
      const permissions = headers['permissions-policy'] ?? ''
      for (const feature of [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ]) {
        expect(permissions, `${path} no longer denies ${feature}`).toContain(feature)
      }
    })
  }
})

test.describe('FA-O-03 — the policy is enforced, not observed', () => {
  /**
   * MEASURED 2026-09-06: the marketing pages carry a real `Content-Security-Policy`, not
   * a `Content-Security-Policy-Report-Only`.
   *
   * ⚠️ REPORT-ONLY IS THE FAILURE MODE THAT LOOKS LIKE SUCCESS. It is what a developer
   * switches to while debugging a blocked resource, it produces identical console
   * warnings, every existing CSP test that reads the enforced header would go quiet
   * rather than red — and the page is then protected by nothing. notfound.spec.ts asserts
   * the DIRECTIVES; this asserts which header carries them.
   */
  for (const path of DOCUMENTS) {
    test(`${path} enforces its policy`, async ({ request }) => {
      const headers = (await request.get(path)).headers()
      expect(headers['content-security-policy'], `${path} has no enforced CSP`).toContain(
        "default-src 'self'",
      )
      expect(
        headers['content-security-policy-report-only'],
        `${path} downgraded its policy to report-only — it is now enforcing nothing`,
      ).toBeUndefined()
    })
  }
})

test.describe('FA-O-06 — the admin cannot be framed', () => {
  /**
   * MEASURED 2026-09-06: `/admin` answers with BOTH `x-frame-options: DENY` and
   * `content-security-policy: frame-ancestors 'none'`.
   *
   * Both, deliberately: `X-Frame-Options` is the one every browser has honoured for
   * fifteen years, `frame-ancestors` is the one that is not deprecated. This is the login
   * for the system that owns every product record and both R2 buckets, and a borrowed
   * click on it is the whole attack.
   */
  test('DENY and frame-ancestors, on the login for everything', async ({ request }) => {
    const headers = (await request.get('/admin')).headers()
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  })
})

test.describe('FA-O-08 / FA-O-61 — five collections refuse an anonymous read', () => {
  /**
   * MEASURED 2026-09-06, live and locally, with controls in the same sweep: `/api/media`,
   * `/api/products`, `/api/users`, `/api/raw-uploads` and `/api/events` all 403, while
   * `/api/health` and `/api/access` answer 200. `/api/media` enumerating all 68 media
   * documents including 13 model files was an OPEN FINDING on 2026-09-05; it closed on
   * 2026-09-06 and nothing here held it closed.
   *
   * ⚠️ THE TWO 200s ARE NOT DECORATION. Without them a blanket outage, a broken route
   * table or a misconfigured host rule would 403 everything and this test would report
   * the security property as intact while the API was down. That is the same reason the
   * audit ran them.
   */
  const REFUSED = [
    '/api/media',
    '/api/media?limit=1',
    '/api/products',
    '/api/users',
    '/api/raw-uploads',
    '/api/events',
    '/api/globals/build-process',
  ] as const

  test('the collections 403 and the open endpoints still answer', async ({ request }) => {
    const wrong: string[] = []
    for (const path of REFUSED) {
      const status = (await request.get(path)).status()
      if (status !== 403) wrong.push(`${path} → ${status}, expected 403`)
    }
    expect(wrong, 'a collection started answering anonymous reads').toEqual([])

    // The positive controls, so a blanket refusal cannot pass as a security property.
    expect((await request.get('/api/health')).status(), '/api/health is down').toBe(200)
    expect((await request.get('/api/access')).status(), '/api/access is down').toBe(200)
  })
})

test.describe('FA-O-13 — nothing is stored, and nothing is told', () => {
  /**
   * MEASURED 2026-09-06 across all three marketing pages: **zero** third-party requests,
   * **zero** cookies, **zero** `localStorage` and `sessionStorage` keys — because
   * `CF_ANALYTICS_TOKEN` is unset and `Analytics()` returns null, which is the documented
   * day-one state. The audit's conclusion was that no consent banner is needed, and the
   * comment in the code saying so is accurate.
   *
   * ⚠️ THAT CONCLUSION IS A CLAIM ABOUT WHAT THE SITE DOES, AND IT WILL BE PUBLISHED. The
   * privacy notice in the audit's Appendix C says "This website stores nothing on your
   * device — no cookies, no local storage, no tracking identifiers." One embedded map,
   * one chat widget, one font served from a CDN, and that published sentence becomes
   * untrue with nothing failing. This is the test that makes it a statement about the
   * code rather than about a Tuesday.
   */
  test('no cookies, no device storage, and nobody else is contacted', async ({ page, context }) => {
    const thirdParty: string[] = []
    const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:4174')

    /*
     * ⚠️ THE COMPANY'S OWN MEDIA HOST IS NOT A THIRD PARTY, AND PRODUCTION DOES CONTACT
     * IT. Every garment photograph on `/` and `/products` is served from
     * media.wear-run.help — same company, same Cloudflare account, no cookies, no script.
     * It is named here rather than left implicit because this test's own measurement
     * ("zero third-party requests") was taken while the fixture emitted Payload-relative
     * poster URLs, which are same-origin and 403 to a visitor. So the number was a fact
     * about the fixture, not about production, and this list is what makes the assertion
     * mean the same thing in both. `e2e/serve.mjs` now emits production's URL shape.
     *
     * Anything NOT on this list still fails: one embedded map, one chat widget, one CDN
     * font, and the privacy notice's claims stop being true with nothing else going red.
     */
    const FIRST_PARTY_HOSTS = [origin.host, 'media.wear-run.help']

    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.protocol === 'data:' || url.protocol === 'blob:') return
      if (FIRST_PARTY_HOSTS.includes(url.host)) return
      thirdParty.push(`${url.host}${url.pathname}`)
    })

    for (const path of DOCUMENTS) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }

    expect(thirdParty, 'the marketing site now contacts someone else').toEqual([])
    expect(await context.cookies(), 'the site set a cookie').toEqual([])

    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }))
    expect(stored.local, 'the site wrote to localStorage').toEqual([])
    expect(stored.session, 'the site wrote to sessionStorage').toEqual([])
  })
})
