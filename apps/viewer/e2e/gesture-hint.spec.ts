import { expect, test } from '@playwright/test'

/**
 * VA-07 (visual audit, 2026-10-02): "DRAG TO ROTATE · PINCH TO ZOOM" ran past its pill on a
 * real iPhone — the final M crossed the pill's rounded edge. The pill is placed with
 * `left: 50%`, which leaves an absolutely placed box only the right half of the stage to size
 * itself in; the fix is `width: max-content`, so the text decides.
 *
 * ⚠️ THE HINT IS INJECTED, NOT WAITED FOR. The real one is drawn only over a live 3D stage after
 * an idle pause (`Stage.tsx`), and this suite's engines take the poster fallback wherever there
 * is no WebGL — Firefox on CI, and the WebKit projects whenever the machine has none — where it
 * is never drawn at all (motion-and-layout.spec.ts documents the same gap for its cue tests). The
 * rule under test is plain CSS on two class names, so the test builds the same markup
 * `Stage.tsx` renders (the `.stage__hint` paragraph, the `.stage__hint-icon` svg, the text) inside
 * the real `.stage__canvas` and measures THAT, in whichever engine is running. It therefore
 * runs in both WebKit projects, which is where the defect was seen.
 *
 * ⚠️ WHAT THIS CAN AND CANNOT SHOW. It fails in an engine that sizes the pill narrower than its
 * text. Desktop WebKit, Chromium and Firefox on a Mac size it correctly with or without the
 * fix as far as anyone has measured — the audit saw the overflow only on an iPhone — so a pass
 * here is the fix being harmless everywhere and the check being armed, not a reproduction of
 * the iPhone. The iOS simulator is where to see the defect itself.
 */

const HINT_WORDS = {
  touch: 'DRAG TO ROTATE · PINCH TO ZOOM',
  pointer: 'DRAG TO ROTATE · SCROLL TO ZOOM',
} as const

for (const width of [320, 390, 430] as const) {
  for (const [device, words] of Object.entries(HINT_WORDS)) {
    test(`the ${device} hint fits inside its pill at ${width}px wide (VA-07)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.locator('.stage__canvas').waitFor({ state: 'attached' })

      const m = await page.evaluate((label) => {
        const canvas = document.querySelector('.stage__canvas')
        if (!canvas) return null
        const hint = document.createElement('p')
        hint.className = 'stage__hint'
        hint.setAttribute('aria-hidden', 'true')
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('class', 'stage__hint-icon')
        icon.setAttribute('viewBox', '0 0 24 24')
        hint.append(icon, label)
        canvas.append(hint)

        const style = getComputedStyle(hint)
        const box = hint.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(hint.lastChild as Text)
        const text = range.getBoundingClientRect()
        const result = {
          // Where the pill's content box ends, and where its text really ends.
          contentRight:
            box.right -
            Number.parseFloat(style.paddingRight) -
            Number.parseFloat(style.borderRightWidth),
          textRight: text.right,
          scrollOverflow: hint.scrollWidth - hint.clientWidth,
          boxWidth: box.width,
          stageWidth: canvas.getBoundingClientRect().width,
          nowrap: style.whiteSpace,
        }
        hint.remove()
        return result
      }, words)

      expect(m, 'no .stage__canvas to put the hint in').not.toBeNull()
      if (!m) return
      // The instrument's own check: the injected pill has to be the real rule, or this
      // measures a stranger. `white-space: nowrap` is the rule that makes overflow possible.
      expect(m.nowrap, 'the injected hint is not picking up the real .stage__hint rules').toBe(
        'nowrap',
      )
      expect(
        m.textRight,
        `the text ends ${(m.textRight - m.contentRight).toFixed(1)}px past its pill's content ` +
          `edge (pill ${m.boxWidth.toFixed(1)}px wide in a ${m.stageWidth.toFixed(0)}px stage)`,
      ).toBeLessThanOrEqual(m.contentRight + 1)
      expect(
        m.scrollOverflow,
        `the pill's content overflows it by ${m.scrollOverflow}px`,
      ).toBeLessThanOrEqual(1)
    })
  }
}
