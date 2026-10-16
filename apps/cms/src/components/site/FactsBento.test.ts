import type { FooterHours } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE, FACTS } from '../../lib/companyFacts'
import { BOOKING_URL, FactsBento, WORKS_ASK } from './FactsBento'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

// The works' hours as production holds them (Mon–Sat 08:00–17:00 PKT).
const HOURS: FooterHours = { firstDay: 1, lastDay: 6, open: '08:00', close: '17:00' }
const html = (worksCoordinates?: string | null, hours: FooterHours | null = HOURS) =>
  renderToStaticMarkup(createElement(FactsBento, { worksCoordinates, hours }))

/**
 * №05's slab (polish X7, 2026-10-05), and the ask under it since the owner merged №05 and №06
 * (2026-10-16). Neither the suite's database nor CI's holds the works' coordinates, so no browser
 * test here ever draws the pin that production draws; this renders it from the value production
 * holds, and e2e/worksSlab.spec.ts checks where its styles put it.
 */
describe('FactsBento — where we ship | certification, then the ask', () => {
  it('pins the works where the CMS says they are', () => {
    const out = html('32.41° N · 74.46° E')
    // 74.46°E is 70.68% of the way across the strip; 32.41°N is 32.93% of the way down its crop
    // (75.9375°N to 56.25°S, src/lib/worldMap.ts).
    expect(out).toContain('style="--pin-x:70.68%;--pin-y:32.93%"')
    expect(out).toMatch(/class="ship-map__name">Sialkot</)
    // Decoration: the line under the map says it, so a screen reader skips the pin.
    expect(out).toMatch(/class="ship-map__pin"[^>]*aria-hidden="true"/)
  })

  it('draws the map with no pin when the coordinates are blank or unreadable, never a default', () => {
    for (const value of [undefined, null, '', '74.46, 32.41']) {
      const out = html(value)
      expect(out, `${value}`).toContain('class="ship-map__land"')
      expect(out, `${value}`).not.toContain('ship-map__pin')
    }
  })

  it('sets every line beside the marks it names, and closes on the promise', () => {
    const out = html(null)
    expect(out.match(/class="cert__mark"/g)).toHaveLength(6)
    for (const line of CERTIFICATION_LINES) expect(out).toContain(line)
    expect(out).toContain(CERTIFICATION_PROMISE)
    // The map is decoration (its line says it), and each mark is named for a screen reader.
    expect(out).toMatch(/class="ship-map__land"[^>]*alt=""/)
    expect(out).not.toMatch(/class="cert__mark"[^>]*alt=""/)
  })

  /*
   * What would have to break: the button renamed (one action, one name: polish X20), sent
   * somewhere other than the form, the call link lost, the row moved into the slab, or a line of
   * its own that repeats the lede's "put it in writing" (the owner's rule: nothing said twice).
   */
  it('ends on one ask under the slab: the heading, the button to the form, a call, the clock', () => {
    const out = html(null)
    const ask = out.slice(out.indexOf('class="works-ask"'))
    expect(out.indexOf('class="works-ask"'), 'the ask is not after the slab').toBeGreaterThan(
      out.indexOf('class="works-slab"'),
    )
    expect(ask).toContain(`>${WORKS_ASK.heading}<`)
    expect(ask).toMatch(/class="btn btn--primary" href="\/contact#inquiry">Start a conversation</)
    expect(ask).toContain(`class="btn btn--ghost" href="${BOOKING_URL}">${WORKS_ASK.call}`)
    expect(ask).toContain(`<b>${WORKS_ASK.clock}</b>`)
    // The clock is honest before it hydrates: a placeholder, and no open or closed light.
    expect(ask).toContain('--:-- PKT')
    expect(ask).not.toMatch(/Open now|Opens 08:00/)
    expect(out).not.toMatch(/put it in writing/)
  })

  it('sets the five figures in order, the first as the feature, each as text a crawler reads', () => {
    const out = html(null)
    const figures = [
      ...out.matchAll(/class="(fact[^"]*)"><dt[^>]*><span class="count-up">([^<]+)</g),
    ]
    expect(figures.map((match) => match[2])).toEqual(FACTS.map((fact) => fact.value))
    expect(figures.map((match) => match[1])).toEqual([
      'fact fact--feature',
      ...Array(FACTS.length - 1).fill('fact'),
    ])
  })
})
