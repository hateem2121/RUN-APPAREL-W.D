/**
 * The logic behind guide-sources.yml: which outside addresses the buyer guides cite, which
 * answers from them count as a real break, and the text of the one issue that reports them.
 *
 * WHY (15 Nov 2026). scripts/link-crawl-probe.mjs never follows a link to another site: it logs each
 * as "external — not followed". Two guide sources were found dead only by a hand-run lychee over the
 * 31 live guide pages (2,974 links, 134 errors), and before that a Green Claims address that had lost
 * its closing ")" sat live, answering 404. Of those 134 errors about 120 were sites that refuse
 * robots (HTTP 403), not dead links, and ftc.gov answers 404 to any script, home page included,
 * while every FTC link loaded in a browser. A weekly job that cried wolf 120 times would be ignored,
 * so this file decides, in plain code with its own tests, what is a break:
 *   - 404, 410, any 5xx, a name that does not resolve, a bad TLS certificate, a timeout: BROKEN
 *     (lychee has already retried them);
 *   - 403 and 429: BLOCKED, never reported (a site refusing robots says nothing about the page);
 *   - a host in `blockedHosts` (config file, one reason each): never asked at all;
 *   - an address in `knownBroken` with an `until` date still in the future: accepted, listed apart,
 *     and reported again the day it expires.
 *
 * WHERE THE ADDRESSES COME FROM: the guides' own source files, not the live site and not a second
 * list. The text is read, not imported, because Node cannot load those TypeScript files (extensionless
 * imports); apps/cms/src/guideSourceLinks.test.ts compares this reader with the real GUIDES array, so
 * a guide layout it cannot read fails CI instead of silently checking fewer links.
 *
 * Usage (stdout is the only output a workflow redirects; notes go to stderr):
 *   node scripts/guide-source-links.mjs extract    > guide-sources.html   (what lychee reads)
 *   node scripts/guide-source-links.mjs recheck <first.json> > again.html   (only what failed, to ask again)
 *   node scripts/guide-source-links.mjs report <first.json> [second.json] > issue.md   (empty = nothing broke)
 * Exit 1 = it could not tell (no addresses, unreadable lychee output), which must never look like
 * "nothing broke". The issue body names addresses and guide pages only: the repository and its
 * Actions logs are public, and nothing here reads a secret.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const GUIDE_FILES = Object.freeze([
  'apps/cms/src/lib/guides.ts',
  'apps/cms/src/lib/guideLibrary.ts',
])
export const CONFIG_FILE = 'scripts/guide-source-links.config.json'

/** Answers that say "this site refuses robots", never "this page is gone". */
export const BLOCKED_CODES = Object.freeze([403, 429])

/**
 * Pure: the addresses a guide file cites, each with the guide page that cites it. A guide is an
 * object whose `path: '/guides/…'` and `sources: [` sit at four spaces; the list ends at `],` at
 * four spaces. Anything else (a nested `url:` for a link inside the page body) is not a source.
 *
 * @param {string} text one guide source file
 * @returns {{ url: string, guide: string }[]}
 */
export function parseSources(text) {
  const found = []
  let guide = ''
  let inSources = false
  for (const line of String(text).split('\n')) {
    const path = /^ {4}path: '(\/guides\/[^']+)'/.exec(line)
    if (path) {
      guide = path[1]
      inSources = false
      continue
    }
    if (/^ {4}sources: \[/.test(line)) {
      inSources = true
      continue
    }
    if (inSources && /^ {4}\],?\s*$/.test(line)) {
      inSources = false
      continue
    }
    if (!inSources) continue
    const url = /\burl:\s*(?:'([^']*)'|"([^"]*)")/.exec(line)
    if (url) found.push({ url: url[1] ?? url[2], guide })
  }
  return found
}

/** @param {string} url @param {string} host `ftc.gov` matches ftc.gov and www.ftc.gov, not notftc.gov */
function onHost(url, host) {
  try {
    const name = new URL(url).hostname.toLowerCase()
    return name === host || name.endsWith(`.${host}`)
  } catch {
    return false
  }
}

/**
 * Pure: split the addresses into those to ask and those whose host is set apart.
 *
 * @param {{ url: string, guide: string }[]} sources
 * @param {{ blockedHosts?: { host: string, reason: string }[] }} config
 */
