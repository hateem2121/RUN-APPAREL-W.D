/**
 * WHERE A SHORT SUMMARY MAY STOP: AT THE END OF A SENTENCE (owner, 2026-10-26, site check).
 *
 * Beside the garment the description shows three lines and "Read more" (polish D8). The browser
 * did the cutting, with `-webkit-line-clamp`, and it cuts where the third line runs out: on the
 * live R-XPS page the summary ended "…chamois pad in sever…", half a word. This finds the longest
 * run of WHOLE sentences that still fits, so the summary ends at a full stop and "Read more"
 * opens the rest. `ProductIdentity.tsx` measures; this is the part a unit test can reach.
 *
 * A sentence ends at `.`, `!` or `?` (with any closing quote or bracket after it) that is followed
 * by white space and then something that is not a lowercase letter. The last rule is the guard
 * against the commonest false stop: "e.g. a zip", "approx. five", "...and then". It errs the safe
 * way: a missed stop only means a shorter summary, never one cut inside a sentence. Not
 * `Intl.Segmenter`: it is missing before Safari 14.1, and the page's floor is iOS 15.4 with
 * nothing older to test on (`apps/viewer/CLAUDE.md`), so an unverifiable branch would have
 * guarded a cut that must not fail.
 */

/** A full stop of a sentence is never the dot of these (compared in lower case, dots removed). */
const ABBREVIATIONS = new Set(['vs', 'approx', 'no', 'nos', 'st', 'mr', 'mrs', 'ms', 'dr', 'inc'])

const STOP = /[.!?]+["'”’)\]]*(?=\s|$)/g

/**
 * Each offset in `text` just after a sentence's last mark, in order, leaving out the end of the
 * text itself: the whole text is not a shorter summary of itself.
 */
export function sentenceEnds(text: string): number[] {
  const wholeLength = text.trimEnd().length
  const ends: number[] = []
  for (const match of text.matchAll(STOP)) {
    const end = match.index + match[0].length
    if (end >= wholeLength) continue
    // A lower-case letter next means the full stop was an abbreviation or an ellipsis.
    const next = /\S/.exec(text.slice(end))?.[0] ?? ''
    if (next !== next.toUpperCase()) continue
    // "R. Smith", "U.S. Army", "etc.," style tokens: a single capital or an inner dot.
    const word = /(\S+)$/.exec(text.slice(0, match.index))?.[1] ?? ''
    const bare = word.replace(/^[("'“‘]+/, '')
    if (/^[A-Za-z]$/.test(bare) || bare.includes('.')) continue
    if (match[0] === '.' && ABBREVIATIONS.has(bare.toLowerCase())) continue
    ends.push(end)
  }
  return ends
}

/**
 * The length of the longest run of whole sentences at the start of `text` that `fits`, or `null`
 * when not even the first sentence does (or there is only one): the caller then keeps the browser's
 * own cut, which is what the page did before. `fits` is called with a candidate summary and must
 * grow harder to satisfy with a longer one, as three lines of text do.
 */
export function longestFittingSentences(
  text: string,
  fits: (candidate: string) => boolean,
): number | null {
  const ends = sentenceEnds(text)
  for (let i = ends.length - 1; i >= 0; i -= 1) {
    const end = ends[i] as number
    if (fits(text.slice(0, end))) return end
  }
  return null
}
