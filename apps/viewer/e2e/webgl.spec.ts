import { expect, test } from '@playwright/test'

/**
 * The headline feature — real WebGL. Runs only in the `webgl` project (software
 * SwiftShader). Skips cleanly if the runner has no WebGL context, so CI can
 * never red-flake on GPU availability.
 */
test('3D model loads and switching colourway changes the KHR material variant', async ({
  page,
}) => {
  // Capture any Content-Security-Policy violation from the moment the page's
  // own scripts run (the theme inline-script hash, the model-viewer chunk, the
  // GLB fetch, Draco/KTX2 workers). Registered before goto via addInitScript.
  await page.addInitScript(() => {
    ;(window as unknown as { __csp: string[] }).__csp = []
    document.addEventListener('securitypolicyviolation', (e) => {
      // Source file and line as well as the directive: a bare "connect-src
      // blocked blob" says a rule fired but not which code tripped it, which is
      // the difference between a fix and a guess.
      const where = e.sourceFile ? ` from ${e.sourceFile}:${e.lineNumber}` : ''
      ;(window as unknown as { __csp: string[] }).__csp.push(
        `${e.violatedDirective} blocked ${e.blockedURI}${where}`,
      )
    })
  })

  await page.goto('/n001/wine')

  const hasWebGL = await page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
  // FAIL, do not skip.
  //
  // This was `test.skip(!hasWebGL, …)`. That made the single most valuable test
  // in the repo — the only one that loads a real Meshopt-compressed GLB in a
  // real browser and asserts it decoded, swapped variant, and tripped no CSP
  // violation — pass silently the moment SwiftShader failed to start on a
  // runner. A green deploy would then prove nothing at all, which is the exact
  // failure shape this suite exists to catch. If the 3D path cannot be
  // exercised, that is a broken build, not a skipped test.
  expect(
    hasWebGL,
    'No WebGL context in this runner. The 3D path is unverified, so this build must not be treated as green — ' +
      'check the SwiftShader flags in playwright.config.ts rather than skipping.',
  ).toBe(true)

  const modelViewer = page.locator('model-viewer')
  await expect(modelViewer).toBeVisible()

  // The camera controls live here rather than in viewer.spec.ts, because they
  // only exist when <model-viewer> is mounted — i.e. they are a property of the
  // 3D path, not of the page. Asserting them in the DOM suite made that suite
  // depend on the runner having a GPU, which headless Firefox does not.
  await expect(page.getByRole('button', { name: 'front' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'back' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'side' })).toBeVisible()

  // The model actually finishes loading (not just the poster).
  await page.waitForFunction(
    () => Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
    undefined,
    { timeout: 20_000 },
  )

  // The selected colourway binds the matching KHR_materials_variants entry.
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-NAVY',
    undefined,
    { timeout: 20_000 },
  )

  // Switching to Black updates the bound variant — the real 3D swap.
  await page.getByRole('tab', { name: /black/i }).click()
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-BLACK',
    undefined,
    { timeout: 20_000 },
  )

  // The whole real-3D flow ran under the production CSP with no violations.
  const cspViolations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
  expect(cspViolations, cspViolations.join('\n')).toEqual([])
})

/**
 * Losing the WebGL context must not leave a dead grey rectangle.
 *
 * WHY THIS TEST EXISTS. iOS Safari caps canvas memory at 256 MB and kills the
 * context when a page crosses it, and iOS 18.2-18.4 additionally introduced
 * WebGL context-loss crashes that did not occur on 17.x. A QR code on a garment
 * tag is scanned with a phone camera, which opens iOS Safari — so this is the
 * single most likely way the headline feature dies in front of a real buyer.
 *
 * The live model is 19 MB compressed but 3,763,177 triangles: 42.7 MB of vertex
 * data and 29.2 MB of index data once decoded, all of it resident alongside the
 * textures and the canvas.
 *
 * Stage.tsx already falls back to the poster when the model fails to LOAD. This
 * is the other case — it loaded fine and the context went away afterwards — and
 * until now nothing handled it: <model-viewer> stayed mounted over a canvas that
 * would never paint again.
 */
test('a lost WebGL context is reported as such, not as a failed colour swap', async ({ page }) => {
  // WHAT THIS ASSERTS, and what it deliberately does not.
  //
  // Falling back to the poster was ALREADY the behaviour — the pre-existing
  // error handler treats an error with no recorded loaded source as a first-load
  // failure and tears down to the poster, which is the right outcome. Measured:
  // with the webglcontextlost branch removed, the stage still ends up on the
  // poster with the same notice.
  //
  // So asserting the poster proves nothing about this change. What the change
  // adds is that a lost GPU context is DISTINGUISHABLE in the diagnostics from a
  //404 on the model file. Those need different responses — one is a device
  // limit, the other is broken data — and until now both arrived as
  // `model-load-error`. That distinction is what this test pins, and it fails if
  // the branch is removed.
  const diagnostics: string[] = []
  page.on('console', (msg) => {
    if (msg.text().includes('[viewer:')) diagnostics.push(msg.text())
  })

  await page.goto('/n001/wine')
  await page.waitForFunction(
    () => Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
    undefined,
    { timeout: 20_000 },
  )

  // HOW THIS SIMULATES THE FAILURE, and why it is not `WEBGL_lose_context`.
  //
  // model-viewer 4.x renders into a SHARED, offscreen WebGL canvas and blits to
  // a per-element 2D canvas in the shadow root (verified by probing the live
  // element: the shadow canvas returns a '2d' context and the document contains
  // no other canvas). The real GL context is therefore unreachable from page
  // script, and an earlier draft of this test that called `loseContext()` on the
  // shadow canvas was silently a no-op — it asserted nothing and passed for the
  // wrong reason.
  //
  // What the library actually does on context loss is dispatch its own `error`
  // event with `detail.type = 'webglcontextlost'` — model-viewer-base.js:204:
  //   this.dispatchEvent(new CustomEvent('error',
  //     { detail: { type: 'webglcontextlost', sourceError: event.sourceEvent } }))
  // That event IS the contract between the library and this app, so it is the
  // right thing to assert against.
  await page.evaluate(() => {
    document
      .querySelector('model-viewer')!
      .dispatchEvent(
        new CustomEvent('error', { detail: { type: 'webglcontextlost', sourceError: null } }),
      )
  })

  // The garment is still represented — poster, not an empty stage.
  await expect(page.getByText(/interactive 3D view could not load/i)).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.locator('.stage img').first()).toBeVisible()

  // The part that only this change provides.
  expect(diagnostics.join('\n')).toContain('[viewer:webgl-context-lost]')
})
