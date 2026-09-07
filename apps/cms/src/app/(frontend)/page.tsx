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
  'A 100% B2B custom apparel manufacturer in Sialkot, Pakistan. Team wear, active wear, casual wear, outerwear and sports accessories — made to order for brands, teams and organisations worldwide. Craftsmanship rooted in 1889.'

export const metadata: Metadata = {
  ...buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/' }),
  // The template in layout.tsx would render "RUN APPAREL — … — RUN APPAREL".
  title: { absolute: TITLE },
}

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
          <p className="label">[ B2B APPAREL MANUFACTURER · SIALKOT, PK · EST. LINEAGE 1889 ]</p>
          <h1 className="display display--hero">
            Made to order. <span className="serif-accent">Made properly.</span>
          </h1>
          <p className="site-lede">
            RUN APPAREL is a 100% B2B manufacturer in Sialkot — team wear, active wear, casual wear,
            outerwear and sports accessories, made to order for the brands, teams and organisations
            that never look back.
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

      <section className="site-section">
        <div className="site-container">
          <p className="section-number">N°03 — Talk to us</p>
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
