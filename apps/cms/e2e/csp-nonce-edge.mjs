/**
 * Proves the script guard (SE-04) in REAL browsers against the REAL Worker (worker.mjs).
 *
 *   node e2e/csp-nonce-edge.mjs                                # opennextjs-cloudflare preview on :8787
 *   node e2e/csp-nonce-edge.mjs --origin=https://wear-run.com  # production, after a deploy
 *
 * For every page type, in Chromium, Firefox and WebKit, it checks four things:
 * - the policy carries a nonce;
 * - script-src no longer allows 'unsafe-inline';
 * - NO securitypolicyviolation fired;
 * - React hydrated the page;
 * - the page is in standards mode, its doctype first (worker.mjs, 2026-10-03).
 * Exits 0 if all of that holds, 1 if anything failed, and 2 if nothing answered.
 *
 * ⚠️ WHY NOT THE PLAYWRIGHT SUITE: it serves the site with `next start`, which never runs
 * worker.mjs (apps/cms/CLAUDE.md). Only the real Worker, local or live, shows the guard.
 * ⚠️ WHY HYDRATION: a blocked inline flight script does not always fire a violation that a
 * page listener can see before it matters, but React never hydrating always shows. Both are
 * checked.
 */
import { chromium, firefox, webkit } from '@playwright/test'
import { FIREFOX_USER_PREFS } from './firefoxPrefs.mjs'

const ORIGIN = (
  process.argv.find((arg) => arg.startsWith('--origin='))?.slice('--origin='.length) ??
  'http://localhost:8787'
).replace(/\/$/, '')

const PAGES = [
  ['/', 200],
  ['/products', 200],
  ['/contact', 200],
  ['/privacy', 200],
  ['/terms', 200],
  ['/custom-teamwear-manufacturer', 200],
  ['/custom-activewear-manufacturer', 200],
  ['/custom-outerwear-manufacturer', 200],
  ['/private-label-casual-wear-manufacturer', 200],
  ['/guides', 200],
  ['/guides/how-a-private-label-order-works', 200],
  ['/guides/3d-garment-reference', 200],
  ['/guides/minimum-order-and-samples', 200],
  ['/guides/garment-printing-methods', 200],
  ['/guides/sportswear-fabrics-and-weights', 200],
  ['/guides/private-label-packaging', 200],
  ['/guides/shipping-and-import-duties', 200],
  ['/policies', 200],
  ['/policies/workplace-conduct', 200],
  ['/policies/health-and-safety', 200],
  ['/policies/health-and-vaccination', 200],
  ['/policies/equal-opportunity', 200],
  ['/policies/labor-rights', 200],
  ['/policies/quality', 200],
  ['/policies/environmental', 200],
  ['/careers', 200],
  ['/community', 200],
  ['/definitely-not-a-page', 404],
]
const ENGINES = [
  ['chromium', chromium, {}],
  ['firefox', firefox, { firefoxUserPrefs: FIREFOX_USER_PREFS }],
  ['webkit', webkit, {}],
]

try {
  await fetch(ORIGIN, { signal: AbortSignal.timeout(10_000) })
} catch {
  console.error(`[csp-nonce-edge] nothing answers at ${ORIGIN}.`)
  process.exit(2)
}

let failures = 0
for (const [name, engine, launchOptions] of ENGINES) {
  const browser = await engine.launch(launchOptions)
  for (const [path, expectedStatus] of PAGES) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const consoleErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.addInitScript(() => {
      window.__cspViolations = []
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
      })
    })
    const response = await page.goto(ORIGIN + path, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForTimeout(1_500)
    const csp = (await response?.allHeaders())?.['content-security-policy'] ?? ''
    const violations = await page.evaluate(() => window.__cspViolations)
    const hydrated = await page.evaluate(() =>
      Object.keys(document.body).some((key) => key.startsWith('__reactFiber')),
    )
    // Standards mode (2026-10-03): on this runtime Next could stream a script before the
    // doctype, and every page was drawn in quirks mode; worker.mjs writes the doctype first.
    const mode = await page.evaluate(() => ({
      compat: document.compatMode,
      doctype: document.doctype?.name ?? null,
    }))
    const problems = []
    if (mode.compat !== 'CSS1Compat' || mode.doctype !== 'html') {
      problems.push(`quirks mode (compatMode ${mode.compat}, doctype ${mode.doctype})`)
    }
    if (response?.status() !== expectedStatus) {
      problems.push(`HTTP ${response?.status()}, expected ${expectedStatus}`)
    }
    if (!/'nonce-[A-Za-z0-9+/]{22}=='/.test(csp)) problems.push('no nonce in the policy')
    if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
      problems.push("script-src still allows 'unsafe-inline'")
    }
    if (violations.length > 0) {
      problems.push(`${violations.length} blocked: ${violations.slice(0, 3).join(' | ')}`)
    }
    if (!hydrated) problems.push('React never hydrated the page')
    const hydrationErrors = consoleErrors.filter((text) => /hydrat/i.test(text))
    if (hydrationErrors.length > 0) {
      problems.push(`hydration error: ${hydrationErrors[0].slice(0, 120)}`)
    }
    console.log(
      `${problems.length > 0 ? 'FAIL' : 'ok  '}  ${name.padEnd(8)} ${path.padEnd(24)} ${problems.join('; ')}`,
    )
    if (problems.length > 0) failures++
    await context.close()
  }
  await browser.close()
}

console.log(
  failures > 0
    ? `\n[csp-nonce-edge] ${failures} page load(s) failed.`
    : '\n[csp-nonce-edge] every page, every engine: nonced, nothing blocked, hydrated, standards mode.',
)
process.exit(failures > 0 ? 1 : 0)
