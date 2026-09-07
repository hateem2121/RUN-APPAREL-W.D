import { normalizeWhatsAppNumber } from '@run-apparel/shared'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getSiteSettings } from '../../lib/content'
import { buildMetadata } from '../../lib/seo'

/**
 * ⚠️ `force-dynamic` IS NOT OPTIONAL. `resolveCloudflareEnv()` returns null during
 * `next build` — no D1 binding exists in the build phase — so any attempt to
 * pre-render this page reads an absent database. The content helpers also swallow the
 * throw, but that only converts a crash into a blank page; this is what stops the
 * attempt happening at all.
 */
export const dynamic = 'force-dynamic'

const TITLE = 'RUN APPAREL — Custom B2B Sportswear & Team Wear Manufacturer'
const DESCRIPTION =
  'A private label apparel manufacturer in Sialkot, Pakistan — 100,000 pieces a month, from 50 pieces per style. Team wear, active wear, casual wear, outerwear and sports accessories, made to order for brands, teams and organisations worldwide. A family manufacturing and exporting trade since 1889.'

export const metadata: Metadata = {
  ...buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/' }),
  // The template in layout.tsx would render "RUN APPAREL — … — RUN APPAREL".
  title: { absolute: TITLE },
}

/**
 * ⚠️ EVERY NUMBER HERE WAS CONFIRMED BY THE OWNER ON 2026-09-07 AND NOTHING ELSE GOES ON
 * THE PAGE. The audit found the whole marketing site contained exactly two checkable
 * numbers (FA-I-10, FA-I-09, FA-I-05): no capacity, no minimum, no lead time, no
 * certification — while the 3D pages already answered a buyer's first question. A
 * manufacturing buyer decides whether to enquire by looking for specifics, and adjectives
 * do not answer that.
 *
 * They are constants rather than CMS fields for the same reason TITLE, DESCRIPTION and
 * FAMILIES below are: this page's copy is code, and splitting half of it into the CMS
 * would create two places for one claim to live. The footer's `capacity` fields are the
 * CMS half of this and are the owner's to fill; if these ever disagree, the footer is a
 * claim the owner edited and this is a claim a developer shipped, so the footer wins.
 *
 * ⚠️ 1889 IS A FAMILY TRADE, NOT A COMPANY FOUNDING DATE. The page said "EST. LINEAGE
 * 1889", which a buyer could read either way and which understated the actual claim
 * (FA-I-12). The owner's words, 2026-09-07: the family began manufacturing and exporting
 * in 1889 and has done so since; company names have changed over that time and the roots
 * have not.
 */
const FACTS = [
  { value: '100,000', label: 'Pieces per month' },
  { value: '50', label: 'Minimum order, per style' },
  { value: '7', label: 'Working days to a sample' },
  { value: '21–45', label: 'Days, approved sample to shipment' },
  { value: '200', label: 'People at the works' },
  { value: '193,000', label: 'Sq ft under roof' },
]

/**
 * What we make. Mirrors the `category` options on the Products collection, so the
 * homepage and the gallery filter cannot describe different catalogues.
 */
const FAMILIES = [
  { name: 'Sportswear', body: 'Performance kit built for training loads and race days.' },
  { name: 'Teamwear & Uniforms', body: 'Squad kit, staff uniforms and matching sets at scale.' },
  { name: 'Casual Wear', body: 'Everyday pieces in the same construction standard.' },
  { name: 'Outerwear', body: 'Weather layers engineered for movement, not just cover.' },
  { name: 'Sports Accessories', body: 'The supporting pieces that finish a programme.' },
]

