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

function ContactButtons({
  settings,
  enquiry,
  compact = false,
}: ContactProps & { compact?: boolean }) {
  return (
    <>
      <a
        className="btn btn--primary"
        href={buildMailtoUrl(settings.email, enquiry)}
        onClick={() => track('email_clicked')}
      >
        {compact ? 'Email' : 'Email Us'}
      </a>
      <a
        className="btn btn--ghost"
        href={buildWhatsAppUrl(settings.whatsappNumber, enquiry)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('whatsapp_clicked')}
      >
        {compact ? 'WhatsApp' : 'WhatsApp Us'}
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
        We have already filled in this garment&rsquo;s code and colourway. Please add your company,
        your market and the quantity you need, then send.
      </p>
    </section>
  )
}

/**
 * Desktop rail — always there, from the first paint.
 *
 * ⚠️ IT USED TO APPEAR ONLY AFTER THE GARMENT SCROLLED OUT OF VIEW, gated on an
 * IntersectionObserver watching `.stage`. Removed 2026-08-17 by owner decision,
 * and the reason is worth keeping: this is the only conversion path in the whole
 * product. There is no cart and no form — a buyer either taps one of these or
 * leaves. On a desktop machine the entire first screen, which for a visitor who
 * does not scroll is the entire page, offered no way to make contact.
 *
 * The observer took `aria-hidden`, `inert`, the `visible` state and the
 * `stageSelector` prop with it. Those existed to keep a HIDDEN rail out of both
 * the tab order and the accessibility tree at the same time (axe rule
 * `aria-hidden-focus`); with nothing ever hidden there is nothing to keep in
 * step, so removing them is the fix rather than a regression of it.
 *
 * The rail is still desktop-only, and still by CSS alone: `.contact-rail` is
 * `display: none` until 900px, which is the exact width where `.action-bar`
 * takes over on the other side. Those two breakpoints must stay equal — they
 * were 1100 and 900, which left 900-1099px with neither.
 */
export function StickyContactRail(props: ContactProps) {
  return (
    <div className="contact-rail">
      <ContactButtons {...props} compact />
    </div>
  )
}

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
