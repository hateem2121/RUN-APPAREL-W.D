/**
 * Split "…needs making properly?" into the part before the last word, the last word,
 * and its trailing punctuation — so the component can set ONE word in the serif accent
 * without the CMS field carrying markup.
 */
export function splitLastWord(sentence: string): { head: string; last: string; tail: string } {
  const trimmed = sentence.trimEnd()
  const match = /^(.*?)(\S+?)([^\w\s]*)$/.exec(trimmed)
  if (!match) return { head: '', last: trimmed, tail: '' }
  return { head: match[1] ?? '', last: match[2] ?? '', tail: match[3] ?? '' }
}
