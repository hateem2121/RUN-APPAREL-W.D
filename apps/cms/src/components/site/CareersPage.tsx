import type { ReactNode } from 'react'
import { APPLICATIONS_TO } from '../../lib/application'
import {
  CAREER_PATH,
  CAREERS_HERO_PHOTO,
  CAREERS_LIFE_PHOTOS,
  CAREERS_PAGE,
  type CompanySection,
  ROLE_GROUPS,
} from '../../lib/companyPages'
import { FACTORY_PHOTOS, type FactoryPhoto, factoryPhotoImage } from '../../lib/factoryPhotos'
import { breadcrumbTrailJsonLd, formatAddress } from '../../lib/structuredData'
import { Breadcrumb } from './Breadcrumb'
import { CompanyClosing } from './CompanyPage'
import { FactoryFigure } from './FactoryFigure'
import { JsonLd } from './JsonLd'

/**
 * The careers page's own layout (owner, 2026-10-07). The guides' layout it used first — every
 * section a heading on the left and a short list on the right — was turned down by the owner on
 * sight: "too much empty space on left", "looks AI generated". Each section now takes the shape
 * of what it says: the benefits a ruled table across the page, the real promotion a path drawn
 * like a dimension line, the roles split into the floor and the office, the form beside its
 * explanation as the contact page has it, and the floor in three photos.
 *
 * ⚠️ NOT ONE NEW WORD. Every sentence still comes from `CAREERS_PAGE` (approved 2026-10-07) and
 * the three lists beside it (`CAREER_PATH`, `ROLE_GROUPS`, the photos), which
 * `companyPages.test.ts` holds to the approved sentences. The anchors LinkedIn points at
 * (`#what-we-offer`, `#training`, `#apply`) stay on the section headings
 * (`e2e/careersForm.spec.ts`).
 */

/** A section of the approved words, by id. Throws on a missing one: a typo, caught at build. */
function sectionOf(id: string): CompanySection {
  const section = CAREERS_PAGE.sections.find((entry) => entry.id === id)
  if (!section) throw new Error(`companyPages.ts has no careers section "${id}"`)
  return section
}

/** The section's sentences, in order. */
function sentences(section: CompanySection): string[] {
  return section.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : []))
}

/** The section's first list. */
function listOf(section: CompanySection): readonly string[] {
  const list = section.blocks.find((block) => block.kind === 'list')
  return list?.kind === 'list' ? list.items : []
}

function factoryPhoto(slug: string): FactoryPhoto {
  const photo = FACTORY_PHOTOS.find((entry) => entry.slug === slug)
  if (!photo) throw new Error(`factoryPhotos.ts has no photo "${slug}"`)
  return photo
}

/** A section heading carrying its anchor, as the policy pages carry theirs. */
function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 className="display display--section" id={id}>
      {children}
    </h2>
  )
}

/*
 * How wide each photo draws. The hero's frame: the whole column to 899 px, then 40% of the page
 * (at most 560 px). The mosaic: the wide photo half the column from 900 px, each tall one a
 * quarter; below that the wide one spans the column and the tall two share it.
 */
const HERO_PHOTO_SIZES = '(max-width: 899px) calc(100vw - 40px), min(40vw, 560px)'
const MOSAIC_SIZES = {
  wide: '(max-width: 899px) calc(100vw - 40px), min(50vw, 736px)',
  single: '(max-width: 899px) calc(50vw - 26px), min(25vw, 368px)',
} as const

