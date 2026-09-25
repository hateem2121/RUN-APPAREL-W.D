/**
 * Six "looks machine-made" patterns, checked against what a browser is SERVED — the CSS and
 * JavaScript responses and the rendered page — never the source alone (VC-07, VC-08, VC-10,
 * VC-11, VC-12, VC-13). Every one is absent today; these are safety nets, and each allow-list
 * below is the measured state, read before this file was written.
 *
 * Plain JavaScript, same rule as `copy-rules.mjs` and `served-css-motion-probe.mjs`: root
 * scripts run under bare `node`, and the apps' TypeScript tests import this through
 * `vibecoded-rules.d.mts`. The one import is a sibling of the same kind.
 *
 * The DOM checks (VC-10, VC-11) take plain data rather than elements, so the e2e specs
 * collect it in the page and the unit test can feed planted cases without a browser.
 */
import { extractLeafRules } from './served-css-motion-probe.mjs'

export { extractLeafRules }

/**
 * VC-08 — a frosted-glass panel. The ONE `backdrop-filter` served today is `.stage__ar`
 * (apps/viewer/src/styles/page.css), a 6px blur behind the small "View in AR" pill over the
 * live 3D canvas, already switched off for anyone who asks for reduced transparency. The
 * pattern this guards against is a frosted PANEL; a second use of any kind needs a decision.
 */
export const BACKDROP_FILTER_ALLOW_LIST = ['.stage__ar']

/**
 * VC-07 — a card with a coloured accent stripe down one side. The ONE served today is the
 * contact form's result notice (apps/cms/src/app/(frontend)/site.css): its 3px edge turns
 * `--dimension` when sent and `--danger` on an error, on a message that says its state in
 * words. A status colour on a message, not a decorative card.
 */
export const COLOURED_EDGE_ALLOW_LIST = ['.form-notice--ok', '.form-notice--bad']

const ONE_SIDE = '(?:left|right|top|bottom|inline-start|inline-end|block-start|block-end)'
const SIDE_SHORTHAND_RE = new RegExp(`^border-${ONE_SIDE}$`, 'i')
const SIDE_COLOUR_RE = /^border-(?:left|right|inline-start|inline-end)-color$/i
const NEUTRAL_COLOUR_RE = /var\(--line\)|\btransparent\b|\bcurrentcolor\b|\binherit\b|\bnone\b/i

function declarations(body) {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':')
      return i < 0 ? null : { property: d.slice(0, i).trim(), value: d.slice(i + 1).trim() }
    })
    .filter((d) => d !== null)
}

function isAllowed(selector, allowList) {
  return selector
    .split(',')
    .map((s) => s.trim())
    .every((s) => allowList.includes(s))
}

