/**
 * Soft hyphens (U+00AD) at syllable points in a colour name, for the colourway rail's
 * LABEL only (audit SZ-06).
 *
 * ⚠️ WHY. The rail gives each of five colourways a fixed share of its width, and a colour
 * name is CMS content. Measured live 2026-09-17 on all 80 pages: 50 of 400 labels broke
 * INSIDE a word at 390px ("TERRACO" / "TTA") and 70 at 320px. `overflow-wrap: anywhere`
 * (page.css) is what keeps a long name inside its tab, and it breaks wherever the line runs
 * out. `hyphens: auto` was measured to do nothing beside it and to overflow without it, so
 * the break points are supplied here instead: "TERRA-" / "COTTA".
 *
 * ⚠️ THE LABEL ONLY — never the data, the tab's accessible name, a page title or a link
 * preview. A soft hyphen is invisible until it ends a line, and nothing but a line box should
 * ever meet one. `ColourwayTabs.tsx` names the tab with `aria-label` for that reason.
 *
 * ⚠️ WHY THE SYLLABLES ARE SHORT. A 10px mono cell is 6.62px in Chromium and Firefox and
 * 6.78px in WebKit, tracking included, and a 320px phone's label box is 39.75px: five cells
 * always fit, a sixth only in Chromium, by one layout unit (measured 2026-09-17). When no
 * soft hyphen fits a line, Chromium breaks INSIDE the syllable ("TERR" / "A-"), so every
 * syllable but the last is at most four letters and the last at most five. "chest" and
 * "quoise" are one sound each and longer; on the narrowest phones `anywhere` still breaks
 * those two, exactly as it did before this file existed.
 *
 * A word the dictionary does not know goes through `fallbackBreaks`, a small rule tested on
 * words the catalogue does not hold yet. A word it cannot place is left alone — today's
 * behaviour.
 */

/** U+00AD SOFT HYPHEN: invisible unless the line breaks there. */
export const SOFT_HYPHEN = '\u{00AD}'

/**
 * Shorter words are never touched. Seven mono cells fit a rail label at 390px in every
 * engine; at 320px WebKit fits five, and a six-letter word there is still broken by
 * `anywhere`, as before.
 */
export const LONG_WORD = 7

/** The fallback keeps splitting a piece only while it is longer than this. */
const MAX_PIECE = 6

/**
 * Syllable points, dictionary style, for every palette word of 7+ letters in
 * `tools/asset-pipeline/src/colour-name.ts` and every such word in a live colourway slug
 * (`scripts/live-products.mjs`). `softHyphenate.test.ts` fails when either list gains a word
 * this does not carry. Keys are lower case; a label keeps its own case.
 *
 * Extra points cost nothing on a wide line: the browser ends a line at the LAST break that
 * fits, so "ter-ra-cotta" still renders "TERRA-" / "COTTA" at 390px.
 */
export const SYLLABLES: Readonly<Record<string, string>> = {
  amethyst: 'ame-thyst',
  burgundy: 'bur-gundy',
  charcoal: 'char-coal',
  chestnut: 'chest-nut',
  crimson: 'crim-son',
  emerald: 'emer-ald',
  fuchsia: 'fuch-sia',
  lavender: 'lav-en-der',
  magenta: 'ma-genta',
  mustard: 'mus-tard',
  scarlet: 'scar-let',
  tangerine: 'tan-ger-ine',
  terracotta: 'ter-ra-cotta',
  turquoise: 'tur-quoise',
}

/** Letter pairs that sound as one consonant: never split between. */
const DIGRAPHS = ['ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ck', 'qu']
/** Pairs that can open a syllable inside a word (ta-ble, pro-gram). */
const ONSETS = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr'])
/** S-pairs that open a syllable only after another consonant (sand-stone, but mus-tard). */
const S_ONSETS = new Set(['sc', 'sk', 'sp', 'st'])

