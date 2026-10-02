import { expect, test } from '@playwright/test'

/**
 * VA-08, the camera half (visual audit, 2026-10-02): with forced colours on, FRONT / BACK /
 * SIDE were plain words with no edge, and the chosen one was a ring around words where
 * normally it is a filled pill. `page.css` now gives every view a 1px `ButtonText` edge and
 * fills the chosen one with `Highlight` / `HighlightText`, also while the pointer is on it.
 *
 * Same recipe as `audit-guards.spec.ts` -> CO-09, which pins the 3px ring on the chosen view:
 *   - `test.skip(!active, …)` where the engine does not emulate forced colours, and a second
 *     skip on the STRONGER signal — a probe painted in colours no palette uses that comes back
 *     unchanged — because WebKit reports `matches: true` without substituting anything (CO-09
 *     measured it). A pass in an engine that substitutes nothing would measure nothing.
 *   - the probe is also the positive control: it proves the browser really replaced author
 *     colours, so a view that "kept its fill" is the CSS working and not the emulation absent.
 *
 * ⚠️ THE VIEWS ARE BUILT, NOT WAITED FOR. `<StageControls>` renders them only over a live 3D
 * stage, and the engines here take the poster fallback wherever there is no WebGL — Firefox on
 * CI, for one (CO-09's comment records that run) — where no camera button exists to measure.
 * The rules are plain CSS on two class names, so the test builds the markup `StageControls.tsx`
 * renders and measures that, in whichever engine runs it. The pill-shaped radius is asserted
 * first: it proves the injected buttons are picking up the real `.camera-btn` rule.
 *
 * ⚠️ THE FIXTURE SITS ON TOP OF THE PAGE (fixed, with a z-index above everything) so nothing —
 * the action bar, the cookie card — can sit between the pointer and the button when the hover
 * is tested.
 */

test.describe('the camera views show their state in forced colours (VA-08)', () => {
  test('every view has an edge, and the chosen one a system-colour fill that survives hover', async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const active = await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches)
    test.skip(!active, `${browserName} does not emulate forced-colors`)

    const built = await page.evaluate(() => {
      // The positive control: colours no palette uses, read back after forced colours has
      // had its chance. Unchanged means nothing below is a measurement of substitution.
      const probe = document.createElement('div')
      probe.textContent = 'probe'
      probe.style.color = 'rgb(1, 2, 3)'
      probe.style.backgroundColor = 'rgb(4, 5, 6)'
      document.body.append(probe)
      const control = {
        color: getComputedStyle(probe).color,
        background: getComputedStyle(probe).backgroundColor,
      }
      probe.remove()

      // What the system's own selection pair resolves to in THIS palette.
      const selection = document.createElement('div')
      selection.style.backgroundColor = 'Highlight'
      selection.style.color = 'HighlightText'
      document.body.append(selection)
      const pair = {
        background: getComputedStyle(selection).backgroundColor,
        color: getComputedStyle(selection).color,
      }
      selection.remove()

      // The markup StageControls.tsx renders for the three views.
      const group = document.createElement('div')
      group.className = 'stage__views'
      group.setAttribute('role', 'group')
      group.setAttribute('aria-label', 'Camera positions')
      group.dataset.probe = 'va08'
      group.style.position = 'fixed'
      group.style.top = '120px'
      group.style.left = '20px'
      group.style.zIndex = '9999'
      for (const [index, view] of ['front', 'back', 'side'].entries()) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'camera-btn'
        button.setAttribute('aria-pressed', String(index === 0))
        button.textContent = view
        group.append(button)
      }
      document.body.append(group)
      return { control, pair }
    })

    test.skip(
      built.control.color === 'rgb(1, 2, 3)',
      `${browserName} reports forced-colors active but does not substitute colour`,
    )
    expect(built.control.background).not.toBe('rgb(4, 5, 6)')

    const read = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-probe="va08"] .camera-btn')].map((element) => {
          const style = getComputedStyle(element)
          return {
            view: element.textContent,
            borderWidth: style.borderTopWidth,
            borderStyle: style.borderTopStyle,
            background: style.backgroundColor,
            color: style.color,
            // A pill: proof the injected buttons are styled by the real `.camera-btn` rule.
            radius: Number.parseFloat(style.borderTopLeftRadius),
          }
        }),
      )

    const [front, back, side] = await read()
    if (!front || !back || !side) throw new Error('the three camera views were not built')
    expect(
      front.radius,
      'the injected views are not picking up the real .camera-btn rule',
    ).toBeGreaterThan(10)

    for (const view of [front, back, side]) {
      expect(
        [view.borderWidth, view.borderStyle],
        `${view.view} has no edge under forced colours`,
      ).toEqual(['1px', 'solid'])
    }
    expect(
      { background: front.background, color: front.color },
      'the chosen view is not filled with the system selection colours',
    ).toEqual(built.pair)
    expect(
      back.background,
      'the other views look exactly like the chosen one: the state is invisible',
    ).not.toBe(front.background)
    expect(side.background).toBe(back.background)

    // The state must survive the pointer: the page's own hover rule is heavier than the fill.
    await page.locator('[data-probe="va08"] .camera-btn').first().hover()
    const [hovered] = await read()
    expect(hovered?.background, 'the chosen view loses its fill while the pointer is on it').toBe(
      built.pair.background,
    )

    await page.evaluate(() => document.querySelector('[data-probe="va08"]')?.remove())
  })
})
