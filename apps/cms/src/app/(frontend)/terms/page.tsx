import type { Metadata } from 'next'
import { getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Terms',
  description:
    'The terms on which RUN APPAREL publishes this site and its 3D garment references. A reference is indicative; colour is confirmed against a physical sample.',
  path: '/terms',
})

/**
 * ⚠️ NOT LEGALLY REQUIRED, AND WORTH HAVING ANYWAY (audit, gap 3).
 *
 * This business publishes 3D REFERENCES, not products for sale, and a terms page is the
 * ordinary place to say that a reference is indicative — that colour renders differently
 * on different screens and under different lighting, and that nothing here is an offer
 * capable of acceptance. That protects a manufacturer considerably more than it protects a
 * visitor, which is why it is here despite not being a compliance need.
 *
 * The colour paragraph is the one that earns its place. `tools/asset-pipeline` exists
 * because a rendered garment's colour is derived from the file rather than typed, and the
 * whole system's premise is that a buyer can judge construction and artwork placement from
 * a screen. Saying plainly what a screen cannot settle is the honest version of that
 * promise, not a retreat from it.
 *
 * NOT LEGAL ADVICE. Wording approved by the owner 2026-09-07; a solicitor should review it
 * before it carries any weight.
 */
export default async function TermsPage() {
  const settings = await getSiteSettings()

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ TERMS ]</p>
          <h1 className="display display--hero">
            A reference, <span className="serif-accent">not a promise.</span>
          </h1>
          <p className="site-lede">
            What our 3D references do and do not settle, and what happens to the artwork you send
            us.
          </p>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container prose">
          <p>
            This website and its 3D product references are published by {settings.companyName} for
            business customers considering manufacture with us.
          </p>

          <p className="section-number">The 3D references are indicative</p>
          <p>
            They show construction, fit and artwork placement. Colour appears differently on
            different screens and under different lighting, and a rendered garment is not a colour
            match to finished cloth. Colour, fabric weight and finish are confirmed against a
            physical sample before production.
          </p>

          <p className="section-number">Nothing here is an offer</p>
          <p>
            Prices, minimum quantities and lead times are quoted in writing for each enquiry.
            Nothing on this site forms a contract.
          </p>

          <p className="section-number">Your artwork stays yours</p>
          <p>
            Tech packs, artwork and samples you send us remain your property and your intellectual
            property. We use them only to quote and to manufacture for you.
          </p>

          <p className="section-number">Our material stays ours</p>
          <p>
            The photographs, 3D models, text and marks on this site belong to {settings.companyName}
            .
          </p>

          <p className="section-number">Availability</p>
          <p>
            We try to keep the site and its 3D references available, but we do not guarantee it and
            we are not liable for loss arising from it being unavailable.
          </p>
        </div>
      </section>
    </>
  )
}
