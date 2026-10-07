import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CASE_STUDIES_HUB } from '../../lib/caseStudies'
import type { CaseStudyView } from '../../lib/caseStudyPublic'
import { JOURNAL_CLUSTERS, JOURNAL_HUB } from '../../lib/journal'
import type { JournalPostView } from '../../lib/journalPublic'
import { CaseStudyIndex, CaseStudyPage } from './CaseStudyPage'
import { JournalIndex } from './JournalIndex'
import { JournalPost } from './JournalPost'

/**
 * The Journal and case-study pages as HTML, server-rendered (G13: every word in the HTML
 * without JavaScript). Both hub states are held here: empty, the hub's words and the topics or
 * the template's parts with no post and no feed link; populated, the posts with their data.
 * The drawn half (layout, focus, 44px rows) is the browser suite's (`e2e/journal.spec.ts`).
 */

const picture = {
  url: 'https://media.wear-run.com/a.jpg',
  alt: 'Cutting a panel',
  width: 1600,
  height: 900,
}

const post = (over: Partial<JournalPostView> = {}): JournalPostView => ({
  slug: 'made-properly',
  path: '/journal/made-properly',
  title: 'What made properly means to us',
  description: 'How a garment is checked before it is packed.',
  cluster: { value: 'craft-and-making', label: 'Craft and making' },
  publishedAt: '2026-10-08T09:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
  author: null,
  hero: picture,
  share: { ...picture, width: 1200, height: 630 },
  body: {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          textFormat: 0,
          children: [
            {
              type: 'text',
              text: 'Read ',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
            {
              type: 'link',
              format: '',
              indent: 0,
              version: 3,
              direction: 'ltr',
              fields: { linkType: 'custom', url: 'javascript:alert(1)', newTab: false },
              children: [
                {
                  type: 'text',
                  text: 'this',
                  format: 0,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                  version: 1,
                },
              ],
            },
            {
              type: 'text',
              text: ' and ',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
            {
              type: 'link',
              format: '',
              indent: 0,
              version: 3,
              direction: 'ltr',
              fields: { linkType: 'custom', url: 'https://example.com/a', newTab: true },
              children: [
                {
                  type: 'text',
                  text: 'that',
                  format: 0,
                  detail: 0,
                  mode: 'normal',
                  style: '',
                  version: 1,
                },
              ],
            },
          ],
        },
        {
          type: 'upload',
          version: 3,
          format: '',
          relationTo: 'media',
          fields: null,
          value: {
            ...picture,
            id: 4,
            mimeType: 'image/jpeg',
            url: 'https://media.wear-run.help/b.jpg',
          },
        },
      ],
    },
  },
  related: [{ href: '/guides/minimum-order-and-samples', name: 'Minimum Order & Samples' }],
  checkedBy: null,
  ...over,
})

const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element)

describe('the Journal hub', () => {
  it('with no post: the hub words and the five topics, no post, no feed link, no Blog data', () => {
    const page = html(createElement(JournalIndex, { posts: [] }))
    expect(page).toContain(JOURNAL_HUB.heading)
    expect(page).toContain(JOURNAL_HUB.headingAccent)
    for (const cluster of JOURNAL_CLUSTERS) expect(page).toContain(cluster.label)
    expect(page).not.toContain('journal-card')
    expect(page).not.toContain('/journal/rss.xml')
    expect(page).not.toContain('"@type":"Blog"')
  })

  it('with posts: each post one link, the feed link, Blog data, and a filter once topics differ', () => {
    const one = html(createElement(JournalIndex, { posts: [post()] }))
    expect(one.match(/class="journal-card__link"/g)).toHaveLength(1)
    expect(one).toContain('href="/journal/rss.xml"')
    expect(one).toContain('"@type":"Blog"')
    expect(one).not.toContain('journal-filter')
    expect(one).toContain('<time dateTime="2026-10-08T09:00:00.000Z">October 8, 2026</time>')

    const two = html(
      createElement(JournalIndex, {
        posts: [
          post(),
          post({
            slug: 'news',
            path: '/journal/news',
            cluster: { value: 'company-news', label: 'Company news' },
          }),
        ],
      }),
    )
    expect(two).toContain('name="journal-topic"')
    expect(two).toContain('data-cluster="company-news"')
  })
})

