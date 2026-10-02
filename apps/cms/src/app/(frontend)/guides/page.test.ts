import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FAMILIES } from '../../../lib/families'
import { familyPageFor } from '../../../lib/familyPages'
import { GUIDES } from '../../../lib/guides'
import GuidesPage from './page'

/**
 * VA-47 (visual audit 2026-10-02): the guides index listed every guide twice, as a card with its
 * own "Read this guide" button and again as a chip in the list at the foot of the same page. Each
 * guide is now ONE link: on its card's heading, named by the guide's title, with nothing
 * interactive inside it. This reads the page a visitor is given, as HTML.
 *
 * The drawn half (the click anywhere on a card, the lift on a mouse) is `e2e/pages.spec.ts`.
 */

interface Anchor {
  href: string
  /** The accessible name of a plain text link: its text, tags removed. */
  name: string
  /** Anything interactive inside it, which a link must not hold. */
  nested: boolean
}

/** Markup text as a reader gets it: React escapes "&" in a title ("Minimum Order &amp; Samples"). */
const decoded = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')

const anchorsIn = (html: string): Anchor[] =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: /href="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? '',
    name: decoded((match[2] ?? '').replace(/<[^>]*>/g, '').trim()),
    nested: /<(a|button|input|select|textarea)\b/.test(match[2] ?? ''),
  }))

const cardsIn = (html: string): string[] =>
  [...html.matchAll(/<li class="panel guide-card">([\s\S]*?)<\/li>/g)].map(
    (match) => match[1] ?? '',
  )

/** Everything wrong with an index page's links, as sentences. */
function problemsWith(html: string): string[] {
  const problems: string[] = []
  const anchors = anchorsIn(html)
  for (const guide of GUIDES) {
    const toIt = anchors.filter((anchor) => anchor.href === guide.path)
    if (toIt.length !== 1) {
      problems.push(`${guide.path} is linked ${toIt.length} times, not once`)
    } else if (toIt[0]?.name !== guide.title) {
      problems.push(`${guide.path} is named "${toIt[0]?.name}", not its title`)
    }
  }
  for (const anchor of anchors) {
    if (anchor.nested) problems.push(`the link to ${anchor.href} holds something interactive`)
  }
  const cards = cardsIn(html)
  if (cards.length !== GUIDES.length) {
    problems.push(`${cards.length} cards for ${GUIDES.length} guides`)
  }
  for (const [index, card] of cards.entries()) {
    const links = anchorsIn(card).length
    if (links !== 1) problems.push(`card ${index + 1} holds ${links} links, not one`)
    if (/<button\b|class="[^"]*\bbtn\b/.test(card)) {
      problems.push(`card ${index + 1} still carries a button`)
    }
  }
  return problems
}

describe('the guides index lists each guide once (VA-47)', () => {
  const html = renderToStaticMarkup(createElement(GuidesPage))

  it('shows each guide as one card with one link, named by its title, and nothing nested', () => {
    expect(GUIDES.length, 'no guides, so nothing was measured').toBeGreaterThan(1)
    expect(problemsWith(html)).toEqual([])
  })

  it('keeps the four buyer pages linked at the foot, which the cards do not repeat', () => {
    const wanted = FAMILIES.map((family) => familyPageFor(family)?.path).filter(
      (path): path is string => path !== undefined,
    )
    expect(wanted.length, 'no buyer pages to look for').toBeGreaterThan(0)
    const hrefs = anchorsIn(html).map((anchor) => anchor.href)
    for (const path of wanted) expect(hrefs, `${path} is no longer linked`).toContain(path)
  })

  it('has no chip for a guide, which was the repeated list', () => {
    const chips = [...html.matchAll(/<a\b[^>]*class="[^"]*\bfilter-chip\b[^"]*"[^>]*>/g)].map(
      (match) => /href="([^"]*)"/.exec(match[0])?.[1],
    )
    expect(chips.length, 'the foot of the page has no chips at all').toBeGreaterThan(0)
    for (const guide of GUIDES) expect(chips).not.toContain(guide.path)
  })

  it('hides the cue from assistive technology, so a card is announced by its title alone', () => {
    const cues = [...html.matchAll(/<span class="guide-card__cue"([^>]*)>([^<]*)<\/span>/g)]
    expect(cues).toHaveLength(GUIDES.length)
    for (const cue of cues) {
      expect(cue[1]).toContain('aria-hidden="true"')
      expect(cue[2]).toBe('Read this guide')
    }
  })

  // NEGATIVE CONTROLS, run both ways: the OLD page (a button per card, then a chip per guide), a
  // link that holds a button, and a card with two links are each caught.
  it('sees the fault: the old page, a nested control, a second link in a card', () => {
    const old = `<section>${GUIDES.map(
      (guide) =>
        `<div><h2>${guide.title}</h2><p>${guide.description}</p><div><a class="btn btn--ghost" href="${guide.path}">Read this guide</a></div></div>`,
    ).join('')}</section><nav>${GUIDES.map(
      (guide) => `<a class="filter-chip" href="${guide.path}">${guide.title}</a>`,
    ).join('')}</nav>`
    const first = GUIDES[0]
    if (!first) throw new Error('no guide to plant a fault in')
    const problems = problemsWith(old)
    expect(problems).toContain(`${first.path} is linked 2 times, not once`)
    expect(problems).toContain(`0 cards for ${GUIDES.length} guides`)

    const nested = `<ul><li class="panel guide-card"><a href="${first.path}"><button>${first.title}</button></a></li></ul>`
    expect(problemsWith(nested)).toContain(`the link to ${first.path} holds something interactive`)
    const two = `<ul><li class="panel guide-card"><a href="${first.path}">${first.title}</a><a href="/x">x</a></li></ul>`
    expect(problemsWith(two)).toContain('card 1 holds 2 links, not one')
  })
})
