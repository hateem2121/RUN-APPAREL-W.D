import type { Metadata } from 'next'
import { ConsentChange } from '../../../components/site/ConsentChange'
import { OnThisPage, type PageSection } from '../../../components/site/OnThisPage'
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
 * Cookie-question wording (the lede, "If you accept the cookie question", and the three
 * sentences it added further down) approved by the owner 2026-09-30.
 *
 * PostHog joined the same question on 2026-10-04 (owner decision; `packages/shared/src/
 * consent.ts` has why). Its sentences are held to the code: typing is masked in the browser
 * (`maskAllInputs`), and "never tell PostHog who you are" is `person_profiles:
 * 'identified_only'` with no `identify` call anywhere. "30 days" is the project's recording
 * retention and "up to seven years" its plan's analytics retention, both read through
 * PostHog's API on 2026-10-04.
 *
 * NOT LEGAL ADVICE. This is a factual account of what the software does, plus the
 * mainstream reading of the rules as of September 2026. Wording approved by the owner
 * 2026-09-07; a solicitor should review it before it carries any weight. Visit-records
 * wording approved by the owner 2026-09-15. The form's new details, attached files and Resend
 * (the notification email's carrier, unnamed until then) approved by the owner 2026-09-29.
 */
/**
 * The notice's parts, each a real heading since polish X4 (2026-10-04): they were small code-style
 * labels, smaller than the words under them, and the right half of the page was empty. The same
 * list draws "On this page" beside the text.
 */
const SECTIONS = [
  { id: 'who-we-are', title: 'Who we are' },
  { id: 'what-we-collect', title: 'What we collect, and when' },
  // The careers form (owner-approved words, 2026-10-07); the form's privacy line links here.
  { id: 'job-applications', title: 'Job applications' },
  { id: 'why-we-are-allowed', title: 'Why we are allowed to' },
  { id: 'how-long-we-keep-it', title: 'How long we keep it' },
  { id: 'where-it-goes', title: 'Where it goes' },
  { id: 'your-rights', title: 'Your rights' },
] as const satisfies readonly PageSection[]

const heading = (id: (typeof SECTIONS)[number]['id']) => {
  const section = SECTIONS.find((entry) => entry.id === id)
  return (
    <h2 id={id} className="product-card__name prose__heading">
      {section?.title}
    </h2>
  )
}

export default async function PrivacyPage() {
  const settings = await getSiteSettings()

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Privacy ]</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          <h1 className="display display--hero hero-legal">
            We store nothing <span className="serif-accent">you did not&nbsp;choose.</span>
          </h1>
          <p className="site-lede">
            Nothing is stored on your device, and no tracker runs, unless you choose it. We ask
            once, on this site and on our 3D reference pages alike. If you accept, Google Analytics,
            Apollo and PostHog count your visit; if you decline, or do not answer, none of them ever
            loads. Your browser also keeps the light or dark setting, and only after you press that
            switch.
          </p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container legal">
          <OnThisPage sections={SECTIONS} />
          <div className="prose legal__body">
            {heading('who-we-are')}
            <p>
              {settings.companyName}, {formatAddress()}.
            </p>

            {heading('what-we-collect')}
            <p>
              <strong>When you visit.</strong> Our hosting provider, Cloudflare, processes your IP
              address, the page you asked for and your browser type in order to serve the site and
              protect it from abuse. We use Cloudflare Web Analytics, which counts visits without
              cookies and without identifying you.
            </p>
            <p id="cookies">
              <strong>If you accept the cookie question.</strong> Three more services start, and
              only then. Google Analytics, from Google, sets cookies named <code>_ga</code> so that
              it can tell us how many people visit, which pages they read, which country they are in
              and which website sent them. We have switched off its advertising features. Apollo, a
              service based in the United States, stores an identifier in your browser and tells us
              which companies visited, by matching your connection to a company. We use it to
              recognize companies, not people, and our pages block the part of it that identifies
              individuals. PostHog, a service based in the United States, stores an identifier in
              your browser and records how you use our pages (where you click, scroll and move the
              pointer) as a replay we can watch, so that we can see which parts of our pages are
              hard to use. Anything you type into a form is hidden in your browser before the
              recording leaves it, and we never tell PostHog who you are. If you decline, or never
              answer, none of these services is loaded and nothing is stored.
            </p>
            <p>
              You can change your mind at any time. Declining after accepting removes what the three
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
              <strong>When you contact us.</strong> If you email us, message us on WhatsApp or send
              an inquiry through this site, we keep what you send — your name, company, contact
              details and the inquiry itself — so that we can reply, and so that we can fulfill your
              order if we go on to work together. An inquiry sent through this site can also include
              your job title, country, phone number, a subject and any files you attach. Attached
              files are stored privately with Cloudflare, never at a public address, and only our
              team can open them.
            </p>

            {heading('job-applications')}
            <p>
              <strong>When you apply for a job.</strong> If you apply through the form on our
              careers page, we keep what you send — your name, phone number and the work you do,
              and, if you add them, your email address, years of experience, a note and one CV — so
              that our HR team can consider you for work with us and contact you about it.
            </p>
            <p>
              <strong>Your CV</strong> is stored privately with Cloudflare, never at a public
              address, and only our team can open it. When you send an application, Resend delivers
              a notification to our HR team.
            </p>
            <p>
              <strong>Why we are allowed to.</strong> To consider your application and take the
              steps you ask for before any job offer.
            </p>
            <p>
              <strong>How long we keep it.</strong> We keep your application, and any CV, for up to
              12 months, then delete it. If you would like it deleted sooner, email us and we will.
            </p>

            {heading('why-we-are-allowed')}
            <p>
              To run and secure the website, to see how the documents we share are used, and to
              answer business inquiries — our legitimate interests — and to perform a contract where
              one follows. Google Analytics, Apollo and PostHog run only with your consent, which
              you can withdraw above.
            </p>

            {heading('how-long-we-keep-it')}
            <p>
              Inquiry correspondence, including any files you attached, for as long as our business
              relationship needs it; when we delete an inquiry, its files are deleted with it.
              Technical logs and error reports are kept briefly by our providers and then deleted.
              Records of visits to our shared documents for 12 months, after which they are deleted
              automatically. Google Analytics keeps visit data for 14 months. PostHog keeps
              recordings for 30 days and other visit data for up to seven years.
            </p>

            {heading('where-it-goes')}
            <p>
              Cloudflare, Sentry and Resend (which delivers our inquiry notifications to us) process
              data outside Pakistan, including in the United States and the European Union, under
              their standard contractual protections. So do Google, Apollo and PostHog, if you
              accepted the cookie question. We do not sell your data and we do not share it for
              advertising.
            </p>

            {heading('your-rights')}
            <p>
              You may ask us for a copy of what we hold about you, ask us to correct or delete it,
              or object to our processing. Email{' '}
              <a className="prose__link" href={`mailto:${settings.email}`}>
                {settings.email}
              </a>{' '}
              and we will reply within 24 hours.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
