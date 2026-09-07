/**
 * Reading level, for the copy on the public marketing site (audit FA-I-11).
 *
 * ⚠️ WHY A NUMBER AT ALL. The audit scored the site's reading level 8/10 and nothing was
 * holding it there. The copy is deliberately plain — "Send what you have. A sketch is
 * enough." — and plain copy is one editing pass from becoming "Our vertically integrated
 * manufacturing capability facilitates..." The buyers this site is written for are
 * frequently reading English as a second language; a grade level is the cheapest
 * available proxy for whether that is still true, and unlike a style opinion it can fail
 * a build.
 *
 * ⚠️ IT IS A PROXY AND THIS FILE SAYS SO. Flesch–Kincaid counts syllables and sentence
 * length. It cannot tell good writing from bad, it is confused by lists and by anything
 * without a full stop, and a short sentence of jargon scores beautifully. It is used here
 * as a CEILING on one measurable kind of density, not as a verdict on the prose.
 *
 * ⚠️ MEASURE PROSE, NOT LABELS. Applied to `main.innerText` on /products the same formula
 * returns grade 17.5, because a gallery of card names and mono chips has 145 words and 5
 * full stops — a "sentence" of 29 words with no verb in it. Restricted to real
 * paragraphs the same page is grade 8.4. Whatever calls this must select prose; that is
 * why the selection lives in the caller and not in here.
 */

/**
 * Syllables in one English word, by the vowel-group heuristic every implementation of
 * this metric uses. It is wrong on individual words (`business` counts 2, not 3) and
 * close enough in aggregate, which is the only way it is ever read.
 */
export function syllablesIn(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export type Readability = {
  words: number
  sentences: number
  wordsPerSentence: number
  syllablesPerWord: number
  /** Flesch–Kincaid grade level. Lower is plainer. */
  grade: number
  /** Flesch reading ease. HIGHER is plainer — the two scales run opposite ways. */
  ease: number
}

/**
 * ⚠️ A "SENTENCE" NEEDS MORE THAN ONE WORD. Without that filter, an abbreviation or a
 * decimal splits one sentence into two and the score improves for a text nobody changed.
 * Returns null rather than a number when there is nothing to measure, so a caller that
 * selected the wrong elements gets an absence it has to handle instead of a grade of 0.
 */
export function readability(text: string): Readability | null {
  const clean = text.replace(/\s+/g, ' ').trim()
  const sentences = clean
    .split(/[.!?]+(?=\s|$)/)
    .filter((part) => part.trim().split(/\s+/).filter(Boolean).length > 1)
  const words = clean.match(/[A-Za-z][A-Za-z'-]*/g) ?? []
  if (sentences.length === 0 || words.length === 0) return null

  const syllables = words.reduce((total, word) => total + syllablesIn(word), 0)
  const wordsPerSentence = words.length / sentences.length
  const syllablesPerWord = syllables / words.length

  return {
    words: words.length,
    sentences: sentences.length,
    wordsPerSentence: round(wordsPerSentence),
    syllablesPerWord: round(syllablesPerWord, 3),
    grade: round(0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59),
    ease: round(206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord, 1),
  }
}

function round(value: number, places = 2): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}
