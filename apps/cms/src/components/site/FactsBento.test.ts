import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CERTIFICATION_LINES, CERTIFICATION_PROMISE } from '../../lib/companyFacts'
import { FactsBento } from './FactsBento'

const html = (worksCoordinates?: string | null) =>
  renderToStaticMarkup(createElement(FactsBento, { worksCoordinates }))

/**
 * №05's slab (polish X7, 2026-10-05). Neither the suite's database nor CI's holds the works'
 * coordinates, so no browser test here ever draws the pin that production draws; this renders it
 * from the value production holds, and e2e/worksSlab.spec.ts checks where its styles put it.
 */
describe('FactsBento — where we ship | certification', () => {
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
})