describe('a Journal post', () => {
  const page = html(
    createElement(JournalPost, { post: post(), companyName: 'RUN APPAREL (PVT) LTD' }),
  )

  it('has one h1, the company as the writer, and BlogPosting data', () => {
    expect(page.match(/<h1/g)).toHaveLength(1)
    expect(page).toContain('RUN APPAREL (PVT) LTD')
    expect(page).toContain('"@type":"BlogPosting"')
  })

  it('draws the body without the script link, and the web link opens safely', () => {
    expect(page).not.toContain('javascript:')
    expect(page).toContain('Read this and')
    expect(page).toContain('href="https://example.com/a" target="_blank" rel="noopener noreferrer"')
  })

  it('draws a body picture from the site’s media host, with its size, lazily', () => {
    expect(page).toContain('src="https://media.wear-run.com/b.jpg"')
    expect(page).toMatch(
      /src="https:\/\/media\.wear-run\.com\/b\.jpg"[^>]*width="1600"[^>]*height="900"/,
    )
    expect(page).toMatch(/<img[^>]*class="journal-body__img"[^>]*loading="lazy"/)
  })

  it('shows "Updated" only when the post changed on a later day', () => {
    expect(page).not.toContain('Updated')
    const later = html(
      createElement(JournalPost, {
        post: post({ updatedAt: '2026-10-10T09:00:00.000Z' }),
        companyName: 'RUN APPAREL',
      }),
    )
    expect(later).toContain('Updated')
  })

  it('carries the AI-help line only when it was set (T14)', () => {
    expect(page).not.toContain('Drafted with AI help')
    const checked = html(
      createElement(JournalPost, { post: post({ checkedBy: 'A. Person' }), companyName: 'x' }),
    )
    expect(checked).toContain('Drafted with AI help and checked by A. Person.')
  })
})

const study: CaseStudyView = {
  slug: 'club-kit',
  path: '/case-studies/club-kit',
  title: 'Team kit for a club',
  description: 'Jerseys for a club.',
  publishedAt: '2026-10-08T09:00:00.000Z',
  updatedAt: '2026-10-08T09:00:00.000Z',
  facts: [
    { label: 'What was made', value: 'Jerseys' },
    { label: 'For whom', value: 'a club in the UK' },
  ],
  story: [{ label: 'The challenge', paragraphs: ['A tight date.'] }],
  clientName: null,
  quote: null,
  images: [picture],
  share: null,
  garments: [{ name: 'Velocity Performance Tee', href: '/products/rxps/wine' }],
}

describe('the case-study hub', () => {
  it('with none: the headline, what each will include, the first-story question and one button', () => {
    const page = html(createElement(CaseStudyIndex, { studies: [] }))
    expect(page).toContain(CASE_STUDIES_HUB.heading)
    for (const part of CASE_STUDIES_HUB.includes) expect(page).toContain(part)
    expect(page).toContain(CASE_STUDIES_HUB.firstStory)
    expect(page.match(/btn--primary/g)).toHaveLength(1)
    expect(page).not.toContain('CollectionPage')
  })

  it('with one: its card, CollectionPage data, and no first-story question', () => {
    const page = html(createElement(CaseStudyIndex, { studies: [study] }))
    expect(page).toContain('href="/case-studies/club-kit"')
    expect(page).toContain('"@type":"CollectionPage"')
    expect(page).not.toContain(CASE_STUDIES_HUB.firstStory)
  })
})

describe('a case study', () => {
  it('has one h1, its facts, Article data, and plain links to the garment pages', () => {
    const page = html(createElement(CaseStudyPage, { study, companyName: 'RUN APPAREL' }))
    expect(page.match(/<h1/g)).toHaveLength(1)
    expect(page).toContain('<dt>What was made</dt><dd>Jerseys</dd>')
    expect(page).toContain('"@type":"Article"')
    expect(page).toContain('<a href="/products/rxps/wine">Velocity Performance Tee</a>')
  })

  it('shows the client’s name beside "For whom" only when permitted (the projection decides)', () => {
    const named = html(
      createElement(CaseStudyPage, { study: { ...study, clientName: 'A Club' }, companyName: 'x' }),
    )
    expect(named).toContain('<dd>A Club, a club in the UK</dd>')
  })
})
