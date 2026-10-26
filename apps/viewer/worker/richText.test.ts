import { describe, expect, it } from 'vitest'
import { richTextParagraphs } from './richText'

/**
 * The CMS sends a garment's customization intro as HTML (`customisationIntroHtml`, serialised from
 * its rich text on the server). The robots' copy needs the WORDS, one paragraph at a time, and
 * escapes them again itself (`preview.ts`), so this only has to read text out of markup, safely.
 */
describe('richTextParagraphs', () => {
  it('reads the words of the CMS’s own wrapper and paragraph', () => {
    expect(
      richTextParagraphs(
        '<div class="payload-richtext"><p>We work as a custom cycling skinsuit manufacturer.</p></div>',
      ),
    ).toEqual(['We work as a custom cycling skinsuit manufacturer.'])
  })

  it('keeps each paragraph, list item and heading apart, and the order they came in', () => {
    expect(
      richTextParagraphs(
        '<h2>Start</h2><p>One.</p><ul><li>Tech pack</li><li>Sketch</li></ul><p>Two<br>lines</p>',
      ),
    ).toEqual(['Start', 'One.', 'Tech pack', 'Sketch', 'Two', 'lines'])
  })

  it('drops inline markup but keeps its words, with no space cut into the middle of a word', () => {
    expect(
      richTextParagraphs(
        '<p>Test orders start at <strong>50</strong> pieces, <a href="/x">ask</a>.</p>',
      ),
    ).toEqual(['Test orders start at 50 pieces, ask.'])
    expect(richTextParagraphs('<p>Fab<em>ric</em> knit</p>')).toEqual(['Fabric knit'])
  })

  it('turns character references into the characters, once', () => {
    expect(
      richTextParagraphs('<p>Tom &amp; Jerry&#39;s &quot;pad&quot; &#x2014; 50&nbsp;pcs</p>'),
    ).toEqual(['Tom & Jerry\'s "pad" — 50 pcs'])
    // Decoded ONCE: the text is "&amp;lt;", not "<".
    expect(richTextParagraphs('<p>&amp;lt;b&amp;gt;</p>')).toEqual(['&lt;b&gt;'])
  })

  it('leaves a script, a style and a comment out, with their contents', () => {
    expect(
      richTextParagraphs(
        '<p>Before.</p><script>alert(1)</script><style>p{color:red}</style><!-- hidden --><p>After.</p>',
      ),
    ).toEqual(['Before.', 'After.'])
    expect(richTextParagraphs('<p>Kept.</p><!-- never closed <p>lost</p>')).toEqual(['Kept.'])
  })

  it('reads a ">" inside an attribute as part of the tag, not as text', () => {
    expect(richTextParagraphs('<p>Fits <a title="a>b" href="/x">well</a>.</p>')).toEqual([
      'Fits well.',
    ])
  })

  it('hands back text that cannot be markup: a "<" that opens no tag stays a plain character', () => {
    // The caller escapes it; what matters here is that nothing is swallowed or invented.
    expect(richTextParagraphs('<p>2 < 3 and 5 > 4</p>')).toEqual(['2 < 3 and 5 > 4'])
    expect(richTextParagraphs('<p><<b>x</b></p>')).toEqual(['<x'])
  })

  it('returns nothing for empty or all-markup input', () => {
    expect(richTextParagraphs('')).toEqual([])
    expect(richTextParagraphs('<div class="payload-richtext"><p> </p></div>')).toEqual([])
    expect(richTextParagraphs('   ')).toEqual([])
  })
})
