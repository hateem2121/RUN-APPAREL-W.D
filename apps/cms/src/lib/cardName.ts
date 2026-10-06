/**
 * A garment name's words, with each hyphenated one marked to stay in one piece on its card.
 *
 * Built in packages/shared/src/cardName.ts since polish S6 (2026-10-04), where the reasons live:
 * a garment page's "More from this category" cards follow the same rule as the website's.
 * NameSegment stopped being re-exported on 2026-10-06: nothing imported it from here
 * (knip, report-only) — import it from @run-apparel/shared directly.
 */
export { nameSegments } from '@run-apparel/shared'
