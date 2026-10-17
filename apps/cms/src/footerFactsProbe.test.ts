import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_SETTINGS, standardsLines } from '@run-apparel/shared'
import { FOOTER_FACTS } from '../../../scripts/apply-footer-facts.mjs'
import {
  expectedFacts,
  footerText,
  hasClass,
  isRefusal,
  missingFacts,
} from '../../../scripts/footer-facts-probe.mjs'
import { SiteFooter } from './components/site/SiteFooter'
import { EMPTY_FOOTER } from './lib/projectPublic'

// The footer's tab reads the page from `usePathname`, which needs the app router; outside Next it
// is mocked, with the path a hoisted mutable so each case chooses its page (as SiteFooter.test).
const route = vi.hoisted(() => ({ path: '/about' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.path }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

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

  it('reports a footer that lacks the class itself: a modifier or a look-alike is not it', () => {
    // The negative control for the class-token match below: loosening it to "the text
    // site-footer appears somewhere in the tag" would pass all three of these.
    for (const tag of [
      '<footer class="site-footer--no-prompt">',
      '<footer class="not-site-footer">',
      '<footer>',
    ]) {
      expect(missingFacts(page(footer().replace('<footer class="site-footer">', tag)))).toEqual([
        'the page has no <footer class="site-footer">',
      ])
    }
    expect(hasClass('<footer class="a  site-footer\tb">', 'site-footer')).toBe(true)
  })

  it('skips another footer element that comes before the site footer', () => {
    // An article or card may carry its own <footer>; the facts are in the site's.
    expect(missingFacts(page(`<footer class="card__foot">Read more</footer>${footer()}`))).toEqual(
      [],
    )
  })

  it('derives what it checks from the approved facts, 15 shown lines today', () => {
    const want = expectedFacts()
    // 12 until 2026-10-06: the owner's 2026-09-29 additions took it 10 → 12, then
    // polish X23 started rendering the two "Suppliers:" rows as ONE merged line and
    // the probe derived its expectations through the same standardsLines — so 4
    // stored rows show as 3 lines (3 capacity + hours… 9 text + 2 hrefs = 11).
    // 11 until 2026-10-11: the script's socialLinks caught up with the CMS (Google Maps
    // and Crunchbase, added there 2026-10-08), so each brings a label and an href:
    // 11 text + 4 hrefs = 15. The live probe read all 15 on wear-run.com that day.
    expect(want.text.length + want.hrefs.length).toBe(15)
  })

  it('treats 403 and 429 as inconclusive, a real error as an answer', () => {
    expect([403, 429].map(isRefusal)).toEqual([true, true])
    expect([200, 404, 500].map(isRefusal)).toEqual([false, false, false])
  })
})

/**
 * The footer's opening tag comes from the component the site draws it with, never retyped:
 * the fixture above wrote `<footer class="site-footer">`, so when the home page's footer
 * gained a second class on 2026-10-16 (PR #194) every test here stayed green while the live
 * robot reported "no footer" each run and opened outage issue #196. Since 2026-10-17 the home
 * page draws the website's one footer again (the owner: "100% identical across the whole website").
 */
const shellTag = (path: string) => {
  route.path = path
  const settings = {
    ...DEFAULT_SITE_SETTINGS,
    logoUrl: null,
    logoMimeType: null,
    footer: EMPTY_FOOTER,
    familyLists: {},
  }
  const out = renderToStaticMarkup(createElement(SiteFooter, { settings }))
  return out.slice(0, out.indexOf('>') + 1)
}

describe('footerSection finds the footer the site draws', () => {
  it('on every website page, the home page included, all one footer', () => {
    const tags = ['/', '/about', '/products', '/contact'].map(shellTag)
    expect(new Set(tags).size, tags.join(' | ')).toBe(1)
    for (const tag of tags) {
      expect(missingFacts(page(footer().replace('<footer class="site-footer">', tag)))).toEqual([])
    }
  })

  // The garment pages' footer carries a second class (apps/viewer/src/components/Footer.tsx), and
  // the robot must still find a footer shaped like that, as it once failed to (#196).
  it('where the footer carries a second class', () => {
    const tag = '<footer class="site-footer site-footer--no-prompt">'
    expect(missingFacts(page(footer().replace('<footer class="site-footer">', tag)))).toEqual([])
  })
})