export default async function HomePage() {
  const settings = await getSiteSettings()
  return (
    <>
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <p className="label">
            [ PRIVATE LABEL MANUFACTURER · SIALKOT, PK · FAMILY TRADE SINCE 1889 ]
          </p>
          <h1 className="display display--hero">
            Made to order. <span className="serif-accent">Made properly.</span>
          </h1>
          <p className="site-lede">
            RUN APPAREL is a private label manufacturer in Sialkot — team wear, active wear, casual
            wear, outerwear and sports accessories, made to order for the brands, teams and
            organisations that never look back.
          </p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/contact">
              Start a conversation
            </Link>
            <Link className="btn btn--ghost" href="/products">
              See the 3D references
            </Link>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <p className="section-number">N°01 — What we make</p>
          <h2 className="display display--section">Five families, one standard.</h2>
          <p className="site-lede">
            One standard means one factory, one set of hands and one set of tolerances — every
            family below is cut, stitched and finished on the same floor, to the same specification,
            whether it is a hundred pieces or a hundred thousand.
          </p>
          {/*
            ⚠️ ITS OWN GRID, NOT THE PRODUCT ONE. Five items in a generic `auto-fill` grid
            never resolve into a shape — at 768 the fifth card sat alone under a pair, and
            from 1024 up the last row was two cards and a hole, at every width (FA-E-01).
            The count here is fixed and mirrors the `category` options on Products, so the
            grid can treat it as a composition rather than as an unknown list.
          */}
          <ul className="family-grid">
            {FAMILIES.map((family) => (
              <li className="panel family-card" key={family.name}>
                <h3 className="product-card__name">{family.name}</h3>
                <p className="product-card__desc">{family.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <p className="section-number">N°02 — See it before it exists</p>
          <h2 className="display display--section">
            Every reference, <span className="serif-accent">in 3D.</span>
          </h2>
          <p className="site-lede">
            Each garment we develop gets a 3D reference you can turn, inspect and share — the same
            model our QR tags open. No sample shipped, no guesswork about how a print sits.
          </p>
          <div className="site-actions">
            <Link className="btn btn--primary" href="/products">
              Browse the references
            </Link>
          </div>
        </div>
      </section>

      {/*
        ⚠️ AFTER THE 3D PITCH, NOT BEFORE IT. The owner decided on 2026-09-07 that the
        introduction leads and the 3D section keeps its place (FA-I-18,
        docs/DECISIONS-BETA-WEBSITE.md D6), so this is inserted below rather than above —
        adding proof must not quietly reorder a section whose position was just settled.
      */}
      <section className="site-section">
        <div className="site-container">
          <p className="section-number">N°03 — The works</p>
          <h2 className="display display--section">
            Numbers you can <span className="serif-accent">hold us to.</span>
          </h2>
          <p className="site-lede">
            Confirmed capacity, not marketing. If any of these matters to your programme, ask and we
            will put it in writing.
          </p>
          <dl className="facts-grid">
            {FACTS.map((fact) => (
              <div className="fact" key={fact.label}>
                <dt className="fact__value display display--section">{fact.value}</dt>
                <dd className="fact__label">{fact.label}</dd>
              </div>
            ))}
          </dl>
          <div className="facts-notes">
            <div>
              <p className="section-number">Where we ship</p>
              <p className="fact__note">Europe, North and South America, and Oceania.</p>
            </div>
            <div>
              {/*
                ⚠️ THE CERTIFICATE HOLDER IS NAMED, DELIBERATELY. RUN APPAREL holds none in
                its own name; SEDEX and SMETA are DURUS INDUSTRIES', and OEKO-TEX, GOTS and
                GRS are the suppliers'. A buyer's compliance team checks the holder's name
                first, so implying otherwise would fail at exactly the moment it mattered.
                Wording approved by the owner 2026-09-07. SMETA is an AUDIT that was carried
                out, not a certificate that is held — "SMETA-audited", never "SMETA-certified".
              */}
              <p className="section-number">Certification</p>
              <p className="fact__note">
                RUN APPAREL does not hold certification in its own name. Our parent company, DURUS
                INDUSTRIES, is SEDEX-registered and SMETA-audited, and we operate within the same
                facility. Our fabric and trim suppliers hold OEKO-TEX, GOTS and GRS certification.
                Where a programme requires certification in our own name, we will pursue it with
                you.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <p className="section-number">N°04 — Talk to us</p>
          <h2 className="display display--section">Tell us what you&rsquo;re making.</h2>
          <p className="site-lede">
            Send the styles, quantities and specs you have — a sketch is enough to start. We reply
            within 2 business days.
          </p>
          <div className="site-actions">
            <a className="btn btn--primary" href={`mailto:${settings.email}`}>
              Email {settings.email}
            </a>
            <a
              className="btn btn--ghost"
              href={`https://wa.me/${normalizeWhatsAppNumber(settings.whatsappNumber)}`}
              rel="noopener"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
