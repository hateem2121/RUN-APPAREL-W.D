import type { ReactNode } from 'react'
import { APPLICATIONS_TO } from '../../lib/application'
import {
  CAREER_PATH,
  CAREERS_HERO_PHOTO,
  CAREERS_LIFE_PHOTOS,
  CAREERS_PAGE,
  ROLE_GROUPS,
} from '../../lib/companyPages'
import { factoryPhotoImage } from '../../lib/factoryPhotos'
import { breadcrumbTrailJsonLd, formatAddress } from '../../lib/structuredData'
import { CompanyClosing } from './CompanyPage'
import { factoryPhoto, Heading, listOf, SplitHero, sectionIn, sentences } from './CompanyParts'
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

/*
 * How wide each mosaic photo draws: the wide photo half the column from 900 px, each tall one a
 * quarter; below that the wide one spans the column and the tall two share it.
 */
const MOSAIC_SIZES = {
  wide: '(max-width: 899px) calc(100vw - 40px), min(50vw, 736px)',
  single: '(max-width: 899px) calc(50vw - 26px), min(25vw, 368px)',
} as const

export function CareersPage({ applyForm }: { applyForm: ReactNode }) {
  const page = CAREERS_PAGE
  const trail = [{ name: page.title, path: page.path }]
  const offer = sectionIn(page, 'what-we-offer')
  const training = sectionIn(page, 'training')
  const roles = sectionIn(page, 'roles')
  const apply = sectionIn(page, 'apply')
  const life = sectionIn(page, 'life')
  const [trainingLead, ...trainingRest] = sentences(training)
  const [applyLead, ...applyRest] = sentences(apply)

  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      <SplitHero
        page={page}
        trail={trail}
        photoSlug={CAREERS_HERO_PHOTO}
        action={
          // The section's own heading as the link's words: no new label.
          <a className="btn btn--ghost" href="#apply">
            {apply.heading}
          </a>
        }
      />

      <section className="site-section careers-offer" data-site-reveal>
        <div className="site-container">
          <Heading id={offer.id}>{offer.heading}</Heading>
          <ul className="ruled-grid">
            {listOf(offer).map((item) => (
              <li className="ruled-grid__item" key={item}>
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
