/**
 * Lists GitHub Actions changelog entries this repository has not been told about yet.
 *
 * WHY (owner, 8 Nov 2026). The CI audit that day found three changes in GitHub's own Actions
 * changelog that applied here, one of them weeks after it shipped (lockfiles went generally
 * available on 28 Oct and were adopted on 7 Nov; the pull-request check GitHub's guide asks for
 * arrived only with the audit). tool-versions.yml already watches the tools CI downloads; this
 * watches GitHub itself. actions-changelog.yml runs it weekly and opens ONE issue when there is
 * something new, so nothing here decides what applies: a person reads the entries.
 *
 * Window: entries from the last 14 days whose link no earlier issue already carries. Twice the
 * weekly cron, because GitHub's schedules land hours late and sometimes not at all
 * (.github/CLAUDE.md measured a 13.6-hour gap), and a link already reported is never repeated.
 *
 * Usage: node scripts/check-actions-changelog.mjs <already-reported.txt> <issue-body.md>
 * Exit 0 with no body file = nothing new; exit 0 with a body = open an issue; exit 1 = the feed
 * could not be read, which must never look like "nothing new".
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'

export const FEED_URL = 'https://github.blog/changelog/label/actions/feed/'
export const WINDOW_DAYS = 14
const LINK_PREFIX = 'https://github.blog/changelog/'

/** The few entities a title carries. `&amp;` goes last, so `&amp;lt;` stays `&lt;` as text. */
function decode(text) {
  return text
    .replace(/&#8217;|&#8216;/g, '’')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Text from a feed is printed into an issue: one line, no control characters, bounded. */
function clean(text) {
  return [...decode(text)]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/**
 * Pure: an RSS document to its entries. An entry without a readable title, a changelog link or a
 * date is dropped rather than half-reported.
 *
 * @param {string} xml
 * @returns {{ title: string, link: string, published: number }[]}
 */
export function parseFeed(xml) {
  const items = []
  for (const block of String(xml).split('<item>').slice(1)) {
    const field = (name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1] ?? ''
    const title = clean(field('title'))
    const link = field('link').trim()
    const published = Date.parse(field('pubDate'))
    if (!title || !link.startsWith(LINK_PREFIX) || /\s/.test(link) || !Number.isFinite(published))
      continue
    items.push({ title, link, published })
  }
  return items
}

/**
 * Pure: the entries to report — inside the window, not already in an earlier issue, oldest first.
 *
 * @param {{ title: string, link: string, published: number }[]} items
 * @param {string} reported every earlier watcher issue's text
 * @param {number} now epoch ms
 */
export function pickNew(items, reported, now) {
  const since = now - WINDOW_DAYS * 86_400_000
  // Whole links only: a substring test would let `…/2026-11-02-x-and-more` hide `…/2026-11-02-x`.
  // The workflow passes only issues github-actions itself opened (security review, 2026-11-08: on
  // a public repo anyone can open an issue with this title and paste links to silence entries).
  const seen = new Set(String(reported).match(/https:\/\/github\.blog\/changelog\/[^\s)\]<>"']+/g))
  return items
    .filter((i) => i.published >= since && i.published <= now + 86_400_000)
    .filter((i) => !seen.has(i.link))
    .sort((a, b) => a.published - b.published)
}

/** The issue body: fixed words around each entry's date, title and link. */
export function issueBody(entries) {
  const lines = entries.map(
    (e) => `- ${new Date(e.published).toISOString().slice(0, 10)} — [${e.title}](${e.link})`,
  )
  return [
    'New entries in GitHub’s Actions changelog since the last check:',
    '',
    ...lines,
    '',
    'For each one: does it change anything in `.github/workflows/`, a repository setting, or a',
    'decision in `.github/CLAUDE.md`? Close this issue with a one-line answer per entry.',
    '',
    `_Opened by actions-changelog.yml (weekly). Source: ${FEED_URL}_`,
  ].join('\n')
}

async function main(reportedFile, bodyFile) {
  let xml = ''
  for (let attempt = 1; attempt <= 3 && !xml; attempt++) {
    try {
      const r = await fetch(FEED_URL, {
        headers: { 'user-agent': 'run-apparel-actions-changelog' },
        signal: AbortSignal.timeout(30_000),
      })
      if (r.ok) xml = await r.text()
    } catch {
      // retried below; a feed that never answers fails the run by name
    }
    if (!xml && attempt < 3) await new Promise((done) => setTimeout(done, 5_000))
  }
  const items = parseFeed(xml)
  if (items.length === 0) {
    console.log('::error::GitHub’s Actions changelog feed could not be read; nothing was checked.')
    return 1
  }
  const reported =
    reportedFile && existsSync(reportedFile) ? readFileSync(reportedFile, 'utf8') : ''
  const fresh = pickNew(items, reported, Date.now())
  console.log(
    `${items.length} entries in the feed, ${fresh.length} new in the last ${WINDOW_DAYS} days`,
  )
  for (const e of fresh) console.log(`- ${e.title}`)
  if (fresh.length > 0) writeFileSync(bodyFile, issueBody(fresh))
  return 0
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  process.exitCode = await main(process.argv[2], process.argv[3])
}
