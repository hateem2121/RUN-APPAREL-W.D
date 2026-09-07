import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import { getSiteSettings } from '../../../lib/content'
import { HONEYPOT_FIELD, MAX_LENGTHS } from '../../../lib/enquiry'
import { buildMetadata } from '../../../lib/seo'
import { contactPageJsonLd, formatAddress } from '../../../lib/structuredData'
import { JsonLd } from '../../../components/site/JsonLd'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Get in touch with RUN APPAREL — a private label apparel manufacturer in Sialkot, Pakistan. We reply within 2 business days.',
  path: '/contact',
})

/**
 * Registered address, rendered from `lib/structuredData.ts`.
 *
 * It lives there rather than here because the JSON-LD block on this page needs the same
 * address broken into parts, and two copies drift — a visible address that contradicts
 * the structured one is read by Google as a spam signal, not as a typo.
 *
 * Still a constant rather than a CMS field: `site-settings` has no address today, and
 * adding one is a D1 migration this page does not need. When that field exists, read it
 * in `structuredData.ts` and both sides follow.
 */
const ADDRESS = formatAddress()

/**
 * ⚠️ THE FORM'S ONE RULE: THE ENQUIRY IS STORED BEFORE ANY MAIL IS ATTEMPTED.
 *
 * This page carried "NO FORM, ON PURPOSE" until 2026-09-07, and the reasoning was sound —
 * a form that silently drops a buyer's message is worse than a mailto link that works.
 * The owner asked for one (D3, FA-I-06), so that reasoning became the DESIGN rather than
 * the objection: `contact/submit/route.ts` writes to the `enquiries` collection first and
 * only then calls Resend, and records the outcome on the row. A mail failure costs a
 * notification and is visible in the admin; it can never cost the enquiry.
 *
 * ⚠️ IT WORKS WITH SCRIPTING OFF, AND EVERY PIECE OF IT IS CHOSEN FOR THAT. A plain
 * `<form method="post">` to a plain route handler — no client component, nothing to
 * hydrate, no Server Action whose server-rendering behaviour would need proving (this
 * stack was bitten by exactly that this week: the blank 404, vercel/next.js#62228).
 * `required`, `type="email"` and `maxlength` are enforced by the BROWSER without
 * JavaScript, so ordinary mistakes are caught before a request is made and the visitor
 * never loses what they typed.
 *
 * ⚠️ THE EMAIL AND WHATSAPP LINKS STAY. The form is an addition, not a replacement: a
 * buyer who wants their own record of what they sent still has one, and both channels are
 * already monitored.
 *
 * ⚠️ AND `?sent=1` / `?error=` CARRY NO TYPED VALUES — never a name, an employer or a
 * message. A URL is written into browser history, proxy logs and outbound `Referer`
 * headers. Preserving the values across the redirect would need a cookie, and this site's
 * privacy notice gets to say it stores NOTHING on the visitor's device (measured,
 * FA-O-74), which is why it needs no consent banner.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const settings = await getSiteSettings()
  const whatsapp = `https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`
  const { sent, error } = await searchParams

  return (
    <>
      <JsonLd data={contactPageJsonLd(settings)} />
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

      <section className="site-section" data-site-reveal>
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
              <p className="section-number">[ Address ]</p>
              <address className="contact-block__value">{ADDRESS}</address>
              <p className="contact-block__note">{settings.companyName}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="section-number">What helps us reply faster</p>
          <h2 className="display display--section">
            Send what you have. <span className="serif-accent">A sketch is enough.</span>
          </h2>
          <p className="site-lede">
            Styles and quantities, your target fabric or a reference garment, any artwork, and the
            date you need it by. Nothing is required to start the conversation.
          </p>
          {sent ? (
            <p className="form-notice form-notice--ok" role="status">
              Thank you — your enquiry is with us. We reply within 2 business days.
            </p>
          ) : null}
          {error ? (
            <p className="form-notice form-notice--bad" role="alert">
              {error === 'too-many'
                ? 'That is several enquiries in a short time. Please wait a few minutes, or email us directly.'
                : error === 'storage'
                  ? 'We could not save your message — please email us directly so it is not lost.'
                  : 'Something in the form was not filled in. Please check and send again.'}
            </p>
          ) : null}

          <form className="enquiry-form" method="post" action="/contact/submit">
            <div className="enquiry-form__row">
              <label className="enquiry-form__field">
                <span className="enquiry-form__label">Your name</span>
                <input
                  className="enquiry-form__input"
                  type="text"
                  name="name"
                  required
                  maxLength={MAX_LENGTHS.name}
                  autoComplete="name"
                />
              </label>
              <label className="enquiry-form__field">
                <span className="enquiry-form__label">Company (optional)</span>
                <input
                  className="enquiry-form__input"
                  type="text"
                  name="company"
                  maxLength={MAX_LENGTHS.company}
                  autoComplete="organization"
                />
              </label>
            </div>

            <label className="enquiry-form__field">
              <span className="enquiry-form__label">Email</span>
              <input
                className="enquiry-form__input"
                type="email"
                name="email"
                required
                maxLength={MAX_LENGTHS.email}
                autoComplete="email"
              />
            </label>

            <label className="enquiry-form__field">
              <span className="enquiry-form__label">What are you making?</span>
              <textarea
                className="enquiry-form__input enquiry-form__textarea"
                name="message"
                required
                rows={6}
                maxLength={MAX_LENGTHS.message}
                placeholder="Styles and quantities, your target fabric or a reference garment, any artwork, and the date you need it by."
              />
            </label>

            {/*
              ⚠️ THE HONEYPOT. Hidden from sight and from assistive technology, and a bot
              that fills every field it can find gives itself away. `aria-hidden` plus
              `tabIndex={-1}` keep it out of the accessibility tree and the tab order, so
              a screen-reader user is never offered a field they must leave blank.
              `autoComplete="off"` stops a browser helpfully filling it in and locking a
              real person out — which is the failure mode that makes honeypots infamous.
              It is not a CAPTCHA and the rate limiter is the real backstop.
            */}
            <div className="enquiry-form__trap" aria-hidden="true">
              <label htmlFor={HONEYPOT_FIELD}>Website</label>
              <input
                id={HONEYPOT_FIELD}
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="site-actions">
              <button className="btn btn--primary" type="submit">
                Send enquiry
              </button>
              <a className="btn btn--ghost" href={`mailto:${settings.email}`}>
                Or email us instead
              </a>
            </div>
          </form>
        </div>
      </section>
    </>
  )
}
