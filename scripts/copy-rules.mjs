/**
 * The copy rules, in ONE place, for every robot that reads what a visitor or a machine reads.
 *
 * WHY A SHARED MODULE. The same rules — American spelling, no buzzwords, no emoji in a
 * heading — are checked by the site's browser tests, the viewer's browser tests, unit tests,
 * a live check of the CMS text on every garment, and a re-check run by hand. Five hand-typed
 * word lists drift the way `scripts/live-products.mjs` exists to prevent, so the lists live
 * here and every reader imports them.
 *
 * ⚠️ PLAIN JAVASCRIPT WITH NO IMPORTS, ON PURPOSE. Root scripts run under bare `node` in CI,
 * the apps' TypeScript tests import it through `copy-rules.d.mts`, and Playwright hands the
 * two in-page readers at the bottom straight to `page.evaluate` — which SERIALISES a
 * function, so those two may not reference anything outside their own bodies.
 */

/**
 * British forms the owner ruled out on 2026-09-04 ("colorway", "color", "customization",
 * "inquiry" — docs/CUSTOMISATION-COPY-2026-09-04.md). Word families rather than bare stems
 * where a stem would catch an American word: `organis` alone matches "organism", and
 * `fulfil` alone matches "fulfill".
 */
export const BRITISH_SPELLING =
  /\b(?:colour\w*|catalogu(?:e|es|ed|ing)\b|organis(?:e|ed|es|er|ers|ing|ation|ations)\b|customis\w*|summaris(?:e|ed|es|ing|ation|ations)\b|enquir\w*|centr(?:e|es|ed|ing)\b|fulfil(?:ment|s)?\b)/gi

/** Every British form in `text`, lower-cased, in first-seen order, without repeats. */
export function findBritishSpellings(text) {
  const found = String(text).match(BRITISH_SPELLING) ?? []
  return [...new Set(found.map((word) => word.toLowerCase()))]
}

/** Replacements for the forms above. Endings that change shape are spelled out whole. */
const AMERICAN = [
  [/\bcolour/gi, () => 'color'],
  [
    /\bcatalogu(e|es|ed|ing)\b/gi,
    (_word, ending) =>
      ({ e: 'catalog', es: 'catalogs', ed: 'cataloged', ing: 'cataloging' })[ending.toLowerCase()],
  ],
  [/\borganis(?=(?:e|ed|es|er|ers|ing|ation|ations)\b)/gi, () => 'organiz'],
  [/\bcustomis/gi, () => 'customiz'],
  [/\bsummaris(?=(?:e|ed|es|ing|ation|ations)\b)/gi, () => 'summariz'],
  [/\benquir/gi, () => 'inquir'],
  [
    /\bcentr(e|es|ed|ing)\b/gi,
    (_word, ending) =>
      ({ e: 'center', es: 'centers', ed: 'centered', ing: 'centering' })[ending.toLowerCase()],
  ],
  [/\bfulfil(ment|s)?\b/gi, (_word, ending) => `fulfill${(ending ?? '').toLowerCase()}`],
]

/** "COLOUR" → "COLOR", "Colour" → "Color", "colour" → "color". */
function matchCase(source, replacement) {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return replacement.toUpperCase()
  }
  const first = source.charAt(0)
  if (first !== first.toLowerCase())
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  return replacement
}

/** `text` with every British form above rewritten in American spelling. */
export function toAmerican(text) {
  let out = String(text)
  for (const [pattern, american] of AMERICAN) {
    out = out.replace(pattern, (word, ...rest) => matchCase(word, american(word, ...rest)))
  }
  return out
}

/**
 * Marketing filler (the vibecoded checklist's buzzword item). A listed word matches with any
 * ending — "empower" catches "empowers" — and a hyphen and a space are interchangeable.
 */
export const BUZZWORDS = Object.freeze([
  'seamless',
  'cutting-edge',
  'world-class',
  'best-in-class',
  'state-of-the-art',
  'game-changing',
  'game-changer',
  'revolutionary',
  'next-generation',
  'next-gen',
  'synergy',
  'unparalleled',
  'supercharge',
  'innovative',
  'leverage',
  'holistic',
  'one-stop',
  'empower',
])

