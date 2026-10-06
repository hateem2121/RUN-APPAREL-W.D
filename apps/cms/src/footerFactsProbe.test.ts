import { describe, expect, it } from 'vitest'
import { standardsLines } from '@run-apparel/shared'
import { FOOTER_FACTS } from '../../../scripts/apply-footer-facts.mjs'
import {
  expectedFacts,
  footerText,
  isRefusal,
  missingFacts,
} from '../../../scripts/footer-facts-probe.mjs'

/**
 * CT-07 / CT-07b — the live footer-facts robot, fed planted pages before its live "all
 * present" is trusted. The fixture is rendered the way the component renders it: React
 * streams `<!-- -->` between a label and its value, the Standards block shows
 * `standardsLines`'s GROUPED lines (polish X23: same-holder rows merge), and the same
 * values repeated in the RSC payload after the footer.
 *
 * ⚠️ THE FIXTURE GOES THROUGH `standardsLines` TOO, not a retyped copy — probe
 * expectation and planted page must share one derivation, or they can drift apart
 * the way they did on 2026-10-06: the probe expected each approved row verbatim
 * while the component showed the two "Suppliers:" rows as one merged line, so the
 * robot went red on a footer that WAS showing the claim.
 */
const cap = FOOTER_FACTS.capacity
const approvedStandards = FOOTER_FACTS.certifications.map((c) => c.name)
const footer = (
  blocks: {
    capacity?: boolean
    standards?: boolean
    elsewhere?: boolean
    certifications?: readonly string[]
  } = {},
) => {
  const {
    capacity = true,
    standards = true,
    elsewhere = true,
    certifications = approvedStandards,
  } = blocks
  return [
    '<footer class="site-footer"><div class="footer-facts">',
    `<div class="footer-block footer-block--contact"><ul><li class="footer-block__sub">${FOOTER_FACTS.worksCoordinates}</li></ul></div>`,
    capacity
      ? `<div class="footer-block footer-block--capacity"><ul><li>MOQ <!-- -->${cap.moq}</li><li>Lead time <!-- -->${cap.leadTime}</li><li>Mon–Sat ${cap.hoursOpen}–${cap.hoursClose} PKT</li></ul></div>`
      : '',
    standards
      ? `<div class="footer-block footer-block--standards"><ul>${standardsLines(certifications)
          .map((line) => `<li>${line}</li>`)
          .join('')}</ul></div>`
      : '',
    elsewhere
      ? `<div class="footer-block footer-block--elsewhere"><ul>${FOOTER_FACTS.socialLinks
          .map((l) => `<li><a href="${l.url}">${l.label}</a></li>`)
          .join('')}</ul></div>`
      : '',
    '</div></footer>',
  ].join('')
}
/** The RSC payload carries every value again, after the footer. */
const payload = `<script>self.__next_f.push([1,"MOQ ${cap.moq} Lead time ${cap.leadTime} ${FOOTER_FACTS.certifications.map((c) => c.name).join(' ')} ${FOOTER_FACTS.socialLinks.map((l) => `${l.label} href=\\"${l.url}\\"`).join(' ')}"])</script>`
const page = (f: string) => `<html><body><main>…</main>${f}${payload}</body></html>`

describe('missingFacts', () => {
  it('passes a footer that shows every approved fact, across React text separators', () => {
    expect(missingFacts(page(footer()))).toEqual([])
    expect(footerText('<li>MOQ <!-- -->50</li>')).toContain('MOQ 50')
  })

  it('decodes each entity once — text that SHOWS an entity keeps it', () => {
    // GitHub's code scan (CodeQL js/double-escaping, 2026-10-01): `&amp;` was decoded
    // first, so a footer showing a literal `&#39;` was read as an apostrophe.
    expect(footerText('a &amp;#39; b')).toBe('a &#39; b')
  })

  it('names each fact of a block that disappeared', () => {
    expect(missingFacts(page(footer({ capacity: false })))).toEqual([
      `text "MOQ ${cap.moq}"`,
      `text "Lead time ${cap.leadTime}"`,
      `text "${cap.hoursOpen}–${cap.hoursClose} PKT"`,
    ])
    expect(missingFacts(page(footer({ standards: false })))).toHaveLength(
      standardsLines(approvedStandards).length,
    )
  })

  it('still catches a row the CMS lost, THROUGH the merge (the 2026-10-06 negative control)', () => {
    // If the amfori row ever leaves the CMS, the merged Suppliers line must lose its
    // "; amfori BSCI audits" tail and the probe must fail again — the guarantee CT-07
    // exists for. standardsLines(approvedStandards)[1] IS that merged line, by the
    // order the owner wrote the rows in.
    const withoutAmfori = approvedStandards.filter((name) => !name.includes('amfori'))
    expect(missingFacts(page(footer({ certifications: withoutAmfori })))).toEqual([
      `text "${standardsLines(approvedStandards)[1]}"`,
    ])
  })

  it('reads ONLY the footer: facts left in the RSC payload do not count', () => {
    // The trap: every value is still on the page, just not in the footer.
    const missing = missingFacts(
      page(footer({ capacity: false, standards: false, elsewhere: false })),
    )
    expect(missing.length).toBe(
      3 + standardsLines(approvedStandards).length + FOOTER_FACTS.socialLinks.length * 2,
    )
  })

  it('catches a social link whose address changed while its label stayed', () => {
    const broken = page(footer()).replace(
      `href="${FOOTER_FACTS.socialLinks[0]?.url}"`,
      'href="https://example.com/"',
    )
    expect(missingFacts(broken)).toEqual([`link ${FOOTER_FACTS.socialLinks[0]?.url}`])
  })

  it('reports a page with no footer at all', () => {
    expect(missingFacts('<html><body><main></main></body></html>')).toEqual([
      'the page has no <footer class="site-footer">',
    ])
  })

  it('derives what it checks from the approved facts, 11 shown lines today', () => {
    const want = expectedFacts()
    // 12 until 2026-10-06: the owner's 2026-09-29 additions took it 10 → 12, then
    // polish X23 started rendering the two "Suppliers:" rows as ONE merged line and
    // the probe derived its expectations through the same standardsLines — so 4
    // stored rows show as 3 lines (3 capacity + hours… 9 text + 2 hrefs = 11).
    expect(want.text.length + want.hrefs.length).toBe(11)
  })

  it('treats 403 and 429 as inconclusive, a real error as an answer', () => {
    expect([403, 429].map(isRefusal)).toEqual([true, true])
    expect([200, 404, 500].map(isRefusal)).toEqual([false, false, false])
  })
})
