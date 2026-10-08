import Link from 'next/link'
import { CASE_STUDIES_HUB, CASE_STUDIES_PATH } from '../../lib/caseStudies'
import type { CaseStudyView } from '../../lib/caseStudyPublic'
import { FAMILY_PAGE_ACTION } from '../../lib/familyPages'
import { formatPostDate } from '../../lib/journal'
import { articleJsonLd, breadcrumbTrailJsonLd, caseStudiesJsonLd } from '../../lib/structuredData'
import { ArticleImage, LinkList, SiteClosing } from './ArticleParts'
import { Breadcrumb } from './Breadcrumb'
import { JsonLd } from './JsonLd'

/**
 * The case studies (PLAN.md D9, Task 5.3): the hub at `/case-studies` and one case study at
 * `/case-studies/<slug>`.
 *
 * ⚠️ AN EMPTY HUB IS NOT A "COMING SOON" PAGE (T5, REVIEW.md R-18). With none published it shows
 * the plan's headline, what every case study will include and "Want to be our first story?" with
 * the site's one primary button, carries `noindex` (the route's metadata) and is left out of the
 * sitemap, llms.txt and every link list. The first published case study switches all of that on.
 */
export function CaseStudyIndex({ studies }: { studies: readonly CaseStudyView[] }) {
  const trail = [{ name: CASE_STUDIES_HUB.title, path: CASE_STUDIES_PATH }]
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      {studies.length > 0 ? (
        <JsonLd
          data={caseStudiesJsonLd(
            studies.map((study) => ({ path: study.path, headline: study.title })),
          )}
        />
      ) : null}

      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container">
          <Breadcrumb trail={trail} />
          <p className="label">{CASE_STUDIES_HUB.eyebrow}</p>
          {/* `hero-legal`: this headline never swaps fonts mid-visit (site.css, 2026-10-01). */}
          <h1 className="display display--hero hero-legal">
            {CASE_STUDIES_HUB.heading}{' '}
            <span className="serif-accent">{CASE_STUDIES_HUB.headingAccent}</span>
          </h1>
        </div>
      </section>

      {studies.length > 0 ? (
        <>
          <section className="site-section" data-site-reveal>
            <div className="site-container">
              <ul className="journal-grid">
                {studies.map((study, index) => (
                  <CaseStudyCard key={study.slug} study={study} lead={index === 0} />
                ))}
              </ul>
            </div>
          </section>
          <section className="site-section" data-site-reveal>
            <div className="site-container">
              <SiteClosing />
            </div>
          </section>
        </>
      ) : (
        <section className="site-section" data-site-reveal>
          <div className="site-container case-first">
            <ol className="journal-topics">
              {CASE_STUDIES_HUB.includes.map((part) => (
                <li className="journal-topics__item" key={part}>
                  {part}
                </li>
              ))}
            </ol>
            <div className="section-head case-first__ask">
              <h2 className="display display--section">{CASE_STUDIES_HUB.firstStory}</h2>
              <div className="section-head__words">
                <div className="site-actions">
                  <Link className="btn btn--primary" href="/contact#inquiry">
                    {FAMILY_PAGE_ACTION}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

/** One case study on the hub: one link, on its title, as the Journal's cards. */
function CaseStudyCard({ study, lead }: { study: CaseStudyView; lead: boolean }) {
  const picture = study.images[0] ?? study.share
  return (
    <li className={`panel journal-card${lead ? ' journal-card--lead' : ''}`}>
      {picture ? (
        <ArticleImage
          image={picture}
          className="journal-card__img"
          sizes={
            lead
              ? '(max-width: 899px) calc(100vw - 40px), 760px'
              : '(max-width: 559px) calc(100vw - 40px), (max-width: 999px) 50vw, 420px'
          }
          eager={lead}
        />
      ) : null}
      <div className="journal-card__words">
        <p className="journal-card__meta">
          {study.facts.slice(0, 2).map((fact) => (
            <span key={fact.label}>{fact.value}</span>
          ))}
        </p>
        <h2
          className={
            lead
              ? 'display display--section journal-card__title'
              : 'product-card__name journal-card__title'
          }
        >
          <Link className="journal-card__link" href={study.path}>
            {study.title}
          </Link>
        </h2>
        {study.description ? <p className="product-card__desc">{study.description}</p> : null}
      </div>
    </li>
  )
}

/**
 * One case study: the facts first, as a specification sheet (what, for whom, how many, how
 * long), the photos, then the story in three parts side by side on a wide screen, the client's
 * words when they agreed, and the garments it was made of.
 */
export function CaseStudyPage({ study }: { study: CaseStudyView }) {
  const trail = [
    { name: CASE_STUDIES_HUB.title, path: CASE_STUDIES_PATH },
    { name: study.title, path: study.path },
  ]
  const [first, ...rest] = study.images
  const facts = study.facts.map((fact) =>
    fact.label === 'For whom' && study.clientName
      ? { ...fact, value: `${study.clientName}, ${fact.value}` }
      : fact,
  )
  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <JsonLd
        data={articleJsonLd({
          path: study.path,
          headline: study.title,
          description: study.description,
          image: study.share ?? first ?? null,
          datePublished: study.publishedAt,
          dateModified: study.updatedAt,
          author: null,
        })}
      />

      <article>
        <header className="site-hero journal-hero">
          <div className="blueprint site-hero__grid" aria-hidden="true" />
          <div className="site-container">
            <Breadcrumb trail={trail} />
            <p className="label">{CASE_STUDIES_HUB.eyebrow}</p>
            <h1
              className={`display display--hero hero-legal${study.title.length >= 36 ? ' display--long' : ''}`}
            >
              {study.title}
            </h1>
            {study.description ? <p className="site-lede">{study.description}</p> : null}
            <p className="journal-card__meta">
              <time dateTime={study.publishedAt}>{formatPostDate(study.publishedAt)}</time>
            </p>
          </div>
        </header>

        <section className="site-section">
          <div className="site-container">
            <dl className="case-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {first ? (
          <div className="site-container case-photos">
            <figure className="case-photos__lead">
              <ArticleImage
                image={first}
                className="journal-hero__img"
                sizes="(max-width: 1439px) calc(100vw - 40px), 1400px"
                eager
              />
            </figure>
            {rest.map((image) => (
              <figure className="case-photos__more" key={image.url}>
                <ArticleImage
                  image={image}
                  className="journal-hero__img"
                  sizes="(max-width: 899px) calc(100vw - 40px), 50vw"
                />
              </figure>
            ))}
          </div>
        ) : null}

        <section className="site-section">
          <div className="site-container case-story">
            {study.story.map((part, index) => (
              <div className="case-story__part" key={part.label}>
                <p className="case-story__number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h2 className="product-card__name">{part.label}</h2>
                {part.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            ))}
          </div>
        </section>

        {study.quote ? (
          <section className="site-section">
            <div className="site-container">
              <figure className="case-quote">
                <blockquote>
                  <p>{study.quote.text}</p>
                </blockquote>
                {study.quote.attribution ? (
                  <figcaption>{study.quote.attribution}</figcaption>
                ) : null}
              </figure>
            </div>
          </section>
        ) : null}
      </article>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <LinkList id="case-garments" title="Garments" links={study.garments} plain />
          <SiteClosing />
        </div>
      </section>
    </>
  )
}
