import type { CSSProperties } from 'react'
import { FACTORY_PHOTOS, factoryPhotoImage } from '../../lib/factoryPhotos'
import { ORDER_PHASES } from '../../lib/orderProcess'

/**
 * The eight order steps as photo cards that stack as the page scrolls (polish D4, the owner's
 * answers Q14 "B, stacking photo cards" and Q41 "the home page's 8 steps everywhere", 2026-10-03).
 * Each card is one step: its number, its stage and whose move it is, its words, and the room it
 * happens in, over that room's own photo under the photo hero's dark wash. The next card slides up
 * over the one before, which sinks back and darkens (site.css, "the order steps").
 *
 * ⚠️ ONE LIST, DRAWN WHEREVER THE STEPS ARE TOLD (X21). The home page's №04 and the order guide's
 * "The eight steps" both draw THIS, from `lib/orderProcess.ts`; until 2026-10-05 the guide typed
 * its own eight with slightly different names ("We send your quote" for "Your quote"), and the
 * buyer pages had a five-step list of their own (gone with polish S4). A third place that tells the
 * steps draws this component too, never its own copy.
 *
 * ⚠️ THE WORDS COME FIRST IN THE MARKUP AND THE PHOTO IS LAID BEHIND THEM BY CSS, so a screen
 * reader hears "Your quote" before "Two technicians in lab coats…" (the reason VA-29 gave for the
 * timeline's rows). The number is for the eye only: the ordered list already says "3 of 8". Nothing
 * in a card takes focus, so the visual and the reading order cannot disagree for a keyboard.
 *
 * A server component: the cards are complete with scripting off, and the stacking and the sink
 * are CSS that a browser without them skips (a plain list of the same eight cards).
 */
const PHOTOS = new Map(FACTORY_PHOTOS.map((photo) => [photo.slug, photo]))

/**
 * How wide a card draws, from site.css: the column's full width below 900px, then the right half of
 * the page's column, the half №01's photos take (`HALF_COLUMN_SIZES` in FactoryFigure.tsx, whose
 * comment has the widths). The page's gutters are 20px to 399px and 5vw from there, ROUNDED TO 2px
 * (tokens.css, VA-17), so a card can be up to 2px wider than 90vw and a half 1px wider than
 * `45vw - 32px`: measured 811px drawn against 809.1 asked at 899px, and 499.5 against 498.6 at
 * 1179px (2026-10-05). The hint asks for those pixels too. №01's photos never needed them: each sits
 * in a frame with a 1px border. `e2e/orderTimeline.spec.ts` and `e2e/homePicture.spec.ts` compare
 * the hint with the width each card is really drawn at.
 */
export const ORDER_STEP_SIZES =
  '(max-width: 399px) calc(100vw - 40px), (max-width: 899px) calc(90vw + 2px), ' +
  '(max-width: 1279px) calc(45vw - 31px), (max-width: 1439px) calc(50vw - 96px), ' +
  '(max-width: 1919px) 624px, 704px'

const STEPS = ORDER_PHASES.flatMap((phase) =>
  phase.steps.map((step) => ({ ...step, phase: phase.name })),
)

export function OrderSteps() {
  return (
    <ol className="order-steps">
      {STEPS.map((step, index) => {
        const photo = PHOTOS.get(step.photo)
        const image = photo ? factoryPhotoImage(photo) : null
        const [across, down] = photo?.focus ?? [50, 50]
        return (
          <li
            className="order-step"
            key={step.title}
            // The card's place in the stack: where it stops, and which stretch of the scroll sinks it.
            style={{ '--i': index } as CSSProperties}
          >
            <div className="order-step__words">
              <span className="order-step__number display display--section" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="order-step__tag">
                <span className="order-step__phase">{step.phase}</span>{' '}
                <span className={`order-step__actor order-step__actor--${step.actor}`}>
                  {step.actor}
                </span>
              </p>
              <h3 className="order-step__title display">{step.title}</h3>
              <p className="order-step__body">{step.body}</p>
              {photo ? <p className="order-step__room">{photo.caption}</p> : null}
            </div>
            {photo && image ? (
              // biome-ignore lint/performance/noImgElement: no `sharp` on Workers, so next/image cannot resize (ProductPoster.tsx measures why); the widths are pre-built files, picked by srcSet.
              <img
                className="order-step__photo"
                src={image.src}
                srcSet={image.srcSet}
                sizes={ORDER_STEP_SIZES}
                width={image.width}
                height={image.height}
                alt={photo.alt}
                // Which part of the file stays when the card cuts it: a value per picture.
                style={{ objectPosition: `${across}% ${down}%` }}
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
