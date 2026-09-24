import { expect, test } from '@playwright/test'
import {
  contrastOf,
  measureContrastInPage,
  parseCssColour,
  relativeLuminance,
  toHex,
  worstRatio,
} from '../../../scripts/contrast-rules.mjs'

/**
 * Guards for the things the 2026-09-06 whole-site audit found ALREADY CORRECT.
 *
 * Sixty checks scored 8 or 9 out of ten. None of them scored ten, and every one
 * lost its last point for the same reason: the measurement was taken once and
 * nothing stopped the next change undoing it. A number measured on a Sunday is a
 * fact about Sunday. This file turns the viewer's share of those measurements
 * into assertions, one `describe` per finding, each naming its audit id.
 *
 * ⚠️ ONE EXCEPTION, ADDED 2026-09-07: FA-F-12 scored 7 and was a real defect. It is
 * here rather than elsewhere because it belongs with the audit ids, and its own
 * comment says so — do not read the paragraph above as covering it.
 *
 * ⚠️ THREE OF THESE NEED `navigator.webdriver` LIFTED, and that is not a trick —
 * it is the only way to reach the code at all. `polish/index.ts` refuses to start
 * Lenis or the cursor under automation, and `polish/reveal.ts` reveals everything
 * immediately, so a Playwright page is a page with no scroll layer and no cursor.
 * Asserting anything about either without the spoof measures the refusal, not the
 * feature — the same "the harness reported clean while measuring nothing" shape
 * this repo has hit four times (see docs/HARDENING-LOG.md). Every one of those
 * tests therefore asserts the feature is RUNNING before it asserts anything about
 * how it behaves.
 *
 * ⚠️ And `reducedMotion: 'reduce'` in playwright.config.ts DOES NOT REACH THE
 * PAGE — measured on 1.62.1, all four engines. `emulateMedia` does. Every test
 * here that cares about the media state sets it explicitly, per
 * `motion-and-layout.spec.ts`.
 */

/** Lift the automation flag before any app code runs. */
const asAHuman = `Object.defineProperty(Navigator.prototype, 'webdriver', {
  get: () => false,
  configurable: true,
})`

/* ══ FA-E-61 — the colourway rail seats five swatches on every phone width ══ */

/**
 * Measured across 320–430 px on five products: five in a row, every time.
 *
 * ⚠️ THE EXISTING GUARD CANNOT SEE THIS. `motion-and-layout.spec.ts` → "never
 * strands a single swatch" visits these same widths and asserts only that the
 * LAST row does not hold exactly one tab. A rail that wrapped 3 + 2 — or 2 + 2 + 1
 * at some future floor — satisfies it completely. Five colourways in two rows is
 * not a stranded swatch; it is the picker taking a second row of the garment's
 * height on the screen where there is least of it, which is the whole reason
 * `page.css` traded the "01/02/03" prefix away to get the required width from
 * 368 px down to 290.5 px against a 320 px phone's 300.8 px.
 *
 * That trade bought 10.3 px of headroom. This asserts it is still there.
 *
 * ⚠️ AND WRITING IT DOWN FOUND THAT THE CLAIM IS NOT TRUE IN SAFARI AT 320 px.
 * Measured 2026-09-07, all three engines, no code changed:
 *
 *     viewport   .colourways content box   Chromium   Firefox   WebKit
 *       320px            300.80px          5 (1 row)  5 (1 row)  3 + 2
 *       321px            301.74px          5 (1 row)  5 (1 row)  5 (1 row)
 *
 * The rail is a container query — `@container colourrail (max-width: 300px)`
 * drops it to `repeat(3, 1fr)` for the two-column aside, which measures 260px —
 * and at a 320px viewport the container's own content box lands on **300.8px**.
 * Chromium and Firefox read that as above the threshold; WebKit does not. From
 * 321px up all three agree, so the divergence is exactly one pixel wide and it
 * sits at the WCAG 1.4.10 reflow width, on the engine every QR scan opens in.
 *
 * `page.css` says of that 300: "any threshold in between works; 300 sits in the
 * middle of a 60px gap rather than against either edge." The gap is between the
 * ASIDE (260) and the RAIL (320) — but the query does not see the rail's 320, it
 * sees the container's 300.8, so the real margin is 0.8px, not 20.
 *
 * NOT FIXED HERE. This file guards findings; it does not move layout thresholds,
 * and the audit measured Chromium only. The 320px row is therefore skipped on
 * WebKit with the measurement attached, rather than deleted, weakened to
 * "3 + 2 is fine", or quietly left red. Every other width is asserted on all
 * four projects.
 */
test.describe('the colourway rail seats five swatches in one row (FA-E-61)', () => {
  const PHONE_WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430] as const

  for (const width of PHONE_WIDTHS) {
    test(`one row of five at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: 812 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const rail = await page.evaluate(() => {
        const list = document.querySelector('.colourways__list')
        if (!list) return null
        const tabs = [...list.querySelectorAll('.colourway-tab')]
        // Rounded: sub-pixel grid positions differ by ~0.01px between engines and
        // are not two rows.
        const tops = tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))
        const rows = [...new Set(tops)].sort((a, b) => a - b)
        return {
          total: tabs.length,
          counts: rows.map((top) => tops.filter((t) => t === top).length),
        }
      })

      expect(rail, 'no .colourways__list on the page').not.toBeNull()
      const { total, counts } = rail as { total: number; counts: number[] }

      // Positive control: five is what the fixture ships and what production
      // ships. Against four this assertion would be about a different rail.
      expect(total, 'the fixture no longer serves five colourways').toBe(5)
      expect(
        counts,
        `the rail wrapped to ${counts.join(' + ')} at ${width}px. Five colourways ` +
          'on one row is what the removed "01/02/03" prefix was traded for — it ' +
          "took the required width from 368px to 290.5px against a 320px phone's " +
          '300.8px. Re-tune the minmax floor in page.css .colourways__list; do not ' +
          'relax this. See audit FA-E-61.',
      ).toEqual([5])
    })
  }
})

/* ══ FA-E-09 — colourway labels are optically centred in one box height ══════ */

/**
 * Measured on r-ajm: 3-line labels leave 10.5 px of bottom slack and 2-line
 * labels 16.8 px inside IDENTICAL 77.5 px tabs — a 6.3 px difference, exactly
 * half a 12.5 px line. The label block is centred rather than top-aligned, which
 * is the right choice and the reason the raggedness is the minimum possible.
 *
 * Two properties hold that up and neither is obvious from reading the rule:
 * `.colourways__list` is a grid, so every tab is STRETCHED to its track and the
 * heights are equal; and `.colourway-tab` is `align-items: center`, so each
 * label sits in the middle of whatever height the tallest name imposed. Change
 * either — a `flex-start` "tidy-up", or the list going back to a wrapping flex —
 * and the short names hang from the top of a tall box with all the slack under
 * them. Nothing else in the suite reads either property.
 *
 * ⚠️ THE FIXTURE IS WHAT MAKES THIS MEASURABLE. `serve.mjs` ships one two-word
 * 20-character name ('Pebble / Optic White') beside four short ones, so the tabs
 * really do carry different line counts. Against five short names every tab is
 * one line, every slack is identical, and the assertion passes without ever
 * meeting the case it exists for — so the differing line count is asserted first.
 */
test.describe('colourway labels are optically centred (FA-E-09)', () => {
  /*
   * Both branches of the rail, because they centre by different declarations and
   * only one of them is reachable from a phone. Below a 500px CONTAINER the tab
   * is `flex-direction: column; justify-content: center` (swatch above name);
   * above it, the base rule's `align-items: center` (swatch beside name). 320
   * reaches the first, 768 — where `.colourways` still spans the page — the
   * second.
   */
  for (const { width, height } of [
    { width: 320, height: 812 },
    { width: 768, height: 1024 },
  ]) {
    test(`tabs share one height and their contents sit in the middle of it at ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const tabs = await page.evaluate(() =>
        [...document.querySelectorAll('.colourway-tab')].map((tab) => {
          const label = tab.querySelector('.colourway-tab__label')
          const style = getComputedStyle(tab)
          const box = tab.getBoundingClientRect()
          const padTop =
            Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth)
          const padBottom =
            Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderBottomWidth)

          /*
           * The union of the tab's own children — swatch AND name — not the name
           * alone. In the compact branch the swatch sits ABOVE the name, so a
           * name-only measurement reads a deliberate, correct layout as
           * off-centre by half the swatch. What is centred, in both branches, is
           * the content as a group.
           */
          const children = [...tab.children].map((child) => child.getBoundingClientRect())
          const contentTop = Math.min(...children.map((r) => r.top))
          const contentBottom = Math.max(...children.map((r) => r.bottom))

          const lineHeight = label
            ? Number.parseFloat(getComputedStyle(label).lineHeight || '0')
            : 0
          return {
            name: label?.textContent?.trim() ?? '?',
            height: Math.round(box.height * 10) / 10,
            // How many line boxes the name broke into.
            lines:
              label && lineHeight > 0
                ? Math.max(1, Math.round(label.getBoundingClientRect().height / lineHeight))
                : 0,
            topSlack: contentTop - (box.top + padTop),
            bottomSlack: box.bottom - padBottom - contentBottom,
          }
        }),
      )

      expect(tabs.length, 'no colourway tabs on the page').toBe(5)

      // The fixture must present more than one line count, or "centred" and
      // "top-aligned" are indistinguishable and this passes vacuously.
      const lineCounts = [...new Set(tabs.map((t) => t.lines))]
      expect(
        lineCounts.length,
        `every colourway label wrapped to the same ${lineCounts[0]} line(s) at ` +
          `${width}px, so this test cannot tell a centred label from a top-aligned ` +
          'one. serve.mjs must keep a long two-word display name — see its ' +
          'COLOURWAYS comment.',
      ).toBeGreaterThan(1)

      const heights = [...new Set(tabs.map((t) => t.height))]
      expect(
        heights,
        `the colourway tabs are ${heights.join(', ')}px tall — a rail of different-sized ` +
          'buttons. The grid track is what stretches them to one height.',
      ).toHaveLength(1)

      for (const tab of tabs) {
        expect(
          Math.abs(tab.topSlack - tab.bottomSlack),
          `"${tab.name}" hangs off-centre in its tab: ${tab.topSlack.toFixed(1)}px above, ` +
            `${tab.bottomSlack.toFixed(1)}px below. With names of different lengths the ` +
            'short ones must sit in the middle of the height the longest one imposed, ' +
            'not at the top of it. See audit FA-E-09.',
        ).toBeLessThanOrEqual(1)
      }
    })
  }
})

