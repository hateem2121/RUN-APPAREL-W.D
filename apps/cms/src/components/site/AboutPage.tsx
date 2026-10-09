import Link from 'next/link'
import type { CSSProperties } from 'react'
import { AboutPreloader } from './AboutPreloader'
import { SiteClosing } from './ArticleParts'
import { Byline } from './Byline'
import { Breadcrumb } from './Breadcrumb'
import { CountUp } from './CountUp'
import { JsonLd } from './JsonLd'
import { Marquee } from './Marquee'
import { ABOUT_PAGE } from '../../lib/aboutPages'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE } from '../../lib/companyFacts'
import { ABOUT_HERO_PHOTO, HERO_PHOTO, aboutHeroSrc } from '../../lib/factoryPhotos'
import { aboutPageJsonLd, breadcrumbTrailJsonLd } from '../../lib/structuredData'

/**
 * The /about page, still version (the about-factory build, 2026-10-09). Every word is
 * `ABOUT_PAGE`'s, approved by the owner on 2026-10-09; the numbers are constants the module
 * imports. The scroll-expanding hero of section 8.3 arrives with the motion phase and only
 * inside the site's motion guards — this layout, complete in the server's HTML with the headline
 * over the photo and the site's ink wash, is what reduced motion, Firefox, no-JavaScript and
 * print keep.
 *
 * ⚠️ THE HEADING IS ONE <h1> IN TWO PARTS, laid out either side of the hero photo where the
 * motion layout runs; here the parts sit on one line over the photo. `composition.spec.ts`
 * fails a heading that splits a word at any width.
 */

/** The two phone crops, named for `factoryPhotos.test.ts`'s AVIF-first check. */
const [tall640, tall1080] = ABOUT_HERO_PHOTO.widths.heroTall
const [wide1280, wide1920, wide2560] = ABOUT_HERO_PHOTO.widths.heroWide

