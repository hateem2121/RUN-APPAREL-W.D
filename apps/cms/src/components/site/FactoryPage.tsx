import Link from 'next/link'
import { SiteClosing } from './ArticleParts'
import { Byline } from './Byline'
import { Breadcrumb } from './Breadcrumb'
import { factoryPhoto } from './CompanyParts'
import { FactoryFigure, HALF_COLUMN_SIZES } from './FactoryFigure'
import { FactoryPhotoViewer, type ViewerPhoto } from './FactoryPhotoViewer'
import { JsonLd } from './JsonLd'
import { Marquee } from './Marquee'
import { FACTORY_PAGE } from '../../lib/aboutPages'
import {
  FACTORY_PHOTO_ASPECT,
  factoryPhotoImage,
  factoryPhotoSrc,
  factoryPhotoWidths,
  HERO_PHOTO,
  heroPhotoSrc,
} from '../../lib/factoryPhotos'
import {
  breadcrumbTrailJsonLd,
  factoryPageJsonLd,
  type FactoryPagePhoto,
} from '../../lib/structuredData'

/**
 * The /inside-the-factory page, still version (the about-factory build, 2026-10-09). Every word
 * is `FACTORY_PAGE`'s, approved by the owner on 2026-10-09; the photos are the factory photo
 * library, and stage 3 shows a drawn panel until the owner sends a cutting photo. The pinned
 * walkthrough and the gallery's wipes and viewer arrive with the motion phase, inside the site's
 * motion guards — this layout, stacked stages and a plain gallery of links to the largest files,
 * is what every visitor can read with scripting off.
 *
 * ⚠️ NO CAPTIONS (owner, 2026-10-05, confirmed 2026-10-09): the gallery's set labels are
 * headings, and the photo viewer will show only "3 / 9". Alt text stays.
 */

/** The two phone crops, named for `factoryPhotos.test.ts`'s AVIF-first check. */
const [tall640, tall1080] = HERO_PHOTO.widths.heroTall
const [wide1280, wide1920, wide2560] = HERO_PHOTO.widths.heroWide

/** The photos the gallery shows, as the page's structured data names them (largest file). */
function galleryJsonLdPhotos(): FactoryPagePhoto[] {
  return GALLERY.map(({ largest, photo }) => ({ ...largest, alt: photo.alt }))
}

/**
 * The gallery's photos in order across its sets, each with its largest file: the address its link
 * opens without JavaScript, the photo the viewer shows, and what the structured data names. One
 * list, so the link's index, the viewer's "3 / 9" and the structured data cannot disagree.
 */
const GALLERY = FACTORY_PAGE.gallery.sets.flatMap((set) =>
  set.photos.map((slug) => {
    const photo = factoryPhoto(slug)
    const width = factoryPhotoWidths(photo)[factoryPhotoWidths(photo).length - 1] ?? 0
    const largest = {
      src: factoryPhotoSrc(photo, width),
      width,
      height: Math.round(width / FACTORY_PHOTO_ASPECT[photo.shape]),
    }
    return { slug, photo, largest }
  }),
)

/** What the viewer needs of each: every width to choose from, the largest as its fallback. */
const VIEWER_PHOTOS: ViewerPhoto[] = GALLERY.map(({ photo, largest }) => ({
  ...largest,
  srcSet: factoryPhotoImage(photo).srcSet,
  alt: photo.alt,
}))

