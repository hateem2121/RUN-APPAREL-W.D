import { describe, expect, it } from 'vitest'
import { OLD_VIEWER_HOST, oldViewerHostRedirect } from './oldViewerHost'

const on = (host: string, pathAndQuery: string) =>
  oldViewerHostRedirect(new Request(`https://${host}${pathAndQuery}`))

/** The Location a request to the old host is sent to, or null when it is not forwarded. */
const location = (pathAndQuery: string) =>
  on(OLD_VIEWER_HOST, pathAndQuery)?.headers.get('location')

describe('the old viewer host forwards to the website (domain move, 2026-09-28)', () => {
  it('sends a printed tag to the same garment and colour on wear-run.com, permanently', () => {
    const response = on(OLD_VIEWER_HOST, '/rxps/wine')
    expect(response?.status).toBe(301)
    expect(response?.headers.get('location')).toBe('https://wear-run.com/products/rxps/wine')
  })

  it('keeps a colourless tag colourless, so the server still picks the default colour', () => {
    expect(location('/rxps')).toBe('https://wear-run.com/products/rxps')
    expect(location('/rxps/')).toBe('https://wear-run.com/products/rxps')
  })

  it('keeps the query string, so a tracking tag on a printed code survives', () => {
    expect(location('/r-xmp/navy?src=qr')).toBe('https://wear-run.com/products/r-xmp/navy?src=qr')
  })

  it('sends an address already in the new shape to the same place, not to /products/products', () => {
    expect(location('/products/rxps/wine')).toBe('https://wear-run.com/products/rxps/wine')
  })

  it('sends the old home page to the garment listing, which is what it showed a visitor', () => {
    expect(location('/')).toBe('https://wear-run.com/products')
  })

  it('sends everything else to the same path, where the website answers it or 404s honestly', () => {
    expect(location('/og/rxps/wine.jpg')).toBe('https://wear-run.com/og/rxps/wine.jpg')
    expect(location('/a/b/c')).toBe('https://wear-run.com/a/b/c')
    expect(location('/.well-known/change-password')).toBe(
      'https://wear-run.com/.well-known/change-password',
    )
  })

  it('carries the security headers a Worker-built response otherwise lacks', () => {
    const response = on(OLD_VIEWER_HOST, '/rxps/wine')
    expect(response?.headers.get('strict-transport-security')).toBeTruthy()
    expect(response?.headers.get('x-content-type-options')).toBe('nosniff')
  })

  // Negative controls: the SAME Worker answers the website's forwarded garment pages (host
  // wear-run.com), local previews and the e2e server. Forwarding any of those would loop or
  // break every test, so the host test must be exact.
  it.each([
    'wear-run.com',
    'localhost:4173',
    'run-apparel-viewer-site.workers.dev',
    'viewer.wear-run.help.example.com',
  ])('does not forward %s', (host) => {
    expect(on(host, '/rxps/wine')).toBeNull()
  })
})
