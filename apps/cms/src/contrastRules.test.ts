import { describe, expect, it } from 'vitest'
import {
  compositeOver,
  contrastOf,
  contrastRatio,
  parseCssColour,
  relativeLuminance,
  toHex,
  worstRatio,
} from '../../../scripts/contrast-rules.mjs'

/**
 * The contrast rules every colour robot shares.
 *
 * ⚠️ NOTHING COUNTS THIS FILE'S SUBJECT IN COVERAGE, so the doctrine has to do the work
 * instead. `apps/cms` counts `src/**` and `apps/viewer` counts `apps/viewer/scripts/*.mjs`;
 * the repo-root `scripts/` is in neither, and `scripts/check-coverage.mjs` only reads the
 * per-package summaries. So every function below is shown CATCHING its fault AND passing
 * clean input — the same rule `copyRules.test.ts` states, for the same reason: a helper
 * that returns a comfortable number for everything passes every robot built on it.
 *
 * `measureContrastInPage` is deliberately absent: it reads `document` and
 * `getComputedStyle`, so it is exercised by the browser suites that hand it to
 * `page.evaluate`, and a jsdom stand-in here would assert against a fake cascade.
 */

describe('relativeLuminance — WCAG, on sRGB bytes', () => {
  it('anchors at the two ends of the scale', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0)
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10)
  })

  it('weights green far above blue, which is what makes it a luminance', () => {
    const green = relativeLuminance([0, 255, 0])
    const blue = relativeLuminance([0, 0, 255])
    expect(green).toBeGreaterThan(blue * 9)
  })

  it('takes the linear branch below the threshold and the power branch above it', () => {
    // 10/255 = 0.0392, under 0.03928; 11/255 = 0.0431, over it. These two bytes are the
    // pair that proves the branch is live rather than dead code.
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 12)
    expect(relativeLuminance([11, 11, 11])).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 12)
  })
})

describe('parseCssColour', () => {
  it('reads every form getComputedStyle and tokens.css actually produce', () => {
    expect(parseCssColour('#ffffff')).toEqual({ rgb: [255, 255, 255], alpha: 1 })
    expect(parseCssColour('#abc')).toEqual({ rgb: [170, 187, 204], alpha: 1 })
    expect(parseCssColour('rgb(1, 2, 3)')).toEqual({ rgb: [1, 2, 3], alpha: 1 })
    expect(parseCssColour('rgba(241, 239, 234, 0.7)')).toEqual({
      rgb: [241, 239, 234],
      alpha: 0.7,
    })
  })

  it('reads a six-digit hex as three channels, not as one number', () => {
    // ⚠️ THE REGRESSION THIS PINS. A digit-run match over `#777777` yields the single
    // number 777777, so a shared numeric path returns [777777, 0, 0] — which luminance
    // then reports as WHITE, and a grey-on-grey failure scores as a pass.
    expect(parseCssColour('#777777').rgb).toEqual([119, 119, 119])
    expect(parseCssColour('#777777').rgb).not.toEqual([777777, 0, 0])
  })

  it('treats a fully transparent colour as alpha 0, not as black', () => {
    expect(parseCssColour('rgba(0, 0, 0, 0)').alpha).toBe(0)
  })
})

describe('compositeOver', () => {
  it('returns the top colour at alpha 1 and the under colour at alpha 0', () => {
    expect(compositeOver([255, 0, 0], 1, [0, 0, 255])).toEqual([255, 0, 0])
    expect(compositeOver([255, 0, 0], 0, [0, 0, 255])).toEqual([0, 0, 255])
  })

  it('lands halfway at alpha 0.5', () => {
    expect(compositeOver([255, 255, 255], 0.5, [0, 0, 0])).toEqual([127.5, 127.5, 127.5])
  })
})

describe('contrastRatio', () => {
  it('reports the two known anchors', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10)
    expect(contrastRatio([18, 52, 86], [18, 52, 86])).toBe(1)
  })

  it('does not care which argument is the lighter one', () => {
    const a = contrastRatio([0, 0, 0], [255, 255, 255])
    const b = contrastRatio([255, 255, 255], [0, 0, 0])
    expect(a).toBe(b)
  })
})

