import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FACTS } from '../../lib/companyFacts'
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
const SAID = `[ Private label manufacturer since 1889 · Start from ${minimum} pieces per style ]`

const labelMarkup = (html: string) => /<p class="label">(.*?)<\/p>/s.exec(html)?.[1] ?? ''
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, '')

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
    expect(
      markup.startsWith('[ Private label manufacturer since 1889<span class="label__dot">'),
    ).toBe(true)
  })

  // NEGATIVE CONTROL: a split that loses the dot, or its spaces, is not the same sentence.
  it('sees the fault: a split that drops the dot or a space no longer says it', () => {
    const noDot = `[ Private label manufacturer since 1889<span class="label__dot"></span><span class="label__tail">Start from ${minimum} pieces per style ]</span>`
    const noSpaces = `[ Private label manufacturer since 1889<span class="label__dot">·</span><span class="label__tail">Start from ${minimum} pieces per style ]</span>`
    expect(textOf(noDot)).not.toBe(SAID)
    expect(textOf(noSpaces)).not.toBe(SAID)
  })
})
