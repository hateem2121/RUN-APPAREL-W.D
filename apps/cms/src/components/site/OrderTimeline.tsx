import { OrderSteps } from './OrderSteps'

/**
 * №04 "How an order works" (owner, 2026-09-29). Four phases, two steps each, every step marked
 * with who acts — the words are `lib/orderProcess.ts`, which says only what the owner confirmed.
 *
 * ⚠️ FOUR FULL-SCREEN STAGE CARDS, TWO STEPS TO A CARD (owner, option A3, 2026-10-15; D42), drawn
 * by `OrderSteps`, which the order guide draws too (Q41). The heading and its line come first, in
 * the page's column; the cards take the screen's whole width under them, outside the column, so
 * nothing has to stretch past it. Until D42 the heading stayed on the left while eight half-width
 * cards passed on the right.
 *
 * "Start with step 1", the button after the cards, went with D42 (owner, 2026-10-16): the hero's
 * "Start a conversation" and the page's closing ask under №05 already lead to the same form.
 */
export function OrderTimeline() {
  return (
    <section className="site-section order-section" data-site-reveal>
      <div className="site-container">
        {/* The heading beside its line from 900px (`.section-head`, polish D1), as №02's is. */}
        <div className="section-head">
          <div className="section-head__title">
            <p className="section-number">№04 — How an order works</p>
            <h2 className="display display--section">
              From a sketch <span className="serif-accent">to your&nbsp;door.</span>
            </h2>
          </div>
          <p className="site-lede">
            Four stages, eight steps, and you always know whose move it is.
          </p>
        </div>
      </div>
      <OrderSteps />
    </section>
  )
}
