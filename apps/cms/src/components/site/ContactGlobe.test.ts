import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContactGlobe } from './ContactGlobe'

/**
 * What the SERVER sends is the globe's fallback and its accessible content, so it is proved here
 * without a browser: the canvas only ever exists after mount (`e2e/globe.spec.ts`).
 */
const ADDRESS = '13 Km Daska Road, Sialkot, 51040, Pakistan'
const render = (coordinates: string) =>
  renderToStaticMarkup(createElement(ContactGlobe, { coordinates, address: ADDRESS }))

describe('ContactGlobe, as the server renders it', () => {
  it('prints the address, the coordinates and a directions link to the pin', () => {
    const html = render('32.41° N · 74.46° E')
    expect(html).toContain(ADDRESS)
    expect(html).toContain('32.41° N · 74.46° E')
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=32.41,74.46"')
    expect(html).toContain('rel="noopener"')
    expect(html).toContain('Get directions')
  })

  it('never sends the canvas: it exists only after mount, and only with WebGL', () => {
    expect(render('32.41° N · 74.46° E')).not.toContain('<canvas')
  })

  it('with no coordinates, keeps the address and links to it by address', () => {
    for (const blank of ['', '   ', 'nonsense', '95° N · 10° E']) {
      const html = render(blank)
      expect(html).toContain(ADDRESS)
      expect(html).not.toContain('contact-globe__coords')
      expect(html).toContain('query=13%20Km%20Daska%20Road')
    }
  })

  it('names no city: the arcs are a picture, not a customer list', () => {
    const html = render('32.41° N · 74.46° E')
    for (const city of ['London', 'New York', 'Tokyo', 'Sydney', 'Berlin', 'Toronto']) {
      expect(html).not.toContain(city)
    }
  })
})
