/**
 * Contrast, in ONE place, for every robot that asks whether a visitor can see something.
 *
 * WHY A SHARED MODULE. Two suites had each grown their own WCAG implementation —
 * `apps/cms/e2e/legibility.spec.ts` (parses `rgba()` strings, composites alpha) and
 * `apps/viewer/src/styles/tokens.test.ts` (parses hex, composites in a separate helper) —
 * and the 100/100 programme adds ~190 more checks, many asking this same question. The
 * two that exist already differ in shape and in input type; a third and fourth copy is
 * how a rule drifts until one of them quietly stops matching the others.
 *
 * ⚠️ TWO DEFECTS THIS FILE EXISTS TO KEEP CATCHABLE. Both passed a colour-only check,
 * and both were opacity rather than colour:
 *   - A translucent foreground is not a colour until it is composited. Reading the first
 *     three numbers out of `rgba(241, 239, 234, 0.7)` and dropping the `0.7` scored the
 *     nav at 14.47:1 — the value it reaches only at full opacity — so the fix that
 *     removed exactly that 0.7 measured as "14.47 -> 14.47" (legibility.spec.ts).
 *   - `.stage__more`, the chevron telling a phone visitor there is more page below,
 *     carried `color: var(--muted); opacity: 0.55`. The TOKEN measures 5.10:1 light and
 *     6.69:1 dark; what the eye received was 2.19:1 and 2.97:1, both under the 3:1 floor
 *     for a graphical object. It is `aria-hidden`, so axe skipped it too — three gates,
 *     none of which could see it (tokens.test.ts, 2026-09-05).
 *
 * ⚠️ PLAIN JAVASCRIPT WITH NO IMPORTS, ON PURPOSE — the same rule and the same reason as
 * `copy-rules.mjs`. Root scripts run under bare `node` in CI, the apps' TypeScript tests
 * import it through `contrast-rules.d.mts`, and `measureContrastInPage` at the bottom is
 * handed straight to `page.evaluate` — which SERIALISES a function, so that one may not
 * reference anything outside its own body, this file's other exports included.
 *
 * NOT covered here, deliberately:
 *   - `tools/asset-pipeline/src/ink-contrast.ts` takes FLOAT LINEAR colour sampled from a
 *     GLB texture, not sRGB bytes. Different input, different domain, and the shrink
 *     container installs with plain `npm`, so it cannot resolve a workspace import anyway.
 *   - `apps/viewer/e2e/audit-guards.spec.ts` computes an UNGAMMAED channel average to pick
 *     a near-white fixture swatch. That is a fixture heuristic, not a contrast gate, and
 *     making it WCAG-correct would change which swatch it selects.
 */

/**
 * WCAG 2.x linearisation. The threshold is `0.03928`, which is what both suites this
 * module replaces already use, so no calibrated number in either of them moves.
 *
 * The sRGB specification says `0.04045`, and `ink-contrast.ts` uses that — correctly, for
 * float input. ⚠️ For 8-bit input the choice is immaterial, and that is measured rather
 * than assumed: `0.03928 * 255 = 10.016` and `0.04045 * 255 = 10.315`, so NO integer
 * channel value falls between them. Byte 10 takes the `/12.92` branch under both
 * thresholds and byte 11 takes the power branch under both. Do not "correct" this to
 * 0.04045 expecting a difference; there is none to be had from a CSS colour.
 */
