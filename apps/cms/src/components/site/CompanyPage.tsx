import Link from 'next/link'
import type { CompanyPage as CompanyContentType } from '../../lib/companyPages'
import { FACTORY_PHOTOS, factoryPhotoImage } from '../../lib/factoryPhotos'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'
import { breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { Breadcrumb } from './Breadcrumb'
import { Block } from './GuidePage'
import { FactoryFigure, HALF_COLUMN_SIZES } from './FactoryFigure'
import { JsonLd } from './JsonLd'

/**
 * A company page — careers and community (PLAN.md D3/D4). Every word comes from
 * `lib/companyPages.ts`, which the owner approved on 2026-10-07; this file only lays it
 * out, on the guides' structure and block renderer. The one primary button is the site's
 * own closing block; the "How to apply" email arrives from `SiteSettings` and is never
 * typed anywhere.
 */

/** One of the owner's factory photos under a section heading (as the guides draw them). */
function SectionPhoto({ slug }: { slug: string }) {
  const photo = FACTORY_PHOTOS.find((entry) => entry.slug === slug)
  // `companyPages.test.ts` fails a slug with no photo; drawing nothing is the safe miss.
  if (!photo) return null
  return <FactoryFigure photo={photo} {...factoryPhotoImage(photo)} sizes={HALF_COLUMN_SIZES} />
}

export function CompanyPage({
  page,
  applyEmail,
}: {
  page: CompanyContentType
  applyEmail?: string
}) {
  const trail = [{ name: page.title, path: page.path }]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01).
              `display--long` where the headline runs long on a phone (base.css, VA-45). */}
          <Breadcrumb trail={trail} />
          <p className="label">{page.eyebrow}</p>
          <h1
            className={`display display--hero hero-legal${page.heading.length + page.headingAccent.length >= 36 ? ' display--long' : ''}`}
          >
            {page.heading} <span className="serif-accent">{page.headingAccent}</span>
          </h1>
          <p className="site-lede">{page.lede}</p>
        </div>
      </section>

      {page.sections.map((section) => {
        const heading = <h2 className="display display--section">{section.heading}</h2>
        return (
          <section className="site-section" data-site-reveal key={section.id}>
            <div className="site-container prose prose--guide spread">
              {section.photo ? (
                <div className="spread__head">
                  {heading}
                  <SectionPhoto slug={section.photo} />
                </div>
              ) : (
                heading
              )}
              <div className="spread__body">
                {section.blocks.map((block) => (
                  <Block
                    key={
                      block.kind === 'list'
                        ? block.items[0]
                        : 'title' in block
                          ? block.title
                          : block.kind === 'orderSteps'
                            ? 'order-steps'
                            : block.kind === 'table'
                              ? block.caption
                              : block.text
                    }
                    block={block}
                  />
                ))}
                {section.id === 'apply' && applyEmail ? (
                  <p>
                    Write to us at <a href={`mailto:${applyEmail}`}>{applyEmail}</a>.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        )
      })}

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="section-head">
            <h2 className="display display--section">Tell us what you&rsquo;re&nbsp;making.</h2>
            <div className="section-head__words">
              <p className="site-lede">
                Send the styles, quantities and specs you have — a sketch is enough to start. We
                reply within 24 hours.
              </p>
              <div className="site-actions">
                <Link className="btn btn--primary" href="/contact#inquiry">
                  {FAMILY_PAGE_ACTION}
                </Link>
              </div>
            </div>
          </div>
          <nav className="see-also" aria-label="More about us">
            <div className="see-also__group">
              <h3 className="product-card__name" id="more-about-us">
                More about us
              </h3>
              <ul className="see-also__list">
                {page.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.name}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      </section>
    </>
  )
}
