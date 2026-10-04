import { askedGarment, formatPhoneForDisplay, normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import { resolveAskedGarment } from '../../../lib/askAboutGarment'
import { getProductCards, getSiteSettings } from '../../../lib/content'
import { CONTACT_HERO_PHOTO, contactHeroSrc, HERO_PHOTO } from '../../../lib/factoryPhotos'
import { HONEYPOT_FIELD, MAX_LENGTHS } from '../../../lib/inquiry'
import { inquiryNotice, OPTIONAL_DIVIDER } from '../../../lib/inquiryForm'
import { buildMetadata } from '../../../lib/seo'
import { contactPageJsonLd, formatAddress } from '../../../lib/structuredData'
import { ContactGlobe } from '../../../components/site/ContactGlobe'
import { FilePicker } from '../../../components/site/FilePicker'
import { InquiryFormEnhancer } from '../../../components/site/InquiryFormEnhancer'
import { InquiryProblem, InquiryReceived } from '../../../components/site/InquiryOutcome'
import { JsonLd } from '../../../components/site/JsonLd'
import { PhoneField } from '../../../components/site/PhoneField'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Get in touch with RUN APPAREL — a private label apparel manufacturer in Sialkot, Pakistan. We reply within 24 hours.',
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
 * ⚠️ THE FORM'S ONE RULE: THE INQUIRY IS STORED BEFORE ANY MAIL IS ATTEMPTED.
 *
 * This page carried "NO FORM, ON PURPOSE" until 2026-09-07, and the reasoning was sound —
 * a form that silently drops a buyer's message is worse than a mailto link that works.
 * The owner asked for one (D3, FA-I-06), so that reasoning became the DESIGN rather than
 * the objection: `contact/submit/route.ts` writes to the `inquiries` collection first and
 * only then calls Resend, and records the outcome on the row. A mail failure costs a
 * notification and is visible in the admin; it can never cost the inquiry.
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
  searchParams: Promise<{
    sent?: string
    error?: string
    reason?: string
    garment?: string | string[]
    colour?: string | string[]
  }>
}) {
  const params = await searchParams
  const settings = await getSiteSettings()
  const whatsapp = `https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`
  const notice = inquiryNotice(params)
  /*
   * "Ask about this garment" (polish S10): a garment page's one prompt opens this form with the
   * garment and colour in it. Looked up among the published garments, and only when the address
   * names both (`lib/askAboutGarment.ts` says why words are never echoed from it).
   */
  const asking = askedGarment(params) ? resolveAskedGarment(params, await getProductCards()) : null
  const [tall640, tall1080] = CONTACT_HERO_PHOTO.widths.heroTall
  const [wide1280, wide1920] = CONTACT_HERO_PHOTO.widths.heroWide

  return (
    <>
      <JsonLd data={contactPageJsonLd(settings)} />
      {/*
       * ⚠️ THE SHOWROOM BEHIND THE HERO, AS THE HOME PAGE HAS THE STITCHING FLOOR (owner,
       * 2026-09-29). `.site-hero--photo` sets the hero in the dark scheme under an ink wash, so the
       * text needs no per-photo contrast work (`HomeHero.tsx` explains). The photo is this page's
       * largest paint: eager, high priority, and inside <picture> — React 19 adds a preload for a
       * bare eager `<img>` on its own, and `e2e/perfBudgets.spec.ts` allows one hint per page.
       */}
      <section className="site-hero site-hero--photo">
        <picture className="site-hero__photo">
          <source
            type="image/avif"
            media="(max-width: 700px)"
            srcSet={`${contactHeroSrc('heroTall', tall640, 'avif')} ${tall640}w, ${contactHeroSrc('heroTall', tall1080, 'avif')} ${tall1080}w`}
            sizes="100vw"
            width={tall640}
            height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
          />
          <source
            media="(max-width: 700px)"
            srcSet={`${contactHeroSrc('heroTall', tall640)} ${tall640}w, ${contactHeroSrc('heroTall', tall1080)} ${tall1080}w`}
            sizes="100vw"
            width={tall640}
            height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
          />
          <img
            className="site-hero__img"
            src={contactHeroSrc('heroWide', wide1280)}
            srcSet={`${contactHeroSrc('heroWide', wide1280)} ${wide1280}w, ${contactHeroSrc('heroWide', wide1920)} ${wide1920}w`}
            sizes="100vw"
            width={wide1280}
            height={Math.round(wide1280 / HERO_PHOTO.aspect.heroWide)}
            alt={CONTACT_HERO_PHOTO.alt}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Contact ]</p>
          <h1 className="display display--hero">Let&rsquo;s talk production.</h1>
          {/*
           * ⚠️ THE WORDING IS MEASURED, NOT JUST WRITTEN (2026-09-26). "Reach us directly — email
           * or WhatsApp, whichever suits you. We reply within 24 hours." failed CI's font-swap
           * test (e2e/fontSwap.spec.ts, CLS 0.022 at 390px): Chromium on Linux draws every glyph
           * at a whole pixel, which widened its second line to 353px in Archivo and 349px in the
           * stand-in face, against a 350px column, so the swap added a line. Every other engine,
           * on Linux and macOS, measured both fonts within 2px and under 350. This wording breaks
           * the same in both fonts in Chromium, Firefox and WebKit at nine widths, 320–1680px.
           * Re-run that test in CI's image after any change to this sentence.
           */}
          <p className="site-lede">
            Reach us directly — by email or on WhatsApp, whichever suits you. We reply within 24
            hours.
          </p>
        </div>
      </section>

      {/*
       * ⚠️ THE FORM COMES FIRST, DIRECTLY UNDER THE HERO (owner, 2026-09-29), and `id="inquiry"` is
       * where every "Start a conversation" link on the site lands (`/contact#inquiry`).
       *
       * ⚠️ ONE STEP SINCE 2026-10-01 (owner, visual audit VA-02): one column, every field showing,
       * the three required ones first and the rest under "Optional details". The two-step form and
       * its progress bar (2026-09-29) are gone. On wide screens the heading and the direct contacts
       * stand in a column beside the form, so a buyer who would rather email sees how at once (the
       * Balmoral and Clothing Network contact pages in the audit's benchmarks); on a phone they
       * follow the form. They replace the separate contact block that sat further down (VA-41).
       */}
      <section className="site-section" id="inquiry">
        <div className="site-container inquiry-layout">
          <div className="inquiry-layout__intro">
            <p className="subhead">What helps us reply faster</p>
            {/* "A&nbsp;sketch": Firefox balanced this as "…you have. a / sketch is enough", the "a"
                alone at a line's end (polish F17, 2026-10-03). */}
            <h2 className="display display--section">
              Send what you have.{' '}
              <span className="serif-accent">A&nbsp;sketch is&nbsp;enough.</span>
            </h2>
            <p className="site-lede">
              Styles and quantities, your target fabric or a reference garment, any artwork, and the
              date you need it by. None of it is required to start the conversation.
            </p>
          </div>

          <div className="inquiry-layout__main">
            {/*
             * After Send the confirmation takes the form's place and the form is hidden (VA-27);
             * a refused Send shows its reason above the form. Both take focus on arrival, so a
             * screen reader reads them, and both clear their code from the address (VA-01).
             */}
            {notice?.kind === 'ok' ? (
              <InquiryReceived
                thanks={notice.text}
                email={settings.email}
                whatsappHref={whatsapp}
                whatsappLabel={formatPhoneForDisplay(settings.whatsappNumber)}
              />
            ) : notice ? (
              <InquiryProblem>{notice.text}</InquiryProblem>
            ) : null}

            {/*
             * ⚠️ `multipart/form-data` SINCE 2026-09-29, for the files. The route reads it with
             * `request.formData()` either way, so a plain-text post from an old cached page still
             * works.
             *
             * ⚠️ EACH MESSAGE SITS OUTSIDE ITS LABEL, linked by `aria-describedby`. Inside the label
             * it would become part of the field's NAME ("Your name Enter your name."), which a
             * screen reader repeats on every visit to the field (GOV.UK error message pattern).
             */}
            <form
              className="inquiry-form"
              id="inquiry-form"
              method="post"
              action="/contact/submit"
              encType="multipart/form-data"
              hidden={notice?.kind === 'ok'}
            >
              <InquiryFormEnhancer />

              {/*
               * The garment a garment page asked about (polish S10), with the way back to it; the
               * message below opens with the same sentence, and the hidden subject names it in the
               * notification email. Its name and code are the garment's own words (`translate`).
               */}
              {asking ? (
                <p className="inquiry-form__about">
                  <span className="inquiry-form__label">Asking about</span>{' '}
                  <a href={asking.href}>
                    <span translate="no">
                      {asking.productName} ({asking.productCode})
                    </span>
                    , {asking.colourName}
                  </a>
                  <input type="hidden" name="subject" value={asking.subject} />
                </p>
              ) : null}

              <div className="inquiry-form__field">
                <label className="inquiry-form__label" htmlFor="inquiry-name">
                  Your name
                </label>
                <input
                  className="inquiry-form__input"
                  id="inquiry-name"
                  type="text"
                  name="name"
                  required
                  maxLength={MAX_LENGTHS.name}
                  autoComplete="name"
                  data-check
                />
                <p className="inquiry-form__error" id="inquiry-name-error" hidden />
              </div>

              <div className="inquiry-form__field">
                <label className="inquiry-form__label" htmlFor="inquiry-email">
                  Email
                </label>
                <input
                  className="inquiry-form__input"
                  id="inquiry-email"
                  type="email"
                  name="email"
                  required
                  maxLength={MAX_LENGTHS.email}
                  autoComplete="email"
                  spellCheck={false}
                  data-check
                />
                <p className="inquiry-form__error" id="inquiry-email-error" hidden />
              </div>

              <div className="inquiry-form__field">
                <label className="inquiry-form__label" htmlFor="inquiry-message">
                  What are you making?
                </label>
                <textarea
                  className="inquiry-form__input inquiry-form__textarea"
                  id="inquiry-message"
                  name="message"
                  required
                  rows={6}
                  maxLength={MAX_LENGTHS.message}
                  // The asked garment's sentence, then an empty line for the buyer (polish S10).
                  defaultValue={asking?.message}
                  data-check
                  /*
                    ⚠️ NO PLACEHOLDER. The first version repeated the paragraph directly
                    above it word for word — the same sentence twice on one phone screen,
                    which a screenshot showed and no test would have. A placeholder is a poor
                    place for guidance anyway: it disappears the moment someone starts
                    typing, exactly when they might want to re-read it.
                  */
                />
                <p className="inquiry-form__error" id="inquiry-message-error" hidden />
              </div>

              {/*
               * The optional half, grouped so a screen reader hears "Optional details" once for the
               * group. Job title and Subject left the form on 2026-10-01 (owner, VA-02): the message
               * already says what Subject asked, and fewer optional fields suit a first B2B contact.
               * The route still accepts both, so a page cached before then still sends.
               */}
              <fieldset className="inquiry-form__group">
                <legend className="inquiry-form__divider">{OPTIONAL_DIVIDER}</legend>
                <label className="inquiry-form__field">
                  <span className="inquiry-form__label">Company (optional)</span>
                  <input
                    className="inquiry-form__input"
                    type="text"
                    name="company"
                    maxLength={MAX_LENGTHS.company}
                    autoComplete="organization"
                  />
                </label>
                <PhoneField />
                <FilePicker />
              </fieldset>

              <div className="site-actions">
                {/* One of the site's agreed primary labels (CT-08, `e2e/copy.spec.ts`). */}
                <button className="btn btn--primary" type="submit">
                  Send inquiry
                </button>
                <a className="btn btn--ghost" href={`mailto:${settings.email}`}>
                  Or email us instead
                </a>
              </div>

              {/*
              ⚠️ THE HONEYPOT. Hidden from sight and from assistive technology, and a bot
              that fills every field it can find gives itself away. `aria-hidden` plus
              `tabIndex={-1}` keep it out of the accessibility tree and the tab order, so
              a screen-reader user is never offered a field they must leave blank.
              `autoComplete="off"` stops a browser helpfully filling it in and locking a
              real person out — which is the failure mode that makes honeypots infamous.
              It is not a CAPTCHA and the rate limiter is the real backstop.
            */}
              <div className="inquiry-form__trap" aria-hidden="true">
                <label htmlFor={HONEYPOT_FIELD}>Website</label>
                <input
                  id={HONEYPOT_FIELD}
                  type="text"
                  name={HONEYPOT_FIELD}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>
            </form>
          </div>

          <div className="inquiry-layout__details contact-grid">
            <div className="contact-block">
              <p className="field-label">[ Partnerships ]</p>
              <a className="contact-block__value" href={`mailto:${settings.email}`}>
                {settings.email}
              </a>
              <p className="contact-block__note">New programs, quotes and samples.</p>
            </div>
            <div className="contact-block">
              <p className="field-label">[ WhatsApp ]</p>
              <a className="contact-block__value" href={whatsapp} rel="noopener">
                {formatPhoneForDisplay(settings.whatsappNumber)}
              </a>
              <p className="contact-block__note">Fastest for a quick question.</p>
            </div>
            <div className="contact-block">
              <p className="field-label">[ Address ]</p>
              <address className="contact-block__value">{ADDRESS}</address>
              <p className="contact-block__note">{settings.companyName}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="subhead">Where we are</p>
          <h2 className="display display--section">
            From Sialkot, <span className="serif-accent">to wherever you&nbsp;are.</span>
          </h2>
          <ContactGlobe coordinates={settings.footer.worksCoordinates} address={ADDRESS} />
        </div>
      </section>
    </>
  )
}
