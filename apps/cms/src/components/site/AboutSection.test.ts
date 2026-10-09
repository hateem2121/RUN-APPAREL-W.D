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
 * The drawn half (the label above the figure on screen) is `e2e/copy.spec.ts`. The label's verb
 * became "Manufacturing since" on 2026-10-09 (owner), to match `LINEAGE`.
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

describe('№01 reads "Manufacturing since 1889", not "1889, making clothes since" (VA-58)', () => {
  const html = renderToStaticMarkup(createElement(AboutSection))

  it('puts the 1889 label before the year in the markup, and leaves the other figure as it was', () => {
    expect(groupsIn(html), 'no figures were found, so nothing was measured').toHaveLength(
      ABOUT.points.length,
    )
    expect(groupsIn(html)).toEqual([
      ['Manufacturing since', '1889'],
      ['One', 'Building, first stitch to sealed bag'],
    ])
    expect(problemsWith(html)).toEqual([])
  })

  it('keeps the same words, and marks only the first figure label-first', () => {
    expect(ABOUT.points.map((point) => point.label)).toEqual([
      'Manufacturing since',
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
      /<dt class="fact__label">Manufacturing since<\/dt><dd class="fact__value display display--section">1889<\/dd>/,
      '<dt class="fact__value display display--section">1889</dt><dd class="fact__label">Manufacturing since</dd>',
    )
    expect(old, 'the planted markup did not land, so this control proves nothing').not.toBe(html)
    expect(problemsWith(old)).toEqual([
      '"Manufacturing since" reads 1889 then Manufacturing since, not Manufacturing since then 1889',
    ])
  })
})

/** Every link in the section, as `class|href|words`. */
function linksIn(html: string): string[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((link) => {
    const attrs = link[1] ?? ''
    const words = stripUntilStable(link[2] ?? '', /<[^>]*>/g, '').trim()
    return `${/class="([^"]*)"/.exec(attrs)?.[1] ?? ''}|${/href="([^"]*)"/.exec(attrs)?.[1] ?? ''}|${words}`
  })
}

/**
 * The /about page's way in from the home page (the about-factory build, 2026-10-09): "Our story →"
 * in №01, as a SECONDARY link — the home page keeps one primary button per screen.
 */
describe('№01 links to the about page', () => {
  const html = renderToStaticMarkup(createElement(AboutSection))

  it('has one "Our story" link to /about, in the ghost style', () => {
    expect(linksIn(html)).toEqual(['btn btn--ghost|/about|Our story →'])
  })

  // NEGATIVE CONTROL: a primary button in its place is caught.
  it('sees the fault: the link drawn as a primary button', () => {
    const planted = html.replace('btn btn--ghost', 'btn btn--primary')
    expect(planted, 'the planted class did not land').not.toBe(html)
    expect(linksIn(planted)).not.toEqual(['btn btn--ghost|/about|Our story →'])
  })
})
