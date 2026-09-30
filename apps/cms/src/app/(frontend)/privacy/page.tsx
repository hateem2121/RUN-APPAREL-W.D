import type { Metadata } from 'next'
import { ConsentChange } from '../../../components/site/ConsentChange'
import { getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'
import { formatAddress } from '../../../lib/structuredData'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Privacy',
  description:
    'What RUN APPAREL does with personal data. Nothing is stored on your device, and no tracker runs, unless you choose it.',
  path: '/privacy',
})

/**
 * ⚠️ REQUIRED, AND ABSENT UNTIL 2026-09-07 (audit FA-O-75, FA-O-76).
 *
 * The trigger for a privacy notice is PROCESSING PERSONAL DATA, not setting cookies. Both
 * surfaces process at least an IP address, and the 3D viewer sends data to two third
 * parties — Cloudflare, and Sentry in the United States, which is an international
 * transfer. UK/EU GDPR Articles 13-14 require the notice regardless of cookies, and the UK
 * Data (Use and Access) Act 2025, in force since 5 February 2026, relaxes CONSENT for some
 * analytics without removing the notice.
 *
 * ⚠️ THE "NO COOKIES" CLAIM IS MEASURED, NOT ASPIRATIONAL, AND IT IS WORTH NOT BREAKING.
 * Audited 2026-09-06 across every page of both surfaces: zero cookies, zero localStorage,
 * zero sessionStorage (FA-O-74). That is what makes a consent banner unnecessary here —
 * consent under ePrivacy/PECR is triggered by storing or reading information on the
 * visitor's device, and there is none. Cloudflare Web Analytics is cookieless by design.
 * Most sites cannot say this. Anything that adds device storage makes this page wrong AND
 * puts a banner on every page of the site.
 *
 * Since the shared menu bar (2026-09-24) one key, `run-theme`, is written when a visitor
 * PRESSES the light/dark switch on either host, and never on a plain visit; the page says
 * so in words the owner approved on 2026-09-23. e2e/themeSwitch.spec.ts fails if a press
 * ever keeps anything else.
 *
 * ⚠️ CLOUDFLARE ANALYTICS IS DESCRIBED IN THE PRESENT TENSE ON PURPOSE. The marketing site
 * contacts nobody today only because `CF_ANALYTICS_TOKEN` is unset, so `Analytics.tsx`
 * renders nothing — and turning it on is on the owner's checklist. A notice that had to be
 * edited at the same moment as a deploy is a notice that would have been wrong for however
 * long that took. The viewer already contacts both parties.
 *
 * ⚠️ THE "NO COOKIES" PARAGRAPH ABOVE DESCRIBES THE SITE UNTIL 2026-09-30, AND IS KEPT AS
 * THE RECORD OF WHY THERE WAS NO BANNER. On that day the owner asked for Google Analytics
 * and Apollo's website visitor tracker on every page. Both keep an identifier in the
 * browser, so the site now asks every visitor first (`ConsentBanner.tsx`), and this page
 * says so. What is still measured and still true: a visit on which nobody presses Accept
 * sets no cookie, stores nothing and contacts neither company. `e2e/consent.spec.ts` and
 * `e2e/privacyClaims.spec.ts` hold the page to that. Apollo is held to identifying
 * COMPANIES, never people: the page policy refuses the script it would need for the
 * latter (`TRACKER_CSP` in packages/shared/src/consent.ts).
 *
 * NOT LEGAL ADVICE. This is a factual account of what the software does, plus the
 * mainstream reading of the rules as of September 2026. Wording approved by the owner
 * 2026-09-07; a solicitor should review it before it carries any weight. Visit-records
 * wording approved by the owner 2026-09-15. The form's new details, attached files and Resend
 * (the notification email's carrier, unnamed until then) approved by the owner 2026-09-29.
 */