export function planChecks(sources, config) {
  const blocked = config.blockedHosts ?? []
  const toCheck = []
  const skipped = []
  for (const s of sources) {
    const hit = blocked.find((b) => onHost(s.url, b.host))
    if (hit) skipped.push({ ...s, host: hit.host })
    else toCheck.push(s)
  }
  return { toCheck, skipped }
}

/** The one-address-per-link page lychee reads. HTML attributes are parsed exactly, so a `(` or `&` survives. */
export function toHtml(urls) {
  const attr = (u) => u.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `${[...new Set(urls)].map((u) => `<a href="${attr(u)}">source</a>`).join('\n')}\n`
}

/** Text from outside is printed into an issue: one line, no control characters, bounded. */
function oneLine(text, max = 160) {
  return [...String(text)]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** A lychee result entry to a short reason, and whether it is a refusal rather than a break. */
function judge(entry) {
  const code = entry?.status?.code
  if (typeof code === 'number' && BLOCKED_CODES.includes(code)) {
    return { kind: 'blocked', reason: `HTTP ${code}` }
  }
  if (typeof code === 'number') return { kind: 'broken', reason: `HTTP ${code}` }
  const text = String(entry?.status?.details ?? entry?.status?.text ?? 'no answer')
  return { kind: 'broken', reason: oneLine(text, 120) }
}

/**
 * Pure: lychee's JSON report to the verdict. Throws when the report is not one lychee wrote or
 * checked nothing, so an empty run cannot pass as a clean one.
 *
 * @param {any} report lychee --format json
 * @param {{ url: string, guide: string }[]} sources the addresses that were asked
 * @param {{ knownBroken?: { url: string, until: string, reason: string }[] }} config
 * @param {string} today YYYY-MM-DD
 */
export function classify(report, sources, config, today) {
  if (!report || typeof report !== 'object' || typeof report.total !== 'number') {
    throw new Error('lychee report unreadable: no "total"')
  }
  const asked = new Set(sources.map((s) => s.url))
  // 5% slack: lychee drops an address it cannot even parse, and that must not hide a run that
  // checked a handful out of hundreds.
  if (report.total === 0 || report.total < Math.floor(asked.size * 0.95)) {
    throw new Error(
      `lychee checked ${report.total} of ${asked.size} addresses; nothing was verified`,
    )
  }
  const guidesOf = (url) => [...new Set(sources.filter((s) => s.url === url).map((s) => s.guide))]
  const entries = [
    ...Object.values(report.error_map ?? {}).flat(),
    ...Object.values(report.timeout_map ?? {}).flat(),
  ]
  const seen = new Set()
  const broken = []
  const blocked = []
  const accepted = []
  const expired = []
  for (const entry of entries) {
    if (!entry?.url || seen.has(entry.url) || !asked.has(entry.url)) continue
    seen.add(entry.url)
    const verdict =
      entry.status?.code === undefined && /timed? ?out/i.test(String(entry.status?.text))
        ? { kind: 'broken', reason: 'timed out' }
        : judge(entry)
    const row = { url: entry.url, reason: verdict.reason, guides: guidesOf(entry.url) }
    if (verdict.kind === 'blocked') {
      blocked.push(row)
      continue
    }
    const known = (config.knownBroken ?? []).find((k) => k.url === entry.url)
    if (known && known.until >= today)
      accepted.push({ ...row, until: known.until, why: known.reason })
    else if (known) expired.push({ ...row, until: known.until, why: known.reason })
    else broken.push(row)
  }
  return {
    total: report.total,
    asked: asked.size,
    broken: [...broken, ...expired.map((e) => ({ ...e, expired: true }))],
    blocked,
    accepted,
  }
}

/**
 * Pure: a break counts only if the second look, a few minutes later, failed too. A site that resets
 * one connection, or answers 500 once (ecc.isc.ac did on 15 Nov and loaded fine an hour later), is
 * not a dead source. 403 and 429 on the second look are refusals, so they recover as well.
 *
 * @param {ReturnType<typeof classify>} first
 * @param {ReturnType<typeof classify>} second
 */
export function confirm(first, second) {
  const stillBroken = new Set(second.broken.map((b) => b.url))
  const keep = (b) => stillBroken.has(b.url)
  return {
    ...first,
    broken: first.broken.filter(keep).map((b) => ({
      ...b,
      reason: second.broken.find((x) => x.url === b.url)?.reason ?? b.reason,
    })),
    recovered: first.broken.filter((b) => !keep(b)),
  }
}

/** The issue body for a verdict with breaks; the empty string when nothing is broken. */
export function issueBody(verdict, today) {
  if (verdict.broken.length === 0) return ''
  const lines = verdict.broken.map((b) => {
    const where = b.guides.length ? ` (cited by ${b.guides.map((g) => `\`${g}\``).join(', ')})` : ''
    const note = b.expired ? ` — the accepted-until date ${b.until} has passed` : ''
    return `- <${b.url}> — ${b.reason}${where}${note}`
  })
  return [
    `Checked ${verdict.total} outside sources the buyer guides cite on ${today}. These really did not answer, after retries:`,
    '',
    ...lines,
    '',
    `Not counted: ${verdict.blocked.length} answered 403 or 429 (a site refusing robots, not a dead page), and ${verdict.accepted.length} ${verdict.accepted.length === 1 ? 'is' : 'are'} accepted as broken until a date in \`${CONFIG_FILE}\`.`,
    '',
    'For each one: open it in a browser. If it loads, say so here (a site that blocks robots belongs in',
    `\`blockedHosts\` of \`${CONFIG_FILE}\` with a reason). If it is gone, replace the source in`,
    '`apps/cms/src/lib/guides.ts` or `guideLibrary.ts`; a source nobody can replace goes in `knownBroken` with a dated `until`.',
    'This issue closes itself on the next weekly run that finds nothing broken.',
    '',
    '_Opened by guide-sources.yml (weekly, Sundays)._',
  ].join('\n')
}