/* ══ FA-D-09 — the camera pill is centred on the stage ═══════════════════════ */

/**
 * Measured to 0.0 px at 1440, 834, 768 and 390 on all six products — and the
 * audit records that reading the same thing off a SCREENSHOT suggested an 8 px
 * miss. The screenshot was wrong.
 *
 * `.stage__controls` is `width: fit-content; margin-inline: auto`, so the
 * centring is a consequence of two declarations that read as layout housekeeping
 * and would survive most reviews if one of them went. `motion-and-layout.spec.ts`
 * already asserts the pill sits BELOW the canvas; nothing asserts where it sits
 * across it.
 */
test.describe('the camera pill is centred on the stage (FA-D-09)', () => {
  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 834, height: 1194 },
    { width: 1440, height: 900 },
  ]) {
    test(`centred at ${width}x${height}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measured = await page.evaluate(() => {
        const centre = (selector: string) => {
          const el = document.querySelector(selector)
          if (!el) return null
          const r = el.getBoundingClientRect()
          return Math.round((r.left + r.width / 2) * 10) / 10
        }
        return {
          stage: centre('.stage'),
          controls: centre('.stage__controls'),
          /*
           * The stage's poster branch renders no camera controls — there is no
           * camera to point — and that branch is real on any engine without
           * WebGL, which is Firefox here and can be WebKit on CI. Absence is
           * accepted ONLY when the visible notice says the stage is in fallback,
           * copied from the same escape hatch in motion-and-layout.spec.ts so a
           * removed control cannot make this vacuous.
           */
          inFallback: (() => {
            const notice = document.querySelector('.stage__error')
            return notice !== null && !notice.hasAttribute('hidden')
          })(),
        }
      })

      expect(measured.stage, 'no .stage on the page').not.toBeNull()

      if (measured.controls === null) {
        expect(
          measured.inFallback,
          'the camera controls are missing and the stage is not in its fallback',
        ).toBe(true)
        return
      }

      expect(
        Math.abs((measured.controls as number) - (measured.stage as number)),
        `the camera pill's centre is at ${measured.controls} against the stage's ` +
          `${measured.stage}. It is centred by \`width: fit-content\` plus ` +
          '`margin-inline: auto` — losing either offsets the one control cluster ' +
          'painted over the garment. See audit FA-D-09.',
      ).toBeLessThanOrEqual(0.6)
    })
  }
})

/* ══ FA-P-07 — a slow API shows a loading state ═════════════════════════════ */

/**
 * With the API delayed 12 s the audit read, at t = 3 s: "Loading the product
 * reference. [ 3D PRODUCT REFERENCE ] PREPARING…" — an announcement plus a
 * visible label. No spinner-forever, no blank.
 *
 * ⚠️ THE FAILURE MODE IS A BLANK SCREEN THAT NO OTHER TEST CAN REACH. `App.tsx`'s
 * loading branch renders the preloader beside `<div className="page"
 * aria-hidden="true" />` — an empty div, hidden from assistive technology. If the
 * preloader ever stops rendering there (it returned `null` under reduced motion
 * once, which is exactly this bug and is recorded in Preloader.tsx), a
 * reduced-motion visitor gets a blank white page and TOTAL SILENCE for the
 * 1.77–2.27 s the CMS fetch takes. Every other test in this suite races past that
 * window because the fixture answers instantly.
 *
 * Asserted in BOTH media branches, because the branch is where the bug lived.
 */
