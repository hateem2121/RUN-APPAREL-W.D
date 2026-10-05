import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContactGlobe } from './ContactGlobe'

/**
 * What the SERVER sends is the globe's fallback and its accessible content, so it is proved here
 * without a browser: the canvas only ever exists after mount (`e2e/globe.spec.ts`).
 */
const ADDRESS = '13 Km Daska Road, Sialkot, 51040, Pakistan'
const NAME = 'RUN APPAREL (PVT) LTD'
const render = (coordinates: string, name = NAME) =>
  renderToStaticMarkup(createElement(ContactGlobe, { coordinates, address: ADDRESS, name }))

// Directions to the company's Google listing, by name and address (polish X24, `lib/globe.ts`).
const TO_THE_LISTING =
  'href="https://www.google.com/maps/dir/?api=1&amp;destination=RUN%20APPAREL%20(PVT)%20LTD%2C%2013%20Km%20Daska%20Road%2C%20Sialkot%2C%2051040%2C%20Pakistan"'

describe('ContactGlobe, as the server renders it', () => {
  it('prints the address as a letter is addressed, the coordinates, and directions to the listing', () => {
    const html = render('32.41° N · 74.46° E')
    expect(html).toContain('<span class="contact-globe__street">13 Km Daska Road</span>')
    expect(html).toContain('<span>Sialkot, 51040, Pakistan</span>')
    // A space between the two lines, so a copy or a screen reader reads "Road Sialkot".
    expect(html).toMatch(/13 Km Daska Road<\/span> <span>Sialkot/)
    expect(html).toContain('32.41° N · 74.46° E')
    expect(html).toContain(TO_THE_LISTING)
    // Never to the rounded coordinates, which sit about half a kilometre from the listing's pin.
    expect(html).not.toContain('32.41,74.46')
    expect(html).toContain('rel="noopener"')
    expect(html).toContain('class="btn btn--ghost contact-globe__link"')
    expect(html).toContain('Get directions')
  })

  it('never sends the canvas: it exists only after mount, and only with WebGL', () => {
    expect(render('32.41° N · 74.46° E')).not.toContain('<canvas')
  })

  it('with no coordinates, keeps the address and the directions to the listing', () => {
    for (const blank of ['', '   ', 'nonsense', '95° N · 10° E']) {
      const html = render(blank)
      expect(html).toContain('13 Km Daska Road')
      expect(html).not.toContain('contact-globe__coords')
      expect(html).toContain(TO_THE_LISTING)
    }
  })

  it('with no name, gives directions to the address alone', () => {
    expect(render('32.41° N · 74.46° E', '')).toContain(
      'destination=13%20Km%20Daska%20Road%2C%20Sialkot%2C%2051040%2C%20Pakistan"',
    )
  })

  it('names no city: the arcs are a picture, not a customer list', () => {
    const html = render('32.41° N · 74.46° E')
    for (const city of ['London', 'New York', 'Tokyo', 'Sydney', 'Berlin', 'Toronto']) {
      expect(html).not.toContain(city)
    }
  })
})
