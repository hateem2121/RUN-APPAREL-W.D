import type { Metadata } from 'next'
import { OnThisPage, type PageSection } from '../../../components/site/OnThisPage'
import { getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = buildMetadata({
  title: 'Terms',
  description:
    'The terms on which RUN APPAREL publishes this site and its 3D garment references. A reference is indicative; color is confirmed against a physical sample.',
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
/** Each term a real heading since polish X4, and the list "On this page" draws (privacy/page.tsx). */
const SECTIONS = [
  { id: 'references-are-indicative', title: 'The 3D references are indicative' },
  { id: 'nothing-is-an-offer', title: 'Nothing here is an offer' },
  { id: 'your-artwork', title: 'Your artwork stays yours' },
  { id: 'our-material', title: 'Our material stays ours' },
  { id: 'availability', title: 'Availability' },
] as const satisfies readonly PageSection[]

const heading = (id: (typeof SECTIONS)[number]['id']) => {
  const section = SECTIONS.find((entry) => entry.id === id)
  return (
    <h2 id={id} className="product-card__name prose__heading">
      {section?.title}
    </h2>
  )
}

export default async function TermsPage() {
  const settings = await getSiteSettings()

  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">[ Terms ]</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          <h1 className="display display--hero hero-legal">
            A reference, <span className="serif-accent">not a&nbsp;promise.</span>
          </h1>
          <p className="site-lede">
            What our 3D references do and do not settle, and what happens to the artwork you send
            us.
          </p>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container legal">
          <OnThisPage sections={SECTIONS} />
          <div className="prose legal__body">
            <p>
              This website and its 3D product references are published by {settings.companyName} for
              business customers considering manufacture with us.
            </p>

            {heading('references-are-indicative')}
            <p>
              They show construction, fit and artwork placement. Color appears differently on
              different screens and under different lighting, and a rendered garment is not a color
              match to finished cloth. Color, fabric weight and finish are confirmed against a
              physical sample before production.
            </p>

            {heading('nothing-is-an-offer')}
            <p>
              Prices, minimum quantities and lead times are quoted in writing for each inquiry.
              Nothing on this site forms a contract.
            </p>

            {heading('your-artwork')}
            <p>
              Tech packs, artwork and samples you send us remain your property and your intellectual
              property. We use them only to quote and to manufacture for you.
            </p>

            {heading('our-material')}
            <p>
              The photographs, 3D models, text and marks on this site belong to{' '}
              {settings.companyName}.
            </p>

            {heading('availability')}
            <p>
              We try to keep the site and its 3D references available, but we do not guarantee it
              and we are not liable for loss arising from it being unavailable.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
