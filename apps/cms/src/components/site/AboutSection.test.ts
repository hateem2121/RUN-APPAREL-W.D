import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { describe, expect, it } from 'vitest'
import { ABOUT } from '../../lib/aboutCopy'
import { AboutSection } from './AboutSection'

/**
 * VA-58 (visual audit 2026-10-02, owner's decision): №01's first figure read "1889" over "MAKING
 * CLOTHES SINCE", so in reading order it said "1889, making clothes since". Its label now comes
 * first, in the markup (so a screen reader reads it too), with the same words. Its neighbour, "One"
 * over "Building, first stitch to sealed bag", reads naturally and keeps its order.
 *
 * The drawn half (the label above the figure on screen) is `e2e/copy.spec.ts`.
 */

const SITE_CSS = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'site.css'),
  'utf8',
)

/** The `<dt>` and `<dd>` text of each `.fact` group, in the order the markup gives it. */
function groupsIn(html: string): string[][] {
  // `fact` as a whole word: the section also holds `factory…` figures.
  return [...html.matchAll(/<div class="fact(?: [^"]*)?">([\s\S]*?)<\/div>/g)].map((group) =>
    [...(group[1] ?? '').matchAll(/<d[td]\b[^>]*>([\s\S]*?)<\/d[td]>/g)].map((entry) =>
      stripUntilStable(entry[1] ?? '', /<[^>]*>/g, '').trim(),
    ),
  )
}

/** Everything wrong with how each point is ordered, as sentences. */
function problemsWith(html: string): string[] {
  const problems: string[] = []
  const groups = groupsIn(html)
  for (const point of ABOUT.points) {
    const wanted = 'labelFirst' in point ? [point.label, point.value] : [point.value, point.label]
    const found = groups.find((group) => group.includes(point.label))
    if (!found) problems.push(`"${point.label}" is not on the page`)
    else if (found.join('|') !== wanted.join('|')) {
      problems.push(`"${point.label}" reads ${found.join(' then ')}, not ${wanted.join(' then ')}`)
    }
  }
  return problems
}

describe('№01 reads "Making clothes since 1889", not "1889, making clothes since" (VA-58)', () => {
  const html = renderToStaticMarkup(createElement(AboutSection))

  it('puts the 1889 label before the year in the markup, and leaves the other figure as it was', () => {
    expect(groupsIn(html), 'no figures were found, so nothing was measured').toHaveLength(
      ABOUT.points.length,
    )
    expect(groupsIn(html)).toEqual([
      ['Making clothes since', '1889'],
      ['One', 'Building, first stitch to sealed bag'],
    ])
    expect(problemsWith(html)).toEqual([])
  })

  it('keeps the same words, and marks only the first figure label-first', () => {
    expect(ABOUT.points.map((point) => point.label)).toEqual([
      'Making clothes since',
      'Building, first stitch to sealed bag',
    ])
    expect(ABOUT.points.map((point) => point.value)).toEqual(['1889', 'One'])
    expect(ABOUT.points.map((point) => 'labelFirst' in point)).toEqual([true, false])
  })

  it('gets the order from the markup, never from CSS, which a screen reader would not follow', () => {
    // `order` and `column-reverse` change what is drawn and leave what is read (WCAG 1.3.2, C27).
    const css = SITE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.fact\b|\.about__points/.test(rule[1] ?? '')) continue
      expect(rule[2], `${rule[1]?.trim()} reorders what it draws`).not.toMatch(
        /\border\s*:|column-reverse|row-reverse/,
      )
    }
  })

  // NEGATIVE CONTROL: the old order, and a label that has lost its words, are both caught.
  it('sees the fault: the figure first, as it was', () => {
    const old = html.replace(
      /<dt class="fact__label">Making clothes since<\/dt><dd class="fact__value display display--section">1889<\/dd>/,
      '<dt class="fact__value display display--section">1889</dt><dd class="fact__label">Making clothes since</dd>',
    )
    expect(old, 'the planted markup did not land, so this control proves nothing').not.toBe(html)
    expect(problemsWith(old)).toEqual([
      '"Making clothes since" reads 1889 then Making clothes since, not Making clothes since then 1889',
    ])
  })
})
