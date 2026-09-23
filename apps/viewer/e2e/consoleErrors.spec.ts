import { type Page, expect, test } from '@playwright/test'

/**
 * The viewer's own console-error / CSP-violation guard (RO-07).
 *
 * WHAT EXISTS TODAY. `apps/cms/e2e/navbar.spec.ts` already asserts zero console errors on
 * the marketing site — RO-07's site half is done. The viewer has no equivalent, despite
 * being the page a QR scan actually opens. A NEW file, deliberately: both
 * `apps/viewer/e2e/motion-and-layout.spec.ts` and `viewer.spec.ts` — the two files most
 * likely to already carry a reusable page-load fixture — are on Phase 1b-B's File map.
 *
 * A KNOWN, RECORDED FALSE ALARM. `docs/VIEWER-CSP-BOT-FIGHT-MODE.md` documents a
 * Cloudflare-injected inline script that trips a CSP violation on the live site,
 * unrelated to anything in this repository and NOT fixed (per-request Cloudflare ray IDs
 * mean no static hash or nonce can cover it). It cannot fire in this LOCAL/CI fixture —
 * `e2e/serve.mjs` is a plain Node server, not the live Cloudflare edge — so today's
 * allowlist below is empty. It exists so a future re-appearance of that SPECIFIC pattern
 * is a documented exception rather than a scramble to redesign this test under pressure.
 */

/** Cloudflare Precursor's own inline-script violation — see the module docblock. Empty today. */
const KNOWN_ALLOWED_CSP_PATTERNS: RegExp[] = []

async function watchPage(page: Page) {
  const scriptErrors: string[] = []
  const cspViolations: string[] = []
  const brokenOwnResources: string[] = []

  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const where = e.sourceFile ? ` from ${e.sourceFile}:${e.lineNumber}` : ''
      ;(window as unknown as { __csp: string[] }).__csp ??= []
      ;(window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI}${where}`,
      )
    })
  })

  page.on('pageerror', (error) => scriptErrors.push(`uncaught: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // "Failed to load resource" is the network signal — handled by the response
    // listener below, scoped to this origin. Same split `navbar.spec.ts` uses.
    if (/Failed to load resource/i.test(message.text())) return
    scriptErrors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    let sameOrigin: boolean
    try {
      sameOrigin = new URL(response.url()).host === new URL(page.url()).host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return
    // A missing model/poster for a deliberately model-less fixture state is content,
    // not code — the same reasoning navbar.spec.ts uses for images on the site.
    if (['image', 'media'].includes(response.request().resourceType())) return
    brokenOwnResources.push(`${response.status()} ${new URL(response.url()).pathname}`)
  })

  return { scriptErrors, cspViolations, brokenOwnResources }
}

async function collectCsp(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
}

const PAGES = [
  { name: 'a real garment', path: '/n001/wine', expectedApiPath: undefined },
  // The API answers 404 for a genuinely unknown PRODUCT by design (isViewerApiError in
  // App.tsx renders the branded unavailable state from it) — that 404 IS the behaviour
  // under test, not a broken resource. A retired COLOURWAY is different: the API
  // resolves it with a 200 and a fallback flag (App.tsx's `requestedColourwayUnavailable`),
  // so /n001/navy is expected to have NO broken resource at all.
  {
    name: 'an unknown product',
    path: '/zzz9/none',
    expectedApiPath: '/api/public/viewer/zzz9/none',
  },
  {
    name: 'a retired colourway (falls back to the default)',
    path: '/n001/navy',
    expectedApiPath: undefined,
  },
]

for (const { name, path, expectedApiPath } of PAGES) {
  test(`${name} (${path}) loads with no console error, no CSP violation, no unexpected broken own-resource`, async ({
    page,
  }) => {
    const { scriptErrors, brokenOwnResources } = await watchPage(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const csp = await collectCsp(page)
    const unexpectedCsp = csp.filter(
      (violation) => !KNOWN_ALLOWED_CSP_PATTERNS.some((pattern) => pattern.test(violation)),
    )
    const unexpectedBroken = brokenOwnResources.filter(
      (entry) => !(expectedApiPath && entry.includes(expectedApiPath)),
    )

    expect(scriptErrors, 'the page logged a script error').toEqual([])
    expect(unexpectedCsp, 'the page reported an unrecognised CSP violation').toEqual([])
    expect(unexpectedBroken, 'a resource this origin serves failed unexpectedly').toEqual([])
    // The expected 404 must still actually have happened — a control against the
    // exclusion above silently swallowing everything.
    if (expectedApiPath) {
      expect(
        brokenOwnResources.some((entry) => entry.includes(expectedApiPath)),
        `expected the known ${expectedApiPath} 404, but it never happened`,
      ).toBe(true)
    }
  })
}
