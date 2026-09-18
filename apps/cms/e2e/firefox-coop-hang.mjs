/**
 * Counts Firefox navigations that never resolve on this site's pages
 * (microsoft/playwright#42731). The negative control for `e2e/firefoxPrefs.mjs`, and
 * the check to run before removing it.
 *
 *   node e2e/firefox-coop-hang.mjs --prefs=none    # Firefox's default: expect stuck > 0
 *   node e2e/firefox-coop-hang.mjs --prefs=suite   # the suite's preferences: expect 0
 *
 * Needs this suite's server already running (`CMS_E2E_PORT=4174 node e2e/serve.mjs`
 * from apps/cms, after a build). Optional: `--trials=400 --concurrency=4`.
 * Exits 1 if any navigation stuck, 0 if none did, and 2 if it could not run.
 *
 * ⚠️ WHY IT DOES NOT USE THE TEST RUNNER. The test runner did not reproduce the hang on
 * a Mac: 0 in 700 Firefox tests, measured 2026-09-18. CI's slower runner hung about one
 * test in 300. What reproduces it here is many brand-new tabs, each making its
 * first navigation to a page that sends COOP, FOUR AT A TIME in one browser. Across three
 * alternating pairs of runs that measured 57 stuck in 800 with `--prefs=none` (one run
 * alone: 47 of 400), and 0 in 800 with `--prefs=suite`. The count swings from run to
 * run, so judge by several hundred navigations, never one short run.
 * One tab at a time (`--concurrency=1`, how the runner drives each browser) measured
 * 0 in 400 either way on the same Mac, so it proves nothing there. Run the two arms
 * back to back, so the machine's load is the same for both.
 */
import { firefox } from '@playwright/test'
import { FIREFOX_USER_PREFS } from './firefoxPrefs.mjs'

// The port playwright.config.ts owns (it passes it to serve.mjs as CMS_E2E_PORT).
const ORIGIN = 'http://localhost:4174'
// Every one sends `Cross-Origin-Opener-Policy: same-origin`, the trigger.
const PAGES = ['/', '/products', '/contact', '/definitely-not-a-page']
const GOTO_TIMEOUT_MS = 10_000

const option = (name, fallback) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const prefsArm = option('prefs', 'suite')
const trials = Number(option('trials', '400'))
const concurrency = Number(option('concurrency', '4'))
if (!['suite', 'none'].includes(prefsArm) || !(trials > 0) || !(concurrency > 0)) {
  console.error(
    'usage: node e2e/firefox-coop-hang.mjs --prefs=suite|none [--trials=400] [--concurrency=4]',
  )
  process.exit(2)
}

try {
  await fetch(ORIGIN, { signal: AbortSignal.timeout(5_000) })
} catch {
  console.error(`[coop-hang] nothing answers at ${ORIGIN}. Start the suite's server first:`)
  console.error('  (in apps/cms) CMS_E2E_PORT=4174 node e2e/serve.mjs')
  process.exit(2)
}

const firefoxUserPrefs = prefsArm === 'suite' ? FIREFOX_USER_PREFS : {}
const browser = await firefox.launch({ firefoxUserPrefs })
console.log(
  `[coop-hang] Firefox ${browser.version()}, prefs=${prefsArm} ${JSON.stringify(firefoxUserPrefs)}, ` +
    `${trials} navigations, ${concurrency} at a time`,
)

let started = 0
const stuck = []
async function worker() {
  while (started < trials) {
    const path = PAGES[started++ % PAGES.length]
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(ORIGIN + path, { timeout: GOTO_TIMEOUT_MS })
    } catch (error) {
      if (!String(error).includes('Timeout')) throw error
      // The bug's signature: the page itself finished loading. An evaluate can hang too,
      // when the lost message is the execution context instead of the navigation.
      const readyState = await Promise.race([
        page.evaluate(() => document.readyState).catch(() => 'evaluate failed'),
        new Promise((resolve) => setTimeout(() => resolve('evaluate hung'), 3_000)),
      ])
      stuck.push(`${path} (page says: ${readyState})`)
    }
    await context.close()
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
await browser.close()

for (const line of stuck) console.log(`  stuck: ${line}`)
console.log(`RESULT prefs=${prefsArm} navigations=${trials} stuck=${stuck.length}`)
process.exit(stuck.length > 0 ? 1 : 0)