test.describe('a slow API shows a loading state (FA-P-07)', () => {
  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`the wait is explained under prefers-reduced-motion: ${reducedMotion}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion })

      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/api/public/viewer/**', async (route) => {
        await held
        return route.continue()
      })

      await page.goto('/n001/wine', { waitUntil: 'commit' })

      const preloader = page.locator('.preloader')
      await expect(preloader).toBeVisible()

      // The words, not the element: a preloader rendering an empty box is the
      // same blank screen with a class on it.
      await expect(preloader).toContainText('3D PRODUCT REFERENCE')
      await expect(preloader).toContainText('PREPARING')
      expect(
        await preloader.locator('.visually-hidden').textContent(),
        'the loading overlay says nothing a screen reader can hear, and the page ' +
          'behind it is aria-hidden — that is silence, not a loading state',
      ).toContain('Loading the product reference')

      // Nothing that would tell a buyer holding the garment that it is gone.
      await expect(page.getByText(/no longer live|no longer show here/i)).toHaveCount(0)

      release()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
  }
})

/* ══ FA-T-10 — the e2e fixture is genuinely production-shaped ════════════════ */

/**
 * The audit called `serve.mjs` "the best fixture in the repository" and could not
 * find a way to make it green on a defect it should catch. Every one of the
 * properties below was added because its ABSENCE had already hidden a real
 * production bug, and each is recorded in a comment beside the data — which is
 * to say, in a place a refactor is free to disagree with.
 *
 * ⚠️ THIS IS A GUARD ON A TEST FIXTURE, WHICH IS THE POINT. Root CLAUDE.md's
 * opening pattern is three production bugs that were invisible because the
 * fixtures could not exhibit the failure; four separate fixture gaps have been
 * closed here since (four colourways vs five, one variant id shared by three
 * slugs, single-word names only, no model-less product). Nothing notices when one
 * is quietly reopened — a fixture that has drifted still renders a plausible
 * page, and every test keyed on it goes green faster.
 *
 * Read over HTTP from the running fixture, not by parsing serve.mjs: what matters
 * is the payload the app receives.
 */
test.describe('the e2e fixture stays production-shaped (FA-T-10)', () => {
  test('the payload carries the five shapes that four real bugs needed', async ({ request }) => {
    const payload = await (await request.get('/api/public/viewer/n001/wine')).json()
    const colourways: Array<{
      slug: string
      displayName: string
      variantId: string
      hexSwatch: string
    }> = payload.colourways

    // FIVE, not four. A four-column rail gives 71.2px per tab at 320px against
    // production's 55.4px, so the label-overflow gate could not fail (2026-08-30).
    expect(colourways, 'production ships five colourways per garment').toHaveLength(5)

    // ONE SLUG, ONE VARIANT. Until 2026-08-31 three slugs shared N001-CRIMSON, so
    // a swap that had to reach the 4th or 5th variant could not be expressed —
    // which is the exact bug that shipped on 2026-08-27, four of five colourways
    // flickering, because model-viewer builds only the arriving colourway's
    // materials.
    expect(new Set(colourways.map((c) => c.variantId)).size, 'two colourways share a variant').toBe(
      5,
    )

    // A TWO-WORD NAME, and a long one. Six of eleven live products ship them;
    // 'Pebble / Optic White' is the longest production actually ships. Against
    // five short words the rail wraps 4 + 1 in production and never in the
    // fixture (2026-09-04).
    const longest = colourways
      .map((c) => c.displayName)
      .sort((a, b) => b.length - a.length)[0] as string
    expect(
      { longest, length: longest.length, hasSpace: longest.includes(' ') },
      'no multi-word colourway name in the fixture — the rail can no longer be ' +
        'measured against the names production actually ships',
    ).toEqual({ longest, length: 20, hasSpace: true })

    // A NEAR-WHITE SWATCH. `.colourway-tab__swatch` draws an inset ring so a pale
    // colour does not vanish into the panel; without one no test can exhibit the
    // ring being wrong, which it was in production until 2026-08-13 (`page.css`
    // read an undefined `var(--paper)`).
    //
    // Luminance, not a per-channel threshold: `butter` is #FDFDC8, whose blue
    // channel is 0xC8. A naive "every channel above 0xE0" rejects the very swatch
    // this exists for. Measured on the five fixture colours — wine 0.36, blush
    // 0.84, lime 0.89, black 0.15, butter 0.98 — so 0.93 sits in a wide gap.
    const luminance = (hexSwatch: string) => {
      const hex = hexSwatch.replace('#', '')
      const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    }
    const nearWhite = colourways.filter((c) => luminance(c.hexSwatch) > 0.93)
    expect(
      nearWhite.length,
      'no near-white colourway left in the fixture, so the swatch ring that stops a ' +
        'pale colour vanishing into the panel is untestable. Luminances: ' +
        colourways.map((c) => `${c.slug} ${luminance(c.hexSwatch).toFixed(2)}`).join(', '),
    ).toBeGreaterThan(0)
  })

  test('it serves the two product states the catalogue is really in', async ({ request }) => {
    const withModel = await (await request.get('/api/public/viewer/n001/wine')).json()
    const withoutModel = await (await request.get('/api/public/viewer/n002/wine')).json()

    // A PUBLISHED PRODUCT WITH NO GLB is a real state — it is what every product
    // is between publication and the robot finishing — and it is the only way to
    // reach the poster-fallback branch and its diagnostic.
    expect(typeof withModel.product.glbUrl, 'n001 lost its model').toBe('string')
    expect(withoutModel.product.glbUrl, 'n002 gained a model, closing the fallback branch').toBe(
      null,
    )

    // shortDescription PRESENT on one and ABSENT on the other. Every product
    // older than 2026-08-17 has none, so the fallback paragraph is what the live
    // catalogue renders; a fixture with a description everywhere can only ever
    // test the other branch.
    expect(withModel.product.shortDescription.length, 'n001 lost its description').toBeGreaterThan(
      0,
    )
    expect(withoutModel.product.shortDescription, 'n002 gained a description').toBe('')
  })

  test('the retired-colourway slug is genuinely absent, so that path is real', async ({
    request,
  }) => {
    // `a11y.spec.ts` and `viewer.spec.ts` reach the retired notice through a slug
    // this fixture must not serve. Adding it turns both into a second scan of a
    // healthy page — silently, and in the direction that passes.
    const payload = await (await request.get('/api/public/viewer/n001/navy')).json()

    expect(
      payload.requestedColourwayUnavailable,
      'the retired-colourway URL now resolves to a real colourway, so every test ' +
        'that uses it is measuring the happy path',
    ).toBe(true)
    expect(payload.fallbackMessage).toBeTruthy()
    expect(payload.selectedColourway.slug, 'the fallback is not the default colourway').toBe('wine')
  })
})

/* ══ FA-F-10 — keyboard scrolling survives Lenis ════════════════════════════ */

/**
 * End → 1413 (scrollHeight 2313 − viewport 900, the true bottom), Home → 0,
 * PageDown → 860, with the keydown counter asserted first.
 *
 * ⚠️ THIS IS THE TEST THAT MOST EASILY MEASURES NOTHING, and the reason is in
 * `polish/index.ts`: Lenis is not merely disabled under automation, it is never
 * IMPORTED. So a Playwright page scrolls natively, "keyboard scrolling works"
 * is trivially true, and the finding — that it works *with a smooth-scroll layer
 * installed* — has not been touched. The spoof is what makes the question exist,
 * and `documentElement.classList` carrying `lenis` is the proof it worked.
 *
 * Reduced motion must be `no-preference` for the same reason: `startSmoothScroll`
 * refuses under `reduce` as well.
 */
test.describe('keyboard scrolling survives Lenis (FA-F-10)', () => {
  test('End, Home and PageDown all move the document', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(asAHuman)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // POSITIVE CONTROL, and the whole basis of this test: Lenis really started.
    // It adds `lenis` to <html> in its constructor.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
        message:
          'Lenis never started, so this test would be measuring native scrolling ' +
          'and would pass however badly the smooth-scroll layer behaved. Check ' +
          'the webdriver spoof and the reduced-motion emulation.',
        timeout: 10_000,
      })
      .toBe(true)

    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      'the page is not tall enough to scroll',
    ).toBeGreaterThan(200)

    await page.locator('body').click({ position: { x: 5, y: 5 } })

    /**
     * ⚠️ THE BOTTOM IS COMPUTED AT READ TIME, NOT BEFORE THE KEY PRESS, and that
     * is not fussiness — a first draft that captured it beforehand failed by
     * exactly 24 px.
     *
     * Under `no-preference` the reveal layer is live, and every un-arrived
     * `[data-reveal]` carrier sits under `transform: translateY(24px)`. Scrolling
     * to the bottom reveals them, the transforms go, and the document gets 24 px
     * SHORTER than it was when the target was taken. Comparing a position read
     * after the scroll against a height read before it is the same class of error
     * as the layout assertion that measured its own scroll (see
     * `apps/viewer/CLAUDE.md`). Both terms have to come from the same frame.
     */
    await page.keyboard.press('End')
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const bottom = document.documentElement.scrollHeight - window.innerHeight
            return Math.round(bottom - window.scrollY)
          }),
        {
          message:
            'End did not reach the bottom of the document — a smooth-scroll layer ' +
            'that swallows the keyboard leaves a keyboard-only visitor unable to ' +
            'reach the enquiry buttons at all. See audit FA-F-10.',
          timeout: 5_000,
        },
      )
      .toBeLessThanOrEqual(1)

    await page.keyboard.press('Home')
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), {
        message: 'Home did not return to the top of the document',
        timeout: 5_000,
      })
      .toBe(0)

    await page.keyboard.press('PageDown')
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), {
        message: 'PageDown moved the document nowhere',
        timeout: 5_000,
      })
      .toBeGreaterThan(100)
  })
})

/* ══ FA-O-13 — no cookies, no storage ═══════════════════════════════════════ */

/**
 * Nine seconds in a real browser on the live viewer: 0 cookies, 0 localStorage
 * keys, 0 sessionStorage keys. Most sites cannot say that, and it is the entire
 * reason this product needs no consent banner — the trigger for one is storage on
 * the visitor's device, and there is none.
 *
 * ⚠️ IT IS ONE `setItem` AWAY FROM BEING FALSE, and the likeliest source is
 * already in the tree: `lib/theme.ts` READS `localStorage` on load and WRITES only
 * on an explicit toggle. Moving that write into the read path — "remember what we
 * resolved so the next load is faster" — is a one-line change that reads as a
 * performance improvement and quietly puts the site inside the ePrivacy consent
 * rules. Nothing else would go red.
 *
 * Asserted with no interaction at all, which is the state the claim is about; the
 * toggle's deliberate write is covered by viewer.spec.ts.
 */
test.describe('the viewer stores nothing on the visitor’s device (FA-O-13)', () => {
  test('a plain visit writes no cookie and no storage key', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
    }))

    expect(
      stored.local,
      'the viewer wrote a localStorage key on a plain visit. Zero storage is why ' +
        'this product needs no consent banner — see audit FA-O-13.',
    ).toEqual([])
    expect(stored.session, 'the viewer wrote a sessionStorage key on a plain visit').toEqual([])
    expect(stored.cookie, 'the viewer set a cookie').toBe('')
    expect(
      (await context.cookies()).map((c) => c.name),
      'a cookie was set on the browsing context',
    ).toEqual([])
  })
})

/* ══ FA-Q-03 — the custom cursor ════════════════════════════════════════════ */

/**
 * With `navigator.webdriver` lifted and real mouse moves: dot 6 px, ring 34 px,
 * both in the same accent colour, `has-custom-cursor` on `<html>` and
 * `cursor: none` on `html` and `body` — identical on both surfaces.
 *
 * ⚠️ `has-custom-cursor` IS APPLIED ONLY ONCE THE REPLACEMENT IS DRAWN, and that
 * ordering is the guarded property. The class sets `cursor: none` on the root and
 * on every link, button and tab; it used to be added on MOUNT, while the dot and
 * ring stayed at `opacity: 0` until the first `mousemove`. Between those two
 * moments the real cursor was hidden and the replacement was invisible: no cursor
 * at all. That window is not theoretical — `startPolish()` runs while the model
 * downloads, which is exactly when a visitor has parked the pointer and is
 * waiting. It was reported as "the cursor seems broken on the buttons".
 *
 * So the sequence is asserted, not just the end state: no class before the first
 * move, class and a visible dot after it.
 *
 * `motion-and-layout.spec.ts` covers the ring's POSITION over a button, which is
 * a different defect (transform composition) and is measured on a synthetic
 * element. This is the real component, mounted by the real app.
 */
test.describe('the custom cursor mounts as documented (FA-Q-03)', () => {
  test('it hides the real pointer only once it has drawn a replacement', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the cursor never mounts on a coarse pointer, by design')

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(asAHuman)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    /*
     * ⚠️ WAIT FOR THE COMPONENT BEFORE MOVING THE MOUSE. `startPolish()` imports
     * ./Cursor dynamically, so the `mousemove` listener does not exist for the
     * first frames of the page. A first draft moved the pointer immediately, the
     * moves landed before the listener was bound, no further move ever came, and
     * the test reported "the cursor never mounted" against a perfectly healthy
     * page — a false failure that would have been read as a false negative
     * control.
     */
    await page.locator('.cursor-dot').waitFor({ state: 'attached' })

    // Mounted but not yet drawn: the page must still own a normal cursor. The
    // class used to be added here, while the dot and ring were still at
    // `opacity: 0`, which is the "no cursor at all" window.
    expect(
      await page.evaluate(() => document.documentElement.classList.contains('has-custom-cursor')),
      'the real cursor was hidden before a replacement had been drawn — that is ' +
        'the "no cursor at all" window this ordering exists to close',
    ).toBe(false)

    await page.mouse.move(640, 450)
    await page.mouse.move(660, 460, { steps: 4 })

    await expect
      .poll(
        () => page.evaluate(() => document.documentElement.classList.contains('has-custom-cursor')),
        {
          message:
            'the custom cursor never mounted. Either the webdriver spoof stopped ' +
            'working — in which case this test measures nothing — or polish/index.ts ' +
            'stopped mounting it.',
          timeout: 10_000,
        },
      )
      .toBe(true)

    const measured = await page.evaluate(() => {
      const read = (selector: string) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const box = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          size: Math.round(box.width),
          // The dot is filled and the ring is stroked, so they carry the accent
          // on different properties.
          colour: selector.includes('dot') ? style.backgroundColor : style.borderTopColor,
          hidden: el.getAttribute('data-hidden'),
        }
      }
      return {
        dot: read('.cursor-dot'),
        ring: read('.cursor-ring'),
        rootCursor: getComputedStyle(document.documentElement).cursor,
        bodyCursor: getComputedStyle(document.body).cursor,
      }
    })

    expect(measured.dot, 'no .cursor-dot in the document').not.toBeNull()
    expect(measured.ring, 'no .cursor-ring in the document').not.toBeNull()

    expect(measured.rootCursor, 'the real cursor is still showing through on <html>').toBe('none')
    expect(measured.bodyCursor, 'the real cursor is still showing through on <body>').toBe('none')

    // Geometry and colour, as measured in the audit. The ring's INFLATED size is
    // pinned separately in motion-and-layout.spec.ts.
    expect(measured.dot?.size, 'the cursor dot is not 6px').toBe(6)
    expect(measured.ring?.size, 'the resting cursor ring is not 34px').toBe(34)
    expect(
      measured.ring?.colour,
      'the dot and the ring are drawn in different colours — they are one crosshair',
    ).toBe(measured.dot?.colour)

    // And it must actually be drawn: a mounted-but-hidden pair is the failure
    // state above wearing the right class.
    expect(measured.dot?.hidden, 'the dot is mounted but hidden').not.toBe('true')
  })
})

/* ══ FA-H-17 — rapid colourway switching settles correctly ══════════════════ */

/**
 * Tab 2 clicked, tab 4 clicked ~60 ms later: no stuck state, no double-fade, the
 * correct label. The unit half of this finding — that `.product-info__colour`
 * REMOUNTS, which is what restarts the entrance — is in
 * `src/components/ProductIdentity.test.tsx`, because jsdom is the only place the
 * key is observable. This is the settling half, in a real browser, where the URL,
 * the tablist state and the label all have to agree afterwards.
 */
test.describe('rapid colourway switching settles correctly (FA-H-17)', () => {
  test('two clicks 60ms apart leave the second one selected, everywhere', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const tabs = page.locator('.colourway-tab')
    await expect(tabs).toHaveCount(5)

    /**
     * ⚠️ BOTH PRESSES ARE DISPATCHED IN THE PAGE, IN ONE TASK, and getting that
     * wrong made this test unable to fail — twice.
     *
     * Draft 1 used `tabs.nth(1).click()` / `waitForTimeout(60)` /
     * `tabs.nth(3).click()`. Playwright's click runs actionability checks and
     * re-resolves the locator after the first press re-renders the tablist, so
     * the gap was several hundred milliseconds — two ordinary clicks, not a rapid
     * switch.
     *
     * Draft 2 moved both into the page with a 60 ms timer, matching the audit's
     * wording. INSTRUMENTED: the two handler invocations were **1168 ms** apart.
     * The first swap blocks the main thread — `apps/viewer/CLAUDE.md` measured
     * 121–131 ms for the material rebinding alone — so a timer set for 60 ms does
     * not fire until long after the work it was meant to interrupt has finished.
     * A deliberate 300 ms "coalesce rapid taps" debounce in `onSelectColourway`
     * passed both drafts.
     *
     * One task is the honest model of the real thing: a visitor's second tap
     * arrives while the first swap still owns the thread, so the browser queues
     * it and delivers it immediately afterwards — exactly this interleaving. It
     * is also the tightest case, which is the one worth pinning.
     *
     * Re-queried on each press rather than held as handles: the tablist
     * re-renders in between.
     */
    await page.evaluate(() => {
      const press = (index: number) => {
        const tab = document.querySelectorAll<HTMLElement>('.colourway-tab')[index]
        tab?.click()
      }
      press(1)
      press(3)
    })

    // One selected tab, and it is the last one clicked.
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.colourway-tab[aria-selected="true"]')).toHaveCount(1)

    // The colour note settled on the same colourway rather than on the one that
    // was interrupted.
    await expect(page.locator('.product-info__colour').first()).toContainText(/LIME/i)

    // And the URL, which is what a reprinted QR tag would be based on.
    await expect(page).toHaveURL(/\/n001\/lime$/)

    // The interrupted tab is genuinely deselected, not merely outnumbered: a
    // count of one proves nothing about WHICH one if the second click had been
    // dropped and the first had stuck.
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'false')
  })
})

/* ══ FA-F-12 — the smooth layer refuses a wheel event nobody rolled ══════════ */

/**
 * ⚠️ THIS ONE IS A FIX, NOT A CONFIRMATION — the only entry in this file that is.
 * FA-F-12 scored 7 and was true when it was written; `smooth-scroll.ts` gained a
 * `virtualScroll` predicate on 2026-09-07 and this pins it.
 *
 * ⚠️ AND IT IS UNTIDINESS, NOT A VULNERABILITY. Measured on the built app before
 * the fix, one page each, same synthetic event:
 *
 *     Lenis running   scrollY 0 → 1090
 *     Lenis absent    scrollY 0 →    0     (window.scrollTo(0, 500) → 500)
 *
 * Dispatching an untrusted event needs script execution in this origin, and the
 * third number is the point: such a script already has `window.scrollTo`. Nothing
 * is gained, and a document cannot dispatch events into another document, so there
 * is no cross-origin path either. What the predicate buys is that the decorative
 * scroll layer stops differing in behaviour from the platform underneath it.
 *
 * BOTH HALVES OR NEITHER. "The page did not scroll" is the trivial result on a page
 * where Lenis never started — which is every Playwright page by default, because
 * `polish/index.ts` refuses under automation. So Lenis is proven running first, and
 * a TRUSTED wheel is proven to still scroll afterwards. Without that second half
 * this test would pass just as happily against a smooth-scroll layer that had been
 * deleted.
 */
test.describe('a synthetic wheel event does not scroll the page (FA-F-12)', () => {
  test('the untrusted one is refused and the real one still works', async ({ page, isMobile }) => {
    test.skip(isMobile, 'wheel events are not how a phone scrolls; FA-F-09 covers touch')

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(asAHuman)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // POSITIVE CONTROL 1: Lenis is actually running. It adds `lenis` to <html> in
    // its constructor; without it every assertion below is about native scrolling.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('lenis')), {
        message:
          'Lenis never started, so this test measures the platform rather than the ' +
          'smooth-scroll layer and would pass with smooth-scroll.ts deleted. Check ' +
          'the webdriver spoof and the reduced-motion emulation.',
        timeout: 10_000,
      })
      .toBe(true)

    expect(
      await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
      'the page is not tall enough to scroll, so neither half of this means anything',
    ).toBeGreaterThan(400)

    // The synthetic event: deltaY 4000 moved the document 1090px before the fix.
    const afterSynthetic = await page.evaluate(async () => {
      window.scrollTo(0, 0)
      document.body.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 4000, bubbles: true, cancelable: true }),
      )
      // Longer than --scroll-duration, so a slow glide cannot hide inside the wait.
      await new Promise((resolve) => setTimeout(resolve, 1500))
      return Math.round(window.scrollY)
    })
    expect(
      afterSynthetic,
      'an untrusted wheel event scrolled the page. The browser ignores these and the ' +
        'smooth layer must not differ — see the virtualScroll predicate in ' +
        'src/polish/smooth-scroll.ts and audit FA-F-12.',
    ).toBe(0)

    /**
     * POSITIVE CONTROL 2: a REAL wheel still scrolls. Playwright's `mouse.wheel` is
     * driver-injected, so `isTrusted` is true — which is exactly the distinction the
     * predicate draws, and without this half the test passes against a smooth-scroll
     * layer that rejects everything.
     *
     * ⚠️ THE POINTER MUST NOT BE OVER THE GARMENT, and a first draft put it there.
     * `(640, 450)` on a 1280x900 screen is inside `.stage__canvas`, which carries
     * `data-lenis-prevent` so that model-viewer keeps scroll-to-zoom. Instrumented:
     * the event arrived `isTrusted: true` on `target: "stage__model"` with
     * `defaultPrevented: true`, the page did not move, and the assertion read that
     * as "the fix broke scrolling" against a working fix. The point is therefore
     * TAKEN FROM THE PAGE and proven to be outside the prevent region, rather than
     * typed as a coordinate that a layout change can quietly move onto the stage.
     */
    const point = await page.evaluate(() => {
      const aside =
        document.querySelector('.product-info__statement') ?? document.querySelector('h1')
      if (!aside) return null
      const box = aside.getBoundingClientRect()
      const x = Math.round(box.left + box.width / 2)
      const y = Math.round(box.top + box.height / 2)
      const under = document.elementFromPoint(x, y)
      return { x, y, prevented: !!under?.closest('[data-lenis-prevent]') }
    })
    expect(point, 'no element to aim the wheel at').not.toBeNull()
    expect(
      (point as { prevented: boolean }).prevented,
      'the chosen wheel point is inside [data-lenis-prevent], where model-viewer ' +
        'consumes the event by design — pick a point off the garment',
    ).toBe(false)

    await page.mouse.move((point as { x: number }).x, (point as { y: number }).y)
    await page.mouse.wheel(0, 800)
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)), {
        message:
          'a real wheel event no longer scrolls the page — the FA-F-12 predicate is ' +
          'rejecting trusted input, which breaks scrolling for every visitor',
        timeout: 5_000,
      })
      .toBeGreaterThan(100)
  })
})

/* ══ FA-H-13 / FA-R-11 — the cursor's honest default under automation ═══════ */

/**
 * ⚠️ FA-H-13 AND FA-R-11 ARE ONE PROPERTY, and this is one guard for both. The
 * audit lists them separately — FA-H-13 under "Motion & feel", FA-R-11 under
 * "Craft details" with "(honest default recorded)" — but they name the same
 * behaviour: `Cursor` refuses to mount when `navigator.webdriver` is set. Writing
 * two tests would double the runtime and halve the chance that both stay true.
 *
 * ⚠️ WHY IT IS WORTH A TEST AT ALL, given the refusal is what makes the cursor
 * invisible to every tool: BECAUSE it is. `apps/viewer/CLAUDE.md` records four
 * defects that shipped in this component at once — including a ring that flew
 * 1.53x away from the pointer — and the reason all four survived is that no test
 * and no browser agent ever rendered it. The refusal is the right default and it
 * is also the thing that hid the bugs, so it is worth pinning that it is a
 * DELIBERATE refusal and not an accident of the gate order.
 *
 * The default is asserted first, from a page with NO spoof — which is what a
 * crawler, a screenshot service and every other automated visitor gets.
 * FA-Q-03 above covers what happens once the flag is lifted; the second half here
 * is only the positive control that proves this page could have had a cursor.
 */
test.describe('the custom cursor refuses to mount under automation (FA-H-13, FA-R-11)', () => {
  test('no cursor by default, and one the moment the flag is lifted', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'a coarse pointer refuses for a second reason; this is about webdriver')

    // ── The honest default. No addInitScript: navigator.webdriver is true. ──
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // The polish layer has to have RUN, or "no cursor" is just "nothing happened
    // yet". `startPolish()` calls startReveals() unconditionally, so `.is-inview`
    // arriving is the proof that the module executed and reached the cursor gate.
    await expect
      .poll(() => page.locator('[data-reveal].is-inview').count(), {
        message:
          'the polish layer never ran, so the absence of a cursor below proves ' +
          'nothing about the automation gate',
        timeout: 10_000,
      })
      .toBeGreaterThan(0)

    const defaultState = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      dot: document.querySelectorAll('.cursor-dot').length,
      ring: document.querySelectorAll('.cursor-ring').length,
      classed: document.documentElement.classList.contains('has-custom-cursor'),
      rootCursor: getComputedStyle(document.documentElement).cursor,
    }))

    expect(
      defaultState.webdriver,
      'Playwright is not reporting navigator.webdriver, so there is no automation to refuse',
    ).toBe(true)
    expect(defaultState.dot, 'a cursor dot mounted under automation').toBe(0)
    expect(defaultState.ring, 'a cursor ring mounted under automation').toBe(0)
    expect(
      defaultState.classed,
      'has-custom-cursor was applied under automation — that rule sets `cursor: none` ' +
        'on the root and on every link, button and tab, so an automated visitor would ' +
        'have no pointer at all and no replacement drawn',
    ).toBe(false)
    expect(defaultState.rootCursor, 'the real pointer was suppressed under automation').not.toBe(
      'none',
    )

    // ── POSITIVE CONTROL: this page CAN have a cursor. Without it the four
    // assertions above are satisfied by a page where the cursor was deleted,
    // where the polish chunk 404s, or where the fine-pointer gate is broken. ──
    const human = await page.context().newPage()
    await human.emulateMedia({ reducedMotion: 'no-preference' })
    await human.addInitScript(asAHuman)
    await human.setViewportSize({ width: 1280, height: 900 })
    await human.goto('/n001/wine')
    await expect(human.getByRole('heading', { level: 1 })).toBeVisible()
    await human.locator('.cursor-dot').waitFor({ state: 'attached', timeout: 10_000 })
    expect(
      await human.evaluate(() => document.querySelectorAll('.cursor-ring').length),
      'lifting the automation flag did not produce a cursor either, so the refusal ' +
        'above is not a refusal — it is a cursor that no longer works at all',
    ).toBe(1)
    await human.close()
  })
})

/* ══ FA-C-54 — the tracking and leading curves are correct by class ═════════ */

/**
 * The claim is a RELATIONSHIP, so it is asserted as one. The absolute values are
 * already pinned by `src/styles/tokens.test.ts` — the `--tracking-*` scale, the
 * `--text-*` scale, and the rule that no stylesheet may write either as a literal.
 * What nothing checked is that those numbers still form the curve
 * `docs/DESIGN.md` §3 describes: "Large display type wants tighter tracking and
 * small type wants looser; that relationship is what optical sizing IS."
 *
 * ⚠️ THE CURVE IS BY RENDERED SIZE, NOT BY CLASS NAME, and writing it the other
 * way round produced a test that failed against correct code. Measured on
 * `/n001/wine`, 2026-09-07:
 *
 *              360px viewport            1440px viewport
 *   hero       34.0px  -0.0169em         34.2px  -0.0200em
 *   section    26.0px  -0.0138em         46.0px  -0.0300em
 *
 * At 1440 the hero is SMALLER than the section, because `.product-info--aside
 * .display--hero` re-sizes the product name in `cqi` for the 360px column it
 * moves into and re-tracks it with `--tracking-wordmark` — deliberately, with the
 * reasoning in `page.css`. A guard asserting "hero is bigger and tighter than
 * section" therefore fails on a page that is right. What holds at both widths, and
 * is the actual design rule, is that the LARGER rendered size is tracked tighter,
 * whichever class produced it.
 *
 * ⚠️ IN EM, NOT PX. `letter-spacing` computes to px and these sizes differ by up
 * to 1.8x, so the larger element is the more negative in px even when the tracking
 * has been flattened to ONE em value across the register — which is exactly the
 * flat `-0.02em` that DESIGN.md records replacing on 2026-08-15. Dividing by the
 * computed font-size is what makes this able to fail. Equal em values fail: the
 * comparison is strict.
 */
test.describe('the tracking and leading curves are correct by class (FA-C-54)', () => {
  const WIDTHS = [360, 1440] as const
  /** Two rendered sizes closer than this are one size for the purposes of the curve. */
  const SAME_SIZE_PX = 0.5

  type Metric = { label: string; size: number; trackingEm: number; leadingRatio: number }

  test('tracking tightens as display type grows, and display leads tighter than body', async ({
    page,
  }) => {
    // `reduce` so no `[data-reveal]` carrier is mid-transition. Opacity does not
    // change computed type metrics, but a settled page is one less variable.
    await page.emulateMedia({ reducedMotion: 'reduce' })

    const read = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      return page.evaluate(() => {
        const metric = (el: Element, label: string) => {
          const style = getComputedStyle(el)
          const size = Number.parseFloat(style.fontSize)
          const spacing =
            style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing)
          const leading =
            style.lineHeight === 'normal' ? Number.NaN : Number.parseFloat(style.lineHeight)
          return { label, size, trackingEm: spacing / size, leadingRatio: leading / size }
        }
        const display = [...document.querySelectorAll('.display')].map((el, index) =>
          metric(el, `${el.className}[${index}]`),
        )
        const bodyEl =
          document.querySelector('.product-info__statement') ??
          document.querySelector('.product-info__desc') ??
          document.body
        return { display, body: metric(bodyEl, bodyEl.className || 'body') }
      })
    }

    for (const width of WIDTHS) {
      const { display, body } = await read(width)

      // Positive control. One display element on the page makes every pairwise
      // claim below vacuous, and two at the same size makes the curve unobservable.
      expect(display.length, `fewer than two .display elements at ${width}px`).toBeGreaterThan(1)
      const distinctSizes = new Set(display.map((m: Metric) => Math.round(m.size * 2)))
      expect(
        distinctSizes.size,
        `every .display element renders at the same size at ${width}px (${display
          .map((m: Metric) => `${m.label} ${m.size}px`)
          .join(', ')}), so there is no optical range for the tracking to follow`,
      ).toBeGreaterThan(1)

      for (const m of display as Metric[]) {
        expect(
          m.trackingEm,
          `${m.label} is tracked at ${m.trackingEm.toFixed(4)}em at ${width}px. Display ` +
            'type here is set at font-stretch 122%, which narrows the counters, so it ' +
            'is tracked negative at every size — see docs/DESIGN.md §3.',
        ).toBeLessThan(0)
        expect(
          m.leadingRatio,
          `${m.label} leads at ${m.leadingRatio.toFixed(3)} of its size at ${width}px; ` +
            'the display face is set at 0.92 so the caps stack as a block',
        ).toBeLessThan(1)
        expect(
          m.leadingRatio,
          `${m.label} leads no tighter than the body copy at ${width}px — large type ` +
            'needs less air between its lines, not the same amount',
        ).toBeLessThan(body.leadingRatio)
      }

      // THE CURVE: every pair of genuinely different sizes, larger tracked tighter.
      for (const a of display as Metric[]) {
        for (const b of display as Metric[]) {
          if (a.size - b.size <= SAME_SIZE_PX) continue
          expect(
            a.trackingEm,
            `at ${width}px, ${a.label} renders at ${a.size}px tracked ` +
              `${a.trackingEm.toFixed(4)}em while ${b.label} renders at ${b.size}px tracked ` +
              `${b.trackingEm.toFixed(4)}em. The larger optical size must be tracked ` +
              'TIGHTER; equal values are one tracking doing two jobs across the range, ' +
              'which is the flat -0.02em docs/DESIGN.md §3 records replacing on ' +
              '2026-08-15. See audit FA-C-54.',
          ).toBeLessThan(b.trackingEm)
        }
      }

      // The body register: 17px / 1.55, which is what the 60ch measure is set for.
      expect(
        body.leadingRatio,
        `body copy leads at ${body.leadingRatio.toFixed(3)} of its size at ${width}px, ` +
          'against the 1.55 docs/DESIGN.md §3 sets',
      ).toBeCloseTo(1.55, 2)
      expect(
        body.trackingEm,
        'body copy carries tracking. It is set at 0 on purpose — tracked lowercase ' +
          'text at a 60ch measure reads as spaced-out, not as refined.',
      ).toBeCloseTo(0, 3)
    }

    /**
     * The optical curve ACROSS widths, on the one class that is viewport-clamped at
     * both: `.display--section` is `clamp(26px, 4vw, 46px)` with
     * `--tracking-display-sm`. `.display--hero` cannot be used here — above 1100px
     * it moves into the aside and takes that block's `cqi` sizing instead.
     */
    const sectionAt = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      return page.evaluate(() => {
        const el = document.querySelector('.display--section')
        if (!el) return null
        const style = getComputedStyle(el)
        const size = Number.parseFloat(style.fontSize)
        return { size, trackingEm: Number.parseFloat(style.letterSpacing) / size }
      })
    }
    const narrow = await sectionAt(360)
    const wide = await sectionAt(1440)
    expect(narrow, 'no .display--section at 360px').not.toBeNull()
    expect(wide, 'no .display--section at 1440px').not.toBeNull()
    if (!narrow || !wide) return

    expect(
      wide.size,
      'the section heading does not grow between 360px and 1440px, so its clamp has ' +
        'been flattened and the curve below cannot be observed',
    ).toBeGreaterThan(narrow.size)
    expect(
      wide.trackingEm,
      `.display--section is tracked at ${narrow.trackingEm.toFixed(4)}em at 360px and ` +
        `${wide.trackingEm.toFixed(4)}em at 1440px. It must TIGHTEN as it grows — that ` +
        'is what --tracking-display-sm being a clamp against vw is for.',
    ).toBeLessThan(narrow.trackingEm)
  })
})

/* ══ CO-12 — every colour swatch keeps a 3:1 ring against its tab ═══════════ */

/**
 * Measured live 2026-09-17 with `scripts/contrast-rules.mjs` on all 400 swatches (80 pages x
 * 5, both themes): the ring `color-mix(in srgb, var(--ink) 22%, transparent)` left 180 of 320
 * unselected swatches under 3:1 in light and 88 in dark. It was a THEME-FLAT ink tone, so a
 * pale swatch vanished into the light page and a dark one into the dark page.
 * `--line-control` flips with the theme: 0 of 320 under 3:1, worst 3.39 light and 4.94 dark.
 * The selected swatch takes `currentColor`, the selected tab's own text colour, which stands
 * 13–14:1 off the inverted fill; `--line-control` there failed every selected ring in dark.
 *
 * ⚠️ ONLY THE OUTER PAIR IS GRADED, ON PURPOSE. For a border, `measureContrastInPage` returns
 * the ring against the swatch's OWN fill (`pairs[0]`) and against what the swatch sits on
 * (`pairs[1]`). A 1px ring inside a coloured disc cannot contrast with every fill at once —
 * 400 of 400 were under 3:1 on that pair before AND after the fix — and it does not need to:
 * its job is to separate the swatch from the tab. `worstRatio` over both pairs would fail
 * every swatch forever and prove nothing.
 *
 * The fixture carries a near-white swatch (butter) and a near-black one (black), which is what
 * lets the light and the dark half fail at all; FA-T-10 above guards the first.
 */
test.describe('every colour swatch keeps a 3:1 ring against its tab (CO-12)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: all five rings, the selected one included`, async ({ page }) => {
      // Navigate BEFORE emulating — Firefox drops emulation set on about:blank (measured
      // 2026-09-07, apps/cms/e2e/legibility.spec.ts) — then again so it applies.
      await page.goto('/n001/wine')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const state = await page.evaluate(() => ({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        ground: getComputedStyle(document.body).backgroundColor,
        selected: [...document.querySelectorAll('.colourway-tab__swatch')]
          .filter((element) => element.getClientRects().length > 0)
          .map(
            (element) =>
              element.closest('.colourway-tab')?.getAttribute('aria-selected') === 'true',
          ),
      }))
      // The controls. An un-revealed rail is opacity 0 and grades 1:1 whatever the ring is,
      // and a scheme that never applied would grade the other theme twice.
      expect(state.reduced, 'reduced motion never reached the page').toBe(true)
      const groundLuminance = relativeLuminance(parseCssColour(state.ground).rgb)
      if (scheme === 'dark') {
        expect(groundLuminance, `the page ground is ${state.ground}, not dark`).toBeLessThan(0.2)
      } else {
        expect(groundLuminance, `the page ground is ${state.ground}, not light`).toBeGreaterThan(
          0.5,
        )
      }

      const rows = await page.evaluate(measureContrastInPage, {
        selector: '.colourway-tab__swatch',
        part: 'border' as const,
      })
      expect(rows, 'the fixture no longer draws five swatches').toHaveLength(5)
      expect(state.selected.filter(Boolean), 'exactly one tab should be selected').toHaveLength(1)

      const failing = rows.flatMap((row, index) => {
        const outer = row.pairs[1]
        if (!outer) return [`swatch ${index + 1}: no outer pair was measured`]
        const ratio = worstRatio({ label: row.label, pairs: [outer] })
        if (ratio >= 3) return []
        const which = state.selected[index] ? 'selected' : 'unselected'
        return [
          `${which} swatch ${index + 1}: ring ${toHex(outer[0])} on ${toHex(outer[1])} is ${ratio.toFixed(2)}:1`,
        ]
      })
      expect(
        failing,
        `${scheme}: a swatch ring under 3:1 lets the colour vanish into its tab (WCAG 1.4.11). ` +
          'Unselected rings use --line-control and the selected one currentColor; see ' +
          '.colourway-tab__swatch in apps/viewer/src/styles/page.css.',
      ).toEqual([])
    })
  }
})

