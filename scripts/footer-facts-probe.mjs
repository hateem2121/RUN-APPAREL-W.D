#!/usr/bin/env node
/**
 * CT-07 / CT-07b — do the footer facts the owner approved actually SHOW on the live site?
 *
 * The footer's capacity, standards and elsewhere blocks render only when their CMS fields
 * are filled, and a blank field renders nothing at all, by design (`SiteFooter.tsx`: a
 * footer must never invent a claim). So a field emptied by a bad save, a restore, or a
 * migration does not break the page — the block silently disappears, which is exactly how
 * the audit found three of them missing. This reads the live home page's `<footer>` and
 * checks every value in `apply-footer-facts.mjs`'s FOOTER_FACTS is in it.
 *
 * ⚠️ ONLY THE FOOTER ELEMENT IS READ. The same values also sit in the page's RSC payload
 * further down, so a whole-page search would pass with the footer gone.
 *
 * A 403 or 429 is INCONCLUSIVE, never a failure (Bot Fight Mode; .github/CLAUDE.md).
 *
 * Usage: node scripts/footer-facts-probe.mjs [siteUrl]
 */
import { pathToFileURL } from 'node:url'
import { FOOTER_FACTS } from './apply-footer-facts.mjs'

export const SITE_URL = 'https://wear-run.help/'

/** Pure: Bot Fight Mode's refusal of a robot — inconclusive, never a failed check. */
export function isRefusal(status) {
  return status === 403 || status === 429
}

/** Pure: the `<footer class="site-footer">…</footer>` element, or '' if there is none. */
export function footerSection(html) {
  const start = html.indexOf('<footer class="site-footer"')
  if (start < 0) return ''
  const end = html.indexOf('</footer>', start)
  return end < 0 ? html.slice(start) : html.slice(start, end)
}

/** Pure: the footer's visible text — React's `<!-- -->` text separators and tags removed. */
export function footerText(section) {
  return section
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
}

/** Pure: what the footer must show, derived from the approved facts, never retyped. */
export function expectedFacts(facts = FOOTER_FACTS) {
  const cap = facts.capacity
  return {
    text: [
      `MOQ ${cap.moq}`,
      `Lead time ${cap.leadTime}`,
      `${cap.hoursOpen}–${cap.hoursClose} PKT`,
      facts.worksCoordinates,
      ...facts.certifications.map((c) => c.name),
      ...facts.socialLinks.map((l) => l.label),
    ],
    hrefs: facts.socialLinks.map((l) => l.url),
  }
}

/** Pure: every approved fact the page's footer does not show. Empty means all present. */
export function missingFacts(html, facts = FOOTER_FACTS) {
  const section = footerSection(html)
  if (!section) return ['the page has no <footer class="site-footer">']
  const text = footerText(section)
  const want = expectedFacts(facts)
  return [
    ...want.text.filter((t) => !text.includes(t)).map((t) => `text "${t}"`),
    ...want.hrefs.filter((h) => !section.includes(`href="${h}"`)).map((h) => `link ${h}`),
  ]
}

async function main() {
  const url = process.argv[2] || SITE_URL
  const res = await fetch(url, { headers: { accept: 'text/html' } })
  if (isRefusal(res.status)) {
    console.log(`::warning::footer-facts-probe: inconclusive — ${url} answered ${res.status}`)
    return
  }
  if (!res.ok) {
    console.error(`footer-facts-probe: ${url} answered ${res.status}`)
    process.exit(1)
  }
  const missing = missingFacts(await res.text())
  if (missing.length > 0) {
    console.error(
      `footer-facts-probe: the live footer is missing ${missing.length} approved fact(s):`,
    )
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }
  const n = expectedFacts().text.length + expectedFacts().hrefs.length
  console.log(`footer-facts-probe: OK — all ${n} approved footer facts show on ${url}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`footer-facts-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
