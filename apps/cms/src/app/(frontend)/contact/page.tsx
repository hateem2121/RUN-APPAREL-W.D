import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import { getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Get in touch with RUN APPAREL — a 100% B2B custom apparel manufacturer in Sialkot, Pakistan. We reply within 2 business days.',
  path: '/contact',
})

/**
 * Registered address. A constant rather than a CMS field because `site-settings` has
 * no address today, and inventing a field is CMS schema work (a D1 migration) that
 * this page does not need. When the field is added, read it here and delete this.
 */
const ADDRESS = '13 Km Daska Road, Sialkot, 51040, Pakistan'

/**
 * ⚠️ NO FORM, ON PURPOSE. There is no endpoint to receive one: the `Inquiries`-style
 * collections in the sibling website repo were schema-only and never wired to a
 * visitor-facing form. A form that silently drops a buyer's message is worse than a
 * mailto link that works, so this routes to channels that already exist and are
 * already monitored. The guided quote builder is later work with its own storage,
 * validation and notification path.
 */
export default async function ContactPage() {
  const settings = await getSiteSettings()
  const whatsapp = `https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ CONTACT ]</p>
          <h1 className="display display--hero">Let&rsquo;s talk production.</h1>
          <p className="site-lede">
            Reach us directly — email or WhatsApp, whichever suits you. We reply within 2 business
            days.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="contact-grid">
            <div className="contact-block">
              <p className="section-number">[ Partnerships ]</p>
              <a className="contact-block__value" href={`mailto:${settings.email}`}>
                {settings.email}
              </a>
              <p className="contact-block__note">New programmes, quotes and samples.</p>
            </div>
            <div className="contact-block">
              <p className="section-number">[ WhatsApp ]</p>
              <a className="contact-block__value" href={whatsapp} rel="noopener">
                {settings.whatsappNumber}
              </a>
              <p className="contact-block__note">Fastest for a quick question.</p>
            </div>
            <div className="contact-block">
              <p className="section-number">[ HQ coordinates ]</p>
              <address className="contact-block__value">{ADDRESS}</address>
              <p className="contact-block__note">{settings.companyName}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <p className="section-number">What helps us reply faster</p>
          <h2 className="display display--section">
            Send what you have. <span className="serif-accent">A sketch is enough.</span>
          </h2>
          <p className="site-lede">
            Styles and quantities, your target fabric or a reference garment, any artwork, and the
            date you need it by. Nothing is required to start the conversation.
          </p>
          <div className="site-actions">
            <a className="btn btn--primary" href={`mailto:${settings.email}`}>
              Email us
            </a>
            <a className="btn btn--ghost" href={settings.catalogueUrl} rel="noopener">
              Download the catalogue
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