/** Width of a border shorthand, in px, or Infinity for a keyword/var that can be thick. */
function borderWidthPx(value) {
  const m = value.match(/(-?\d*\.?\d+)(px|rem|em)\b/)
  if (m) return Number(m[1]) * (m[2] === 'px' ? 1 : 16)
  if (/\bthin\b/.test(value)) return 1
  if (/\b(medium|thick)\b|var\(/.test(value)) return Number.POSITIVE_INFINITY
  return 0
}

/**
 * A shorthand with no colour of its own (`2px solid`) draws in `currentColor` — the text
 * colour, which is how the menu icon's bars are drawn (`.notch__icon-line`,
 * packages/ui/src/notch.css). Only a colour the rule NAMES can be an accent.
 */
function namesAColour(property, value) {
  if (/-color$/i.test(property)) return true
  const rest = value
    .replace(/(-?\d*\.?\d+)(px|rem|em)\b/g, '')
    .replace(
      /\b(thin|medium|thick|none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)\b/gi,
      '',
    )
    .trim()
  return rest.length > 0
}

/**
 * One-sided borders at least 2px wide in a colour other than the hairline, and one-sided
 * side-colour changes (`border-inline-start-color: …`) — the two ways an accent stripe is
 * written. Four-sided borders (buttons, inputs, a selected swatch) are not the pattern.
 */
export function findColouredEdges(rules, allowList = COLOURED_EDGE_ALLOW_LIST) {
  const out = []
  for (const rule of rules) {
    for (const { property, value } of declarations(rule.body)) {
      const stripe =
        (SIDE_SHORTHAND_RE.test(property) && borderWidthPx(value) >= 2) ||
        SIDE_COLOUR_RE.test(property)
      if (!stripe || NEUTRAL_COLOUR_RE.test(value) || !namesAColour(property, value)) continue
      if (isAllowed(rule.selector, allowList)) continue
      out.push({ ...rule, declaration: `${property}: ${value}` })
    }
  }
  return out
}

export function findBackdropFilters(rules, allowList = BACKDROP_FILTER_ALLOW_LIST) {
  const out = []
  for (const rule of rules) {
    for (const { property, value } of declarations(rule.body)) {
      if (!/^(-webkit-)?backdrop-filter$/i.test(property) || /^none$/i.test(value)) continue
      if (isAllowed(rule.selector, allowList)) continue
      out.push({ ...rule, declaration: `${property}: ${value}` })
    }
  }
  return out
}

/**
 * VC-12 / VC-13 — fingerprints a UI kit leaves in what it ships. Each is a string the kit
 * itself writes (a class prefix, a data attribute, a custom-property namespace, its licence
 * banner), not a word that could turn up in prose. `@base-ui` is this repo's settled library
 * (docs/DECISION-UI-LIBRARIES.md) and is deliberately absent.
 */
export const UI_KIT_FINGERPRINTS = [
  { kit: 'Lucide', re: /\blucide(?:-react|-static)?\b/i },
  { kit: 'Tailwind', re: /--tw-[a-z]/ },
  { kit: 'Tailwind', re: /\btailwindcss\b/i },
  { kit: 'Radix', re: /\bdata-radix-/ },
  { kit: 'Radix', re: /@radix-ui\// },
  { kit: 'Radix', re: /--radix-[a-z]/ },
  { kit: 'shadcn', re: /\bshadcn\b/i },
  { kit: 'shadcn', re: /\bclass-variance-authority\b/ },
  { kit: 'shadcn', re: /\btailwind-merge\b/ },
]

/** Every fingerprint found in one served body, with 40 characters either side. */
export function findUiKitFingerprints(text) {
  const out = []
  for (const { kit, re } of UI_KIT_FINGERPRINTS) {
    const m = re.exec(text)
    if (m) {
      const from = Math.max(0, m.index - 40)
      out.push({ kit, match: m[0], context: text.slice(from, m.index + m[0].length + 40) })
    }
  }
  return out
}

/** The same kits as dependencies: any workspace manifest naming one fails. */
export const FORBIDDEN_PACKAGES = [
  /^lucide(?:-.+)?$/,
  /^@radix-ui\//,
  /^radix-ui$/,
  /^tailwindcss$/,
  /^@tailwindcss\//,
  /^class-variance-authority$/,
  /^tailwind-merge$/,
  /^shadcn(?:-ui)?$/,
]

export function findForbiddenDependencies(manifest) {
  const names = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ].flatMap((field) => Object.keys(manifest[field] ?? {}))
  return names.filter((name) => FORBIDDEN_PACKAGES.some((re) => re.test(name)))
}

/**
 * VC-10 — the "three icon boxes" row: a parent whose element children, three or more of
 * them, each hold an icon (`svg`) AND a heading. `groups` is what the page reported: for
 * every parent with 3+ element children, how many of them carry both.
 */
export function findIconBoxRows(groups) {
  return groups.filter((g) => g.children >= 3 && g.withIconAndHeading >= 3)
}

/**
 * VC-11 — a pill badge above the headline. `before` describes the element right before each
 * `h1` and every element inside it: its rounded corners against its height, and whether it
 * paints a background or border. A pill = corners at least half the height, with paint.
 * The site's and viewer's mono `[ … ]` labels paint nothing, so they pass.
 */
export function findHeadlineBadges(before) {
  return before.filter(
    (b) => b.height > 0 && b.radius >= b.height / 2 - 1 && (b.hasBackground || b.hasBorder),
  )
}

/*
 * The two page-side collectors, run by `page.evaluate(fn, arg)` in both browser specs. They
 * must stay SELF-CONTAINED — Playwright sends the function's source text to the page, so a
 * reference to anything outside the function body is undefined there.
 */

/** VC-10's input: every element under `rootSelector` with 3+ element children. */
export function collectIconBoxGroups(rootSelector) {
  const out = []
  for (const parent of document.querySelectorAll(`${rootSelector} *`)) {
    const kids = [...parent.children]
    if (kids.length < 3) continue
    out.push({
      parent: `${parent.tagName.toLowerCase()}.${[...parent.classList].join('.')}`,
      children: kids.length,
      withIconAndHeading: kids.filter(
        (k) => k.querySelector('svg') && k.querySelector('h2, h3, h4, h5, h6'),
      ).length,
    })
  }
  return out
}

/** VC-11's input: the element right before each h1, and every element inside it. */
export function collectHeadlineNeighbours() {
  const out = []
  for (const h1 of document.querySelectorAll('h1')) {
    const before = h1.previousElementSibling
    if (!before) continue
    for (const el of [before, ...before.querySelectorAll('*')]) {
      const cs = getComputedStyle(el)
      const bg = cs.backgroundColor
      out.push({
        where: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        height: el.getBoundingClientRect().height,
        radius: Number.parseFloat(cs.borderTopLeftRadius) || 0,
        hasBackground:
          (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || cs.backgroundImage !== 'none',
        hasBorder: cs.borderTopStyle !== 'none' && Number.parseFloat(cs.borderTopWidth) > 0,
      })
    }
  }
  return out
}
