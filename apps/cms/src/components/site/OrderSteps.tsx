import type { CSSProperties } from 'react'
import { FACTORY_PHOTOS, factoryPhotoImage, stepPhotoSrcSet } from '../../lib/factoryPhotos'
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
 * ⚠️ ON A PHONE EACH STEP IS ITS OWN CARD (owner, 2026-10-19: "single card stacking … not 2 at a
 * time"). Below 900px, for someone who allows motion, the stage and its list step aside
 * (`display: contents`) and the eight steps stack one by one, each sinking back a little as the next
 * covers it (the owner's choice that day, amending D42's "nothing animates" for phones). So the
 * stage's pill is drawn in its FIRST STEP, at the same place it held on the card: from 900px that
 * step starts where its card does, so the computer's cards look as they did. Each step carries its
 * place in the eight (`--step`) and the names of its own and the next step's view timelines, which
 * the sink reads.
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

/**
 * WHEN A STEP TAKES ITS OWN CROP (2026-11-11, owner: "Yes, tall copies"). In the stack (motion
 * allowed) a step's photo fills a box the screen's width (below 900px) or half of it, and at least
 * the screen's height less 8px a card: `min-block-size: calc(100svh - var(--step) * 8px)`, at most
 * 56px less. The photo is `object-fit: cover`, so a crop that is NOT narrower than its box keeps its
 * full height and loses only a strip at each side, exactly as the old file did. So each condition
 * below promises a box no wider than its crop, with room for the 56px:
 *
 * - `phone` (3:5 = 0.6): a screen at most 11:20 (0.55) below 900px, so the box is at most
 *   0.55 × h / (h − 56), under 0.6 for any screen 670px tall or more;
 * - `card` (9:10): at most 4:5 below 900px, or 8:5 from 900px where the box is half the width:
 *   at most 0.87 for a 700px-tall screen, under 0.9.
 *
 * Under reduced motion the cards are a plain list, two steps to a screen, and a box can be wider
 * than either crop (a tablet's is 1.5:1), so there, and on any wider screen, the step keeps the file
 * it had. `e2e/orderTimeline.spec.ts` measures the drawn boxes against these promises.
 */
export const STEP_CROP_MEDIA = {
  phone:
    '(prefers-reduced-motion: no-preference) and (max-width: 899px) and (max-aspect-ratio: 11/20)',
  card: '(prefers-reduced-motion: no-preference) and (max-width: 899px) and (max-aspect-ratio: 4/5), (prefers-reduced-motion: no-preference) and (min-width: 900px) and (max-aspect-ratio: 8/5)',
} as const

/** How many steps there are in all: the last one has no next step to sink under. */
const STEP_COUNT = ORDER_PHASES.reduce((sum, { steps }) => sum + steps.length, 0)

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
            {/* biome-ignore lint/a11y/noRedundantRoles: iOS VoiceOver reads a list with `list-style: none` as plain text (WebKit bug 304137, December 2025), so the role is said again. */}
            <ol className="order-stage__steps" role="list" start={first}>
              {phase.steps.map((step, index) => {
                const number = first + index
                const photo = PHOTOS.get(step.photo)
                const image = photo ? factoryPhotoImage(photo) : null
                const [across, down] = photo?.focus ?? [50, 50]
                const phoneSet = photo ? stepPhotoSrcSet(photo, 'phone') : null
                const cardSet = photo ? stepPhotoSrcSet(photo, 'card') : null
                return (
                  // ⚠️ THREE BOXES FOR ONE CARD, so iPhone Safari's bar can forget a card (2026-10-20).
                  // The list item keeps the role; the slot is what sticks in a phone's stack and paints
                  // nothing; `.order-step` draws the card. Why the slot: OrderStagesList.tsx.
                  <li className="order-step-item" key={step.title}>
                    <div
                      className="order-step-slot"
                      style={
                        {
                          '--step': number - 1,
                          '--step-name': `--step-${number}`,
                          '--next-name': number < STEP_COUNT ? `--step-${number + 1}` : 'none',
                        } as CSSProperties
                      }
                    >
                      <div className="order-step">
                        {index === 0 ? (
                          // One string, so the markup holds the name whole ("Stage 1 · Talk"), not in three pieces.
                          <p className="order-stage__name">{`Stage ${stage + 1} · ${phase.name}`}</p>
                        ) : null}
                        <div className="order-step__top">
                          <span
                            className="order-step__number display display--hero"
                            aria-hidden="true"
                          >
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
                          <h3 className="order-step__title display display--section">
                            {step.title}
                          </h3>
                          <p className="order-step__body">{step.body}</p>
                          <p className="order-step__detail">{step.detail}</p>
                        </div>
                        {photo && image ? (
                          // `display: contents` (site.css): the <img> stays the box that is drawn.
                          <picture className="order-step__picture">
                            {phoneSet ? (
                              <source
                                media={STEP_CROP_MEDIA.phone}
                                srcSet={phoneSet}
                                sizes="100vw"
                              />
                            ) : null}
                            {cardSet ? (
                              <source
                                media={STEP_CROP_MEDIA.card}
                                srcSet={cardSet}
                                sizes={ORDER_STEP_SIZES}
                              />
                            ) : null}
                            {/* A plain <img> (no `sharp` on Workers, so next/image cannot resize; ProductPoster.tsx measures why): the widths are pre-built files, picked by srcSet. */}
                            <img
                              className="order-step__photo"
                              src={image.src}
                              srcSet={image.srcSet}
                              sizes={ORDER_STEP_SIZES}
                              width={image.width}
                              height={image.height}
                              alt={photo.alt}
                              // Which part of the file stays when the half cuts it: a value per picture.
                              // The step crops keep it too: each was cut so the same value shows the
                              // same window (`STEP_CROPS` in scripts/build-factory-photos.mjs).
                              style={{ objectPosition: `${across}% ${down}%` }}
                              loading="lazy"
                              decoding="async"
                            />
                          </picture>
                        ) : null}
                      </div>
                    </div>
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
