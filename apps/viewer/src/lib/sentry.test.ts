import { describe, expect, it } from 'vitest'
import { IGNORED_ERRORS, isNetworkError, scrub } from './sentry'

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

/**
 * These assert a QUOTA guarantee, and they use the REAL strings measured in
 * production on 2026-08-25 rather than invented ones. A synthetic
 * "crawler error" fixture would pass while the actual CefSharp message — which
 * carries a varying id digit — walked straight through, which is the failure
 * mode this repo keeps rediscovering: a test whose fixture cannot exhibit the
 * bug is not a test.
 */
describe('IGNORED_ERRORS', () => {
  const matches = (message: string): boolean =>
    IGNORED_ERRORS.some((p) => (typeof p === 'string' ? message.includes(p) : p.test(message)))

  it('drops the Outlook SafeLinks crawler error, whatever id it carries', () => {
    // Both of these were observed in the same issue, four hours apart.
    expect(matches('Object Not Found Matching Id:3, MethodName:update, ParamCount:4')).toBe(true)
    expect(
      matches(
        'Non-Error promise rejection captured with value: Object Not Found Matching Id:2, MethodName:update, ParamCount:4',
      ),
    ).toBe(true)
  })

  it('drops errors injected by browser extensions', () => {
    expect(matches('chrome-extension://abcdef/content.js failed')).toBe(true)
    expect(matches('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
  })

  it('does NOT drop a real application error (negative control)', () => {
    // If this ever goes true the filter has started eating the signal it exists
    // to protect.
    expect(matches('TypeError: Cannot read properties of null (reading modelViewer)')).toBe(false)
    expect(matches('TypeError: Failed to fetch')).toBe(false)
  })
})

describe('isNetworkError', () => {
  it('recognises a fetch failure from the exception value', () => {
    expect(
      isNetworkError({ exception: { values: [{ value: 'TypeError: Failed to fetch' }] } }),
    ).toBe(true)
  })

  it("recognises the Safari and Firefox spellings, not just Chrome's", () => {
    // Same fault, three engines, three strings — the reason this is a regex.
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
      true,
    )
  })

  it('does NOT classify a code fault as a network error (negative control)', () => {
    // This is the half that must keep reporting: a cached 404 on media.wear-run.help
    // surfaces as a fetch failure while the page is still live, and that is an
    // incident, not a visitor leaving.
    expect(isNetworkError({ exception: { values: [{ value: 'ReferenceError: x' }] } })).toBe(false)
    expect(isNetworkError({})).toBe(false)
  })
})
