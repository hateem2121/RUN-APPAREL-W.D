import { JOURNAL_HUB, JOURNAL_PATH, JOURNAL_RSS_PATH } from './journal'

/**
 * The Journal's feed at `/journal/rss.xml` (PLAN.md T9: feed readers, and Pinterest can pin
 * from RSS). RSS 2.0.11 (rssboard.org, read 2026-10-07): a channel needs `title`, `link` and
 * `description`; every date is RFC 822. The `atom:link rel="self"` is the RSS Advisory Board's
 * own recommendation, so a reader knows the feed's address.
 *
 * Pure: the route passes in the published posts the page shows.
 */

/**
 * Escapes text for XML. ⚠️ `&` FIRST, or the other replacements' own ampersands would be
 * escaped again. Characters XML 1.0 cannot carry at all (control characters other than tab,
 * newline and carriage return) are dropped: an escaped one is still invalid, and one of them
 * pasted into a title would make the whole feed unreadable.
 */
export function xmlEscape(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  )
}

/** An ISO date as RFC 822, in GMT (`toUTCString` writes exactly that form). */
export function rfc822(iso: string): string {
  return new Date(iso).toUTCString()
}

type FeedPost = {
  path: string
  title: string
  description: string
  publishedAt: string
  cluster: { label: string } | null
}

export function buildJournalRss(posts: readonly FeedPost[], origin: string): string {
  const items = posts
    .map((post) => {
      const url = `${origin}${post.path}`
      return [
        '    <item>',
        `      <title>${xmlEscape(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <description>${xmlEscape(post.description)}</description>`,
        `      <pubDate>${rfc822(post.publishedAt)}</pubDate>`,
        ...(post.cluster ? [`      <category>${xmlEscape(post.cluster.label)}</category>`] : []),
        '    </item>',
      ].join('\n')
    })
    .join('\n')
  const newest = posts[0]?.publishedAt
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>RUN APPAREL Journal</title>',
    `    <link>${origin}${JOURNAL_PATH}</link>`,
    `    <description>${xmlEscape(JOURNAL_HUB.description)}</description>`,
    '    <language>en-us</language>',
    `    <atom:link href="${origin}${JOURNAL_RSS_PATH}" rel="self" type="application/rss+xml"/>`,
    ...(newest ? [`    <lastBuildDate>${rfc822(newest)}</lastBuildDate>`] : []),
    ...(items ? [items] : []),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