export function CareersPage({ applyForm }: { applyForm: ReactNode }) {
  const page = CAREERS_PAGE
  const trail = [{ name: page.title, path: page.path }]
  const offer = sectionOf('what-we-offer')
  const training = sectionOf('training')
  const roles = sectionOf('roles')
  const apply = sectionOf('apply')
  const life = sectionOf('life')
  const hero = factoryPhoto(CAREERS_HERO_PHOTO)
  const heroImage = factoryPhotoImage(hero)
  const [trainingLead, ...trainingRest] = sentences(training)
  const [applyLead, ...applyRest] = sentences(apply)

  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      <section className="site-hero careers-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container careers-hero__layout">
          <div className="careers-hero__words">
            <Breadcrumb trail={trail} />
            <p className="label">{page.eyebrow}</p>
            {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
            <h1 className="display display--hero hero-legal">
              {page.heading} <span className="serif-accent">{page.headingAccent}</span>
            </h1>
            <p className="site-lede">{page.lede}</p>
            <div className="site-actions">
              {/* The section's own heading as the link's words: no new label. */}
              <a className="btn btn--ghost" href="#apply">
                {apply.heading}
              </a>
            </div>
          </div>
          {/*
           * ⚠️ THE PAGE'S LARGEST PAINT: eager, high priority, and inside <picture>, because
           * React 19 adds a preload for a bare eager <img> and `e2e/perfBudgets.spec.ts` allows
           * one hint per page (contact/page.tsx has the same note).
           */}
          <figure className="careers-hero__photo">
            <picture>
              <img
                className="careers-hero__img"
                src={heroImage.src}
                srcSet={heroImage.srcSet}
                sizes={HERO_PHOTO_SIZES}
                width={heroImage.width}
                height={heroImage.height}
                alt={hero.alt}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            {/* The blueprint's corner marks, as the footer's clock wears them. Decoration. */}
            <span className="careers-hero__corners" aria-hidden="true" />
          </figure>
        </div>
      </section>

      <section className="site-section careers-offer" data-site-reveal>
        <div className="site-container">
          <Heading id={offer.id}>{offer.heading}</Heading>
          <ul className="careers-offer__list">
            {listOf(offer).map((item) => (
              <li className="careers-offer__item" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section careers-training" data-site-reveal>
        <div className="site-container careers-training__layout">
          <div className="careers-training__words">
            <Heading id={training.id}>{training.heading}</Heading>
            <p className="site-lede">{trainingLead}</p>
            {trainingRest.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
          {/*
           * The sentence above, drawn: one person's steps up, on a dimension line that rises with
           * them. Hidden from screen readers, which have just read the same steps in the sentence.
           */}
          <ol className="career-path" aria-hidden="true">
            {CAREER_PATH.map((step) => (
              <li className="career-path__step" key={step}>
                <span className="career-path__name">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site-section careers-roles" data-site-reveal>
        <div className="site-container">
          <div className="careers-roles__head">
            <Heading id={roles.id}>{roles.heading}</Heading>
            {sentences(roles).map((text) => (
              <p className="site-lede" key={text}>
                {text}
              </p>
            ))}
          </div>
          <div className="careers-roles__groups">
            {ROLE_GROUPS.map((group) => (
              <div className="careers-roles__group" key={group.name}>
                <h3 className="careers-roles__name">{group.name}</h3>
                <ul className="careers-roles__list">
                  {group.roles.map((role) => (
                    <li key={role}>{role}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
       * ⚠️ THE CONTACT PAGE'S LAYOUT, WHICH THE OWNER APPROVED (VA-02, polish D7): what to send and
       * how else to reach us in a column beside the form, which stays in sight on a wide screen
       * while the form scrolls past it. On a phone they come first, then the form.
       */}
      <section className="site-section careers-apply">
        <div className="site-container inquiry-layout careers-apply__layout">
          <div className="inquiry-layout__intro careers-apply__intro">
            <Heading id={apply.id}>{apply.heading}</Heading>
            <p className="site-lede">{applyLead}</p>
            {applyRest.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <div className="careers-apply__contacts">
              <p className="contact-block__value">
                Write to us at <a href={`mailto:${APPLICATIONS_TO}`}>{APPLICATIONS_TO}</a>.
              </p>
              <address className="contact-block__note">{formatAddress()}</address>
            </div>
          </div>
          <div className="inquiry-layout__main">{applyForm}</div>
        </div>
      </section>

      <section className="site-section careers-life" data-site-reveal>
        <div className="site-container">
          <div className="section-head">
            <Heading id={life.id}>{life.heading}</Heading>
            <div className="section-head__words">
              {sentences(life).map((text) => (
                <p className="site-lede" key={text}>
                  {text}
                </p>
              ))}
            </div>
          </div>
          <div className="careers-life__mosaic">
            {CAREERS_LIFE_PHOTOS.map((slug) => {
              const photo = factoryPhoto(slug)
              return (
                <FactoryFigure
                  key={slug}
                  photo={photo}
                  {...factoryPhotoImage(photo)}
                  sizes={MOSAIC_SIZES[photo.shape]}
                />
              )
            })}
          </div>
        </div>
      </section>

      <CompanyClosing links={page.links} />
    </>
  )
}
