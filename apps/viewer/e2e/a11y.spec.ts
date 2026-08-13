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
// ADVISORY (reported, not gated): colour-contrast AT OR ABOVE 2:1. The muted
// editorial palette is a deliberate design choice; changing token colours to
// chase WCAG-AA contrast is a design decision to make explicitly, not one this
// check should silently force. Those findings are printed so they stay visible
// and can be addressed deliberately (see the project handoff notes).
//
// HARD GATE since 2026-08-13: colour-contrast BELOW 2:1. That is not a palette
// choice, it is invisible text. The split exists because this file's blanket
// exemption let the skip link ship at 1.00:1 — see INVISIBLE_TEXT_RATIO below
// for the measurement that justifies the threshold.
//
// WHY MORE THAN ONE URL. This covered a single healthy colourway alone until
// 2026-08-03 (then `/n001/navy`, now `/n001/wine` — the slug changed on
// 2026-08-13 because navy had never existed in production), which
// is the one state on the site that is guaranteed to be healthy. Every screen a
// visitor reaches when something has gone WRONG — the unavailable page, the
// retired-colourway notice, the poster-only fallback — was unscanned, and those
// are exactly the screens carrying extra live regions, injected meta tags and
// conditionally-rendered controls. A garment failing to load is not a reason to
// also become unusable with a screen reader.
async function scan(page: Page, name: string) {
  /**
   * Let entrance animations finish before measuring colour.
   *
   * Colour contrast is the one axe rule whose result depends on WHEN you look.
   * A fading element is blended against its background, so axe reports the
   * half-way colour: measured in this suite on 2026-08-13, the entrance layer
   * produces 65 transient findings ranging from 1.07:1 to 2.09:1, none of which
   * exist a moment later. That overlaps the real bug this file now gates on —
   * the skip link sat at 1.06:1 permanently — so no threshold can separate them.
   * The distinguishing property is not how low the ratio is, it is whether it is
   * still true once the page has settled.
   *
   * Infinite animations are excluded rather than waited on: the loading
   * indicator loops until the model arrives, and waiting for it would hang.
   */
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
          )
          .every(
            (animation) => animation.playState === 'finished' || animation.playState === 'idle',
          ),
      undefined,
      { timeout: 8_000 },
    )
    .catch(() => {
      // Something is still moving after 8s. Scan anyway — a missed settle is a
      // noisy report, but skipping the scan entirely would be a missed gate.
      console.warn(`[a11y] ${name}: animations had not settled after 8s; scanning regardless`)
    })

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const seriousOrWorse = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )

  /**
   * Below this ratio, "deliberate design decision" stops being a possible
   * explanation.
   *
   * The exemption above is right about the palette and stays. It is NOT right
   * about everything it was catching. On 2026-08-13 an audit of the live site
   * found the skip link at **1.00:1** in light mode and 1.06:1 in dark — text
   * the exact colour of its own background, caused by `color: var(--page)` where
   * `--page` was never a token. This gate saw it, printed it as advisory, and
   * passed. It had been live long enough to be found by an outside audit rather
   * than by CI.
   *
   * A muted editorial palette lands in the 3–4.5 range; that argument is real and
   * this file should not override it. Nothing lands at 1:1 on purpose — that is
   * invisible text, which is a bug in every design language. Splitting the rule
   * at 2:1 keeps the judgement call advisory and makes the impossible case fail.
   *
   * Measured the same day, and the reason the threshold can be this strict: a
   * full AAA scan of the live product page, minor impacts included, returned the
   * skip link as the ONLY contrast finding on the page. The palette this
   * exemption protects already passes AA, and mostly AAA.
   */
  const INVISIBLE_TEXT_RATIO = 2

  const contrast = seriousOrWorse.filter((v) => v.id === 'color-contrast')

  /**
   * axe types `CheckResult.data` as `any`, so this key is a runtime contract, not
   * a compile-time one. Verified against axe-core 4.13.0, whose color-contrast
   * check writes `contrastRatio` and whose own message template reads
   * `${data.contrastRatio}`.
   *
   * An unreadable ratio therefore counts as ZERO — i.e. it blocks. Defaulting the
   * other way would mean that the day axe renames this field, every contrast
   * finding silently becomes advisory again and this gate quietly stops working.
   * That is the precise failure being fixed here, and it should not be
   * reintroduced as the error path.
   */
  const worstRatio = (violation: (typeof contrast)[number]) =>
    Math.min(
      ...violation.nodes.flatMap((node) =>
        node.any.map((check) => (check.data as { contrastRatio?: number })?.contrastRatio ?? 0),
      ),
    )

  const invisibleText = contrast.filter((v) => worstRatio(v) < INVISIBLE_TEXT_RATIO)
  const advisoryContrast = contrast.filter((v) => worstRatio(v) >= INVISIBLE_TEXT_RATIO)
  const blocking = [...seriousOrWorse.filter((v) => v.id !== 'color-contrast'), ...invisibleText]

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
  await page.goto('/n001/wine')
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
  await page.goto('/n002/wine')
  await expect(page.getByText(/interactive 3D view could not load/i)).toBeVisible()
  await scan(page, 'poster-only fallback')
})

test('the expanded customisation accordion is usable with a screen reader', async ({ page }) => {
  // Collapsed content is `inert`; expanding it puts a dozen focusable elements
  // into the tab order that axe never saw in the default state.
  await page.goto('/n001/wine')
  await page.getByRole('button', { name: /how we build your product/i }).click()
  await expect(page.getByText('SHARE YOUR STARTING POINT')).toBeVisible()
  await scan(page, 'customisation accordion expanded')
})
