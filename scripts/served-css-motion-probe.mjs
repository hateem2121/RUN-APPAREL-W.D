/**
 * Three static checks against SERVED (built) CSS — never the source, which a build step
 * can strip or an `@supports` fallback never ships. Same reasoning `check-bundle-budget.mjs`
 * gives for reading `dist/` instead of `src/`.
 *
 * MO-05: no `:hover` rule on a button/link selector changes `opacity` — the "AI tell" the
 * 2026-09 audit named (a fade that reads as generated rather than designed).
 * MO-15: no `will-change` outside an explicit allow-list, and no `transition: all` /
 * `transition-property: all` anywhere.
 * MO-16: no `transition`/`transition-property` names a layout-triggering property
 * (`width`, `height`, `top`, `left`, `right`, `bottom`, `margin*`, `padding*`, `flex-basis`).
 *
 * ⚠️ PLAIN JAVASCRIPT WITH NO IMPORTS, on purpose — same rule as `contrast-rules.mjs` and
 * `copy-rules.mjs`: root scripts run under bare `node` in CI, and the apps' TypeScript
 * tests import this module through `served-css-motion-probe.d.mts`.
 *
 * The allow-list below is not a guess: it is the two selectors that currently carry
 * `will-change` in this repo's OWN source (`packages/ui/src/base.css`,
 * `apps/viewer/src/styles/page.css`), read before this file was written. A third
 * selector adding `will-change` is exactly the drift this check exists to catch — add it
 * to the list only as a deliberate, reviewed decision, not to make a red run go away.
 */

export const WILL_CHANGE_ALLOW_LIST = ['[data-reveal]', '.stage__placeholder']

/** Layout properties — transitioning any of these forces reflow, not just paint/composite. */
const LAYOUT_PROPERTY_RE =
  /\b(width|height|top|left|right|bottom|margin(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|padding(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|flex-basis)\b/i

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Flattens a (possibly `@media`/`@supports`/`@layer`-nested) stylesheet into leaf rules —
 * `{ selector, body }` pairs whose body contains no further `{`. Brace-depth based, so it
 * survives a minified build with no newlines, which is what `apps/viewer/dist` and
 * `.next/static/chunks` both ship.
 */
// Both helpers take the TEXT to scan explicitly, rather than closing over a fixed
// outer string — `walk()` below is recursive (for @media/@supports/@layer bodies), and
// closing over one fixed string meant a recursive call's byte OFFSETS (relative to its
// own, shorter substring) were used to index into the ORIGINAL, longer string. That
// bug was caught by this file's own "survives a nested @media container" negative
// control before it ever shipped: it split the declaration `opacity: 0.5` at the
// decimal point, which is exactly the class of nonsense a wrong offset produces.

function findOpenBrace(text, from) {
  let inStr = null
  for (let j = from; j < text.length; j++) {
    const c = text[j]
    if (inStr) {
      if (c === inStr && text[j - 1] !== '\\') inStr = null
      continue
    }
    if (c === '"' || c === "'") inStr = c
    else if (c === '{') return j
    else if (c === '}') return -1
  }
  return -1
}

function findMatchingClose(text, openIdx) {
  let depth = 1
  let inStr = null
  let j = openIdx + 1
  while (j < text.length && depth > 0) {
    const c = text[j]
    if (inStr) {
      if (c === inStr && text[j - 1] !== '\\') inStr = null
    } else if (c === '"' || c === "'") inStr = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    j++
  }
  return depth === 0 ? j - 1 : -1
}

function walkRules(text, rules) {
  let pos = 0
  while (pos < text.length) {
    const open = findOpenBrace(text, pos)
    if (open === -1) break
    const selector = text.slice(pos, open).trim()
    const close = findMatchingClose(text, open)
    if (close === -1) break
    const body = text.slice(open + 1, close)
    if (body.includes('{')) {
      // A container at-rule (@media, @supports, @layer, @keyframes, …) — recurse.
      // @keyframes bodies (0%/100% { ... }) are containers too and are correctly
      // walked, but their "selectors" (0%, 100%) never match a `:hover`/interactive
      // selector check, so they are harmless to include.
      walkRules(body, rules)
    } else {
      rules.push({ selector, body })
    }
    pos = close + 1
  }
}

export function extractLeafRules(css) {
  const rules = []
  walkRules(stripComments(css), rules)
  return rules
}

/** A selector that plausibly targets a button or a link, for MO-05's scope. */
function isButtonOrLinkSelector(selector) {
  return /(^|[\s>+~,.])a(:|\[|\s|$|\.|#)|\.btn\b|\bbutton\b|\blink\b/i.test(selector)
}

/** MO-05 — `:hover` selectors on a button/link that also touch `opacity`. */
export function findHoverOpacityFades(rules) {
  return rules.filter(
    (rule) =>
      /:hover\b/.test(rule.selector) &&
      isButtonOrLinkSelector(rule.selector) &&
      /(^|;|\{|\s)opacity\s*:/.test(rule.body),
  )
}

/**
 * MO-15 — `will-change` outside the allow-list, or `transition(-property): all`.
 *
 * `will-change: auto` is excluded — it is the RELEASE of the hint (the pattern this
 * repo's own `[data-reveal].is-inview` rule uses once an entrance finishes, per
 * `packages/ui/src/base.css`), not a new one being held. Holding a value other than
 * `auto` is what costs a compositor layer.
 */
export function findForbiddenWillChangeOrTransitionAll(rules, allowList = WILL_CHANGE_ALLOW_LIST) {
  const violations = []
  for (const rule of rules) {
    if (/will-change\s*:\s*(?!auto\b)\S/.test(rule.body) && !allowList.includes(rule.selector)) {
      violations.push({ ...rule, reason: 'will-change outside the allow-list' })
    }
    if (/transition(-property)?\s*:\s*all\b/.test(rule.body)) {
      violations.push({ ...rule, reason: 'transition(-property): all' })
    }
  }
  return violations
}

/**
 * `.notch__icon-line` — the three lines of the phone menu's hamburger icon, which morph
 * into an X (Phase 1b-B, `packages/ui/src/notch.css:488-521`). Each line is a fixed
 * ~20x16px decorative box; the `width` change is the icon's own two-frame line-length
 * morph, not a page-layout-affecting animation, and reflows only that tiny box. Kept as
 * an explicit, reviewed exception rather than silently widening MO-16's rule.
 */
export const LAYOUT_TRANSITION_ALLOW_LIST = ['.notch__icon-line']

/** MO-16 — a `transition`/`transition-property` declaration naming a layout property. */
export function findLayoutPropertyTransitions(rules, allowList = LAYOUT_TRANSITION_ALLOW_LIST) {
  const violations = []
  for (const rule of rules) {
    if (allowList.includes(rule.selector)) continue
    // Match each transition/transition-property DECLARATION individually (not the whole
    // body), so a rule that legitimately transitions e.g. `filter, opacity` elsewhere in
    // the same body is not blamed for it.
    const declarations = rule.body.match(/transition(?:-property)?\s*:[^;}]+/gi) ?? []
    for (const declaration of declarations) {
      if (LAYOUT_PROPERTY_RE.test(declaration)) {
        violations.push({ ...rule, declaration: declaration.trim() })
      }
    }
  }
  return violations
}
