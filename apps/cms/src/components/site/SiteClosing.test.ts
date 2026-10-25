import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FAQ_TOPICS } from '../../lib/faqs'
import { guideAt } from '../../lib/guides'
import { SiteClosing } from './ArticleParts'
import { CompanyClosing } from './CompanyPage'
import { FaqHubPage, FaqTopicPage } from './FaqPages'
import { GlossaryPage } from './GlossaryPage'
import { GuidePage } from './GuidePage'

/**
 * "Tell us what you're making." is written ONCE, in `SiteClosing` (ArticleParts.tsx). The company
 * pages, the FAQ pages, the glossary and the guides each typed their own copy until 2026-10-24,
 * so a reword needed five edits and one missed would have left a page saying the old words.
 *
 * The drawn half (nothing about these pages looks different) is held by the browser suites; the
 * markup was compared byte for byte before and after the change for every guide, FAQ page, the
 * glossary and the company closing.
 */

/** The heading as a reader gets it: a right quote and a no-break space. */
const HEADING = 'Tell us what you’re making.'

const SITE_DIR = import.meta.dirname

const countOf = (html: string, needle: string) => html.split(needle).length - 1

const closing = (props?: { children?: unknown }) =>
  renderToStaticMarkup(createElement(SiteClosing, props as never))

describe('SiteClosing draws the heading, the lede and one primary button', () => {
  it('has the heading once, then the lede, then the one button to the enquiry form', () => {
    const html = closing()
    expect(countOf(html, HEADING)).toBe(1)
    expect(html.indexOf(HEADING)).toBeLessThan(html.indexOf('Send the styles'))
    expect(html.indexOf('Send the styles')).toBeLessThan(html.indexOf('btn btn--primary'))
    expect(countOf(html, 'btn--primary')).toBe(1)
    expect(html).toContain('href="/contact#inquiry"')
  })

  it('draws its children inside the column of words, after the button', () => {
    const html = closing({ children: createElement('nav', { id: 'extra' }, 'More') })
    const words = /<div class="section-head__words">([\s\S]*)<\/div><\/div>$/.exec(html)?.[1]
    expect(words, 'the children are not inside .section-head__words').toBeDefined()
    expect(words?.indexOf('btn btn--primary')).toBeGreaterThan(-1)
    expect(words?.indexOf('<nav id="extra">')).toBeGreaterThan(words?.indexOf('</a>') ?? Infinity)
    expect(html.endsWith('<nav id="extra">More</nav></div></div>')).toBe(true)
  })

  // NEGATIVE CONTROL, both ways: children before the button, or none drawn, are caught by the
  // same check the real markup passes.
  it('sees children drawn before the button, or left out', () => {
    const real = closing({ children: createElement('nav', { id: 'extra' }, 'More') })
    const extraAfterButton = (html: string) =>
      html.indexOf('<nav id="extra">') > html.indexOf('btn btn--primary')
    expect(extraAfterButton(real)).toBe(true)
    const planted = real
      .replace('<nav id="extra">More</nav>', '')
      .replace('<div class="site-actions">', '<nav id="extra">More</nav><div class="site-actions">')
    expect(planted, 'the planted move did not land').not.toBe(real)
    expect(extraAfterButton(planted)).toBe(false)
    expect(extraAfterButton(closing())).toBe(false)
  })
})

describe('every page that ends on the closing block draws its heading exactly once', () => {
  const pages: [string, () => string][] = [
    [
      'a company page (CompanyClosing)',
      () =>
        renderToStaticMarkup(
          createElement(CompanyClosing, { links: [{ href: '/about', name: 'About' }] } as never),
        ),
    ],
    [
      'an FAQ topic page',
      () => renderToStaticMarkup(createElement(FaqTopicPage, { topic: FAQ_TOPICS[0] as never })),
    ],
    ['the FAQ hub', () => renderToStaticMarkup(createElement(FaqHubPage))],
    ['the glossary', () => renderToStaticMarkup(createElement(GlossaryPage))],
    [
      'a guide',
      () =>
        renderToStaticMarkup(
          createElement(GuidePage, { guide: guideAt('/guides/minimum-order-and-samples') }),
        ),
    ],
  ]

  for (const [name, render] of pages) {
    it(`${name}: the heading once, the button once, in the closing block`, () => {
      const html = render()
      expect(countOf(html, HEADING)).toBe(1)
      expect(countOf(html, 'href="/contact#inquiry"')).toBe(1)
      expect(html).toContain('<div class="section-head"><h2 class="display display--section">')
    })
  }

  it('keeps the links where each page had them: under the button, or under the whole block', () => {
    const company = pages[0]?.[1]() ?? ''
    expect(company).toMatch(
      /<div class="site-actions">[\s\S]*<\/div><nav class="see-also company-closing__more" aria-label="More about us">/,
    )
    const faq = pages[1]?.[1]() ?? ''
    expect(faq).toMatch(
      /<div class="site-actions">[\s\S]*<\/div><nav class="see-also company-closing__more" aria-labelledby="more-to-read">/,
    )
    // The guides' links come after the whole block, not inside its column of words.
    const guide = pages[4]?.[1]() ?? ''
    expect(guide).toMatch(
      /<\/div><\/div><\/div><nav class="see-also" aria-labelledby="more-to-read">/,
    )
    expect(guide.indexOf(HEADING)).toBeLessThan(guide.indexOf('aria-labelledby="more-to-read"'))
  })
})

describe('no page types the closing words itself (the fault this change removes)', () => {
  // The words live in SiteClosing alone. `FactsBento.tsx`'s own ask ("Tell us what you’re
  // making." with a clock and a call button) is a different block and uses a plain apostrophe in
  // a constant, not this markup; `FamilyLanding.tsx`'s lede is a different sentence.
  const WORDS = 're&nbsp;making'
  const LEDE = 'Send the styles, quantities and specs you have — a sketch is enough to start'

  const sources = Object.fromEntries(
    readdirSync(SITE_DIR)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => [file, readFileSync(join(SITE_DIR, file), 'utf8').replace(/\s+/g, ' ')]),
  )

  /** The files that write the words themselves. */
  const holdersIn = (files: Record<string, string>) =>
    Object.entries(files)
      .filter(([, source]) => source.includes(WORDS) || source.includes(LEDE))
      .map(([file]) => file)

  it('finds the heading and the lede in ArticleParts.tsx and nowhere else', () => {
    expect(Object.keys(sources).length, 'no components were read').toBeGreaterThan(20)
    expect(holdersIn(sources)).toEqual(['ArticleParts.tsx'])
  })

  // NEGATIVE CONTROL, both ways: the real tree is clean, then a page given its own copy of the
  // heading, and one given its own copy of the lede, are each named.
  it('sees a page with a hand-typed copy', () => {
    const glossary = sources['GlossaryPage.tsx'] ?? ''
    const withHeading = {
      ...sources,
      'GlossaryPage.tsx': `${glossary} <h2>Tell us what you&rsquo;re&nbsp;making.</h2>`,
    }
    expect(holdersIn(withHeading)).toEqual(['ArticleParts.tsx', 'GlossaryPage.tsx'])
    const withLede = {
      ...sources,
      'FaqPages.tsx': `${sources['FaqPages.tsx'] ?? ''} <p>${LEDE}. We reply within 24 hours.</p>`,
    }
    expect(holdersIn(withLede)).toEqual(['ArticleParts.tsx', 'FaqPages.tsx'])
  })
})