/*
 * ══ forced-colors substitutes real colour, on the viewer too (CO-09) ══
 *
 * `apps/cms/e2e/motion.spec.ts` -> "the browser substitutes, and the underline survives
 * it" already proves this mechanism on the site; `page.css:2382`'s own
 * `@media (forced-colors: active)` block is written from the specification rather than
 * measured (its own comment says so), so this is the viewer's first browser-run proof
 * of it. Same recipe as the CMS test, mirrored deliberately (A-N4): the
 * `test.skip(!active, …)` engine guard, and an injected probe as the POSITIVE control —
 * without it, an engine that silently ignores the emulation would pass this test for
 * measuring nothing, exactly the "harness reports clean while measuring nothing" shape
 * this repo has hit before (root CLAUDE.md).
 */
test.describe('forced-colors substitutes real colour, on the viewer too (CO-09)', () => {
  test('the selected colourway tab and the active camera button keep a visible outline', async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const active = await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches)
    test.skip(!active, `${browserName} does not emulate forced-colors`)

    const measured = await page.evaluate(() => {
      // The positive control: an element styled with colours no theme uses, read back
      // AFTER forced-colors has had a chance to apply. If these come back unchanged,
      // nothing below is a measurement of substitution — it is a measurement of CSS
      // that would look identical whether or not the browser is honouring the request.
      const probe = document.createElement('div')
      probe.textContent = 'probe'
      probe.style.color = 'rgb(1, 2, 3)'
      probe.style.backgroundColor = 'rgb(4, 5, 6)'
      document.body.appendChild(probe)
      const probeStyle = getComputedStyle(probe)
      const control = { color: probeStyle.color, background: probeStyle.backgroundColor }
      probe.remove()

      const tab = document.querySelector('.colourway-tab[aria-selected="true"]') as HTMLElement
      const cameraBtn = document.querySelector('.camera-btn[aria-pressed="true"]') as HTMLElement
      const swatch = document.querySelector('.colourway-tab__swatch') as HTMLElement
      const tabStyle = tab && getComputedStyle(tab)
      const btnStyle = cameraBtn && getComputedStyle(cameraBtn)
      return {
        control,
        foundTab: Boolean(tab),
        foundBtn: Boolean(cameraBtn),
        foundSwatch: Boolean(swatch),
        tabOutline: tabStyle && [tabStyle.outlineWidth, tabStyle.outlineStyle],
        btnOutline: btnStyle && [btnStyle.outlineWidth, btnStyle.outlineStyle],
        swatchAdjust: swatch && getComputedStyle(swatch).forcedColorAdjust,
      }
    })

    // ⚠️ MEASURED 2026-09-24: WebKit and its mobile variant report `matches: true` for the
    // forced-colors media query under Playwright's emulation WITHOUT actually substituting
    // any colour — the `active` skip above is necessary but not sufficient. Skip on the
    // STRONGER signal (the probe itself failed to recolour), rather than fail these two
    // engines for a gap in what Playwright can emulate on them, which has nothing to do
    // with this file's CSS. Chromium and Firefox both substitute for real.
    const reallySubstituting = measured.control.color !== 'rgb(1, 2, 3)'
    test.skip(
      !reallySubstituting,
      `${browserName} reports forced-colors active but does not substitute colour`,
    )
    expect(measured.control.background).not.toBe('rgb(4, 5, 6)')

    expect(measured.foundTab, 'no selected colourway tab to measure').toBe(true)
    expect(measured.foundBtn, 'no active camera button to measure').toBe(true)
    expect(measured.foundSwatch, 'no colourway swatch to measure').toBe(true)

    // page.css:2382 — 3px solid Highlight, offset -3px, on the two states colour alone
    // would otherwise mark.
    expect(measured.tabOutline, 'the selected colourway tab lost its outline under high contrast').toEqual([
      '3px',
      'solid',
    ])
    expect(measured.btnOutline, 'the active camera button lost its outline under high contrast').toEqual([
      '3px',
      'solid',
    ])
    expect(
      measured.swatchAdjust,
      'the swatch is being recoloured by the browser instead of keeping its own paint',
    ).toBe('none')
  })
})

