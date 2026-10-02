import { ABOUT, type AboutPoint } from '../../lib/aboutCopy'
import { FACTORY_PHOTOS, factoryPhotoSrc } from '../../lib/factoryPhotos'
import { FactoryFigure } from './FactoryFigure'

/**
 * №01 "Who we are" — credibility before capability (decision D23, 2026-09-29). Copy from
 * `lib/aboutCopy.ts`, every figure the owner's; pictures are the building and its roof.
 *
 * ⚠️ A FIGURE'S LABEL COMES FIRST WHEN THE LABEL LEADS INTO THE FIGURE (VA-58, 2026-10-02). "1889" over
 * "MAKING CLOTHES SINCE" read in order as "1889, making clothes since". Its label is now the term
 * and the year its description, so the DOM, the screen and a screen reader all say "Making clothes
 * since 1889". It is the markup order that changes, never a CSS reordering: `order` or
 * `column-reverse` would leave a screen reader reading the old order (WCAG 1.3.2, technique C27).
 * The neighbour ("One", "Building, first stitch to sealed bag") reads naturally and keeps its order.
 * These figures are plain text; the count-up island belongs to №05's numbers (`CountUp.tsx`).
 */
const POINTS: readonly AboutPoint[] = ABOUT.points
const PHOTOS = ['exterior', 'solar-roof']
  .map((slug) => FACTORY_PHOTOS.find((photo) => photo.slug === slug))
  .filter((photo) => photo !== undefined)

export function AboutSection() {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container about">
        <div className="about__copy">
          <p className="section-number">№01 — Who we are</p>
          <h2 className="display display--section">
            {ABOUT.heading} <span className="serif-accent">{ABOUT.accent}</span>
          </h2>
          <p className="site-lede">{ABOUT.lede}</p>
          <p className="site-lede">{ABOUT.body}</p>
          <dl className="about__points">
            {POINTS.map((point) =>
              point.labelFirst ? (
                <div className="fact fact--label-first" key={point.label}>
                  <dt className="fact__label">{point.label}</dt>
                  <dd className="fact__value display display--section">{point.value}</dd>
                </div>
              ) : (
                <div className="fact" key={point.label}>
                  <dt className="fact__value display display--section">{point.value}</dt>
                  <dd className="fact__label">{point.label}</dd>
                </div>
              ),
            )}
          </dl>
        </div>
        <div className="about__photos">
          {PHOTOS.map((photo) => (
            <FactoryFigure
              key={photo.slug}
              photo={photo}
              src={factoryPhotoSrc(photo, 640)}
              srcSet={`${factoryPhotoSrc(photo, 640)} 640w, ${factoryPhotoSrc(photo, 1200)} 1200w`}
              sizes="(min-width: 900px) 540px, 100vw"
              width={640}
              height={400}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
