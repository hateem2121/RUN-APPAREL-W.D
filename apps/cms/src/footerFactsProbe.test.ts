import { describe, expect, it } from 'vitest'
import { FOOTER_FACTS } from '../../../scripts/apply-footer-facts.mjs'
import {
  expectedFacts,
  footerText,
  isRefusal,
  missingFacts,
} from '../../../scripts/footer-facts-probe.mjs'

/**
 * CT-07 / CT-07b — the live footer-facts robot, fed planted pages before its live "all
 * present" is trusted. The fixture is rendered the way React streams it: `<!-- -->` between
 * a label and its value, and the same values repeated in the RSC payload after the footer.
 */
const cap = FOOTER_FACTS.capacity
const footer = (blocks: { capacity?: boolean; standards?: boolean; elsewhere?: boolean } = {}) => {
  const { capacity = true, standards = true, elsewhere = true } = blocks
  return [
    '<footer class="site-footer"><div class="footer-facts">',
    `<div class="footer-block footer-block--contact"><ul><li class="footer-block__sub">${FOOTER_FACTS.worksCoordinates}</li></ul></div>`,
    capacity
      ? `<div class="footer-block footer-block--capacity"><ul><li>MOQ <!-- -->${cap.moq}</li><li>Lead time <!-- -->${cap.leadTime}</li><li>Mon–Sat ${cap.hoursOpen}–${cap.hoursClose} PKT</li></ul></div>`
      : '',
    standards
      ? `<div class="footer-block footer-block--standards"><ul>${FOOTER_FACTS.certifications.map((c) => `<li>${c.name}</li>`).join('')}</ul></div>`
      : '',
    elsewhere
      ? `<div class="footer-block footer-block--elsewhere"><ul>${FOOTER_FACTS.socialLinks.map((l) => `<li><a href="${l.url}">${l.label}</a></li>`).join('')}</ul></div>`
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

  it('names each fact of a block that disappeared', () => {
    expect(missingFacts(page(footer({ capacity: false })))).toEqual([
      `text "MOQ ${cap.moq}"`,
      `text "Lead time ${cap.leadTime}"`,
      `text "${cap.hoursOpen}–${cap.hoursClose} PKT"`,
    ])
    expect(missingFacts(page(footer({ standards: false })))).toHaveLength(
      FOOTER_FACTS.certifications.length,
    )
  })

  it('reads ONLY the footer: facts left in the RSC payload do not count', () => {
    // The trap: every value is still on the page, just not in the footer.
    const missing = missingFacts(
      page(footer({ capacity: false, standards: false, elsewhere: false })),
    )
    expect(missing.length).toBe(
      3 + FOOTER_FACTS.certifications.length + FOOTER_FACTS.socialLinks.length * 2,
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

  it('derives what it checks from the approved facts, 10 of them today', () => {
    const want = expectedFacts()
    expect(want.text.length + want.hrefs.length).toBe(10)
  })

  it('treats 403 and 429 as inconclusive, a real error as an answer', () => {
    expect([403, 429].map(isRefusal)).toEqual([true, true])
    expect([200, 404, 500].map(isRefusal)).toEqual([false, false, false])
  })
})
