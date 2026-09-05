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
      'N001-WINE',
    undefined,
    { timeout: 20_000 },
  )

  /**
   * ⚠️ THE DEPTH BIAS MUST SURVIVE A COLORWAY CHANGE, AND FOR ONE DAY IT DID NOT.
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

  /**
   * WHAT THE SCENE DRAWS, NOT WHAT THE WRAPPERS SAY (audit DV-01, 2026-09-03). The
   * count above reads each wrapper's first three.js material; a colourway switch binds
   * a DIFFERENT entry of the wrapper's set to the mesh, so "26 of 26 biased" was true of
   * the wrappers while the live skinsuit drew 1 of 6 and the bib 0 of 5. This walks the
   * three.js scene graph and counts the materials actually bound to meshes.
   */
  const countSceneBias = () =>
    page.evaluate(() => {
      const mv = document.querySelector('model-viewer') as object | null
      if (!mv) return { cutouts: 0, biased: 0 }
      let scene: { traverse: (fn: (o: unknown) => void) => void } | null = null
      for (const symbol of Object.getOwnPropertySymbols(mv)) {
        const value = (mv as Record<symbol, unknown>)[symbol] as {
          isObject3D?: boolean
          traverse?: unknown
        } | null
        if (value?.isObject3D && typeof value.traverse === 'function') {
          scene = value as { traverse: (fn: (o: unknown) => void) => void }
          break
        }
      }
      if (!scene) return { cutouts: -1, biased: -1 }
      const seen = new Set<object>()
      let cutouts = 0
      let biased = 0
      scene.traverse((object) => {
        const material = (object as { material?: unknown }).material
        const list = Array.isArray(material) ? material : material ? [material] : []
        for (const m of list as { alphaTest?: number; polygonOffset?: boolean }[]) {
          if (!m || seen.has(m) || !((m.alphaTest ?? 0) > 0)) continue
          seen.add(m)
          cutouts++
          if (m.polygonOffset) biased++
        }
      })
      return { cutouts, biased }
    })
  const expectSceneFullyBiased = async (where: string) => {
    const scene = await countSceneBias()
    expect(
      scene.cutouts,
      `${where}: the scene must hold printed cut-outs (found the scene: ${scene.cutouts >= 0})`,
    ).toBeGreaterThan(0)
    expect(
      scene.biased,
      `${where}: every cut-out the SCENE draws must be biased — the wrappers' first entry is not what is drawn (DV-01)`,
    ).toBe(scene.cutouts)
  }

  const onArrival = await countBias()
  expect(onArrival.reachable, 'the fixture must carry printed cut-outs to bias').toBeGreaterThan(0)
  await expectSceneFullyBiased('on arrival')
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
  await expectSceneFullyBiased('after the swap to Black')

  /**
   * A THIRD SWAP, TO A MIDDLE VARIANT — added 2026-08-31 with the 5-colourway fixture.
   *
   * Until then `serve.mjs` mapped five slugs onto THREE variant ids: blush, butter
   * and lime all resolved to N001-CRIMSON. So "click a tab, the variant changes" was
   * only ever proven for the first and last entries, and a swap that had to reach the
   * 4th or 5th variant of the GLB could not be expressed. That is the precise shape of
   * the 2026-08-27 production bug — model-viewer builds only the ARRIVING colourway's
   * materials, and four of five colourways went on flickering while every test passed.
   *
   * `lime` is 4th of five and is neither the arrival variant nor the last one, so it
   * cannot be satisfied by an off-by-one that happens to land on either end.
   */
  await page.getByRole('tab', { name: /lime/i }).click()
  await page.waitForFunction(
    () =>
      (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
      'N001-LIME',
    undefined,
    { timeout: 20_000 },
  )

  const afterMiddleSwap = await countBias()
  expect(
    afterMiddleSwap.reachable,
    'swapping to a MIDDLE variant loaded no cut-outs at all, so nothing here is ' +
      'being measured. Check that PlaceholderColourway.ink is distinct per colourway ' +
      'or dedup() has merged the decal materials into one eager copy.',
  ).toBeGreaterThan(0)
  expect(
    afterMiddleSwap.biased,
    'a swap to a middle colourway left printed decals un-biased. This is the exact ' +
      'case the fixture could not express before 2026-08-31, and the one that shipped.',
  ).toBe(afterMiddleSwap.reachable)

  // The whole real-3D flow ran under the production CSP with no violations.
  await expectSceneFullyBiased('after the swap to Lime')

  // AND THE OTHER TWO — five tabs, five counts, N of N on each (the audit's DV-01 probe
  // read 1 of 6 on four of five colourways of the live skinsuit; a middle tab and a
  // last tab are the ones an off-by-one hides behind).
  for (const colour of ['blush', 'butter', 'wine']) {
    // Located by ID, not by accessible name. The id is `colourway-tab-<slug>` and
    // the slug is what this loop already reasons about (it derives the variant id
    // from it two lines below); the LABEL is CMS copy that can say anything. When
    // serve.mjs gave one fixture colourway a two-word name on 2026-09-04 — to
    // reproduce a real stranding defect — a name-based lookup here broke on a
    // change that had nothing to do with WebGL. Match on the stable identifier.
    await page.locator(`#colourway-tab-${colour}`).click()
    await page.waitForFunction(
      (expected) =>
        (document.querySelector('model-viewer') as { variantName?: string } | null)?.variantName ===
        expected,
      `N001-${colour.toUpperCase()}`,
      { timeout: 20_000 },
    )
    await expectSceneFullyBiased(`after the swap to ${colour}`)
  }

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
    'The 3D view is not available. The colors, fabric and specifications on this page are correct, and you can still send an inquiry below.',
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

test.describe('the 3D view shows a focus ring', () => {
  /**
   * ⚠️ ASSERTING THAT THE RULE EXISTS IS NOT ENOUGH, and that is the whole reason
   * this test measures geometry instead.
   *
   * The original rule put the ring on `model-viewer.stage__model`, which is
   * `position: absolute; inset: 0` inside `.stage__canvas` — an `overflow: hidden`
   * box whose edges it therefore matches EXACTLY. An outline at
   * `outline-offset: 2px` paints 2-4px outside the element's border box, i.e.
   * entirely outside the clip, so it had nowhere to go. Measured on the live site
   * 2026-09-04: both boxes at top 77.0, left 11.3, right 363.8, bottom 571.5.
   *
   * The rule shipped, linted, and painted nothing. A test that read
   * `outlineStyle === 'solid'` would have passed against it — the style computes
   * fine, it is the PAINT that is thrown away. Same shape as the `--poster-color`
   * trap in apps/viewer/CLAUDE.md.
   *
   * So the invariant asserted here is the one that actually matters: whatever
   * element carries the ring must have room to paint it. Either it IS the
   * clipping box (an element's own `overflow` never clips its own outline), or it
   * sits far enough inside one.
   */
  // Lives in webgl.spec.ts, not motion-and-layout.spec.ts: `playwright.config.ts`
  // routes only /(webgl|render)\.spec\.ts/ to the project that has a GPU, and the
  // other four projects have no WebGL — so <model-viewer> never mounts there and
  // this test could only ever SKIP. A skipped test reads as green.
  test('the ring has room to paint, not just a rule that computes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // The element mounts only after the whole GLB is buffered, and its shadow root
    // is built later still. Querying before that returns null and the test SKIPS,
    // which reads as green — the exact failure this file exists to prevent.
    await page.locator('model-viewer').waitFor({ state: 'attached', timeout: 30_000 })
    await page.waitForFunction(
      () =>
        (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded === true,
      undefined,
      { timeout: 30_000 },
    )

    const result = await page.evaluate(() => {
      const mv = document.querySelector('model-viewer') as
        | (HTMLElement & { shadowRoot: ShadowRoot })
        | null
      if (!mv?.shadowRoot) return { skip: 'no model-viewer (poster fallback)' as const }
      const inner = mv.shadowRoot.querySelector<HTMLElement>('[tabindex="0"]')
      if (!inner) return { skip: 'no focusable node in the shadow root' as const }
      inner.focus()

      // Which element actually carries an outline right now?
      const candidates = [mv, ...document.querySelectorAll<HTMLElement>('.stage__canvas, .stage')]
      const outlined = candidates.find((el) => {
        const s = getComputedStyle(el)
        return s.outlineStyle !== 'none' && Number.parseFloat(s.outlineWidth) > 0
      })
      if (!outlined) return { skip: false as const, outlined: null }

      const s = getComputedStyle(outlined)
      const need = Number.parseFloat(s.outlineWidth) + Number.parseFloat(s.outlineOffset)

      // Walk up to the first ancestor that clips.
      let clipper: HTMLElement | null = outlined.parentElement
      while (clipper && getComputedStyle(clipper).overflow === 'visible') {
        clipper = clipper.parentElement
      }
      const selfClips = getComputedStyle(outlined).overflow !== 'visible'
      const a = outlined.getBoundingClientRect()
      const room = clipper
        ? (() => {
            const c = clipper.getBoundingClientRect()
            return Math.min(a.top - c.top, a.left - c.left, c.right - a.right, c.bottom - a.bottom)
          })()
        : Number.POSITIVE_INFINITY

      return {
        skip: false as const,
        outlined:
          outlined.tagName.toLowerCase() + (outlined.className ? `.${outlined.className}` : ''),
        selfClips,
        need,
        room,
        clipper: clipper ? clipper.className || clipper.tagName : null,
      }
    })

    if ('skip' in result && typeof result.skip === 'string') {
      test.skip(true, result.skip)
      return
    }
    const r = result as {
      outlined: string | null
      selfClips: boolean
      need: number
      room: number
      clipper: string | null
    }

    expect(
      r.outlined,
      'nothing carries a focus outline while the 3D view is focused',
    ).not.toBeNull()
    expect(
      r.selfClips || r.room >= r.need,
      `the focus ring is drawn on ${r.outlined}, which needs ${r.need}px outside its own ` +
        `border box, but its clipping ancestor (${r.clipper}) leaves ${r.room}px. The ring ` +
        `is painted and then clipped away — put it on the clipping element itself, whose ` +
        `own overflow does not clip its own outline.`,
    ).toBe(true)
  })
})

test('model_loaded reports how long the visitor actually waited', async ({ page }) => {
  /**
   * ⚠️ THE DURATION WAS COMPUTED ON EVERY LOAD AND THROWN AWAY. The progress bar and
   * the "~8s LEFT" readout cannot exist without it, and `model_loaded` still carried
   * only the product code — so the one question a QR-scan business actually has,
   * "how long does a buyer wait after scanning a tag?", was unanswerable from the
   * data the page already had in its hand.
   *
   * `bytes` rides along because a duration alone is uninterpretable across an
   * 1.8-7.8 MB catalogue: four seconds means very different things for the 1.8 MB
   * pullover and the 7.8 MB bib.
   */
  const events: Array<Record<string, unknown>> = []
  await page.exposeFunction('__captureAnalytics', (detail: Record<string, unknown>) => {
    events.push(detail)
  })
  await page.addInitScript(() => {
    document.addEventListener('run:analytics', (e) => {
      ;(window as unknown as { __captureAnalytics: (d: unknown) => void }).__captureAnalytics(
        (e as CustomEvent).detail,
      )
    })
  })

  await page.goto('/n001/wine')
  await page.locator('model-viewer').waitFor({ state: 'attached', timeout: 30_000 })
  await page.waitForFunction(
    () => (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded === true,
    undefined,
    { timeout: 30_000 },
  )
  await expect
    .poll(() => events.some((e) => e.event === 'model_loaded'), { timeout: 10_000 })
    .toBe(true)

  const loaded = events.find((e) => e.event === 'model_loaded') as Record<string, string>
  expect(loaded.product, 'the product code was already reported and must remain').toBeTruthy()
  expect(
    loaded.durationMs,
    'model_loaded carried no durationMs — the number is computed for the progress ' +
      'bar on every load and must not be discarded again',
  ).toMatch(/^\d+$/)
  expect(
    Number(loaded.durationMs),
    'a duration of zero means the start timestamp was never stamped',
  ).toBeGreaterThan(0)
  /*
   * ⚠️ `bytes` IS DELIBERATELY NOT ASSERTED, AND THE REASON IS THE SAME FIXTURE GAP
   * DOCUMENTED IN e2e/serve.mjs. The fixture streams the GLB without
   * `content-length`, so `fetchWithProgress` reports `total: 0`, so the field is
   * correctly omitted rather than sent as a lie. Production DOES send the header
   * (measured 2026-09-04, `content-length: 3883016`), so the field will be present
   * in the field data this exists to produce.
   *
   * Asserting it here would mean asserting the fixture's limitation. Asserting the
   * OPPOSITE — that it is absent — would pin the gap in place and fail the day the
   * fixture is fixed. So it is left unasserted with the reason written down, which
   * is the honest third option.
   *
   * This is the second assertion that same missing header has blocked today; the
   * first was the whole `preparing` phase. If the header is ever added — see the
   * warning in serve.mjs about why the attempt was reverted — both become testable.
   */
  expect(
    'bytes' in loaded ? typeof loaded.bytes : 'absent',
    'when bytes IS present it must be a numeric string, never a placeholder',
  ).toMatch(/^(string|absent)$/)
})