export function FactoryPage() {
  const page = FACTORY_PAGE
  const trail = [{ name: 'Inside the factory', path: page.path }]

  return (
    <>
      <JsonLd data={factoryPageJsonLd(page, galleryJsonLdPhotos())} />
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      {/*
       * The editorial hero: the words in the column, the stitching floor beside them. The photo
       * is the page's largest paint, so it is eager with `fetchPriority="high"` on the `<img>`
       * (never a preload link: `e2e/perfBudgets.spec.ts` pins one preload per page).
       */}
      <section className="site-hero">
        <div className="blueprint site-hero__grid" aria-hidden="true" />
        <div className="site-container split-hero">
          <div className="split-hero__words">
            <Breadcrumb trail={trail} />
            <p className="label">{page.label}</p>
            <h1 className="display display--hero hero-legal">
              {page.hero.heading} <span className="serif-accent">{page.hero.accent}</span>
            </h1>
            <p className="site-lede">{page.hero.subtitle}</p>
            <Byline path={page.path} />
          </div>
          <figure className="split-hero__photo factory-hero">
            <picture>
              <source
                type="image/avif"
                media="(max-width: 899px)"
                srcSet={`${heroPhotoSrc('heroTall', tall640, 'avif')} ${tall640}w, ${heroPhotoSrc('heroTall', tall1080, 'avif')} ${tall1080}w`}
                sizes="(max-width: 899px) calc(100vw - 40px)"
                width={tall640}
                height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
              />
              <source
                media="(max-width: 899px)"
                srcSet={`${heroPhotoSrc('heroTall', tall640)} ${tall640}w, ${heroPhotoSrc('heroTall', tall1080)} ${tall1080}w`}
                sizes="(max-width: 899px) calc(100vw - 40px)"
                width={tall640}
                height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
              />
              {/* A plain <img>: pre-built crops picked by srcSet, as the home hero's note says. */}
              <img
                className="split-hero__img"
                src={heroPhotoSrc('heroWide', wide1280)}
                srcSet={`${heroPhotoSrc('heroWide', wide1280)} ${wide1280}w, ${heroPhotoSrc('heroWide', wide1920)} ${wide1920}w, ${heroPhotoSrc('heroWide', wide2560)} ${wide2560}w`}
                sizes="(max-width: 899px) calc(100vw - 40px), min(40vw, 560px)"
                width={wide1280}
                height={Math.round(wide1280 / HERO_PHOTO.aspect.heroWide)}
                alt={HERO_PHOTO.alt}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <span className="split-hero__corners" aria-hidden="true" />
          </figure>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">{page.walkthrough.heading}</h2>
          {/*
           * The walkthrough. An `<ol>` in order at every width. On a wide screen with
           * the site's motion allowed, each stage holds the screen while its photos stay pinned
           * and its words pass, the checkpoint lands like a stamp, and the rail beside the list
           * fills 01 to 05 (site.css, "the walkthrough holds each stage"). The wrapper owns the
           * rail's timeline, which its descendants reach without `timeline-scope`.
           */}
          <div className="factory-walk">
            <span className="factory-walk__rail" aria-hidden="true" />
            <ol className="factory-stages">
              {page.walkthrough.stages.map((stage, index) => (
                <li className="factory-stage" key={stage.title}>
                  <div className="factory-stage__words">
                    <p className="section-number">0{index + 1}</p>
                    <h3 className="factory-stage__title">{stage.title}</h3>
                    <p>{stage.body}</p>
                    <p className="factory-stage__badge">{stage.badge}</p>
                  </div>
                  <div className="factory-stage__photos">
                    {stage.photos.length > 0 ? (
                      stage.photos.map((slug) => {
                        const photo = factoryPhoto(slug)
                        return (
                          <FactoryFigure
                            key={slug}
                            photo={photo}
                            {...factoryPhotoImage(photo)}
                            sizes={HALF_COLUMN_SIZES}
                          />
                        )
                      })
                    ) : (
                      // Stage 3 has no cutting photo yet (owner, 2026-10-09): a drawn panel, the
                      // blueprint grid with corner marks, until one arrives.
                      <span className="factory-panel" aria-hidden="true" />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="site-lede factory-stages__close">
            {page.walkthrough.close.text}{' '}
            <Link href={page.walkthrough.close.href}>{page.walkthrough.close.linkName}</Link>.
          </p>
        </div>
      </section>

      {/* FM1: the five stages, as a decorative row (the stage list above is the real text). */}
      <Marquee words={page.marquee} joiner="→" />

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">{page.gallery.heading}</h2>
          {page.gallery.sets.map((set) => (
            <div className="factory-gallery__set" key={set.label}>
              <h3 className="factory-gallery__label">{set.label}</h3>
              <div className="factory-gallery__photos">
                {set.photos.map((slug) => {
                  const at = GALLERY.findIndex((entry) => entry.slug === slug)
                  const entry = GALLERY[at]
                  if (!entry) return null
                  return (
                    // Without JavaScript, a link to the largest file; with it, the viewer.
                    <a
                      className="factory-gallery__open"
                      href={entry.largest.src}
                      data-gallery-index={at}
                      key={slug}
                    >
                      <FactoryFigure
                        photo={entry.photo}
                        {...factoryPhotoImage(entry.photo)}
                        sizes={HALF_COLUMN_SIZES}
                      />
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
          <FactoryPhotoViewer photos={VIEWER_PHOTOS} />
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container factory-run">
          <div className="factory-run__words">
            <p className="label">{page.howWeRunIt.label}</p>
            <h2 className="display display--section">{page.howWeRunIt.heading}</h2>
            <p className="display display--section factory-run__stat">{page.howWeRunIt.stat}</p>
            <p className="site-lede">{page.howWeRunIt.statWords}</p>
            <ul className="factory-run__lines">
              {page.howWeRunIt.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="site-actions">
              <Link className="btn btn--ghost" href={page.howWeRunIt.link.href}>
                {page.howWeRunIt.link.name} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="factory-run__photo">
            {(() => {
              const photo = factoryPhoto('solar-roof')
              return (
                <FactoryFigure
                  photo={photo}
                  {...factoryPhotoImage(photo)}
                  sizes={HALF_COLUMN_SIZES}
                />
              )
            })()}
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container site-actions">
          <Link className="btn btn--ghost" href={page.crossLink.href}>
            {page.crossLink.name} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <SiteClosing />
        </div>
      </section>
    </>
  )
}