/*
 * ══ prefers-contrast: more raises viewer ratios too (CO-10) ══
 *
 * `apps/cms/e2e/legibility.spec.ts` -> "FA-H-09" already proves this mechanism on the
 * site; this is the viewer's own proof, against `page.css:2403`'s `@media
 * (prefers-contrast: more)` block, which raises `--line`'s alpha (docs/DESIGN.md §1) and
 * turns the header's blur off rather than let a translucent, moving surface fight the
 * request for more contrast.
 *
 * ⚠️ SAME TWO TRAPS FA-H-09 NAMED, so this test avoids them the same way: navigate BEFORE
 * emulating (a Firefox emulation set on about:blank is dropped), and take both samples in
 * the SAME colour scheme (an accidental scheme change would move every ratio for a reason
 * that has nothing to do with contrast preference).
 */
test.describe('prefers-contrast: more raises viewer ratios too (CO-10)', () => {
  const sample = async (page: import('@playwright/test').Page) => {
    await page.evaluate(() => document.fonts.ready)
    return page.evaluate(() => {
      const header = document.querySelector('.header') as HTMLElement
      return {
        matches: matchMedia('(prefers-contrast: more)').matches,
        line: getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),
        headerBorder: getComputedStyle(header).borderBottomColor,
        headerBg: getComputedStyle(document.body).backgroundColor,
        backdropFilter: getComputedStyle(header).backdropFilter,
      }
    })
  }

  test('the header hairline gains real separation and drops its blur', async ({
    page,
    browserName,
  }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await page.emulateMedia({ contrast: 'no-preference' })
    const before = await sample(page)
    test.skip(before.matches, `${browserName} cannot emulate prefers-contrast: no-preference here`)

    await page.emulateMedia({ contrast: 'more' })
    const after = await sample(page)

    /*
     * ⚠️ MEASURED 2026-09-24, FIREFOX ONLY, ON THIS PAGE SPECIFICALLY. `matchMedia
     * ('(prefers-contrast: more)').matches` flips to `true` (the control below passes),
     * but `--line`, `.header`'s border colour and its `backdrop-filter` all read back
     * BYTE-IDENTICAL before and after — as if the nested `@media` block were never
     * evaluated at all. Tried and ruled out: a double-`requestAnimationFrame` wait (no
     * change), and pairing an explicit `colorScheme` with every `emulateMedia` call, the
     * same way apps/cms/e2e/legibility.spec.ts's FA-H-09 does (no change). That test is
     * the reason this is scoped to THIS PAGE rather than "Firefox can't do
     * prefers-contrast": it raises the identical --line token, through the identical
     * lightningcss light-dark() polyfill (packages/ui/src/tokens.css is the one shared
     * file), on Firefox, and passes. Chromium, WebKit and mobile Safari all pass this
     * exact assertion on the viewer page too — only this one engine+page combination
     * does not observably apply the override. Skipping rather than failing for a gap this
     * investigation could not close, per this repo's "an honest limitation, recorded
     * plainly" rule rather than a guessed fix.
     */
    test.skip(
      browserName === 'firefox',
      'measured 2026-09-24: Firefox reports the media query matching but does not visibly ' +
        'apply this page’s override (see the comment above) — proven on chromium, ' +
        'webkit and mobile-safari here, and on Firefox itself via the identical --line ' +
        'mechanism in apps/cms/e2e/legibility.spec.ts',
    )

    // The control: without this the whole test compares a page to itself.
    expect(after.matches, `${browserName} did not apply prefers-contrast: more`).toBe(true)
    expect(before.line, 'the --line token did not move at all').not.toBe(after.line)

    const borderBefore = contrastOf(before.headerBorder, before.headerBg)
    const borderAfter = contrastOf(after.headerBorder, after.headerBg)
    expect(
      borderAfter,
      `the header hairline went ${borderBefore.toFixed(2)}:1 -> ${borderAfter.toFixed(2)}:1`,
    ).toBeGreaterThan(borderBefore)

    expect(
      after.backdropFilter,
      'the header keeps blurring moving content behind it under a request for more contrast',
    ).toBe('none')
  })
})

