/**
 * THE WORDS OF THE CMS'S RICH TEXT, ONE PARAGRAPH AT A TIME (owner, 2026-10-26, site check).
 *
 * A garment's customization intro arrives as HTML (`customisationIntroHtml`, serialised from its
 * rich text on the server by `convertLexicalToHTML`), and the page puts it on screen as markup. The
 * copy served to robots (`preview.ts`, `buildCrawlerBody`) is built from escaped plain text, so it
 * needs the words and nothing else.
 *
 * ⚠️ A READER, NOT A SANITISER, and that is why there is no `replace(/<[^>]*>/g, '')` here. A
 * regular-expression strip can leave markup behind (removing an inner tag can join the text round
 * it into a new one), which is what CodeQL's `js/incomplete-multi-character-sanitization` flags in
 * this repo (`scripts/strip-until-stable.mjs` says how it was met elsewhere). This walks the text
 * once, left to right, and builds NEW text from the characters between tags; nothing it returns
 * is ever parsed as markup again. The caller escapes every paragraph (`esc()` in `preview.ts`), so
 * a `<` that survives, from an entity such as `&lt;`, arrives as `&lt;`.
 *
 * Workers have no DOM and `HTMLRewriter` streams a response, so a small reader is the honest tool.
 * Pure string work only: `preview.ts` is also compiled by the app's tsconfig for its test.
 */

/** Tags that end the paragraph being read, and start the next. */
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'br',
  'hr',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'section',
  'article',
  'table',
  'tr',
  'td',
  'th',
])

/** Tags whose contents are not words at all. */
const OPAQUE_TAGS = new Set(['script', 'style'])

const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Character references to characters, in ONE pass: `&amp;lt;` is the text "&lt;", not "<". */
function decodeReferences(text: string): string {
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code = /^#[xX]/.test(name) ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isInteger(code) &&
        code > 0 &&
        code <= 0x10ffff &&
        !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : whole
    }
    return NAMED_REFERENCES[name.toLowerCase()] ?? whole
  })
}

/** The index of the `>` that ends the tag opening at `from`, skipping quoted attribute values. */
function tagEnd(html: string, from: number): number {
  let quote = ''
  for (let i = from + 1; i < html.length; i += 1) {
    const ch = html.charAt(i)
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i
    }
  }
  return -1
}

/** The paragraphs of words in `html`, in order, white space collapsed, none empty. */
export function richTextParagraphs(html: string): string[] {
  const paragraphs: string[] = []
  let current = ''
  let raw = ''
  const takeText = () => {
    current += decodeReferences(raw)
    raw = ''
  }
  const endParagraph = () => {
    takeText()
    const text = current.replace(/\s+/g, ' ').trim()
    if (text) paragraphs.push(text)
    current = ''
  }

  let i = 0
  while (i < html.length) {
    if (html.charAt(i) === '<') {
      if (html.startsWith('<!--', i)) {
        // A comment, and an unclosed one runs to the end, as a browser reads it.
        const close = html.indexOf('-->', i + 4)
        i = close === -1 ? html.length : close + 3
        continue
      }
      const name = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, i + 24))
      const end = name ? tagEnd(html, i) : -1
      if (name && end !== -1) {
        const tag = (name[2] ?? '').toLowerCase()
        const closing = name[1] === '/'
        takeText()
        if (BLOCK_TAGS.has(tag)) endParagraph()
        i = end + 1
        if (OPAQUE_TAGS.has(tag) && !closing) {
          const closer = new RegExp(`</${tag}\\b`, 'gi')
          closer.lastIndex = i
          const found = closer.exec(html)
          if (!found) break
          const closeEnd = tagEnd(html, found.index)
          i = closeEnd === -1 ? html.length : closeEnd + 1
        }
        continue
      }
      // A "<" that opens no tag is a plain character.
    }
    raw += html.charAt(i)
    i += 1
  }
  endParagraph()
  return paragraphs
}