interface Unit {
  text: string
  start: number
  vowel: boolean
}

function units(word: string): Unit[] {
  const lower = word.toLowerCase()
  const out: Unit[] = []
  let i = 0
  while (i < lower.length) {
    const pair = lower.slice(i, i + 2)
    if (DIGRAPHS.includes(pair)) {
      out.push({ text: pair, start: i, vowel: false })
      i += 2
      continue
    }
    const letter = lower[i] ?? ''
    out.push({
      text: letter,
      start: i,
      vowel: /[aeiou]/.test(letter) || (letter === 'y' && i > 0),
    })
    i += 1
  }
  return out
}

/**
 * Where a word may break: between its vowel groups, before the consonant that opens the next
 * syllable. A consonant cluster ("strong") is a surer place than a lone consonant. At least
 * two letters stay before a break and three after it.
 */
function candidates(word: string): { at: number; strong: boolean }[] {
  const list = units(word)
  const found: { at: number; strong: boolean }[] = []
  let i = 0
  while (i < list.length && !list[i]!.vowel) i += 1
  while (i < list.length) {
    while (i < list.length && list[i]!.vowel) i += 1
    const run: Unit[] = []
    while (i < list.length && !list[i]!.vowel) {
      run.push(list[i]!)
      i += 1
    }
    if (i >= list.length || run.length === 0) break
    let at: number
    if (run.length === 1) {
      const only = run[0]!
      // "mack-erel": ck closes a syllable and never opens one.
      at = only.text === 'ck' ? only.start + 2 : only.start
    } else {
      const lastTwo = run
        .slice(-2)
        .map((unit) => unit.text)
        .join('')
      const keepTwo = (run.length >= 3 && S_ONSETS.has(lastTwo)) || ONSETS.has(lastTwo)
      at = run[run.length - (keepTwo ? 2 : 1)]!.start
    }
    found.push({ at, strong: run.length > 1 })
  }
  return found.filter(({ at }) => at >= 2 && word.length - at >= 3)
}

/** One break nearest the middle, then the same for any piece still longer than MAX_PIECE. */
function fallbackBreaks(word: string, offset = 0): number[] {
  if (word.length <= MAX_PIECE) return []
  const all = candidates(word)
  const strong = all.filter((candidate) => candidate.strong)
  const pool = strong.length > 0 ? strong : all
  if (pool.length === 0) return []
  const middle = word.length / 2
  const best = pool.reduce((a, b) => (Math.abs(b.at - middle) < Math.abs(a.at - middle) ? b : a))
  return [
    ...fallbackBreaks(word.slice(0, best.at), offset),
    offset + best.at,
    ...fallbackBreaks(word.slice(best.at), offset + best.at),
  ]
}

/** Where `word` takes a soft hyphen, as offsets into it. Empty means "leave it alone". */
export function syllableBreaks(word: string): number[] {
  if (word.length < LONG_WORD) return []
  const key = word.toLowerCase()
  // `Object.hasOwn`, not `SYLLABLES[key] !== undefined`: a word like "constructor" would
  // otherwise find Object's own property and try to split a function.
  if (Object.hasOwn(SYLLABLES, key)) {
    const breaks: number[] = []
    let at = 0
    for (const piece of SYLLABLES[key]!.split('-').slice(0, -1)) {
      at += piece.length
      breaks.push(at)
    }
    return breaks
  }
  // Letters outside plain English (Écarlate) are left alone rather than guessed at.
  if (!/^[A-Za-z]+$/.test(word)) return []
  return fallbackBreaks(word)
}

/** `label` with a soft hyphen at every syllable point of its long words. */
export function softHyphenate(label: string): string {
  return label.replace(/\p{L}+/gu, (word) => {
    let out = ''
    let from = 0
    for (const at of syllableBreaks(word)) {
      out += word.slice(from, at) + SOFT_HYPHEN
      from = at
    }
    return out + word.slice(from)
  })
}
