import { describe, expect, it } from 'vitest'
import { JOURNAL_HUB } from './journal'
import { buildJournalRss, rfc822, xmlEscape } from './journalRss'

/**
 * The Journal's RSS 2.0 feed (PLAN.md T9; RSS 2.0.11 spec, rssboard.org, read 2026-10-07: a
 * channel needs title, link and description; dates are RFC 822). A title with an ampersand or a
 * quote is the realistic failure: one unescaped `&` makes the whole feed malformed, and a feed
 * reader then shows nothing.
 */
describe('xmlEscape', () => {
  it('escapes the five characters XML reserves', () => {
    expect(xmlEscape(`Fish & chips <b> "quoted" 'single'`)).toBe(
      'Fish &amp; chips &lt;b&gt; &quot;quoted&quot; &apos;single&apos;',
    )
  })

  it('treats an entity typed into a title as text, not as markup', () => {
    expect(xmlEscape('&lt;')).toBe('&amp;lt;')
  })

  it('drops the control characters XML 1.0 cannot carry at all', () => {
    expect(xmlEscape('a\u0000b\u000bc\td\ne')).toBe('abc\td\ne')
  })
})

describe('rfc822', () => {
  it('writes the date RSS asks for, in GMT', () => {
    expect(rfc822('2026-10-08T09:00:00.000Z')).toBe('Thu, 08 Oct 2026 09:00:00 GMT')
  })
})

describe('buildJournalRss', () => {
  const origin = 'https://wear-run.com'
  const post = {
    path: '/journal/fish-and-chips',
    title: 'Fish & chips: "a" <story>',
    description: 'One & two',
    publishedAt: '2026-10-08T09:00:00.000Z',
    cluster: { value: 'company-news', label: 'Company news' },
  }

  it('is RSS 2.0 with the three required channel elements', () => {
    const xml = buildJournalRss([], origin)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')
    expect(xml).toContain('<title>RUN APPAREL Journal</title>')
    expect(xml).toContain(`<link>${origin}/journal</link>`)
    expect(xml).toContain(`<description>${xmlEscape(JOURNAL_HUB.description)}</description>`)
    expect(xml).toContain(
      `<atom:link href="${origin}/journal/rss.xml" rel="self" type="application/rss+xml"/>`,
    )
    expect(xml).not.toContain('<item>')
  })

  it('lists each post with its escaped words, permalink guid, date and cluster', () => {
    const xml = buildJournalRss([post], origin)
    expect(xml).toContain('<title>Fish &amp; chips: &quot;a&quot; &lt;story&gt;</title>')
    expect(xml).toContain(`<link>${origin}/journal/fish-and-chips</link>`)
    expect(xml).toContain(`<guid isPermaLink="true">${origin}/journal/fish-and-chips</guid>`)
    expect(xml).toContain('<description>One &amp; two</description>')
    expect(xml).toContain('<pubDate>Thu, 08 Oct 2026 09:00:00 GMT</pubDate>')
    expect(xml).toContain('<category>Company news</category>')
    expect(xml).toContain('<lastBuildDate>Thu, 08 Oct 2026 09:00:00 GMT</lastBuildDate>')
    // No raw ampersand anywhere outside an entity.
    expect(xml.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toContain('&')
  })
})
