import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { describe, expect, it, vi } from 'vitest'
import { FACTS, WHAT_WE_ARE, WHAT_WE_MAKE } from '../../lib/companyFacts'
import { HomeHero } from './HomeHero'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * VA-43 (visual audit round 4, 2026-10-02): on a phone the home hero's label breaks into two
 * deliberate lines and drops the dot between them. The label is the owner's, chosen 2026-09-29
 * ("since 1889" plus "start from 50"), so the split must change NOTHING a reader is told: these
 * hold the words, their order and the punctuation. The phone's two lines are measured in a
 * browser (`e2e/composition.spec.ts`); `polishGuards.test.ts` holds the CSS that does the breaking.
 */
const minimum = FACTS.find((fact) => fact.label.startsWith('Minimum'))?.value ?? ''
// In normal letters since 2026-10-02 (visual audit VA-44, the owner's choice): same words, same order.
// "Family-run since 1889" since 2026-10-17 (owner, D45): 1889 is the family's year, not the company's.
const SAID = `[ Family-run since 1889 · Start from ${minimum} pieces per style ]`

const labelMarkup = (html: string) => /<p class="label">(.*?)<\/p>/s.exec(html)?.[1] ?? ''
const textOf = (markup: string) => stripUntilStable(markup, /<[^>]*>/g, '')

describe('the home hero label, split in two halves', () => {
  const html = renderToStaticMarkup(createElement(HomeHero))

  it('says exactly what it said: same words, same order, same dot and spaces', () => {
    expect(minimum, 'the minimum order was not found, so the label has a hole in it').not.toBe('')
    expect(textOf(labelMarkup(html))).toBe(SAID)
  })

  it('puts the dot in a span of its own, and the second half in another, for the phone to break at', () => {
    const markup = labelMarkup(html)
    expect(markup).toContain('<span class="label__dot"> · </span>')
    expect(markup).toContain(
      `<span class="label__tail">Start from ${minimum} pieces per style ]</span>`,
    )
    // Two halves, and the dot between them: the first half stops at 1889, with no space of its own.
    expect(markup.startsWith('[ Family-run since 1889<span class="label__dot">')).toBe(true)
  })

  // NEGATIVE CONTROL: a split that loses the dot, or its spaces, is not the same sentence.
  it('sees the fault: a split that drops the dot or a space no longer says it', () => {
    const noDot = `[ Family-run since 1889<span class="label__dot"></span><span class="label__tail">Start from ${minimum} pieces per style ]</span>`
    const noSpaces = `[ Family-run since 1889<span class="label__dot">·</span><span class="label__tail">Start from ${minimum} pieces per style ]</span>`
    expect(textOf(noDot)).not.toBe(SAID)
    expect(textOf(noSpaces)).not.toBe(SAID)
  })
})

/**
 * The lede (owner, 2026-10-11, question tool): it opens with the definition every profile opens
 * with (`WHAT_WE_ARE`, `companyFacts.ts`), because Google showed this paragraph as the home page's
 * summary that day and it called the company "a private label manufacturer in Sialkot" in words
 * no profile used. The ending is the owner's line and stays.
 */
const ledeMarkup = (html: string) => /<p class="site-lede">(.*?)<\/p>/s.exec(html)?.[1] ?? ''

describe('the home hero lede', () => {
  const html = renderToStaticMarkup(createElement(HomeHero))
  const SAYS = `RUN APPAREL is a ${WHAT_WE_ARE} — ${WHAT_WE_MAKE}, made to order for the brands, teams and organizations that never look back.`

  it('opens with the definition every profile opens with, and keeps its ending', () => {
    expect(textOf(ledeMarkup(html))).toBe(SAYS)
  })

  // NEGATIVE CONTROL: the lede as it read before 2026-10-11 is caught by the same extraction.
  it('sees the fault: the old lede does not pass', () => {
    const before =
      '<p class="site-lede">RUN APPAREL is a private label manufacturer in Sialkot — team wear, active wear, casual wear, outerwear and sports accessories, made to order for the brands, teams and organizations that never look back.</p>'
    expect(textOf(ledeMarkup(before))).not.toBe('')
    expect(textOf(ledeMarkup(before))).not.toBe(SAYS)
  })
})