function linearise(value) {
  const c = (value ?? 0) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of an sRGB byte triple, 0 (black) to 1 (white). */
export function relativeLuminance(rgb) {
  return 0.2126 * linearise(rgb[0]) + 0.7152 * linearise(rgb[1]) + 0.0722 * linearise(rgb[2])
}

/**
 * A CSS colour as bytes plus its own alpha. Handles `#rgb`, `#rrggbb`, `rgb(...)` and
 * `rgba(...)` — which is every form `getComputedStyle` returns on the engines this repo
 * tests, plus the hex literals `tokens.css` declares.
 *
 * ⚠️ HEX IS PARSED FIRST AND SEPARATELY. A digit-run match over `#777777` yields the
 * single number 777777, so a shared numeric path silently reads black.
 */
export function parseCssColour(value) {
  const text = String(value).trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
  if (hex?.[1]) {
    const digits = hex[1]
    const pairs =
      digits.length === 3
        ? [...digits].map((digit) => digit + digit)
        : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
    return { rgb: pairs.map((pair) => Number.parseInt(pair, 16)), alpha: 1 }
  }
  const numbers = (text.match(/[\d.]+/g) ?? []).map(Number)
  return {
    rgb: [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0],
    alpha: numbers.length > 3 ? (numbers[3] ?? 1) : 1,
  }
}

/** What the eye receives when `top` is drawn over `under` at `alpha`. */
export function compositeOver(top, alpha, under) {
  return [0, 1, 2].map((i) => (top[i] ?? 0) * alpha + (under[i] ?? 0) * (1 - alpha))
}

/** WCAG contrast ratio of two OPAQUE byte triples, 1:1 to 21:1. */
export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/**
 * The ratio a visitor actually receives: `foreground` composited over `background`,
 * through its own alpha AND any `opacity` applied to it.
 *
 * Pass `opacity` when the element or an ancestor dims it — that is the `.stage__more`
 * case in this file's header, where the token passes and the rendered cue does not.
 */
export function contrastOf(foreground, background, { opacity = 1 } = {}) {
  const front = parseCssColour(foreground)
  const behind = parseCssColour(background)
  const seen = compositeOver(front.rgb, front.alpha * opacity, behind.rgb)
  return contrastRatio(seen, behind.rgb)
}

/** A byte triple as `#rrggbb`, for failure messages that name the colour they measured. */
export function toHex(rgb) {
  const pair = (i) =>
    Math.max(0, Math.min(255, Math.round(rgb[i] ?? 0)))
      .toString(16)
      .padStart(2, '0')
  return `#${pair(0)}${pair(1)}${pair(2)}`
}

/**
 * Read every visible match of `selector` and report what the eye receives, in the page.
 *
 * ⚠️ HANDED TO `page.evaluate`, SO IT REFERENCES NOTHING OUTSIDE ITSELF — not even the
 * exports above, which is why the maths is repeated here rather than imported. Same rule
 * and same reason as `readCopyInPage` in `copy-rules.mjs`.
 *
 * `part: 'border'` returns TWO pairs, because a control's edge has to separate it from
 * what it sits on AND from what surrounds it; a field whose border matches the page but
 * not the input is still an invisible edge.
 *
 * The background is the composited ANCESTOR STACK, not the element's own
 * `backgroundColor` — that is `transparent` on most text, and grading against
 * `rgba(0,0,0,0)` scores every paragraph against black.
 */
export function measureContrastInPage({ selector, part = 'text' }) {
  const parse = (value) => {
    const text = String(value).trim()
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)
    if (hex?.[1]) {
      const digits = hex[1]
      const pairs =
        digits.length === 3
          ? [digits[0] + digits[0], digits[1] + digits[1], digits[2] + digits[2]]
          : [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6)]
      return { rgb: pairs.map((pair) => Number.parseInt(pair, 16)), a: 1 }
    }
    const n = (text.match(/[\d.]+/g) ?? []).map(Number)
    return { rgb: [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0], a: n.length > 3 ? (n[3] ?? 1) : 1 }
  }
  const over = (top, under) => top.rgb.map((v, i) => v * top.a + (under[i] ?? 0) * (1 - top.a))
  const ground = (start) => {
    const layers = []
    for (let el = start; el; el = el.parentElement) {
      const bg = parse(getComputedStyle(el).backgroundColor)
      if (bg.a > 0) layers.push(bg)
      if (bg.a >= 1) break
    }
    let colour = [255, 255, 255]
    for (const layer of layers.reverse()) colour = over(layer, colour)
    return colour
  }
  return [...document.querySelectorAll(selector)]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const style = getComputedStyle(el)
      const fg = parse(part === 'text' ? style.color : style.borderTopColor)
      let opacity = 1
      for (let node = el; node; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity)
      }
      const behind = ground(el)
      const seen = over({ rgb: fg.rgb, a: fg.a * opacity }, behind)
      const pairs =
        part === 'text'
          ? [[seen, behind]]
          : [
              [seen, behind],
              [seen, ground(el.parentElement)],
            ]
      return { label: `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60), pairs }
    })
}

/** The worst (lowest) ratio among a row's pairs — a row is only as good as its weakest. */
export function worstRatio(row) {
  return Math.min(...row.pairs.map(([fg, bg]) => contrastRatio(fg, bg)))
}
