import { formatAddress } from './company'
import { CONSENT_COPY } from './consent'
import { formatPhoneForDisplay } from './contact'
import { formatHours } from './footerHours'
import { marksFor } from './standardsLogos'

/**
 * The site footer's words, links and rules — ONCE, for the public site and the garment pages.
 *
 * Visual audit VA-31 (owner-approved 2026-10-01, "one footer everywhere"): the garment pages
 * ended in a pale three-line footer while every other page ended in the dark one with its call
 * to action, clock, standards and wordmark. No decision chose that. On 24 September the garment
 * pages took the website's bar, and the footer was never brought across.
 *
 * WCAG 2.2 SC 3.2.6 Consistent Help (W3C Understanding, updated 9 March 2026): contact details
 * repeated across a set of pages keep the same order relative to the rest of the page, so two
 * different footers on one site can fail it.
 *
 * ⚠️ WHY THE MARKUP IS NOT HERE — the bar's reason (siteBar.ts). The site's footer is a Next
 * server component with client islands; the garment pages' is a client component in a Vite SPA
 * whose links go to the site. So each app writes its own JSX, and what a visitor could see drift
 * is shared instead: the stylesheet is packages/ui/src/footer.css, the words, links and rules are
 * here, and `siteFooterAriaSnapshot` is the one template both apps' browser suites hold their
 * rendered footer to.
 */

/** Working hours, parsed. Days are 0–6 with Sunday 0, matching `Date#getDay()`. */
export interface FooterHours {
  firstDay: number
  lastDay: number
  /** `HH:MM`, works local time (Asia/Karachi). */
  open: string
  close: string
}

export interface FooterSettings {
  ctaLabel: string
  ctaQuestion: string
  ctaSubline: string
  ctaPromise: string
  capacity: { moq: string; leadTime: string; hours: FooterHours | null }
  worksCoordinates: string
  certifications: string[]
  socialLinks: { label: string; url: string }[]
}

/**
 * Copy has a default; a claim does not. The split is the whole point of this object —
 * a blank certification list renders NO block, never an example one.
 */
export const EMPTY_FOOTER: FooterSettings = {
  ctaLabel: 'Start an inquiry',
  ctaQuestion: 'Have a garment that needs making properly?',
  ctaSubline: 'Send a tech pack, a sketch, or just the idea.',
  ctaPromise: 'Reply within 24 hours',
  capacity: { moq: '', leadTime: '', hours: null },
  worksCoordinates: '',
  certifications: [],
  socialLinks: [],
}

/** The footer's fixed words: headings, the clock's caption and the open/closed light. */
export const SITE_FOOTER_WORDS = {
  eyebrow: 'Start here',
  contact: 'Contact',
  capacity: 'Capacity',
  standards: 'Standards',
  elsewhere: 'Elsewhere',
  /** The owner confirmed 2026-09-05 that HQ, office and factory are all at the one address. */
  clockCity: 'Sialkot · HQ & works',
  clockZone: 'PKT',
  openNow: 'Open now',
  marks: 'Marks of the standards above',
} as const

/** The closed light's words: "Opens 09:00 PKT". */
export function opensAt(open: string): string {
  return `Opens ${open} ${SITE_FOOTER_WORDS.clockZone}`
}

/**
 * The bottom row's links, as paths on the site, in order. The garment pages prefix the site's
 * origin. `consent` marks the way back to the cookie question (2026-09-30): each app draws it
 * with its own handler, because it reopens the question in place when one is mounted.
 */
export const SITE_FOOTER_LINKS = [
  { href: '/products', label: 'Products', consent: false },
  { href: '/contact', label: 'Contact', consent: false },
  // The buyer guides (owner, 2026-09-30): a page nothing links to is rarely found.
  { href: '/guides', label: 'Guides', consent: false },
  // A legal requirement, not a nicety: both hosts process at least an IP address (FA-O-75).
  { href: '/privacy', label: 'Privacy', consent: false },
  { href: '/privacy#cookies', label: CONSENT_COPY.change, consent: true },
  { href: '/terms', label: 'Terms', consent: false },
] as const