/**
 * ⚠️ "SEAMLESS" IS ALSO HOW A GARMENT IS MADE. Seamless knitting is a construction method, so
 * a garment's own specification may say it and mean it. Pass this as `allow` when checking
 * garment text; never when checking the marketing pages.
 */
export const GARMENT_TERMS = Object.freeze(['seamless'])

/** The buzzwords in `text`, in BUZZWORDS order. */
export function findBuzzwords(text, { allow = [] } = {}) {
  const lower = String(text).toLowerCase()
  return BUZZWORDS.filter((word) => {
    if (allow.includes(word)) return false
    return new RegExp(`(^|[^a-z])${word.replace(/-/g, '[-\\s]')}`).test(lower)
  })
}

/** Pictographs. ©, ® and ™ are Extended_Pictographic in Unicode, and are legal marks. */
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/gu

export function findEmoji(text) {
  return String(text).match(EMOJI) ?? []
}

const PLACEHOLDER_WORDS = /\b(?:lorem|ipsum)\b/gi
const PLACEHOLDER_TOKENS = /\b(?:TODO|TBD|FIXME|undefined|NaN)\b|\[object Object\]/g

/** Filler text, and values that leak when code renders nothing. */
export function findPlaceholders(text) {
  const source = String(text)
  return [...(source.match(PLACEHOLDER_WORDS) ?? []), ...(source.match(PLACEHOLDER_TOKENS) ?? [])]
}

/**
 * What Lighthouse 13.4.1's `llms-txt` audit checks (core/audits/agentic/llms-txt.js:101-103):
 * an H1, at least one Markdown link, and at least 50 characters. `[]` means it passes.
 */
export function llmsTxtProblems(content) {
  const text = String(content)
  const problems = []
  if (!/^\s*#\s+.+/m.test(text)) problems.push('no H1 heading')
  if (!/\[.+\]\(.+\)/.test(text)) problems.push('no Markdown link')
  if (text.length < 50) problems.push('shorter than 50 characters')
  return problems
}

/**
 * RUNS INSIDE THE PAGE — pass it to `page.evaluate`. Every heading's text, the visible body,
 * and the decoded subject/body/text of every pre-filled mailto or WhatsApp link: an enquiry
 * template is copy a visitor sends, and `innerText` alone never sees it.
 */
export function readCopyInPage() {
  const decoded = []
  for (const link of document.querySelectorAll('a[href]')) {
    const query = (link.getAttribute('href') ?? '').split('?')[1]
    if (!query) continue
    const params = new URLSearchParams(query)
    for (const key of ['subject', 'body', 'text']) {
      const value = params.get(key)
      if (value) decoded.push(value)
    }
  }
  return {
    headings: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(
      (h) => h.textContent ?? '',
    ),
    body: document.body.innerText,
    decoded,
  }
}

/**
 * RUNS INSIDE THE PAGE. Every visible `.btn--primary`, and for each screen-high slice of the
 * document the set of DIFFERENT places those buttons lead. The same action repeated — the
 * viewer's email button in the page and again in the fixed bar — is one destination, and
 * that is deliberate: apps/viewer/src/components/Contact.tsx records why both stay.
 */
export function primaryActionsInPage() {
  const screen = window.innerHeight
  const height = document.documentElement.scrollHeight
  const isFixed = (element) => {
    for (let node = element; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return true
    }
    return false
  }
  const primaries = [...document.querySelectorAll('.btn--primary')]
    .filter((element) => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden'
    })
    .map((element) => {
      const label = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
      const form = element.closest('form')
      const destination =
        element.getAttribute('href') ??
        (form ? `form:${form.getAttribute('action') ?? ''}` : `button:${label}`)
      return {
        label,
        destination,
        top: element.getBoundingClientRect().top + window.scrollY,
        fixed: isFixed(element),
      }
    })
  const windows = []
  for (let top = 0; top < height; top += screen) {
    const inside = primaries.filter((p) => p.fixed || (p.top >= top && p.top < top + screen))
    windows.push({ top, destinations: [...new Set(inside.map((p) => p.destination))] })
  }
  return { primaries, windows }
}
