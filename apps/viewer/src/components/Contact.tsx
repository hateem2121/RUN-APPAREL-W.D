import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  type EnquiryContext,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { track } from '../lib/analytics'

interface ContactProps {
  settings: ViewerSiteSettings
  enquiry: EnquiryContext
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
 */
function ContactButtons({ settings, enquiry }: ContactProps) {
  return (
    <>
      <a
        className="btn btn--primary"
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

export function ContactSection(props: ContactProps) {
  return (
    <section className="contact" aria-labelledby="contact-heading" data-reveal>
      <p className="section-number">N&#8470;003 — START THE CONVERSATION — N&#8470;003</p>
      <h2 id="contact-heading" className="display display--section">
        Develop this with <span className="serif-accent">us</span>.
      </h2>
      <div className="contact__buttons">
        <ContactButtons {...props} />
      </div>
      <p className="contact__micro">
        We have already filled in this garment&rsquo;s code and colorway. Please add your company,
        your market and the quantity you need, then send.
      </p>
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
  return (
    <div className="action-bar">
      <ContactButtons {...props} />
    </div>
  )
}