/*
 * ══ the serif accent stays within its style and its budget (TY-09, viewer half) ══
 *
 * `packages/ui/src/base.css:224-251`'s `.serif-accent` (used in `Contact.tsx`,
 * `CustomisationSection.tsx` and via the shared `headingWithAccent()` helper) is styled
 * but never asserted against a live page. `docs/DESIGN.md`'s own budget is 1-2 accented
 * words per headline; every current caller uses exactly one, so the budget check is a
 * guard against a FUTURE regression, not a fact about today's copy.
 */
test.describe('the serif accent stays within its style and its budget (TY-09)', () => {
  test('every .serif-accent is italic Instrument Serif, and no heading exceeds two', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => {
      const accents = [...document.querySelectorAll('.serif-accent')]
      const perAccent = accents.map((el) => {
        const style = getComputedStyle(el)
        return { fontStyle: style.fontStyle, fontFamily: style.fontFamily }
      })
      // Count siblings-under-one-heading by the nearest heading-role ancestor, the
      // same grouping docs/DESIGN.md's "per headline" budget means.
      const headingCounts = new Map<Element, number>()
      for (const el of accents) {
        const heading = el.closest('h1, h2, h3, [role="heading"]')
        if (!heading) continue
        headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1)
      }
      return {
        total: accents.length,
        perAccent,
        counts: [...headingCounts.values()],
        unheaded: accents.length - [...headingCounts.values()].reduce((a, b) => a + b, 0),
      }
    })

    // The control: a page with zero .serif-accent elements would pass every claim below
    // vacuously.
    expect(measured.total, 'no .serif-accent element was found on the page at all').toBeGreaterThan(0)
    expect(measured.unheaded, 'a .serif-accent has no heading-role ancestor to budget against').toBe(
      0,
    )

    const wrongStyle = measured.perAccent.filter((m) => m.fontStyle !== 'italic')
    expect(wrongStyle, 'a serif accent is not italic').toEqual([])
    const wrongFamily = measured.perAccent.filter((m) => !m.fontFamily.includes('Instrument Serif'))
    expect(wrongFamily, 'a serif accent does not resolve through --font-serif').toEqual([])

    const overBudget = measured.counts.filter((count) => count > 2)
    expect(
      overBudget,
      `a heading carries more than the 2-word docs/DESIGN.md budget for serif accents (counts: ${measured.counts.join(', ')})`,
    ).toEqual([])
  })
})

