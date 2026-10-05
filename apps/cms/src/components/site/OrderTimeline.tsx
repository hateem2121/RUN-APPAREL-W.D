import Link from 'next/link'
import { OrderSteps } from './OrderSteps'

/**
 * №04 "How an order works" (owner, 2026-09-29). Four phases, two steps each, every step marked
 * with who acts — the words are `lib/orderProcess.ts`, which says only what the owner confirmed.
 *
 * ⚠️ THE STEPS ARE PHOTO CARDS THAT STACK AS THE PAGE SCROLLS (polish D4, the owner's answer Q14,
 * 2026-10-03), drawn by `OrderSteps`, which the order guide draws too (Q41). Until 2026-10-05 this
 * was a timeline: four phases of two rows, each row its words and a square photo (VA-29), and a
 * line down the side that drew itself.
 *
 * ⚠️ FROM 900px THE HEADING STAYS BESIDE THE CARDS WHILE THEY PASS: the heading and its words on
 * the left, sticky, and the cards on the right half, the half №01's photos take. A card is no wider
 * than that half because the photo files stop at 1200px (wide) and 800px (tall): a card across the
 * whole column would stretch them on a sharp screen. On a phone the heading comes first and the
 * cards take the column's full width. The button comes after the cards in both, as it did after
 * the steps: the DOM order is the reading order (WCAG 1.3.2).
 */
export function OrderTimeline() {
  return (
    <section className="site-section" data-site-reveal>
      <div className="site-container order-layout">
        <div className="order-layout__head">
          <p className="section-number">№04 — How an order works</p>
          <h2 className="display display--section">
            From a sketch <span className="serif-accent">to your&nbsp;door.</span>
          </h2>
          <p className="site-lede">
            Four stages, eight steps, and you always know whose move it is.
          </p>
        </div>
        <OrderSteps />
        <div className="site-actions order-layout__actions">
          <Link className="btn btn--ghost" href="/contact#inquiry">
            Start with step 1
          </Link>
        </div>
      </div>
    </section>
  )
}