describe('contrastOf — what the eye receives, which is the whole point', () => {
  it('fails the planted grey-on-grey the browser suite plants', () => {
    // The exact control from apps/cms/e2e/legibility.spec.ts, so the shared maths and the
    // in-page maths are held to one number rather than two.
    expect(contrastOf('#777777', '#888888')).toBeLessThan(1.5)
  })

  it('passes black on white — negative control', () => {
    expect(contrastOf('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })

  it('counts the alpha inside an rgba(), which a colour-only read drops', () => {
    // The nav case: the same colour scores far higher if the 0.7 is thrown away.
    const composited = contrastOf('rgba(241, 239, 234, 0.7)', '#1d1f1a')
    const opaque = contrastOf('rgb(241, 239, 234)', '#1d1f1a')
    expect(composited).toBeLessThan(opaque)
  })

  it('reproduces the .stage__more incident exactly, in both themes', () => {
    /*
     * ⚠️ THESE FOUR NUMBERS ARE THE POINT OF THIS TEST, AND NONE OF THEM WAS CHOSEN HERE.
     *
     * `.stage__more` — the chevron telling a phone visitor there is more page below —
     * shipped `color: var(--muted); opacity: 0.55` until 2026-09-05. The TOKEN measures
     * 5.10:1 light and 6.69:1 dark, comfortably over the 3:1 floor for a graphical
     * object; what a visitor received was 2.19:1 and 2.97:1, under it. The element is
     * `aria-hidden`, so axe skipped it, and a token-only check passed it — three gates,
     * none of which could see the defect, on the only cue saying the page continues.
     *
     * Those four values were measured by `apps/viewer/src/styles/tokens.test.ts`'s own
     * implementation, on a different day, before this module existed. This one
     * reproduces all four from the real tokens in `packages/ui/src/tokens.css`. Agreement
     * between two independent implementations is why these are pinned rather than
     * bounded — a figure picked to make a test pass would prove nothing at all.
     */
    const MUTED = { light: '#63665b', dark: '#a2a695' }
    const BG = { light: '#f1efea', dark: '#1c1f18' }

    expect(contrastOf(MUTED.light, BG.light)).toBeCloseTo(5.1, 1)
    expect(contrastOf(MUTED.dark, BG.dark)).toBeCloseTo(6.69, 1)
    expect(contrastOf(MUTED.light, BG.light, { opacity: 0.55 })).toBeCloseTo(2.19, 1)
    expect(contrastOf(MUTED.dark, BG.dark, { opacity: 0.55 })).toBeCloseTo(2.97, 1)

    // The floor the incident crossed: it passes on the token and fails on what is seen.
    expect(contrastOf(MUTED.light, BG.light)).toBeGreaterThan(3)
    expect(contrastOf(MUTED.light, BG.light, { opacity: 0.55 })).toBeLessThan(3)
  })

  it('changes nothing at opacity 1 — negative control for the option itself', () => {
    expect(contrastOf('#63665b', '#f1efea', { opacity: 1 })).toBe(contrastOf('#63665b', '#f1efea'))
  })
})

describe('toHex', () => {
  it('round-trips a parsed colour', () => {
    expect(toHex(parseCssColour('#cdf345').rgb)).toBe('#cdf345')
  })

  it('rounds a composited channel and clamps out-of-range input', () => {
    expect(toHex([127.5, 0, 0])).toBe('#800000')
    expect(toHex([-20, 300, 0])).toBe('#00ff00')
  })
})

describe('worstRatio', () => {
  it('reports the weakest pair, not the average', () => {
    const row = {
      label: 'a.btn--ghost',
      pairs: [
        [
          [0, 0, 0],
          [255, 255, 255],
        ],
        [
          [136, 136, 136],
          [119, 119, 119],
        ],
      ] as [number[], number[]][],
    }
    expect(worstRatio(row)).toBeLessThan(1.5)
  })

  it('reports a strong row as strong — negative control', () => {
    const row = {
      label: 'p.site-lede',
      pairs: [
        [
          [0, 0, 0],
          [255, 255, 255],
        ],
      ] as [number[], number[]][],
    }
    expect(worstRatio(row)).toBeCloseTo(21, 0)
  })
})

describe('DS-13 — the blueprint grid stays decoration, not a second reading of contrast', () => {
  /**
   * A pure arithmetic check against the token VALUES (`packages/ui/src/tokens.css`), not
   * a live rendering — `.blueprint` (`base.css:399-404`) draws `--grid` as 1px lines at
   * a 0.05 alpha over whichever surface it sits on: `--paper` (`#f1efea`, the same value
   * `--bg` resolves to in light mode) in light, `--bg`'s own dark value (`#1c1f18`) in
   * dark. The ceiling is 1.3:1 — comfortably below the 3:1 WCAG floor for anything
   * meant to be read, because this motif is meant to be felt, not read.
   */
  const PAPER = '#f1efea'
  const BG_DARK = '#1c1f18'
  const CEILING = 1.3

  it('the grid line reads under 1.3:1 against its surface, in both themes', () => {
    const light = contrastOf('rgba(29, 31, 26, 0.05)', PAPER)
    const dark = contrastOf('rgba(236, 235, 228, 0.05)', BG_DARK)

    expect(light, `light: the grid reads at ${light.toFixed(2)}:1, no longer decoration`).toBeLessThan(
      CEILING,
    )
    expect(dark, `dark: the grid reads at ${dark.toFixed(2)}:1, no longer decoration`).toBeLessThan(
      CEILING,
    )
    // The control: a fixture value that should fail this ceiling must actually fail it,
    // or the assertion above could be passing vacuously against any number.
    expect(contrastOf('rgba(29, 31, 26, 0.55)', PAPER)).toBeGreaterThan(CEILING)
  })
})
