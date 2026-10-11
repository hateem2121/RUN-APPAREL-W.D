import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { WHAT_WE_ARE } from '../../lib/companyFacts'
import { PressPage } from './PressPage'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * The press page's first sentence (owner, 2026-10-11): the legal name from Site Settings, then the
 * definition every profile opens with (`WHAT_WE_ARE`, `companyFacts.ts`). It said "a private
 * label apparel manufacturer" until then, so a journalist copying it got a fifth version of the
 * company. Rendered, not read from the source, because the sentence is assembled at render time.
 */
const firstSentence = (html: string) =>
  stripUntilStable(
    /<div class="company-head__words"><p class="site-lede">(.*?)<\/p>/s.exec(html)?.[1] ?? '',
    /<[^>]*>/g,
    '',
  )

describe('the press page About section', () => {
  const html = renderToStaticMarkup(
    createElement(PressPage, { companyName: 'RUN APPAREL (PVT) LTD', news: [] }),
  )

  it('opens with the legal name and the definition every profile opens with', () => {
    expect(firstSentence(html)).toBe(`RUN APPAREL (PVT) LTD is a ${WHAT_WE_ARE}.`)
  })

  it('no longer calls the company an apparel manufacturer', () => {
    expect(html).not.toMatch(/private label apparel manufacturer/i)
  })
})
