import { FOCUS_RING_CONTRACT, TOKEN_CONTRACT } from '@run-apparel/shared'
import { expect, test } from '@playwright/test'

/**
 * XS-04 — tokens and the focus ring are identical across hosts.
 *
 * Deliberately NOT `apps/viewer/src/styles/tokens.test.ts` — that file is Phase
 * 1b-B's own File map territory (Task 7). This is the cross-host CONTRACT, on the
 * `packages/shared/src/tokenContract.ts` pattern `siteBar.ts` already set: a fixed
 * expected table, each host's own spec reading its OWN computed styles against it.
 *
 * `color-scheme: light` is pinned so `--focus-ring`'s `light-dark()` resolves
 * deterministically — see `tokenContract.ts`'s own docblock for why the other
 * tokens need no such pin.
 *
 * ⚠️ CHROMIUM ONLY, MEASURED NOT ASSUMED. The first run across all four engines
 * found two real engine-serialisation differences, neither a cross-HOST
 * inconsistency (both hosts read the identical stylesheet): Firefox normalises a
 * `ms` custom-property value to a shorthand (`200ms` read back as `.2s`), and
 * WebKit reports a 3px outline-width for the SAME `2px` rule this repo's other
 * `outline`-shorthand tests do not hit. Scoping to one deterministic engine per
 * host is the same call `PF-04`/`PF-05` already make for CDP for the same
 * reason — engine noise, not the thing XS-04 is checking.
 */
test.describe('design tokens match the shared contract (XS-04)', () => {
  test('root custom properties resolve to the contracted raw values', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'measured engine-serialisation noise, not host drift')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/n001/wine')
    const computed = await page.evaluate((names: string[]) => {
      const style = getComputedStyle(document.documentElement)
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]))
    }, Object.keys(TOKEN_CONTRACT))

    for (const [name, expected] of Object.entries(TOKEN_CONTRACT)) {
      expect(computed[name], `${name} on the viewer`).toBe(expected)
    }
  })

  test('the focus ring matches the contract on a real focused control', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'measured engine-serialisation noise, not host drift')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/n001/wine')
    // The shared header's own `.nav-link` — the one component Phase 1b-B unified
    // across both hosts (`packages/ui/src/notch.css`), which is what XS-04 is
    // about. A colourway tab was tried first and measures a DIFFERENT rule (the
    // general `--focus-ring`, not `.notch`'s own `--volt` override) — see
    // tokenContract.ts's own comment.
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
    expect(outline.outlineWidth, 'outline-width on the viewer').toBe(
      FOCUS_RING_CONTRACT.outlineWidth,
    )
    expect(outline.outlineStyle, 'outline-style on the viewer').toBe(
      FOCUS_RING_CONTRACT.outlineStyle,
    )
    expect(outline.outlineColorLight, 'outline-color (light) on the viewer').toBe(
      FOCUS_RING_CONTRACT.outlineColorLight,
    )
  })
})
