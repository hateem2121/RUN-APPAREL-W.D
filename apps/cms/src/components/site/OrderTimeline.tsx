import Link from 'next/link'
import { FACTORY_PHOTOS, factoryPhotoSrc } from '../../lib/factoryPhotos'
import { ORDER_PHASES } from '../../lib/orderProcess'
import { FactoryFigure } from './FactoryFigure'

/**
 * №04 "How an order works" (owner, 2026-09-29). Four phases, two steps each, every step marked
 * with who acts — the words are `lib/orderProcess.ts`, which says only what the owner confirmed.
 *
 * Ordered lists, because the order IS the content: a screen reader announces the count and each
 * position. The line down the side draws itself as the section scrolls past (`.timeline__line`,
 * scroll-driven CSS, reduced motion excluded); without that it is simply there, fully drawn.
 */
const NUMBERED = ORDER_PHASES.map((phase, phaseIndex) => ({
  phase,
  photo: FACTORY_PHOTOS.find((entry) => entry.slug === phase.photo),
  firstStep:
    ORDER_PHASES.slice(0, phaseIndex).reduce((sum, earlier) => sum + earlier.steps.length, 0) + 1,
}))

export function OrderTimeline() {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container">
        <p className="section-number">№04 — How an order works</p>
        <h2 className="display display--section">
          From a sketch <span className="serif-accent">to your&nbsp;door.</span>
        </h2>
        <p className="site-lede">Four stages, eight steps, and you always know whose move it is.</p>
        <div className="timeline">
          <span className="timeline__line" aria-hidden="true" />
          <ol className="timeline__phases">
            {NUMBERED.map(({ phase, photo, firstStep }) => (
              <li className="timeline__phase" key={phase.name}>
                <div className="timeline__copy">
                  <p className="timeline__name">{phase.name}</p>
                  <ol className="timeline__steps" start={firstStep}>
                    {phase.steps.map((step, index) => (
                      <li className="timeline__step" key={step.title}>
                        <span className="timeline__marker" aria-hidden="true">
                          {String(firstStep + index).padStart(2, '0')}
                        </span>
                        <span className={`timeline__actor timeline__actor--${step.actor}`}>
                          {step.actor}
                        </span>
                        <h3 className="timeline__title">{step.title}</h3>
                        <p className="timeline__body">{step.body}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                {photo ? (
                  <FactoryFigure
                    photo={photo}
                    src={factoryPhotoSrc(photo, photo.shape === 'wide' ? 640 : 400)}
                    srcSet={
                      photo.shape === 'wide'
                        ? `${factoryPhotoSrc(photo, 640)} 640w, ${factoryPhotoSrc(photo, 1200)} 1200w`
                        : `${factoryPhotoSrc(photo, 400)} 400w, ${factoryPhotoSrc(photo, 800)} 800w`
                    }
                    sizes="(min-width: 900px) 420px, 100vw"
                    width={photo.shape === 'wide' ? 640 : 400}
                    height={photo.shape === 'wide' ? 400 : 500}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="site-actions">
          <Link className="btn btn--ghost" href="/contact#inquiry">
            Start with step 1
          </Link>
        </div>
      </div>
    </section>
  )
}
