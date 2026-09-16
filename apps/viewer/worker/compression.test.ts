import { describe, expect, it } from 'vitest'
import { chooseEncoding, visitorAcceptEncoding, withCompression } from './compression'

const request = (acceptEncoding?: string) =>
  new Request('https://viewer.wear-run.help/rxps/wine', {
    headers: acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding },
  })
/**
 * A request as Cloudflare hands it to the Worker: the header already rewritten, and the
 * visitor's own list (if Cloudflare stored one) on `cf`. Node's Request has no `cf`, so it
 * is added here. `stored` undefined means Cloudflare stored nothing (measured 2026-09-17
 * for no header, an empty one, `*` and `zstd`).
 */
const onCloudflare = (header: string | undefined, stored: string | undefined) => {
  const req = request(header)
  Object.defineProperty(req, 'cf', {
    value: stored === undefined ? {} : { clientAcceptEncoding: stored },
  })
  return req
}
const html = (headers: Record<string, string> = {}, status = 200) =>
  new Response('<!doctype html><p>hi', {
    status,
    headers: { 'content-type': 'text/html', 'content-length': '20', etag: '"abc"', ...headers },
  })

describe('chooseEncoding (PF-13)', () => {
  it.each([
    ['br, gzip', 'br'],
    ['gzip, deflate, br, zstd', 'br'],
    ['gzip', 'gzip'],
    ['br;q=0, gzip', 'gzip'],
    ['*', 'br'],
    ['*;q=0, gzip', 'gzip'],
    ['identity', null],
    ['deflate', null],
    ['', null],
  ])('%s → %s', (header, expected) => {
    expect(chooseEncoding(header)).toBe(expected)
  })

  it('treats a missing header as "send it plain"', () => {
    expect(chooseEncoding(null)).toBe(null)
  })
})

describe('visitorAcceptEncoding (PF-13)', () => {
  it('reads what the visitor sent, not the header Cloudflare rewrote', () => {
    expect(visitorAcceptEncoding(onCloudflare('br, gzip', 'gzip'))).toBe('gzip')
  })

  it('reads an empty stored list as empty, not as "use the header"', () => {
    expect(visitorAcceptEncoding(onCloudflare('br, gzip', ''))).toBe('')
  })

  it('names no encoding when Cloudflare stored no list, whatever the header says', () => {
    expect(visitorAcceptEncoding(onCloudflare('br, gzip', undefined))).toBeNull()
    expect(visitorAcceptEncoding(onCloudflare('*', undefined))).toBeNull()
    expect(visitorAcceptEncoding(onCloudflare(undefined, undefined))).toBeNull()
  })

  it('uses the header outside Cloudflare', () => {
    expect(visitorAcceptEncoding(request('gzip'))).toBe('gzip')
  })
})

describe('withCompression (PF-13)', () => {
  it('sends gzip to a visitor that only reads gzip, whatever the rewritten header says', () => {
    const out = withCompression(onCloudflare('br, gzip', 'gzip'), html())
    expect(out.headers.get('content-encoding')).toBe('gzip')
  })

  it('sends brotli to a browser, read from its stored list', () => {
    const out = withCompression(onCloudflare('br, gzip', 'gzip, deflate, br'), html())
    expect(out.headers.get('content-encoding')).toBe('br')
  })

  it('sends it plain to a visitor that asked for identity', () => {
    const out = withCompression(onCloudflare('br, gzip', 'identity'), html())
    expect(out.headers.get('content-encoding')).toBeNull()
  })

  it('sends it plain when Cloudflare stored no list, even if the header offers brotli', () => {
    const out = withCompression(onCloudflare('br, gzip', undefined), html())
    expect(out.headers.get('content-encoding')).toBeNull()
  })

  it('asks the runtime for brotli when the browser offers it', () => {
    const out = withCompression(request('gzip, deflate, br'), html())
    expect(out.headers.get('content-encoding')).toBe('br')
    expect(out.headers.get('content-length')).toBeNull()
  })

  it('falls back to gzip', () => {
    expect(withCompression(request('gzip'), html()).headers.get('content-encoding')).toBe('gzip')
  })

  it('sends it plain when nothing is offered, and still says it varies', () => {
    const out = withCompression(request(), html())
    expect(out.headers.get('content-encoding')).toBeNull()
    expect(out.headers.get('vary')).toBe('Accept-Encoding')
  })

  it('weakens a strong ETag, and keeps a weak one', () => {
    expect(withCompression(request('br'), html()).headers.get('etag')).toBe('W/"abc"')
    expect(withCompression(request('br'), html({ etag: 'W/"x"' })).headers.get('etag')).toBe(
      'W/"x"',
    )
  })

  it('adds to an existing Vary rather than replacing it', () => {
    const vary =
      withCompression(request('br'), html({ vary: 'User-Agent' })).headers.get('vary') ?? ''
    expect(vary.toLowerCase()).toContain('user-agent')
    expect(vary.toLowerCase()).toContain('accept-encoding')
  })

  it('keeps no-transform, which is why the edge does not compress it', () => {
    const out = withCompression(
      request('br'),
      html({ 'cache-control': 'public, max-age=0, no-transform' }),
    )
    expect(out.headers.get('cache-control')).toContain('no-transform')
  })

  it('compresses the branded 404 too', () => {
    expect(withCompression(request('br'), html({}, 404)).headers.get('content-encoding')).toBe('br')
  })

  it('leaves non-HTML, a 304, and an already-encoded body alone', () => {
    const image = new Response('x', { headers: { 'content-type': 'image/jpeg' } })
    expect(withCompression(request('br'), image)).toBe(image)
    const notModified = new Response(null, {
      status: 304,
      headers: { 'content-type': 'text/html' },
    })
    expect(withCompression(request('br'), notModified)).toBe(notModified)
    const encoded = html({ 'content-encoding': 'gzip' })
    expect(withCompression(request('br'), encoded)).toBe(encoded)
  })

  it('keeps the body readable', async () => {
    expect(await withCompression(request('br'), html()).text()).toBe('<!doctype html><p>hi')
  })
})
