import {
  askAboutGarmentPath,
  buildMailtoUrl,
  buildWhatsAppUrl,
  type EnquiryContext,
  type TrackerWindow,
  trackerEvent,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { useEffect, useRef } from 'react'
import { startActionBarStepsAside } from '../lib/actionBarStepsAside'
import { track } from '../lib/analytics'
import { SITE_ORIGIN } from '../lib/siteLinks'

interface ContactProps {
  settings: ViewerSiteSettings
  enquiry: EnquiryContext
  /** When true, pulses the primary CTA with action-glow (engagement cue) */
  actionGlow?: boolean
}

/**
 * ⚠️ THE SAME TWO LINKS APPEAR TWICE IN THE TAB ORDER ON A PHONE, AND THAT IS
 * ACCEPTED. Recorded 2026-08-20 so the next audit does not re-open it.
 *
 * Measured at 768px before the two-column layout: tab stops 14-17 were
 * Email Us, WhatsApp Us, Email Us, WhatsApp Us — <ContactSection> in the page
 * body and <MobileActionBar> fixed to the bottom, with identical accessible
 * names and identical destinations.
 *
 * Above 900px this is now gone: `.contact-rail` is superseded by the two-column
 * layout and <StageContact> is the only persistent pair. Below 900px the
 * duplication remains, and removing it would mean choosing which one to delete:
 *
 *   - Delete the in-page pair, and a screen-reader user reading the contact
 *     section linearly reaches a heading, a paragraph inviting them to get in
 *     touch, and no way to do it.
 *   - Delete the bar, and the only conversion path in the product stops being
 *     persistent on the device the product is opened with — a QR scan from a
 *     garment tag.
 *
 * Neither is worth trading for two fewer tab stops. Duplicate links to one
 * destination are explicitly allowed (they are not a WCAG failure), the axe
 * audit reports zero violations, and the cost is one extra Tab press. If this
 * ever does need fixing, the answer is a distinguishing accessible name — not
 * deleting one of them.
 *
 * ⚠️ SINCE VA-54 (2026-10-02) THE BAR STEPS ASIDE WHILE THE IN-PAGE PAIR IS ON SCREEN
 * (`<MobileActionBar>` below), so while that pair is in view only one pair is on screen or
 * reachable; since 2026-10-03 also while the footer is, which carries the same routes. At every
 * other scroll position the duplication stands exactly as recorded here.
 */
function ContactButtons({
  settings,
  enquiry,
  quiet = false,
  actionGlow = false,
}: ContactProps & { quiet?: boolean }) {
  const primaryClass = `btn btn--primary${actionGlow && !quiet ? ' btn--action-glow' : ''}`
  return (
    <>
      <a
        className={quiet ? 'btn btn--ghost' : primaryClass}
        href={buildMailtoUrl(settings.email, enquiry)}
        onClick={() => track('email_clicked')}
      >
        Email Us
      </a>
      <a
        className="btn btn--ghost"
        href={buildWhatsAppUrl(settings.whatsappNumber, enquiry)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('whatsapp_clicked')}
      >
        WhatsApp Us
      </a>
    </>
  )
}

/** The garment and the colour on the page, as slugs: what "Ask about this garment" carries. */
export interface AskedGarment {
  productSlug: string
  colourSlug: string
}

/**
 * The end of a garment page, and its ONE prompt (polish S10 + Q42, owner 2026-10-04): "Ask about
 * this garment" opens the website's contact form with the garment and its colour already in it
 * (`askAboutGarmentPath`; the contact page looks both up and writes them in). Email and WhatsApp
 * stay beside it, quieter, because a buyer who wants their own record of what they sent, or who
 * lives in WhatsApp, still has the route they came for; the footer below asks nothing since Q42.
 *
 * The line saying what the buttons do comes BEFORE them, so a buyer reads it on the way to them;
 * after them it read as small print nobody reaches (the audit's X23).
 *
 * The click is counted twice under one name, the owner's key event `ask_about_garment` (Q37): in
 * the site's own event log, and in Google Analytics only for a visitor who accepted it.
 */
export function ContactSection({
  garment,
  actionGlow = false,
  ...props
}: ContactProps & { garment: AskedGarment }) {
  const ask = `${SITE_ORIGIN}${askAboutGarmentPath(garment.productSlug, garment.colourSlug)}`
  const askClass = `btn btn--primary contact__ask${actionGlow ? ' btn--action-glow' : ''}`
  const onAsk = () => {
    track('ask_about_garment', { product: props.enquiry.productCode, variant: garment.colourSlug })
    trackerEvent(window as unknown as TrackerWindow, 'ask_about_garment', {
      garment_code: props.enquiry.productCode,
      colour: props.enquiry.colourName,
    })
  }
  return (
    <section className="contact" aria-labelledby="contact-heading" data-reveal>
      <p className="section-number">&#8470;04 — Start the conversation</p>
      <h2 id="contact-heading" className="display display--section">
        Develop this with <span className="serif-accent">us</span>.
      </h2>
      <p className="contact__micro">
        We have already filled in this garment&rsquo;s code and colorway. Please add your company,
        your market and the quantity you need, then send.
      </p>
      <div className="contact__buttons">
        {/* `contact__ask`: what the phone's bar steps aside for (lib/actionBarStepsAside.ts). */}
        <a className={askClass} href={ask} onClick={onAsk}>
          Ask about this garment
        </a>
        <ContactButtons {...props} quiet />
      </div>
    </section>
  )
}

/*
 * `<StickyContactRail>` WAS DELETED HERE ON 2026-09-04, with its CSS, its two
 * unit tests and the `compact` prop that nothing else used.
 *
 * It had been dead on screen since 2026-08-20 and the CSS said so: `.contact-rail`
 * was `display: flex` inside `@media (min-width: 900px)` and then `display: none`
 * inside `@media (min-width: 900px), (min-width: 700px) and (min-aspect-ratio: 3/2)`
 * — same specificity, later source order wins, and the second query is a superset
 * of the first. It could not paint at any viewport.
 *
 * `<StageContact>` replaced it and says why: measured at 2560x1440 the rail was
 * 196x54px, 0.29% of the screen, 1,064px right of centre, while the four spec
 * callouts occupied 3.0x its area — the facts were louder than the only control
 * that starts a conversation.
 *
 * The removal was scheduled in page.css in the same commit that made it dead
 * ("Do it next, and delete this comment with it"), deliberately unbundled from the
 * layout change that caused it. This is that commit.
 *
 * `compact` went with it. It shortened the labels to "Email" / "WhatsApp" because
 * the rail was a narrow pill in a corner; both surviving surfaces
 * (<StageContact>, <MobileActionBar>) carry comments saying they deliberately do
 * NOT use it, because the verb is the point on the only conversion path here.
 */

/**
 * The contact pair INSIDE the stage band, for screens laid out in two columns.
 *
 * ⚠️ IT EXISTS BECAUSE THE FLOATING PILL WAS THE QUIETEST THING ON THE PAGE.
 * Measured 2026-08-20 at 2560x1440: `.contact-rail` is 196x54px and never
 * scales, which is **0.29% of the screen**, sitting 1,064px right of centre in a
 * 399px band of empty background. The four spec callouts occupied 31,790px2
 * against its 10,606 — the facts were 3.0x louder than the only control that
 * starts a conversation, on a page with no cart and no form.
 *
 * In the column it sits on the reading path instead of in a corner, and
 * `.contact-rail` is switched off at exactly the widths this appears — see the
 * two-column block in page.css. The two are never both painted, so this is not
 * a second tab stop; `display: none` keeps the hidden one out of the tab order
 * and the accessibility tree together.
 *
 * ⚠️ NOT `compact`. The rail shortened its labels to "Email" / "WhatsApp"
 * because it was a narrow pill in a corner. A column is not narrow, and the verb
 * is the point on the only conversion path in the product — the same reasoning
 * that restored it for <MobileActionBar> on 2026-08-14.
 */
export function StageContact(props: ContactProps) {
  return (
    <div className="stage__contact">
      <ContactButtons {...props} />
    </div>
  )
}

/**
 * Mobile persistent bottom action bar (safe-area aware).
 *
 * ⚠️ NOT `compact` — the verb is restored here, 2026-08-14 by owner decision.
 * This is the ONE surface where the verb is the point: it is the persistent
 * call to action on the device the product is opened with, and "Email" alone
 * reads as a label for a field rather than an invitation to do something.
 * `compact` is kept for <StickyContactRail>, where the rail is narrow, desktop
 * only, and sits beside a page that has already said it in full.
 *
 * Measured at 320px before shipping — the audit had recorded the layout
 * overflowing there, which is fixed, and both full labels fit on one line.
 */
export function MobileActionBar(props: ContactProps) {
  const bar = useRef<HTMLElement>(null)
  /*
   * ⚠️ IT STEPS ASIDE WHILE THE PAGE'S OWN PAIR IS ON SCREEN (visual audit VA-54, 2026-10-02).
   * At the end of a phone page "Develop this with us" showed EMAIL US and WHATSAPP US and the bar
   * showed the same two buttons at the same moment. This sets one attribute on the bar while that
   * pair is in view above it; the fade, and keeping a hidden bar out of the Tab order and the
   * accessibility tree, are CSS (`.action-bar[data-tucked]`). The reasoning is in
   * `lib/actionBarStepsAside.ts`. Both pairs stay in the page; only one is shown at a time.
   * Since 2026-10-03 it also steps aside while any of the footer is above it: over the dark
   * footer the paper bar was a white block on an iPhone (owner's screenshot).
   */
  useEffect(() => (bar.current ? startActionBarStepsAside(bar.current) : undefined), [])
  /*
   * An <aside>, so the bar is a landmark a screen reader can name and jump to. It sat outside
   * every landmark: axe's `region` rule flagged it on all three garments at 390x844, the only
   * automated finding of the 2026-10-01 visual audit across 40 scans.
   */
  return (
    <aside ref={bar} className="action-bar" aria-label="Contact">
      <ContactButtons {...props} />
    </aside>
  )
}