export default async function PrivacyPage() {
  const settings = await getSiteSettings()

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ PRIVACY ]</p>
          <h1 className="display display--hero">
            We store nothing <span className="serif-accent">you did not&nbsp;choose.</span>
          </h1>
          <p className="site-lede">
            Nothing is stored on your device, and no tracker runs, unless you choose it. We ask
            once, on this site and on our 3D reference pages alike. If you accept, Google Analytics
            and Apollo count your visit; if you decline, or do not answer, neither ever loads. Your
            browser also keeps the light or dark setting, and only after you press that switch.
          </p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container prose">
          <p className="subhead">Who we are</p>
          <p>
            {settings.companyName}, {formatAddress()}.
          </p>

          <p className="subhead">What we collect, and when</p>
          <p>
            <strong>When you visit.</strong> Our hosting provider, Cloudflare, processes your IP
            address, the page you asked for and your browser type in order to serve the site and
            protect it from abuse. We use Cloudflare Web Analytics, which counts visits without
            cookies and without identifying you.
          </p>
          <p id="cookies">
            <strong>If you accept the cookie question.</strong> Two more services start, and only
            then. Google Analytics, from Google, sets cookies named <code>_ga</code> so that it can
            tell us how many people visit, which pages they read, which country they are in and
            which website sent them. We have switched off its advertising features. Apollo, a
            service based in the United States, stores an identifier in your browser and tells us
            which companies visited, by matching your connection to a company. We use it to
            recognize companies, not people, and our pages block the part of it that identifies
            individuals. If you decline, or never answer, neither service is loaded and nothing is
            stored.
          </p>
          <p>
            You can change your mind at any time. Declining after accepting removes what the two
            services stored in your browser.
          </p>
          <p>
            <ConsentChange />
          </p>
          <p>
            <strong>When you open a document we share with you.</strong> Our catalog and company
            profile open from private links. When one is opened, we record the day and time; the
            approximate location (country, region and city), its time zone, and the name of the
            network your connection comes from; your type of device, system, browser and language;
            the website you came from; how far you scrolled; the time between your first and last
            activity on it that day; and whether you downloaded the file. We do not record your IP
            address. To count how many different people opened a document each day, we use a code
            made from your connection and a secret that is replaced and deleted every day, so it
            cannot be traced back to you or linked across days. If your browser sends a Global
            Privacy Control signal, we count the visit and record nothing else.
          </p>
          <p>
            <strong>When something breaks.</strong> Our 3D reference pages report technical faults
            to Sentry, a service based in the United States, so that we can fix them. A report
            contains the error, the page it happened on and your IP address, which Sentry records
            with the report. It does not include your name, cookies or anything you type.
          </p>
          <p>
            <strong>When you contact us.</strong> If you email us, message us on WhatsApp or send an
            inquiry through this site, we keep what you send — your name, company, contact details
            and the inquiry itself — so that we can reply, and so that we can fulfill your order if
            we go on to work together. An inquiry sent through this site can also include your job
            title, country, phone number, a subject and any files you attach. Attached files are
            stored privately with Cloudflare, never at a public address, and only our team can open
            them.
          </p>

          <p className="subhead">Why we are allowed to</p>
          <p>
            To run and secure the website, to see how the documents we share are used, and to answer
            business inquiries — our legitimate interests — and to perform a contract where one
            follows. Google Analytics and Apollo run only with your consent, which you can withdraw
            above.
          </p>

          <p className="subhead">How long we keep it</p>
          <p>
            Inquiry correspondence, including any files you attached, for as long as our business
            relationship needs it; when we delete an inquiry, its files are deleted with it.
            Technical logs and error reports are kept briefly by our providers and then deleted.
            Records of visits to our shared documents for 12 months, after which they are deleted
            automatically. Google Analytics keeps visit data for 14 months.
          </p>

          <p className="subhead">Where it goes</p>
          <p>
            Cloudflare, Sentry and Resend (which delivers our inquiry notifications to us) process
            data outside Pakistan, including in the United States and the European Union, under
            their standard contractual protections. So do Google and Apollo, if you accepted the
            cookie question. We do not sell your data and we do not share it for advertising.
          </p>

          <p className="subhead">Your rights</p>
          <p>
            You may ask us for a copy of what we hold about you, ask us to correct or delete it, or
            object to our processing. Email{' '}
            <a className="prose__link" href={`mailto:${settings.email}`}>
              {settings.email}
            </a>{' '}
            and we will reply within 24 hours.
          </p>
        </div>
      </section>
    </>
  )
}
