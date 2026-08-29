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

  /**
   * ⚠️ RESERVED-AND-DISABLED, NEVER UNMOUNTED — and this is the only project that
   * can assert it. The row is rendered from first paint so it cannot appear ~23
   * seconds late and shove the colourway rail down mid-read; while the model is
   * still arriving the buttons are `disabled` rather than absent.
   *
   * `motion-and-layout.spec.ts` used to carry this check and it failed all four
   * viewports in CI on 2026-08-17 while passing on every local run: that suite's
   * projects have no guaranteed WebGL (headless Firefox on Linux has none, and
   * playwright.config.ts says the same of WebKit), so <Stage> correctly renders
   * the poster branch with no camera controls at all. macOS headless Firefox DOES
   * have WebGL, which is exactly why the machine could not see it. The existence
   * claim belongs where a context is guaranteed; the overlap claim stayed there.
   */
  const controlsExist = await page.locator('.stage__controls').count()
  expect(controlsExist, 'the camera control row must be rendered, not unmounted').toBe(1)

  /**
   * No snapshot of the garment behind the loading bar — the owner asked for that
   * feature gone and it was still running.
   *
   * ⚠️ IT LOOKED REMOVED AND WAS NOT, and the way it hid is the point.
   * `Stage.tsx` stopped showing its own `.stage__poster-fallback` during loading
   * on 2026-08-05, and `page.css` set `--poster-color: transparent` and
   * `--progress-mask: transparent` on the element to suppress model-viewer's
   * built-in one. Both of those custom properties were REMOVED IN
   * model-viewer 4.x — verified against the installed 4.3.1, where the only
   * survivor is `--progress-bar-color` and `#default-poster` carries a hardcoded
   * `background-color: #fff0`. So the suppression had silently done nothing for
   * an entire major version, and the `poster` attribute was still being handed
   * over and still painted as `#default-poster`'s background-image.
   *
   * Asserting the PROPERTY, not the attribute: React sets `src`-like values on a
   * custom element as properties and never reflects them (apps/viewer/CLAUDE.md),
   * so `getAttribute('poster')` is null either way and would pass vacuously.
   */
  const posterHandedOver = await page.evaluate(() => {
    const mv = document.querySelector('model-viewer') as { poster?: string | null } | null
    return mv?.poster ?? null
  })
  expect(
    posterHandedOver,
    'the garment snapshot is still being given to <model-viewer>, which paints it ' +
      'behind the loading bar — check that no `poster` prop is set in Stage.tsx',
  ).toBeNull()

  /**
   * The two gesture settings that make a phone predictable, both measured on the
   * iOS 26.5 simulator with real touch input on 2026-08-19. Neither had any test
   * at all before this, and both are single attributes that a refactor could drop
   * without a visible symptom on desktop, where nobody pinches.
   *
   * `disableTap` — model-viewer treats a sub-300ms, sub-2px touch as a command:
   * on the model it re-targets the camera, and on a MISS it runs
   * `userAdjustOrbit(0, 0, 1)`, which its own source comments as "Zoom all the
   * way out." The garment is a narrow skinsuit on a full-width canvas, so most of
   * what a thumb can land on is empty grid.
   *
   * `panSensitivity` — a pinch is also a pan, so an asymmetric one slides the
   * garment sideways. Measured: 1.0 pushed it off the screen edge, 0.3 keeps it
   * centred while a two-finger stroke still moves the view 17.5% of the frame at
   * a 4.82deg zoom. See PAN_SENSITIVITY in Stage.tsx for the full table and for
   * why 0 is not an option.
   *
   * ⚠️ PROPERTIES, not attributes — same reason as the poster check above.
   */
  const gestureConfig = await page.evaluate(() => {
    const mv = document.querySelector('model-viewer') as {
      disableTap?: boolean
      panSensitivity?: number
    } | null
    return { disableTap: mv?.disableTap ?? null, panSensitivity: mv?.panSensitivity ?? null }
  })
  expect(
    gestureConfig.disableTap,
    'tap-to-recenter is live again — a tap on the empty canvas around the garment ' +
      'will zoom it all the way out. Check `disable-tap` in Stage.tsx.',
  ).toBe(true)
  expect(
    gestureConfig.panSensitivity,
    'pan sensitivity is back to model-viewer default, so a pinch will drag the ' +
      'garment off-centre. Check `pan-sensitivity` in Stage.tsx.',
  ).toBeLessThanOrEqual(0.3)

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

  /**
   * ⚠️ THE DEPTH BIAS MUST SURVIVE A COLOURWAY CHANGE, AND FOR ONE DAY IT DID NOT.
   *
   * Printed cut-outs are pulled toward the camera so they win the depth test
   * against the cloth (src/lib/decal-depth-bias.ts). The first version applied it
   * once, on `load`. model-viewer builds only the ARRIVING variant's materials;
   * everything reachable solely through KHR_materials_variants is a lazy stub
   * whose backing three.js material does not exist yet — so on the live garment
   * the bias reached **6 of 26 decals** and four of five colourways went on
   * shattering the artwork. Nothing failed, because nothing looked.
   *
   * ⚠️ AND THE FIXTURE COULD NOT HAVE CAUGHT IT UNTIL 2026-08-27 EITHER. Its
   * colourways built byte-identical artwork materials, so `dedup()` merged them
   * into one shared, always-eager material: 6 MASK decals, 6 eager, **0 lazy**.
   * `ink` on PlaceholderColourway now tints each colourway's print as a real CLO
   * export does, giving 18 MASK, 6 eager, 12 lazy — production's shape.
   *
   * ⚠️ Both halves were verified by BREAKING them, not by reasoning. Removing the
   * `variant-applied` listener fails this on "a colourway swap left printed decals
   * un-biased"; reverting the fixture to its pre-`ink` form fails it EARLIER, on
   * "the colourway swap loaded no new cut-outs, so this assertion proves nothing".
   * That second guard is the load-bearing one — without it an inadequate fixture
   * would make this test pass while the bug shipped, which is precisely how the
   * original made it to production.
   *
   * Counted in the browser rather than asserted structurally: under jsdom
   * <model-viewer> is a stub, so this is the only place the real scene graph exists.
   */
  const countBias = () =>
    page.evaluate(() => {
      const backingOf = (
        material: object,
      ): { alphaTest: number; polygonOffset: boolean } | null => {
        for (const source of [material, Object.getPrototypeOf(material)]) {
          if (!source) continue
          for (const symbol of Object.getOwnPropertySymbols(source)) {
            if (symbol.description !== 'backingThreeMaterial') continue
            const value = (material as Record<symbol, unknown>)[symbol]
            if (value && typeof value === 'object')
              return value as { alphaTest: number; polygonOffset: boolean }
          }
        }
        return null
      }
      const mv = document.querySelector('model-viewer') as {
        model?: { materials?: readonly object[] }
      } | null
      let reachable = 0
      let biased = 0
      for (const material of mv?.model?.materials ?? []) {
        const backing = backingOf(material)
        if (!backing || !(backing.alphaTest > 0)) continue
        reachable++
        if (backing.polygonOffset) biased++
      }
      return { reachable, biased }
    })

  const onArrival = await countBias()
  expect(onArrival.reachable, 'the fixture must carry printed cut-outs to bias').toBeGreaterThan(0)
  expect(
    onArrival.biased,
    'every cut-out reachable on arrival must be biased — see decal-depth-bias.ts',
  ).toBe(onArrival.reachable)

  // Switching to Black updates the bound variant — the real 3D swap.
  await page.getByRole('tab', { name: /black/i }).click()
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-BLACK',
    undefined,
    { timeout: 20_000 },
  )

  // Black's own decal materials now exist. Two claims, and the first is what makes
  // the second mean anything: the swap must actually have brought NEW cut-outs
  // into reach, and every one of them must have been biased by the
  // `variant-applied` listener rather than left behind.
  const afterSwap = await countBias()
  expect(
    afterSwap.reachable,
    'the colourway swap loaded no new cut-outs, so this assertion proves nothing — ' +
      'check that the fixture tints its ink per colourway (PlaceholderColourway.ink)',
  ).toBeGreaterThan(onArrival.reachable)
  expect(
    afterSwap.biased,
    'a colourway swap left printed decals un-biased: they will z-fight with the ' +
      'cloth and the artwork shatters. Stage.tsx must re-apply on `variant-applied`.',
  ).toBe(afterSwap.reachable)

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

  // The visitor is told what happened — an explanation, not an empty stage.
  //
  // The expected copy changed 2026-08-14, and THIS TEST is the reason it had to.
  // The old string said "the interactive 3D view could not load", which is false
  // in precisely the case this test simulates: the model loaded, and the GPU
  // then took the context away. The replacement describes what is on screen.
  //
  // ⚠️ It changed AGAIN 2026-08-21 and this test is the reason a second time. The
  // 2026-08-14 wording ended "…so this page is showing a photograph of the
  // garment", which was true only while the stage painted a poster; the poster was
  // removed that day and the sentence was not, so this test's own subject — the
  // commonest failure a real buyer meets — would have told them to look at a
  // picture that is not there. What is asserted now is the notice's full text,
  // because matching a fragment is exactly how the stale half survived.
  const notice = page.locator('.stage__error')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  await expect(notice).toHaveText(
    'The 3D view is not available. The colours, fabric and specifications on this page are correct, and you can still send an enquiry below.',
  )
  // No image stands in for the model any more, in any state.
  await expect(page.locator('.stage img')).toHaveCount(0)

  // Added 2026-08-14: the live region must not still be offering to rotate a
  // model that is gone. The webglcontextlost branch sets fallback and now also
  // clears modelLoaded — without the second half, `loading` stays false and the
  // region falls through to "Drag to rotate, use scroll or pinch to zoom".
  const announced = (await page.locator('.stage [role="status"]').allInnerTexts()).join(' ')
  expect(announced.toLowerCase()).not.toContain('drag to rotate')

  // The part that only this change provides.
  expect(diagnostics.join('\n')).toContain('[viewer:webgl-context-lost]')
})
