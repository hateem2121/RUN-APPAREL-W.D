import assert from 'node:assert/strict'
import { test } from 'node:test'
import { issueBody, parseFeed, pickNew, WINDOW_DAYS } from './check-actions-changelog.mjs'

// Shaped like github.blog/changelog/label/actions/feed/ as fetched on 2026-11-08: whitespace and a
// dc:creator between the fields, CDATA descriptions, numeric entities in titles.
const item = (title, slug, date) => `<item>
		<title>${title}</title>
		<link>https://github.blog/changelog/${slug}</link>
		<dc:creator><![CDATA[Someone]]></dc:creator>
		<pubDate>${date}</pubDate>
		<guid isPermaLink="false">https://github.blog/changelog/${slug}</guid>
		<description><![CDATA[<p>Body with a <a href="https://example.com">link</a>.</p>]]></description>
	</item>`
const FEED = `<?xml version="1.0"?><rss><channel><title>Actions</title>
${item('pull_request_target blocked by default December 2', '2026-11-02-prt', 'Mon, 02 Nov 2026 15:14:46 +0000')}
${item('GitHub Actions workflow lockfiles are generally available', '2026-10-28-lock', 'Wed, 28 Oct 2026 15:30:00 +0000')}
${item('What&#8217;s new &amp; improved', '2026-10-01-old', 'Thu, 01 Oct 2026 19:11:23 +0000')}
</channel></rss>`
const NOW = Date.parse('2026-11-08T12:00:00Z')

test('reads every entry with its title, link and date, entities decoded', () => {
  const items = parseFeed(FEED)
  assert.equal(items.length, 3)
  assert.equal(items[2].title, 'What’s new & improved')
  assert.equal(items[0].link, 'https://github.blog/changelog/2026-11-02-prt')
})

test(`keeps only the last ${WINDOW_DAYS} days, oldest first`, () => {
  const fresh = pickNew(parseFeed(FEED), '', NOW)
  assert.deepEqual(
    fresh.map((e) => e.link.split('/').pop()),
    ['2026-10-28-lock', '2026-11-02-prt'],
  )
})

test('NEGATIVE CONTROL: a link an earlier issue already carries is not reported again', () => {
  const earlier = 'New entries…\n- 2026-11-02 — [x](https://github.blog/changelog/2026-11-02-prt)'
  const fresh = pickNew(parseFeed(FEED), earlier, NOW)
  assert.deepEqual(
    fresh.map((e) => e.link.split('/').pop()),
    ['2026-10-28-lock'],
  )
  assert.equal(pickNew(parseFeed(FEED), FEED, NOW).length, 0)
})

test('an unreadable feed yields no entries, so the run fails instead of saying "nothing new"', () => {
  for (const bad of ['', '<html>Bad gateway</html>', '<item><title>x</title></item>']) {
    assert.equal(parseFeed(bad).length, 0)
  }
})

test('an entry linking outside the changelog, or with control characters, is dropped or cleaned', () => {
  const evil = `<item><title>Ok\u0007 title</title><link>https://evil.example/x</link><pubDate>Mon, 02 Nov 2026 15:14:46 +0000</pubDate></item>
<item><title>Bell\u0007here</title><link>https://github.blog/changelog/2026-11-03-x</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>`
  const items = parseFeed(evil)
  assert.equal(items.length, 1)
  assert.equal(items[0].title, 'Bell here')
})

test('the issue body lists each entry as a dated link and says what to do', () => {
  const body = issueBody(pickNew(parseFeed(FEED), '', NOW))
  assert.match(body, /- 2026-10-28 — \[GitHub Actions workflow lockfiles are generally available\]/)
  assert.match(body, /Close this issue with a one-line answer per entry/)
})
