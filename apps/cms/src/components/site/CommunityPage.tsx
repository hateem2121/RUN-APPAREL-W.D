import {
  COMMUNITY_HERO_PHOTO,
  COMMUNITY_PAGE,
  COMMUNITY_WORKS_PHOTOS,
} from '../../lib/companyPages'
import { factoryPhotoImage } from '../../lib/factoryPhotos'
import { breadcrumbTrailJsonLd } from '../../lib/structuredData'
import { CompanyClosing } from './CompanyPage'
import { factoryPhoto, Heading, listOf, SplitHero, sectionIn, sentences } from './CompanyParts'
import { FactoryFigure } from './FactoryFigure'
import { JsonLd } from './JsonLd'

/**
 * The community page's own layout (2026-10-07), for the careers page's reason: the guides'
 * heading-left, list-right sections left half of every screen empty, which the owner turned down
 * on careers ("too much empty space on left", "looks AI generated") and asked to be checked on
 * every page. The benefits share careers' ruled table; the two one-sentence sections stand side by
 * side in one band instead of two half-empty ones; the works are two photos across the page.
 *
 * ⚠️ NOT ONE NEW WORD. Every sentence is `COMMUNITY_PAGE`'s (approved 2026-10-07), and the anchors
 * (`#work`, `#hard-times`, `#buyers`, `#the-works`) stay on their headings
 * (`e2e/careersForm.spec.ts` holds them).
 */

/** Each works photo: half the column from 900 px, the whole column below. */
const WORKS_SIZES = '(max-width: 899px) calc(100vw - 40px), min(48vw, 736px)'

export function CommunityPage() {
  const page = COMMUNITY_PAGE
  const trail = [{ name: page.title, path: page.path }]
  const work = sectionIn(page, 'work')
  const pair = [sectionIn(page, 'hard-times'), sectionIn(page, 'buyers')]
  const works = sectionIn(page, 'the-works')

  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <SplitHero page={page} trail={trail} photoSlug={COMMUNITY_HERO_PHOTO} />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="company-head">
            <Heading id={work.id}>{work.heading}</Heading>
            <div className="company-head__words">
              {sentences(work).map((text) => (
                <p className="site-lede" key={text}>
                  {text}
                </p>
              ))}
            </div>
          </div>
          <ul className="ruled-grid">
            {listOf(work).map((item) => (
              <li className="ruled-grid__item" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container company-pair">
          {pair.map((section) => (
            <div className="company-pair__item" key={section.id}>
              <Heading id={section.id}>{section.heading}</Heading>
              {sentences(section).map((text) => (
                <p className="site-lede" key={text}>
                  {text}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="company-head">
            <Heading id={works.id}>{works.heading}</Heading>
            <div className="company-head__words">
              {sentences(works).map((text) => (
                <p className="site-lede" key={text}>
                  {text}
                </p>
              ))}
            </div>
          </div>
          <div className="company-works">
            {COMMUNITY_WORKS_PHOTOS.map((slug) => {
              const photo = factoryPhoto(slug)
              return (
                <FactoryFigure
                  key={slug}
                  photo={photo}
                  {...factoryPhotoImage(photo)}
                  sizes={WORKS_SIZES}
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