/** The Capacity block's lines, each only when its claim is set. Empty means no block. */
export function capacityLines(capacity: FooterSettings['capacity']): string[] {
  return [
    capacity.moq ? `MOQ ${capacity.moq}` : '',
    capacity.leadTime ? `Lead time ${capacity.leadTime}` : '',
    capacity.hours ? formatHours(capacity.hours) : '',
  ].filter(Boolean)
}

/** What a footer is drawn from, on either host. */
export interface SiteFooterContent {
  footer: FooterSettings
  email: string
  whatsappNumber: string
  legalLine: string
  footerLine: string
}

/**
 * The footer as Playwright's accessibility snapshot sees it, for `toMatchAriaSnapshot`: every
 * landmark child in order, `/children: equal`, so a block one host adds or drops fails both
 * suites. Built from the same content the page was given, because the blocks are conditional.
 * The clock's time is the one live value, so it is a pattern.
 */
export function siteFooterAriaSnapshot(content: SiteFooterContent): string {
  const q = JSON.stringify
  const { footer } = content
  const words = SITE_FOOTER_WORDS
  const lines = ['- contentinfo:', '  - /children: equal']
  const add = (depth: number, line: string) => lines.push(`${'  '.repeat(depth)}- ${line}`)

  add(1, `link ${q(footer.ctaLabel)}`)
  add(1, `paragraph: ${q(words.eyebrow)}`)
  add(1, `heading ${q(footer.ctaQuestion)} [level=2]`)
  add(1, `paragraph: ${q(footer.ctaSubline)}`)
  add(1, `paragraph: ${q(footer.ctaPromise)}`)
  // The light appears only once the clock has mounted, so it is optional even with hours.
  const status = footer.capacity.hours
    ? `( ?(${words.openNow}|${opensAt(footer.capacity.hours.open)}))?`
    : ''
  add(1, `text: /^${words.clockCity} (--:--|\\d\\d:\\d\\d)${words.clockZone}${status}$/`)

  add(1, `heading ${q(words.contact)} [level=3]`)
  add(1, 'list:')
  add(2, 'listitem:')
  add(3, `link ${q(content.email)}`)
  add(2, 'listitem:')
  add(3, `link ${q(`WhatsApp ${formatPhoneForDisplay(content.whatsappNumber)}`)}`)
  add(2, `listitem: ${q(formatAddress())}`)
  if (footer.worksCoordinates) add(2, `listitem: ${q(footer.worksCoordinates)}`)

  const capacity = capacityLines(footer.capacity)
  if (capacity.length > 0) {
    add(1, `heading ${q(words.capacity)} [level=3]`)
    add(1, 'list:')
    for (const line of capacity) add(2, `listitem: ${q(line)}`)
  }
  if (footer.certifications.length > 0) {
    add(1, `heading ${q(words.standards)} [level=3]`)
    add(1, 'list:')
    for (const name of footer.certifications) add(2, `listitem: ${q(name)}`)
  }
  if (footer.socialLinks.length > 0) {
    add(1, `heading ${q(words.elsewhere)} [level=3]`)
    add(1, 'list:')
    for (const link of footer.socialLinks) {
      add(2, 'listitem:')
      add(3, `link ${q(link.label)}`)
    }
  }
  const marks = marksFor(footer.certifications)
  if (marks.length > 0) {
    add(1, `group ${q(words.marks)}:`)
    for (const mark of marks) add(2, `img ${q(mark.alt)}`)
  }

  add(1, `text: ${q(`${content.legalLine} ${content.footerLine}`)}`)
  for (const link of SITE_FOOTER_LINKS) add(1, `link ${q(link.label)}`)
  return lines.join('\n')
}