function readGuides() {
  return GUIDE_FILES.flatMap((file) => parseSources(readFileSync(join(ROOT, file), 'utf8')))
}

function readConfig() {
  return JSON.parse(readFileSync(join(ROOT, CONFIG_FILE), 'utf8'))
}

async function main(argv) {
  const [command, reportFile] = argv
  const sources = readGuides()
  if (sources.length === 0) {
    console.error('::error::No guide sources were found in the guide files; nothing to check.')
    return 1
  }
  const config = readConfig()
  const { toCheck, skipped } = planChecks(sources, config)
  if (command === 'extract') {
    const unique = new Set(toCheck.map((s) => s.url))
    console.error(
      `${sources.length} citations, ${unique.size} addresses to ask, ${skipped.length} set apart by host`,
    )
    process.stdout.write(toHtml(toCheck.map((s) => s.url)))
    return 0
  }
  if (command === 'recheck' || command === 'report') {
    const today = new Date().toISOString().slice(0, 10)
    const secondFile = argv[2]
    let verdict
    try {
      if (!reportFile || !existsSync(reportFile))
        throw new Error('lychee wrote no report; nothing was verified')
      verdict = classify(JSON.parse(readFileSync(reportFile, 'utf8')), toCheck, config, today)
      if (command === 'recheck') {
        // The second look: only what the first pass called broken, asked again after a pause.
        process.stdout.write(toHtml(verdict.broken.map((b) => b.url)))
        console.error(`${verdict.broken.length} addresses to ask a second time`)
        return 0
      }
      if (secondFile && verdict.broken.length > 0) {
        if (!existsSync(secondFile))
          throw new Error('the second lychee pass wrote no report; nothing was confirmed')
        const again = verdict.broken.map((b) => ({ url: b.url, guide: '' }))
        const second = classify(JSON.parse(readFileSync(secondFile, 'utf8')), again, config, today)
        verdict = confirm(verdict, second)
      }
    } catch (error) {
      console.error(`::error::${oneLine(error instanceof Error ? error.message : error)}`)
      return 1
    }
    console.error(
      `${verdict.total} checked: ${verdict.broken.length} broken, ${verdict.blocked.length} blocked (403/429), ${verdict.accepted.length} accepted until a date, ${verdict.recovered?.length ?? 0} answered on the second look`,
    )
    for (const b of verdict.broken) console.error(`BROKEN ${b.url} — ${b.reason}`)
    process.stdout.write(`${issueBody(verdict, today)}${verdict.broken.length ? '\n' : ''}`)
    return 0
  }
  console.error(
    'usage: guide-source-links.mjs extract | recheck <first.json> | report <first.json> [second.json]',
  )
  return 2
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2))
}
