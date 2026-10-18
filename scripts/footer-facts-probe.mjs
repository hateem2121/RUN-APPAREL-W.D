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
import { FOOTER_FACTS } from './apply-footer-facts.mjs'
import { stripUntilStable } from './strip-until-stable.mjs'
import { standardsLines } from '../packages/shared/src/siteFooter.ts'
import { realpathSync } from 'node:fs'

export const SITE_URL = 'https://wear-run.com/'

/** Pure: Bot Fight Mode's refusal of a robot — inconclusive, never a failed check. */
export function isRefusal(status) {
  return status === 403 || status === 429
}

/** The footer's class token, as `SiteFooter.tsx` writes it (the garment pages add a second). */
export const FOOTER_CLASS = 'site-footer'

/**
 * Pure: whether a start tag's class attribute holds `token` as one of its classes.
 *
 * A class attribute is "a set of space-separated tokens" (HTML Standard §3.2.6, read
 * 2026-10-17), so the test is membership, never the whole value.
 */
export function hasClass(tag, token) {
  const match = /\sclass="([^"]*)"/.exec(tag)
  return match?.[1].split(/\s+/).includes(token) === true
}

/**
 * Pure: the `<footer class="… site-footer …">…</footer>` element, or '' if there is none.
 *
 * ⚠️ MATCH THE CLASS TOKEN, NOT THE ATTRIBUTE TEXT. Until 2026-10-17 this searched for the
 * literal `<footer class="site-footer"`. On 2026-10-16 (PR #194) the home page's footer
 * became `class="site-footer site-footer--no-prompt"`, the literal stopped matching, and the
 * uptime robot reported "no footer" every run and opened outage issue #196 while all 15
 * facts were on the page. Other pages still matched, so only the home page fell through.
 */
export function footerSection(html) {
  let from = 0
  for (;;) {
    const start = html.indexOf('<footer', from)
    if (start < 0) return ''
    const tagEnd = html.indexOf('>', start)
    if (tagEnd < 0) return ''
    if (hasClass(html.slice(start, tagEnd + 1), FOOTER_CLASS)) {
      const end = html.indexOf('</footer>', tagEnd)
      return end < 0 ? html.slice(start) : html.slice(start, end)
    }
    from = tagEnd + 1
  }
}

/** Pure: the footer's visible text — React's `<!-- -->` text separators and tags removed. */
export function footerText(section) {
  // Comments and tags stripped until none is left: one pass can leave one
  // (strip-until-stable.mjs).
  return (
    stripUntilStable(stripUntilStable(section, /<!--[\s\S]*?-->/g, ''), /<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      // LAST, so text that shows an entity keeps it (2026-10-01).
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
  )
}

/**
 * Pure: what the footer must show, derived from the approved facts, never retyped.
 *
 * The Standards lines run through the SAME `standardsLines` the component renders
 * (polish X23 groups same-holder rows: the two "Suppliers:" entries show as ONE line,
 * "Suppliers: ISO 9001, OEKO-TEX, GOTS, GRS; amfori BSCI audits"). Until 2026-10-06
 * this probe expected each approved row verbatim, so the merged line read as a missing
 * fact and the robot went red on a footer that WAS showing the claim — the expectation
 * and the renderer had drifted. Deriving both sides from one function keeps CT-07's
 * guarantee intact: if the CMS ever loses the amfori row, the derived line loses
 * "; amfori BSCI audits" and this probe fails again.
 */
export function expectedFacts(facts = FOOTER_FACTS) {
  const cap = facts.capacity
  return {
    text: [
      `MOQ ${cap.moq}`,
      `Lead time ${cap.leadTime}`,
      `${cap.hoursOpen}–${cap.hoursClose} PKT`,
      facts.worksCoordinates,
      ...standardsLines(facts.certifications.map((c) => c.name)),
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

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`footer-facts-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
