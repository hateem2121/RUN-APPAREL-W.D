import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

// Automated accessibility check (axe-core, MPL-2.0). The e2e mock server
// (serve.mjs) supplies real product JSON, so this runs against the same DOM a
// visitor sees.
//
// HARD GATE: zero serious/critical *structural* violations — ARIA misuse,
// missing names/roles, keyboard/focus traps. These are unambiguous bugs (this
// suite already caught and fixed an aria-hidden focusable rail).
//
// ADVISORY (reported, not gated): colour-contrast. The muted editorial palette
// is a deliberate design choice; changing token colours to chase WCAG-AA
// contrast is a design decision to make explicitly, not one this check should
// silently force. The findings are printed so they stay visible and can be
// addressed deliberately (see the project handoff notes).
//
// WHY MORE THAN ONE URL. This covered `/n001/navy` alone until 2026-08-03, which
// is the one state on the site that is guaranteed to be healthy. Every screen a
// visitor reaches when something has gone WRONG — the unavailable page, the
// retired-colourway notice, the poster-only fallback — was unscanned, and those
// are exactly the screens carrying extra live regions, injected meta tags and
// conditionally-rendered controls. A garment failing to load is not a reason to
// also become unusable with a screen reader.
async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const seriousOrWorse = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  const advisoryContrast = seriousOrWorse.filter((v) => v.id === 'color-contrast')
  const blocking = seriousOrWorse.filter((v) => v.id !== 'color-contrast')

  if (advisoryContrast.length > 0) {
    console.warn(
      `[a11y advisory] ${name}: colour-contrast findings (not gated — deliberate design decision):\n` +
        JSON.stringify(
          advisoryContrast.flatMap((v) => v.nodes.map((n) => n.target)),
          null,
          2,
        ),
    )
  }

  expect(
    blocking,
    `structural axe violations on ${name}:\n${JSON.stringify(
      blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
      null,
      2,
    )}`,
  ).toEqual([])
}

test('product page has no serious/critical structural a11y violations', async ({ page }) => {
  await page.goto('/n001/navy')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Velocity Performance/i)
  await scan(page, 'product page')
})

test('the unavailable state is usable with a screen reader', async ({ page }) => {
  await page.goto('/zzz9/none')
  await expect(page.getByText('[ REFERENCE UNAVAILABLE ]')).toBeVisible()
  await scan(page, 'unavailable state')
})

test('the retired-colourway notice is usable with a screen reader', async ({ page }) => {
  // Adds a role="status" live region above the fold and rewrites the URL.
  await page.goto('/n001/lime')
  await expect(page.getByText(/no longer active/i)).toBeVisible()
  await scan(page, 'retired colourway notice')
})

test('the poster-only fallback is usable with a screen reader', async ({ page }) => {
  // A published product with no 3D file: no <model-viewer>, no camera buttons,
  // and a notice in their place — a materially different DOM.
  await page.goto('/n002/navy')
  await expect(page.getByText(/interactive 3D view could not load/i)).toBeVisible()
  await scan(page, 'poster-only fallback')
})

test('the expanded customisation accordion is usable with a screen reader', async ({ page }) => {
  // Collapsed content is `inert`; expanding it puts a dozen focusable elements
  // into the tab order that axe never saw in the default state.
  await page.goto('/n001/navy')
  await page.getByRole('button', { name: /how we build your product/i }).click()
  await expect(page.getByText('SHARE YOUR STARTING POINT')).toBeVisible()
  await scan(page, 'customisation accordion expanded')
})
