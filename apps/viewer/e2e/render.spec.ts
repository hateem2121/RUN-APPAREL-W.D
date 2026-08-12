import { expect, test } from '@playwright/test'

/**
 * `/render` — task 13's screenshot route for task 14's automatic-poster robot.
 *
 * Chromium-only, same as webgl.spec.ts and for the same reason: the first
 * test below waits on `window.__RENDER_READY`, which this route only ever
 * sets after <model-viewer>'s `load` event fires — undetectable without a
 * real WebGL context. playwright.config.ts's DOM_SUITE regex now matches
 * this file too, so it runs under the `webgl` project (software SwiftShader)
 * and is excluded from the four DOM-only projects, exactly like webgl.spec.ts.
 * The second test needs no WebGL at all (it only checks a navigation's HTTP
 * status), but there is no value in re-running a host-string check across
 * four more browser engines, so it stays in this file rather than
 * viewer.spec.ts.
 *
 * ⚠️ THE FIXTURE. `/fixtures/n001.glb` (served by e2e/serve.mjs from
 * tools/asset-pipeline/output/n001.glb, built by `pnpm seed:assets`) is the
 * SAME Meshopt-compressed, three-variant file webgl.spec.ts already loads —
 * reused deliberately rather than building a second one. This repo has a
 * documented pattern of production bugs invisible because a seeded fixture
 * could not exhibit the failure (root CLAUDE.md): an uncompressed placeholder
 * would never have exercised the Meshopt decoder path (blob: in connect-src)
 * or proven a real KHR_materials_variants swap. What this fixture does NOT
 * prove: it carries no printed artwork, so it says nothing about whether a
 * poster taken through this route would show a torn logo — that risk lives in
 * the asset pipeline's own decimation step (CLAUDE.md's "three blocking gates
 * do NOT catch decimation damage"), not in this route, which only points a
 * camera at whatever geometry and materials the file already has.
 */