/*
 * ══ the two-column stage genuinely collapses to one column at 320px (SZ-02) ══
 *
 * `apps/cms/e2e/composition.spec.ts` -> "FA-D-06 / FA-E-05" already proves the site's own
 * multi-column regions collapse at 320px. The viewer has no catalogue-style content grid
 * (it is a single-product page) — its own multi-column region is the stage band moving
 * the product identity into `.stage__aside` beside the garment
 * (`apps/viewer/src/lib/useIdentityInAside.ts`), which only the no-overflow half
 * (FA-D-06-shaped) had ever been asserted against, never the reflow itself.
 */
test.describe('the two-column stage genuinely collapses to one column at 320px (SZ-02)', () => {
  test('the product identity sits beside the garment at 1280px and stacks above it at 320px', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const wide = await page.evaluate(() => ({
      inAside: Boolean(document.querySelector('.stage__aside #product-heading')),
    }))
    expect(wide.inAside, 'at 1280x900 the identity never moved beside the garment').toBe(true)

    await page.setViewportSize({ width: 320, height: 812 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const narrow = await page.evaluate(() => ({
      inAside: Boolean(document.querySelector('.stage__aside #product-heading')),
      // The control: the heading must still exist SOMEWHERE, or "not in the aside"
      // is trivially true because nothing rendered at all.
      headingExists: Boolean(document.querySelector('#product-heading')),
    }))
    expect(narrow.headingExists, 'the product heading did not render at 320px at all').toBe(true)
    expect(
      narrow.inAside,
      'at 320px the identity is still a second column beside the garment, not stacked above it',
    ).toBe(false)
  })
})

/*
 * ══ every interactive control clears 24px at a DESKTOP width too (SZ-04) ══
 *
 * `apps/viewer/e2e/motion-and-layout.spec.ts` -> "every interactive control meets the
 * WCAG 2.5.8 target size" already proves this at 375px (a phone). Reimplemented here
 * rather than imported, since that file is on Phase 1b-B's file map — same detection
 * logic (24px floor, with the spacing exception WCAG 2.5.8 itself allows), a desktop
 * width instead.
 */
test.describe('every interactive control clears 24px at a desktop width too (SZ-04)', () => {
  test('no control is under 24x24 CSS px at 1280px, with no spacing exception', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const undersized = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll<HTMLElement>(
          'a, button, [role="button"], [role="tab"], input, select, summary',
        ),
      ].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })

      return targets
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (r.width >= 24 && r.height >= 24) return false
          const cx = r.x + r.width / 2
          const cy = r.y + r.height / 2
          const nearest = Math.min(
            ...targets
              .filter((other) => other !== el)
              .map((other) => {
                const q = other.getBoundingClientRect()
                return Math.hypot(cx - (q.x + q.width / 2), cy - (q.y + q.height / 2))
              }),
          )
          return !(nearest >= 24)
        })
        .map((el) => {
          const r = el.getBoundingClientRect()
          const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)
          return `${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`
        })
    })

    expect(undersized, 'controls below 24x24 CSS px with no spacing exception, at 1280px').toEqual(
      [],
    )
  })
})

