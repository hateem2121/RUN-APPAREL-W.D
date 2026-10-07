import { PRESS_PAGE } from '../../lib/companyPages'
import { factoryPhotoImage } from '../../lib/factoryPhotos'
import { formatPostDate } from '../../lib/journal'
import type { JournalPostView } from '../../lib/journalPublic'
import {
  MEDIA_EMAIL,
  PRESS_FACTS,
  PRESS_HERO_PHOTO,
  PRESS_PHOTO_USAGE,
  PRESS_PHOTOS,
  pressPhotoDownload,
} from '../../lib/press'
import { breadcrumbTrailJsonLd, formatAddress } from '../../lib/structuredData'
import { CompanyClosing } from './CompanyPage'
import { Heading, listOf, SplitHero, sectionIn, sentences } from './CompanyParts'
import { FactoryFigure } from './FactoryFigure'
import { JsonLd } from './JsonLd'

/**
 * The press page (PLAN.md D8; words approved by the owner 2026-10-07). Built on the careers and
 * community pages' parts, for the reason those pages give: every band fills the page's width (the
 * owner, on careers: "too much empty space on left"). The facts run across the page in five
 * columns, the photos in a grid where a wide photo takes two cells and a tall one one, and the
 * contact sits beside its heading as the closing band does.
 *
 * ⚠️ NOT ONE NEW WORD beyond the approved list: the headings and words are `PRESS_PAGE`'s and
 * `press.ts`'s; the boilerplate is `LINEAGE` and `CERTIFICATION_LINES`; the numbers are `FACTS`.
 * "News" is drawn only when a "Company news" post is published, so the page never shows an empty
 * band.
 */

/** A wide photo: half the column from 900 px, the whole column below. A tall one: half that. */
const PHOTO_SIZES = {
  wide: '(max-width: 899px) calc(100vw - 40px), min(50vw, 736px)',
  single: '(max-width: 899px) calc(50vw - 26px), min(25vw, 368px)',
} as const

export function PressPage({
  companyName,
  news,
}: {
  companyName: string
  news: readonly JournalPostView[]
}) {
  const page = PRESS_PAGE
  const trail = [{ name: page.title, path: page.path }]
  const about = sectionIn(page, 'about')
  const facts = sectionIn(page, 'quick-facts')
  const photos = sectionIn(page, 'photos')
  const newsSection = sectionIn(page, 'news')
  const contact = sectionIn(page, 'media-contact')
  const rows = [
    { label: 'Legal name', value: companyName },
    { label: 'Address', value: formatAddress() },
    ...PRESS_FACTS,
  ]

  return (
    <>
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />
      <SplitHero
        page={page}
        trail={trail}
        photoSlug={PRESS_HERO_PHOTO}
        action={
          // The section's own heading as the link's words: no new label.
          <a className="btn btn--ghost" href={`#${contact.id}`}>
            {contact.heading}
          </a>
        }
      />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="company-head">
            <Heading id={about.id}>{about.heading}</Heading>
            <div className="company-head__words">
              <p className="site-lede">
                {companyName} is a private label apparel manufacturer in Sialkot, Pakistan.
              </p>
              {sentences(about).map((text) => (
                <p className="site-lede" key={text}>
                  {text}
                </p>
              ))}
            </div>
          </div>
          {/* `data-facts`: the certificate lines, as on the policies hub (PolicyIndex.tsx): names
              such as SEDEX and OEKO-TEX, which the reading-ease check reads as hard words. With
              them /press scored 49.3 ease against a floor of 50 (2026-10-07). */}
          <ul className="ruled-grid" data-facts>
            {listOf(about).map((item) => (
              <li className="ruled-grid__item" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <Heading id={facts.id}>{facts.heading}</Heading>
          <dl className="case-facts press-facts">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <div className="company-head">
            <Heading id={photos.id}>{photos.heading}</Heading>
            <div className="company-head__words">
              <p className="site-lede">{PRESS_PHOTO_USAGE}</p>
            </div>
          </div>
          <ul className="press-photos">
            {PRESS_PHOTOS.map((photo) => {
              const file = pressPhotoDownload(photo)
              return (
                <li
                  className={`press-photos__item press-photos__item--${photo.shape}`}
                  key={photo.slug}
                >
                  <FactoryFigure
                    photo={photo}
                    {...factoryPhotoImage(photo)}
                    sizes={PHOTO_SIZES[photo.shape]}
                  />
                  {/* "Download" is the visible name; the label adds which photo, and keeps the
                      visible word first (WCAG 2.5.3, label in name). */}
                  <a
                    className="press-photos__download"
                    href={file.href}
                    download
                    aria-label={`Download: ${photo.alt}`}
                  >
                    Download
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {news.length > 0 ? (
        <section className="site-section" data-site-reveal>
          <div className="site-container section-head">
            <Heading id={newsSection.id}>{newsSection.heading}</Heading>
            <ul className="section-head__words press-news">
              {news.map((post) => (
                <li key={post.slug}>
                  <a href={post.path}>{post.title}</a>{' '}
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="site-section" data-site-reveal>
        <div className="site-container section-head">
          <Heading id={contact.id}>{contact.heading}</Heading>
          <div className="section-head__words">
            <p className="site-lede">
              <a className="prose__link" href={`mailto:${MEDIA_EMAIL}`}>
                {MEDIA_EMAIL}
              </a>
            </p>
            {sentences(contact).map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </div>
      </section>

      <CompanyClosing links={page.links} />
    </>
  )
}