test('render route signals ready and shows only the model', async ({ page }) => {
  const params = new URLSearchParams({
    model: '/fixtures/n001.glb',
    variant: 'N001-NAVY',
    orbit: '0deg 82deg 105%',
    fov: '30deg',
  })
  await page.goto(`/render?${params.toString()}`)
  await page.waitForFunction(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY === true,
    null,
    { timeout: 60_000 },
  )
  await expect(page.locator('header, nav, footer')).toHaveCount(0)

  // Requirement 3 (task 13 brief), proven rather than assumed: `src` was
  // assigned as a JS property, not left inert as an HTML attribute someone
  // wrote into markup, and the model actually finished loading.
  const modelViewer = page.locator('model-viewer')
  await expect(modelViewer).toBeVisible()
  const loaded = await page.evaluate(
    () => (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded,
  )
  expect(loaded).toBe(true)
  const variantName = await page.evaluate(
    () => (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName,
  )
  expect(variantName).toBe('N001-NAVY')

  /**
   * ⚠️ THE INCIDENT THIS PINS (2026-08-08, task 13 review finding 3).
   * <model-viewer>'s `min-field-of-view` defaults to **12deg**, and it
   * SILENTLY ignores anything tighter — no error, just a wider frame than
   * asked for. Measured on the real N001 baseline: four renders at
   * 1.4°/2°/3.1°/4.5° came back BYTE-IDENTICAL, which meant any print
   * smaller than roughly a hand was unphotographable and nothing said so
   * (full detail: tools/asset-pipeline/src/render.test.ts, which pins the
   * SAME fact for the offline harness). RenderPage.tsx sets the attribute
   * (`min-field-of-view="1deg"`), but until now nothing here checked it —
   * a future refactor could drop it, the suite would stay green, and every
   * poster this route takes for a print smaller than a hand would silently
   * go back to being unusable, exactly like the original incident.
   */
  const minFieldOfView = await page.evaluate(() =>
    document.querySelector('model-viewer')?.getAttribute('min-field-of-view'),
  )
  expect(minFieldOfView).toBe('1deg')
})

test('task 14 review finding 1: an in-page variant swap re-renders without a fresh navigation', async ({
  page,
}) => {
  // capturePosters (apps/shrink/src/index.ts) navigates ONCE per garment and
  // calls window.__renderSetVariant once per remaining colour, instead of a
  // fresh page.goto() per colour — Cloudflare Browser Rendering bills on
  // session-seconds, and a navigation reruns the Meshopt decode/GPU
  // upload/scene build (the dominant cost) on every colour instead of once.
  // This proves the swap actually re-renders, not just that a flag flips:
  // __RENDER_READY must be OBSERVED false, not just eventually true again
  // (a stale "already true" would let a screenshot loop race ahead and
  // capture the PREVIOUS colour under the new one's filename), and the
  // element's own variantName must end up on the NEW colour.
  //
  // The false→true transition is caught with a property interceptor
  // installed on `window`, not by polling for it — the two chained
  // requestAnimationFrames in RenderPage.tsx settle in roughly two frames
  // (~33ms), which a poll could step over and report a false pass for the
  // wrong reason (the exact failure shape CLAUDE.md warns about elsewhere
  // in this repo: a test that cannot actually witness the thing it claims
  // to test).
  const params = new URLSearchParams({
    model: '/fixtures/n001.glb',
    variant: 'N001-NAVY',
    orbit: '0deg 82deg 105%',
    fov: '30deg',
  })
  await page.goto(`/render?${params.toString()}`)
  await page.waitForFunction(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY === true,
    null,
    { timeout: 60_000 },
  )

  await page.evaluate(() => {
    const w = window as unknown as { __RENDER_READY?: boolean; __readyLog?: unknown[] }
    w.__readyLog = []
    let value = w.__RENDER_READY
    Object.defineProperty(window, '__RENDER_READY', {
      configurable: true,
      get: () => value,
      set: (v) => {
        value = v
        w.__readyLog?.push(v)
      },
    })
  })

  await page.evaluate(() => {
    ;(
      window as unknown as {
        __renderSetVariant?: (t: { variant: string; orbit: string; fov: string }) => void
      }
    ).__renderSetVariant?.({ variant: 'N001-BLACK', orbit: '0deg 82deg 105%', fov: '30deg' })
  })
  await page.waitForFunction(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY === true,
    null,
    { timeout: 60_000 },
  )

  const log = await page.evaluate(
    () => (window as unknown as { __readyLog?: unknown[] }).__readyLog,
  )
  expect(log).toEqual([false, true])

  const variantName = await page.evaluate(
    () => (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName,
  )
  expect(variantName).toBe('N001-BLACK')

  // Still exactly one <model-viewer> and still no chrome — a swap that
  // accidentally remounted the element, or that a bug made fall through to
  // the query-string path again, would still pass the assertions above by
  // coincidence; this rules that out.
  await expect(page.locator('model-viewer')).toHaveCount(1)
  await expect(page.locator('header, nav, footer')).toHaveCount(0)
})

test('refuses a model from anywhere but our own media host', async ({ page }) => {
  const response = await page.goto('/render?model=https://example.com/evil.glb')
  expect(response?.status()).toBe(400)
})

test('refuses a request with no model at all', async ({ page }) => {
  // Not from the task 13 brief's own test list, but the same guard handles it
  // (renderGuard.ts's isAllowedRenderModel treats a missing model as
  // disallowed) — worth pinning here since an absent required param is an
  // easy thing to leave unhandled.
  const response = await page.goto('/render')
  expect(response?.status()).toBe(400)
})

test('requirement 5: a webglcontextlost-shaped error is handled via model-viewer’s own event, not the real DOM one', async ({
  page,
}) => {
  // apps/viewer/CLAUDE.md: the REAL `webglcontextlost` DOM event never
  // reaches a listener added the ordinary way on <model-viewer> — it fires on
  // the shadow-root <canvas> and is not composed. The library's own contract
  // is its `error` event with `detail.type === 'webglcontextlost'` instead.
  // Real context loss cannot be triggered deterministically, so this
  // dispatches the synthetic event AFTER a real load — same technique
  // webgl.spec.ts's own context-loss test uses — and asserts on the console
  // line RenderPage.tsx's handler logs, not just "nothing crashed": a
  // missing or misnamed listener would ALSO leave the page looking fine,
  // which is exactly the kind of test this repo has a documented pattern of
  // writing by accident.
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  const params = new URLSearchParams({
    model: '/fixtures/n001.glb',
    variant: 'N001-NAVY',
    orbit: '0deg 82deg 105%',
    fov: '30deg',
  })
  await page.goto(`/render?${params.toString()}`)
  await page.waitForFunction(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY === true,
    null,
    { timeout: 60_000 },
  )

  await page.evaluate(() => {
    document
      .querySelector('model-viewer')!
      .dispatchEvent(
        new CustomEvent('error', { detail: { type: 'webglcontextlost', sourceError: null } }),
      )
  })

  expect(consoleErrors.some((line) => line.includes('webglcontextlost'))).toBe(true)
  // The handler only logs — it must never retroactively clear a readiness
  // flag Part B's screenshot loop may already have acted on.
  const stillReady = await page.evaluate(
    () => (window as unknown as { __RENDER_READY?: boolean }).__RENDER_READY,
  )
  expect(stillReady).toBe(true)
})
