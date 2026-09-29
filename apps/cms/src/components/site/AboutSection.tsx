import { ABOUT } from '../../lib/aboutCopy'
import { FACTORY_PHOTOS, factoryPhotoSrc } from '../../lib/factoryPhotos'
import { FactoryFigure } from './FactoryFigure'

/**
 * №01 "Who we are" — credibility before capability (decision D23, 2026-09-29). Copy from
 * `lib/aboutCopy.ts`, every figure the owner's; pictures are the building and its roof.
 */
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
            {ABOUT.points.map((point) => (
              <div className="fact" key={point.label}>
                <dt className="fact__value display display--section">{point.value}</dt>
                <dd className="fact__label">{point.label}</dd>
              </div>
            ))}
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
