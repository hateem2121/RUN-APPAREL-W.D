import { FOCUS_RING_CONTRACT, TOKEN_CONTRACT } from '@run-apparel/shared'
import { expect, test } from '@playwright/test'

/**
 * XS-04 — tokens and the focus ring are identical across hosts.
 *
 * Deliberately NOT `apps/viewer/src/styles/tokens.test.ts` (Phase 1b-B's File map,
 * Task 7) and NOT a new assertion inside it from this side either — this is the
 * cross-host CONTRACT, on the `packages/shared/src/tokenContract.ts` pattern
 * `siteBar.ts` already set: a fixed expected table, each host's own spec reading
 * its OWN computed styles against it. Mirrors `apps/viewer/e2e/tokenParity.spec.ts`.
 *
 * ⚠️ CHROMIUM ONLY, MEASURED NOT ASSUMED — see that file's own comment: the first
 * cross-engine run found Firefox normalising a `ms` custom-property value
 * (`200ms` read back as `.2s`) and WebKit reporting a 3px outline-width for the
 * same `2px` rule. Engine noise, not host drift.
 */
test.describe('design tokens match the shared contract (XS-04)', () => {
  test('root custom properties resolve to the contracted raw values', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'measured engine-serialisation noise, not host drift')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const computed = await page.evaluate((names: string[]) => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]))
    }, Object.keys(TOKEN_CONTRACT))

    for (const [name, expected] of Object.entries(TOKEN_CONTRACT)) {
      expect(computed[name], `${name} on the site`).toBe(expected)
    }
  })

  test('the focus ring matches the contract on a real focused control', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'measured engine-serialisation noise, not host drift')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const link = page.locator('.nav-link').first()
    await link.focus()
    const outline = await link.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        outlineColorLight: style.outlineColor,
      }
    })
    expect(outline.outlineWidth, 'outline-width on the site').toBe(FOCUS_RING_CONTRACT.outlineWidth)
    expect(outline.outlineStyle, 'outline-style on the site').toBe(FOCUS_RING_CONTRACT.outlineStyle)
    expect(outline.outlineColorLight, 'outline-color (light) on the site').toBe(
      FOCUS_RING_CONTRACT.outlineColorLight,
    )
  })
})
