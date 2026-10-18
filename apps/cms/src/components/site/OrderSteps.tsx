import type { CSSProperties } from 'react'
import { FACTORY_PHOTOS, factoryPhotoImage } from '../../lib/factoryPhotos'
import { ORDER_PHASES } from '../../lib/orderProcess'
import { OrderStagesList } from './OrderStagesList'

/**
 * The order steps as four full-screen stage cards, two steps to a card (owner, option A3,
 * 2026-10-15; D42). Each card is one stage, named once in a pill ("Stage 1 · Talk"); each half is
 * one step: its number and whose move it is at the top, its title and two lines at the foot, over
 * the photo of the room it happens in. From 900px the halves sit side by side, below it one above
 * the other. As the page scrolls each card stops just under the one before and the next slides up
 * over it; nothing animates (site.css, "the order steps").
 *
 * Eight cards, one per step, until D42 (polish D4 and the owner's answer Q14, 2026-10-03), each
 * half the page wide; the eight sank back and darkened as the next covered them.
 *
 * ⚠️ ONE LIST, DRAWN WHEREVER THE STEPS ARE TOLD (X21). The home page's №04 and the order guide's
 * "The eight steps" both draw THIS, from `lib/orderProcess.ts` (the owner's Q41, confirmed for the
 * four cards on 2026-10-16); until 2026-10-05 the guide typed its own eight with slightly different
 * names. A third place that tells the steps draws this component too, never its own copy.
 *
 * ⚠️ AN ORDERED LIST OF STAGES, EACH AN ORDERED LIST OF ITS STEPS, NUMBERED ON FROM THE LAST
 * (`start`), so a screen reader hears "Stage 2 · Develop", then step 3 of the list. THE WORDS COME
 * FIRST IN THE MARKUP AND THE PHOTO IS LAID BEHIND THEM BY CSS, so a screen reader hears "Your
 * quote" before the photo's description (the reason VA-29 gave). The big number is for the eye
 * only: the list already says it. Nothing in a card takes focus, so the visual and the reading
 * order cannot disagree for a keyboard.
 *
 * A server component: the cards are complete with scripting off, and the stacking is CSS that a
 * browser without it skips (a plain list of the same four cards). Only the list is a client
 * component (`OrderStagesList`), to tell the stack each card's height.
 */
const PHOTOS = new Map(FACTORY_PHOTOS.map((photo) => [photo.slug, photo]))

/**
 * How wide a step's photo draws, from site.css: a card is the page's full width, so a step is the
 * whole width below 900px and half of it from there. `e2e/orderTimeline.spec.ts` and
 * `e2e/homePicture.spec.ts` compare the hint with the width each half is really drawn at.
 */
export const ORDER_STEP_SIZES = '(max-width: 899px) 100vw, 50vw'

/** Each stage with its steps' numbers, counted on from the stages before it (1–2, 3–4, …). */
const STAGES = ORDER_PHASES.map((phase, stage) => {
  const before = ORDER_PHASES.slice(0, stage).reduce((sum, { steps }) => sum + steps.length, 0)
  return { ...phase, first: before + 1 }
})

export function OrderSteps() {
  return (
    <OrderStagesList>
      {STAGES.map((phase, stage) => {
        const first = phase.first
        return (
          <li
            className="order-stage"
            key={phase.name}
            // The card's place in the stack: where it stops.
            style={{ '--i': stage } as CSSProperties}
          >
            {/* One string, so the markup holds the name whole ("Stage 1 · Talk"), not in three pieces. */}
            <p className="order-stage__name">{`Stage ${stage + 1} · ${phase.name}`}</p>
            {/* biome-ignore lint/a11y/noRedundantRoles: iOS VoiceOver reads a list with `list-style: none` as plain text (WebKit bug 304137, December 2025), so the role is said again. */}
            <ol className="order-stage__steps" role="list" start={first}>
              {phase.steps.map((step, index) => {
                const number = first + index
                const photo = PHOTOS.get(step.photo)
                const image = photo ? factoryPhotoImage(photo) : null
                const [across, down] = photo?.focus ?? [50, 50]
                return (
                  <li className="order-step" key={step.title}>
                    <div className="order-step__top">
                      <span className="order-step__number display display--hero" aria-hidden="true">
                        {String(number).padStart(2, '0')}
                      </span>
                      {/*
                       * Said, not shown: "Step 3, our move" (home page audit, 2026-10-17). The
                       * pill's bare "You" or "We" told a screen reader nothing about whose turn.
                       */}
                      <span className="visually-hidden">
                        {`Step ${number}, ${step.actor === 'You' ? 'your move' : 'our move'}`}
                      </span>
                      <span
                        className={`order-step__actor order-step__actor--${step.actor}`}
                        aria-hidden="true"
                      >
                        {step.actor}
                      </span>
                    </div>
                    <div className="order-step__words">
                      <h3 className="order-step__title display display--section">{step.title}</h3>
                      <p className="order-step__body">{step.body}</p>
                      <p className="order-step__detail">{step.detail}</p>
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
                        // Which part of the file stays when the half cuts it: a value per picture.
                        style={{ objectPosition: `${across}% ${down}%` }}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </li>
        )
      })}
    </OrderStagesList>
  )
}
