import { describe, expect, it } from 'vitest'
import { scrub } from './sentry'

/**
 * These assert a PRIVACY guarantee, not a formatting preference.
 *
 * The viewer has no login, no cookie and no form — the enquiry path is a
 * `mailto:` link built client-side — so today there is very little for Sentry to
 * leak. That is a fact about the current code, and `scrub` is what keeps the
 * guarantee true if it changes: the day someone adds a `?ref=` parameter or a
 * filter to the URL, this is the only thing standing between it and a third
 * party. A test that only reflected today's app would not be worth writing.
 */
describe('scrub', () => {
  it('drops the user object entirely', () => {
    const event = scrub({ user: { id: 'u1', email: 'buyer@example.com', ip_address: '1.2.3.4' } })
    expect(event.user).toBeUndefined()
  })

  it('drops cookies, headers and request bodies', () => {
    const event = scrub({
      request: {
        cookies: { session: 'abc' },
        headers: { 'user-agent': 'x', authorization: 'Bearer secret' },
        data: { message: 'typed by a visitor' },
        url: 'https://viewer.wear-run.help/n001/wine',
      },
    })
    const request = event.request as Record<string, unknown>
    expect(request.cookies).toBeUndefined()
    expect(request.headers).toBeUndefined()
    expect(request.data).toBeUndefined()
  })

  it('reduces the URL to origin + pathname, dropping query and fragment', () => {
    const event = scrub({
      request: { url: 'https://viewer.wear-run.help/n001/wine?email=buyer@example.com#token=abc' },
    })
    const request = event.request as Record<string, unknown>
    expect(request.url).toBe('https://viewer.wear-run.help/n001/wine')
    expect(String(request.url)).not.toContain('buyer@example.com')
    expect(String(request.url)).not.toContain('token')
  })

  it('keeps the product and colourway path, which are public QR-tag identifiers', () => {
    const event = scrub({ request: { url: 'https://viewer.wear-run.help/n001/wine' } })
    expect((event.request as Record<string, unknown>).url).toBe(
      'https://viewer.wear-run.help/n001/wine',
    )
  })

  it('drops a URL it cannot parse rather than passing it through unexamined', () => {
    const event = scrub({ request: { url: 'not a url' } })
    expect((event.request as Record<string, unknown>).url).toBeUndefined()
  })

  it('is a no-op on an event with nothing sensitive', () => {
    const event = scrub({ message: 'boom', tags: { product: 'n001' } })
    expect(event.message).toBe('boom')
    expect(event.tags).toEqual({ product: 'n001' })
  })
})
