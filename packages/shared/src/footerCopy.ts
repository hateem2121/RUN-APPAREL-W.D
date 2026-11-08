/**
 * Split "…needs making properly?" into the part before the last word, the last word,
 * and its trailing punctuation — so the component can set ONE word in the serif accent
 * without the CMS field carrying markup.
 *
 * ⚠️ A SCAN FROM THE END, NOT A REGEX (CodeQL js/polynomial-redos, alert #95, 2026-11-08). The old
 * pattern /^(.*?)(\S+?)([^\w\s]*)$/ backtracked in cubic time on a line break after a run of "!":
 * 2,000 took 1.1 s, 4,000 took 8.6 s and 8,000 took 67 s, measured in Node 26, and this runs on
 * every page that draws the footer. This version gave the same answer on 200,000 random strings
 * (letters, punctuation, emoji, spaces, tabs, line breaks), so the rules below are the old
 * pattern's, written out: the last word is the run of non-spaces at the end; its trailing
 * punctuation is the longest run of characters that are neither ASCII word characters nor spaces,
 * leaving at least one character as the word; and, as `.` never crossed a line break, a sentence
 * holding one is returned whole as the "last word".
 */
const LINE_BREAK = /[\n\r\u2028\u2029]/
const SPACE = /\s/
const WORD_OR_SPACE = /[\w\s]/

export function splitLastWord(sentence: string): { head: string; last: string; tail: string } {
  const trimmed = sentence.trimEnd()
  if (trimmed === '' || LINE_BREAK.test(trimmed)) return { head: '', last: trimmed, tail: '' }
  let start = trimmed.length
  while (start > 0 && !SPACE.test(trimmed.charAt(start - 1))) start--
  let end = trimmed.length
  while (end > start + 1 && !WORD_OR_SPACE.test(trimmed.charAt(end - 1))) end--
  return {
    head: trimmed.slice(0, start),
    last: trimmed.slice(start, end),
    tail: trimmed.slice(end),
  }
}
