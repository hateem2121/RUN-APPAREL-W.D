import Link from 'next/link'
import {
  FACTORY_PHOTO_ASPECT,
  FACTORY_PHOTO_WIDTHS,
  FACTORY_PHOTOS,
  factoryPhotoSrc,
} from '../../lib/factoryPhotos'
import { ORDER_PHASES } from '../../lib/orderProcess'
import { FactoryFigure } from './FactoryFigure'

/**
 * №04 "How an order works" (owner, 2026-09-29). Four phases, two steps each, every step marked
 * with who acts — the words are `lib/orderProcess.ts`, which says only what the owner confirmed.
 *
 * Ordered lists, because the order IS the content: a screen reader announces the count and each
 * position. The line down the side draws itself as the section scrolls past (`.timeline__line`,
 * scroll-driven CSS, reduced motion excluded); without that it is simply there, fully drawn.
 *
 * ⚠️ EVERY STEP IS A ROW: ITS WORDS AND ITS OWN PHOTO (visual audit VA-29, owner's choice
 * 2026-10-02). There were four photos for eight steps, one per phase and in mixed shapes, so the
 * rows did not line up. Now all eight are one square, the words on the left and the picture on the
 * right where there is room, and the picture ABOVE its step on a phone. The words come first in the
 * markup and the picture is moved above them by CSS on a phone only (`order`), so a screen reader
 * hears the step's title before the picture's description — a picture of a lab means nothing ahead
 * of "Your quote". Nothing in it is focusable, so the visual and the reading order cannot disagree
 * for a keyboard.
 */
const PHOTOS = new Map(FACTORY_PHOTOS.map((photo) => [photo.slug, photo]))

/**
 * How wide a step's picture draws, from `.timeline__step` in site.css: the whole column minus the
 * timeline's 24px line gutter and the page's gutters (about 64px in all) on a phone, a 400px cap from
 * 480px, and a 280px column from 900px (the owner's choice of 2026-10-02, to shorten the section). Only a hint to pick between the two pre-built widths, so
 * close is enough: 400px is also the width the files were cut for (`FACTORY_PHOTO_WIDTHS`), so a
 * 1x screen takes the small file and a 2x screen the large one.
 */
const SIZES = '(min-width: 900px) 280px, (min-width: 480px) 400px, calc(100vw - 64px)'

function StepPhoto({ slug }: { slug: string }) {
  const photo = PHOTOS.get(slug)
  if (!photo) return null
  const [small, large] = FACTORY_PHOTO_WIDTHS[photo.shape]
  return (
    <FactoryFigure
      photo={photo}
      square
      src={factoryPhotoSrc(photo, small)}
      srcSet={`${factoryPhotoSrc(photo, small)} ${small}w, ${factoryPhotoSrc(photo, large)} ${large}w`}
      sizes={SIZES}
      width={small}
      height={Math.round(small / FACTORY_PHOTO_ASPECT[photo.shape])}
    />
  )
}

const NUMBERED = ORDER_PHASES.map((phase, phaseIndex) => ({
  phase,
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
            {NUMBERED.map(({ phase, firstStep }) => (
              <li className="timeline__phase" key={phase.name}>
                <p className="timeline__name">{phase.name}</p>
                <ol className="timeline__steps" start={firstStep}>
                  {phase.steps.map((step, index) => (
                    <li className="timeline__step" key={step.title}>
                      <div className="timeline__text">
                        <span className="timeline__marker" aria-hidden="true">
                          {String(firstStep + index).padStart(2, '0')}
                        </span>
                        <span className={`timeline__actor timeline__actor--${step.actor}`}>
                          {step.actor}
                        </span>
                        <h3 className="timeline__title">{step.title}</h3>
                        <p className="timeline__body">{step.body}</p>
                      </div>
                      <StepPhoto slug={step.photo} />
                    </li>
                  ))}
                </ol>
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