export function AboutPage() {
  const page = ABOUT_PAGE
  const trail = [{ name: 'About', path: page.path }]
  const { lead, links, close } = page.whatWeMake
  const linked = links.slice(0, -1)
  const last = links[links.length - 1]

  return (
    <>
      {/* First on the page: its script decides before anything below can paint. */}
      <AboutPreloader />
      <JsonLd data={aboutPageJsonLd(page)} />
      <JsonLd data={breadcrumbTrailJsonLd(trail)} />

      {/*
       * The scroll-expanding hero. Still, this is the photo hero below; inside the
       * site's motion guards (site.css, "The /about hero expands"), the section grows tall and
       * `.about-hero__stage` sticks while the photo opens from a card to the screen and the two
       * halves of the headline slide away. The ghost "1889" is drawn, not written: an SVG, hidden
       * from screen readers, shown only in the motion layout.
       */}
      <section className="site-hero site-hero--photo about-hero">
        <div className="about-hero__stage">
          <svg
            className="about-hero__ghost"
            viewBox="0 0 200 64"
            aria-hidden="true"
            focusable="false"
          >
            <text x="100" y="56" textAnchor="middle">
              1889
            </text>
          </svg>
          <picture className="site-hero__photo">
            <source
              type="image/avif"
              media="(max-width: 700px)"
              srcSet={`${aboutHeroSrc('heroTall', tall640, 'avif')} ${tall640}w, ${aboutHeroSrc('heroTall', tall1080, 'avif')} ${tall1080}w`}
              sizes="100vw"
              width={tall640}
              height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
            />
            <source
              media="(max-width: 700px)"
              srcSet={`${aboutHeroSrc('heroTall', tall640)} ${tall640}w, ${aboutHeroSrc('heroTall', tall1080)} ${tall1080}w`}
              sizes="100vw"
              width={tall640}
              height={Math.round(tall640 / HERO_PHOTO.aspect.heroTall)}
            />
            {/* A plain <img>: pre-built crops picked by srcSet, as the home hero's note says. */}
            <img
              className="site-hero__img"
              src={aboutHeroSrc('heroWide', wide1280)}
              srcSet={`${aboutHeroSrc('heroWide', wide1280)} ${wide1280}w, ${aboutHeroSrc('heroWide', wide1920)} ${wide1920}w, ${aboutHeroSrc('heroWide', wide2560)} ${wide2560}w`}
              sizes="100vw"
              width={wide1280}
              height={Math.round(wide1280 / HERO_PHOTO.aspect.heroWide)}
              alt={ABOUT_HERO_PHOTO.alt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <div className="blueprint site-hero__grid" aria-hidden="true" />
          <div className="site-container">
            <Breadcrumb trail={trail} />
            <h1 className="display display--hero about-hero__heading">
              <span className="about-hero__part">{page.hero.partLeft}</span>{' '}
              <span className="about-hero__part">
                {page.hero.partRight} <span className="serif-accent">{page.hero.accent}</span>
              </span>
            </h1>
            <p className="site-lede about-hero__subtitle">{page.hero.subtitle}</p>
          </div>
        </div>
      </section>

      {/*
       * The byline sits directly under the opening paragraph, as on the guides, policies and
       * careers (approved with the words). It was in the hero at first; there it did not
       * fit beside the card on a phone's sticky screen.
       */}
      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="site-lede about-lead">{page.quickAnswer}</p>
          <Byline path={page.path} />
        </div>
      </section>

      {/*
       * The mission, word for word (owner): `[data-quote]` is the readability exception the
       * owner chose on 2026-10-09 — the sentence stays as written, and `legibility.spec.ts`
       * skips it the way it skips the certificate lines.
       */}
      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <blockquote className="about-mission" data-quote>
            <p>{page.mission}</p>
          </blockquote>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="site-lede about-lead">
            {lead}{' '}
            {linked.map((link) => (
              <span key={link.href}>
                <Link href={link.href}>{link.name}</Link>,{' '}
              </span>
            ))}
            {last ? (
              <>
                and <Link href={last.href}>{last.name}</Link>{' '}
              </>
            ) : null}
            {close}
          </p>
        </div>
      </section>

      {/* M1: the categories above, as a decorative row (their links are the real text). */}
      <Marquee words={page.marquee} joiner="·" />

      {/*
       * The timeline. An `<ol>` in time order at every width. On a wide screen with
       * the site's motion allowed, the section grows tall and `.about-timeline__stage` sticks while
       * the list moves left as a track, a line drawing under it (site.css, "the timeline runs
       * sideways"); anywhere else it is this vertical list.
       */}
      <section
        className="site-section about-timeline-section"
        data-site-reveal
        style={{ '--tl-count': page.timeline.entries.length } as CSSProperties}
      >
        <div className="site-container about-timeline__stage">
          <p className="label">{page.timeline.label}</p>
          <h2 className="display display--section">{page.timeline.heading}</h2>
          <span className="about-timeline__progress" aria-hidden="true" />
          <ol className="about-timeline">
            {page.timeline.entries.map((entry) => (
              <li className="about-timeline__entry" key={entry.year}>
                <p className="mono about-timeline__year">{entry.year}</p>
                <h3 className="about-timeline__title">{entry.title}</h3>
                <p>{entry.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <p className="label">{page.people.label}</p>
          <h2 className="display display--section">{page.people.heading}</h2>
          <div className="about-people">
            <div className="about-people__card about-people__card--name">
              <h3 className="display display--section">{page.people.name.name}</h3>
              <p className="label">{page.people.name.role}</p>
              <p>{page.people.name.line}</p>
            </div>
            {page.people.cards.map((card) => (
              <div className="about-people__card" key={card.title}>
                <h3 className="about-people__role">{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <dl className="facts-grid">
            {page.factsBand.map((fact) =>
              'labelFirst' in fact && fact.labelFirst ? (
                <div className="fact fact--label-first" key={fact.label}>
                  <dt className="fact__label">{fact.label}</dt>
                  <dd className="fact__value display display--section">
                    <CountUp value={fact.value} />
                  </dd>
                </div>
              ) : (
                <div className="fact" key={fact.label}>
                  <dt className="fact__value display display--section">
                    <CountUp value={fact.value} />
                  </dt>
                  <dd className="fact__label">{fact.label}</dd>
                </div>
              ),
            )}
          </dl>
        </div>
      </section>

      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <dl className="about-table">
            {page.factsTable.map((row) => (
              <div className="about-table__row" key={row.term}>
                <dt className="about-table__term">{row.term}</dt>
                <dd className="about-table__detail">{row.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/*
       * `[data-facts]`: the certificate lines are names (SEDEX, OEKO-TEX, the SECP), as on the
       * policies hub and the home page's slab — the readability test skips them, and the lines
       * are the same `companyFacts.ts` constants those pages draw.
       */}
      <section className="site-section" data-site-reveal>
        <div className="site-container">
          <h2 className="display display--section">{page.certificates.heading}</h2>
          <div data-facts>
            <ul className="about-cert">
              {CERTIFICATION_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="about-cert__promise">{CERTIFICATION_PROMISE}</p>
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
