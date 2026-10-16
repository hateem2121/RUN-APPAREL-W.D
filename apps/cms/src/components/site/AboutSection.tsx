import Link from 'next/link'
import { ABOUT, type AboutPoint } from '../../lib/aboutCopy'
import { FACTORY_PHOTOS, factoryPhotoImage } from '../../lib/factoryPhotos'
import { CountUp } from './CountUp'

/**
 * №01 "Who we are" — credibility before capability (decision D23, 2026-09-29). Copy from
 * `lib/aboutCopy.ts`, every figure the owner's.
 *
 * ⚠️ THE AERIAL PHOTO IS THE SECTION'S GROUND, UNDER A DARK WASH (owner, option C, 2026-10-15/16;
 * D41). The words sit on the left and the four figures on the right, both on the photo; the front
 * of the building, which stood beside the roof until then, is no longer on the home page (the
 * "Inside the factory" gallery keeps it, `aboutPages.ts`). The section borrows the photo hero's dark token set and its wash
 * arithmetic (site.css), so every word reads over the brightest pixel the photo could put under it.
 *
 * ⚠️ A FIGURE'S LABEL COMES FIRST WHEN THE LABEL LEADS INTO THE FIGURE (VA-58, 2026-10-02). "1889" over
 * "MAKING CLOTHES SINCE" read in order as "1889, making clothes since". Its label is now the term
 * and the year its description, so the DOM, the screen and a screen reader all say "Making clothes
 * since 1889". It is the markup order that changes, never a CSS reordering: `order` or
 * `column-reverse` would leave a screen reader reading the old order (WCAG 1.3.2, technique C27).
 * The other figures ("Six", "Buildings, first stitch to sealed bag") read naturally and keep theirs.
 * The floor area and the solar share count up (`AboutPoint.countUp`); the year and "Six" do not.
 */
const POINTS: readonly AboutPoint[] = ABOUT.points
const GROUND = FACTORY_PHOTOS.find((photo) => photo.slug === 'solar-roof')

/**
 * Its own words here: the shared description begins "The same building from above", which only
 * reads after the front of the building, and on the home page that photo no longer comes first.
 */
export const GROUND_ALT = 'The works from above, the roof covered in solar panels.'

function Figure({ point }: { point: AboutPoint }) {
  return (
    <>
      {point.prefix ? <span className="fact__prefix">{point.prefix} </span> : null}
      {point.countUp ? <CountUp value={point.value} /> : point.value}
    </>
  )
}

export function AboutSection() {
  const ground = GROUND ? factoryPhotoImage(GROUND) : null
  return (
    <section className="site-section about-ground" data-site-reveal>
      {ground ? (
        <div className="about-ground__photo">
          {/* biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the widths are pre-built files, picked by srcSet. */}
          <img
            className="about-ground__img"
            src={ground.src}
            srcSet={ground.srcSet}
            sizes="100vw"
            width={ground.width}
            height={ground.height}
            alt={GROUND_ALT}
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}
      <div className="site-container about">
        <div className="about__copy">
          <p className="section-number">№01 — Who we are</p>
          <h2 className="display display--section">
            {ABOUT.heading} <span className="serif-accent">{ABOUT.accent}</span>
          </h2>
          <p className="site-lede">{ABOUT.lede}</p>
          <p className="site-lede">{ABOUT.body}</p>
          {/* The about page's way in (the about-factory build, 2026-10-09): a secondary link, the
              section keeping its one primary button ("Start a conversation" in the hero). Kept on
              the photo by the owner, 2026-10-16. */}
          <div className="site-actions">
            <Link className="btn btn--ghost" href="/about">
              Our story <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <dl className="about__points">
          {POINTS.map((point) =>
            point.labelFirst ? (
              <div className="fact fact--label-first" key={point.label}>
                <dt className="fact__label">{point.label}</dt>
                <dd className="fact__value display display--section">
                  <Figure point={point} />
                </dd>
              </div>
            ) : (
              <div className="fact" key={point.label}>
                <dt className="fact__value display display--section">
                  <Figure point={point} />
                </dt>
                <dd className="fact__label">{point.label}</dd>
              </div>
            ),
          )}
        </dl>
      </div>
    </section>
  )
}
