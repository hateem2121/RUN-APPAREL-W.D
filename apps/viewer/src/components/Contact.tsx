import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  type EnquiryContext,
  type ViewerSiteSettings,
} from '@run-apparel/shared'
import { useEffect, useState } from 'react'
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
      <p className="section-number">N°003 — START THE CONVERSATION — N°003</p>
      <h2 id="contact-heading" className="display display--section">
        Develop this with <span className="serif-accent">us</span>.
      </h2>
      <div className="contact__buttons">
        <ContactButtons {...props} />
      </div>
      <p className="contact__micro">
        Share your company, target market, estimated quantity and product requirements so our team
        can advise accurately. The message template is pre-filled — complete the open fields before
        sending.
      </p>
    </section>
  )
}

/** Desktop-only rail that appears after the visitor scrolls past the 3D stage. */
export function StickyContactRail(props: ContactProps & { stageSelector?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stage = document.querySelector(props.stageSelector ?? '.stage')
    if (!stage) return
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.every((entry) => !entry.isIntersecting))
      },
      { threshold: 0.05 },
    )
    observer.observe(stage)
    return () => observer.disconnect()
  }, [props.stageSelector])

  return (
    // `inert` while hidden removes the rail's links from BOTH the tab order and
    // the accessibility tree, so keyboard users can't tab into content that
    // aria-hidden conceals from screen readers (axe rule: aria-hidden-focus).
    <div
      className={`contact-rail${visible ? ' contact-rail--visible' : ''}`}
      aria-hidden={!visible}
      inert={!visible}
    >
      <ContactButtons {...props} compact />
    </div>
  )
}

/** Mobile persistent bottom action bar (safe-area aware). */
export function MobileActionBar(props: ContactProps) {
  return (
    <div className="action-bar">
      <ContactButtons {...props} compact />
    </div>
  )
}
