import type { CSSProperties } from 'react'
import { chartBars } from '../../lib/buyerQuestions'

/**
 * The bar chart of what buyers asked us about (C7, owner approved the page's words on 6 Nov 2026):
 * one bar per topic, drawn from `chartBars()`, which reads the SAME list as the table after it and
 * the CSV file (`lib/buyerQuestions.ts`), so a count cannot differ between them.
 *
 * ⚠️ THE TABLE IS THE CHART'S TEXT ALTERNATIVE, SHOWN TO EVERYONE (W3C WAI, "Complex images": a
 * long description gives "the actual values and trends"). So the bars are hidden from assistive
 * technology (`aria-hidden`) and say nothing the table does not. It adds no words of its own: a bar
 * carries a topic's name and its count, both from the list, so there is no caption to approve.
 * A bar's length is a unitless ratio handed to CSS as a custom property (`--bar`), never a width in
 * pixels, so no size is written here (`tokens.test.ts` scans JSX as well as CSS). A count still owed,
 * or hidden because it is below 3, has no bar and says so in words.
 */
export function BuyerQuestionsChart() {
  return (
    <div className="buyer-chart" aria-hidden="true">
      <ul className="buyer-chart__bars">
        {chartBars().map((bar) => (
          <li className="buyer-chart__row" key={bar.topic}>
            <span className="buyer-chart__topic">{bar.topic}</span>
            <span className="buyer-chart__track">
              <span
                className="buyer-chart__bar"
                style={{ '--bar': bar.ratio ?? 0 } as CSSProperties}
              />
            </span>
            <span className="buyer-chart__value">{bar.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
