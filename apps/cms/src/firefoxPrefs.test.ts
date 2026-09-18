import { describe, expect, it } from 'vitest'
import { FIREFOX_USER_PREFS } from '../e2e/firefoxPrefs.mjs'
import config from '../playwright.config'

/**
 * ⚠️ PINS A WORKAROUND THAT LOOKS REMOVABLE. The site's Firefox browser tests run with
 * Cross-Origin-Opener-Policy switched off in the test browser, because the header makes
 * Playwright's Firefox driver lose `page.goto`'s navigation (microsoft/playwright#42731).
 * It hung a navigation in 25 of 40 CI runs, and a pull request went red on it.
 * "Firefox ignores a security header" reads like a mistake to tidy away, so this fails
 * first and points at the evidence: `e2e/firefoxPrefs.mjs`, and
 * `e2e/firefox-coop-hang.mjs` to re-measure before removing it.
 */
const COOP_PREF = 'browser.tabs.remote.useCrossOriginOpenerPolicy'

type ConfigProject = NonNullable<typeof config.projects>[number]
const coopOffIn = (project: ConfigProject | undefined) =>
  project?.use?.launchOptions?.firefoxUserPrefs?.[COOP_PREF] === false

const projectNamed = (name: string) => config.projects?.find((project) => project.name === name)

describe('the Firefox browser tests run with COOP off (microsoft/playwright#42731)', () => {
  it('the shared preferences switch it off', () => {
    expect(FIREFOX_USER_PREFS[COOP_PREF]).toBe(false)
  })

  it('the firefox project launches with them', () => {
    const firefox = projectNamed('firefox')
    expect(firefox, 'playwright.config.ts has no project named "firefox"').toBeDefined()
    expect(
      coopOffIn(firefox),
      'the firefox project lost its firefoxUserPrefs; read e2e/firefoxPrefs.mjs before removing them',
    ).toBe(true)
  })

  it('the check fails on the same project without them (negative control)', () => {
    const firefox = projectNamed('firefox')
    const stripped = { ...firefox, use: { ...firefox?.use, launchOptions: undefined } }
    expect(coopOffIn(stripped)).toBe(false)
    // And on a project that never had them, so the check is not true of every project.
    expect(coopOffIn(projectNamed('chromium'))).toBe(false)
  })
})