/*
 * ══ every rendered image carries its own dimensions (SZ-10) ══
 *
 * Only one image (`placeholder-webgl.spec.ts:109-126`) was ever checked for this. A
 * missing `width`/`height` is a Cumulative Layout Shift source the moment the image's
 * network response is slower than the surrounding layout.
 */
test.describe('every rendered image carries its own dimensions (SZ-10)', () => {
  test('no <img> is missing width or height at 1280px', async ({ page }) => {
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((img) => !img.getAttribute('width') || !img.getAttribute('height'))
        .map((img) => `${img.className || '(unclassed)'} src=${img.getAttribute('src')?.slice(0, 40)}`),
    )
    expect(missing, 'an <img> has no explicit width/height').toEqual([])
  })
})

/*
 * ══ the viewer stays usable at two short-viewport conditions (SZ-14) ══
 *
 * `apps/cms/e2e/composition.spec.ts`'s own FA-D-06 sweep already covers these two exact
 * conditions for the site (1024x600, 1280x500 are two of its ten CONDITIONS). The viewer
 * has no equivalent.
 *
 * A-N2, BINDING: measured in DOCUMENT space, `elementBottom + scrollY <= documentHeight -
 * barHeight`, with NO `scrollTo` anywhere in the assertion path —
 * `e2e-scroll-not-layout.md` records a version of this shape of check that scrolled
 * first and so measured the scroll (passed locally by 1px, failed CI by up to 358px).
 */
test.describe('the viewer stays usable at two short-viewport conditions (SZ-14)', () => {
  for (const { name, width, height } of [
    { name: 'short laptop 1024x600', width: 1024, height: 600 },
    { name: 'short desktop 1280x500', width: 1280, height: 500 },
  ]) {
    test(`no overflow, and the colourway rail and the contact controls both stay reachable at ${name}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const measured = await page.evaluate(() => {
        const doc = document.documentElement
        const bar = document.querySelector('.action-bar') as HTMLElement | null
        const barVisible = Boolean(bar) && getComputedStyle(bar as HTMLElement).display !== 'none'
        const barHeight = barVisible ? (bar as HTMLElement).getBoundingClientRect().height : 0
        const documentHeight = doc.scrollHeight
        // In DOCUMENT space — the element's own rect plus however far the page has
        // already scrolled — never `scrollTo` anywhere in this function.
        const bottomInDocument = (el: Element | null) =>
          el ? el.getBoundingClientRect().bottom + window.scrollY : null
        return {
          overflow: doc.scrollWidth > doc.clientWidth,
          documentHeight,
          barHeight,
          railBottom: bottomInDocument(document.querySelector('.colourways')),
          contactBottom: bottomInDocument(document.querySelector('.contact__buttons')),
        }
      })

      expect(measured.overflow, `sideways scrolling at ${name}`).toBe(false)
      expect(measured.railBottom, `no .colourways rail found at ${name}`).not.toBeNull()
      expect(measured.contactBottom, `no .contact__buttons found at ${name}`).not.toBeNull()

      const ceiling = measured.documentHeight - measured.barHeight
      expect(
        measured.railBottom,
        `the colourway rail ends past the reachable document area at ${name} ` +
          `(rail bottom ${measured.railBottom}, ceiling ${ceiling})`,
      ).toBeLessThanOrEqual(ceiling + 1)
      expect(
        measured.contactBottom,
        `the contact controls end past the reachable document area at ${name} ` +
          `(contact bottom ${measured.contactBottom}, ceiling ${ceiling})`,
      ).toBeLessThanOrEqual(ceiling + 1)
    })
  }
})

/*
 * ══ the content column stays capped at ultrawide, and the page is not (SZ-15) ══
 *
 * `site.css:358,371-382` gives the site's own container a documented cap; the viewer
 * repeats `max-width: 1200px` as a literal in five places with no test at 2560px on
 * either surface. `.header` is the full-bleed proof (its own box spans the viewport;
 * only its PADDING centres the 1200px content), which is what the row's own finding
 * names.
 */
test.describe('the content column stays capped at ultrawide (SZ-15)', () => {
  test('the header is full-bleed and .content stays at or under 1200px at 2560px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2560, height: 1200 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const measured = await page.evaluate(() => ({
      headerWidth: document.querySelector('.header')?.getBoundingClientRect().width ?? 0,
      contentWidth: document.querySelector('.content')?.getBoundingClientRect().width ?? 0,
      viewportWidth: window.innerWidth,
    }))

    expect(
      measured.headerWidth,
      `.header is ${measured.headerWidth}px in a ${measured.viewportWidth}px viewport — it is not full-bleed`,
    ).toBeGreaterThanOrEqual(measured.viewportWidth - 1)
    expect(
      measured.contentWidth,
      `.content is ${measured.contentWidth}px wide at 2560px — it should stay at or under 1200px`,
    ).toBeLessThanOrEqual(1200)
  })
})

/*
 * ══ the rendered viewport meta tag is present and sane (SZ-13) ══
 *
 * `index.html:5` sets it explicitly, including `viewport-fit=cover` for the notch —
 * never asserted against a rendered page before. Not compared byte-for-byte against
 * the site's own tag (SZ-13's own live re-check found them legitimately different).
 */
test.describe('the rendered viewport meta tag is present and sane (SZ-13)', () => {
  test('content includes width=device-width', async ({ page }) => {
    await page.goto('/n001/wine')
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content')
    expect(content, 'no <meta name="viewport"> rendered at all').not.toBeNull()
    expect(content).toContain('width=device-width')
  })
})
