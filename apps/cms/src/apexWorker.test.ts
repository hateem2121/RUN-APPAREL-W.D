import { describe, expect, it } from 'vitest'
import { handle } from '../../../infra/apex-404/index.js'

/**
 * The apex Worker's routing and header rules.
 *
 * WHY THIS EXISTS. On 2026-08-30 `infra/apex-404/index.js` was reconciled against the
 * Worker that had been deployed from the Cloudflare dashboard two days earlier. The
 * recovered source arrived MINIFIED — the dashboard editor had collapsed the whole
 * handler onto one line — and was rewritten here as readable code. That is a
 * behavioural risk: a reformat can change behaviour, and Biome formats this directory
 * (`biome.jsonc` includes `**`), so "byte-identical to what is deployed" is not a
 * property this file can ever have.
 *
 * So it is verified by BEHAVIOUR instead. These are the rules the live Worker was
 * measured to follow on 2026-08-30:
 *
 *   /catalogue /CATALOGUE /catalogue/ /catalogue.pdf /catalogue?x=1  -> 200, same etag
 *   /profile /profile.pdf                                            -> 200, other etag
 *   / /cataloguexyz /RUN-Apparel-Catalogue.pdf /assets/index.js      -> 404
 *
 * ⚠️ THE LAST GROUP IS THE SECURITY PROPERTY, and it is easy to lose in a rewrite.
 * This is a two-path ALLOWLIST, not a generic proxy onto `run-assets` — so the bucket
 * is not enumerable through the apex. A refactor that passed the pathname to
 * `env.ASSETS.get()` would still serve both PDFs and pass every other test here.
 */

type StubObject = {
  body: string | null
  size: number
  httpEtag: string
  range?: { offset?: number; length?: number }
  writeHttpMetadata: (headers: Headers) => void
}

const SIZE = 54_336_461

/** A stub R2 bucket holding exactly the two real objects, under their real keys. */
const bucket = (over: { miss?: boolean } = {}) => {
  const calls: { key: string; ranged: boolean }[] = []
  const env = {
    ASSETS: {
      get: async (key: string, options?: { range?: Headers }) => {
        calls.push({ key, ranged: Boolean(options?.range) })
        if (over.miss) return null
        if (key !== 'RUN PRODUCT CATALOUGE.pdf' && key !== 'Company Profile.pdf') return null

        const rangeHeader = options?.range?.get('range')
        const object: StubObject = {
          body: 'stub-body',
          size: SIZE,
          httpEtag: `"etag-${key}"`,
          writeHttpMetadata: (headers: Headers) => headers.set('x-from-metadata', '1'),
        }
        if (rangeHeader === 'bytes=0-1023') object.range = { offset: 0, length: 1024 }
        if (rangeHeader === 'whole') object.range = { offset: 0, length: SIZE }
        return object
      },
    },
  }
  return { env, calls }
}

/** The handler's `env` param, narrowed to the only binding it touches. */
type ApexEnv = Parameters<typeof handle>[1]

const get = (path: string, init?: RequestInit) => {
  const { env, calls } = bucket()
  const request = new Request(`https://wear-run.help${path}`, init)
  return handle(request, env as unknown as ApexEnv).then((res: Response) => ({ res, calls }))
}

describe('apex worker routing', () => {
  it.each([
    ['/catalogue', 'RUN PRODUCT CATALOUGE.pdf'],
    ['/profile', 'Company Profile.pdf'],
  ])('serves %s from the right R2 key', async (path, key) => {
    const { res, calls } = await get(path)
    expect(res.status).toBe(200)
    expect(calls[0]?.key).toBe(key)
  })

  it.each(['/CATALOGUE', '/catalogue/', '/catalogue.pdf', '/CATALOGUE.PDF', '/catalogue///'])(
    'normalises %s to the catalogue',
    async (path) => {
      const { res } = await get(path)
      expect(res.status).toBe(200)
    },
  )

  it('ignores the query string', async () => {
    const { res } = await get('/catalogue?utm_source=qr')
    expect(res.status).toBe(200)
  })

  it.each(['/', '/cataloguexyz', '/nope', '/assets/index.js'])('404s %s', async (path) => {
    const { res } = await get(path)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('viewer.wear-run.help')
  })

  it('is an ALLOWLIST, not a proxy — an R2 key is not reachable as a path', async () => {
    // The security property. A refactor that forwarded the pathname to
    // env.ASSETS.get() would serve both PDFs and pass every other test in this file,
    // while making the whole shared bucket enumerable through the apex.
    for (const path of [
      '/RUN PRODUCT CATALOUGE.pdf',
      '/Company Profile.pdf',
      '/RUN-Apparel-Catalogue.pdf',
    ]) {
      const { res, calls } = await get(path)
      expect(res.status, `${path} should not resolve`).toBe(404)
      expect(calls, `${path} must not reach R2 at all`).toEqual([])
    }
  })
})

describe('apex worker headers', () => {
  it('sets everything a browser needs to render the PDF inline', async () => {
    const { res } = await get('/catalogue')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="RUN-Apparel-Catalogue.pdf"',
    )
    // L17-12, 2026-08-31: one day plus a week of stale-while-revalidate, raised from
    // one hour. A 54.3 MB catalogue that changes a few times a year, on an apex whose
    // cold fetch measured 1.6 s, should not be re-fetched hourly.
    // ⚠️ Asserted as a WHOLE STRING on purpose. stale-while-revalidate is the half
    // that makes the long TTL safe — it is what lets a replaced PDF reach people
    // without anyone waiting on it — and a substring match on max-age would let it be
    // dropped silently.
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800',
    )
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('etag')).toBe('"etag-RUN PRODUCT CATALOUGE.pdf"')
    // R2's own metadata is written first, then overridden where we care.
    expect(res.headers.get('x-from-metadata')).toBe('1')
  })
})

describe('apex worker methods and ranges', () => {
  it.each(['POST', 'PUT', 'DELETE'])('405s %s with an allow header', async (method) => {
    const { res } = await get('/catalogue', { method })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, HEAD')
  })

  it('405 takes priority only AFTER the path is known — an unknown path still 404s', async () => {
    const { res } = await get('/nope', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('HEAD returns the headers and no body', async () => {
    const { res } = await get('/catalogue', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
    expect(res.headers.get('content-type')).toBe('application/pdf')
  })

  /**
   * ⚠️ THE WORKER MUST NOT ANSWER RANGES ITSELF. It did until 2026-08-30, returning
   * its own 206 — and Cloudflare does not store a 206 produced by a Worker
   * (developers.cloudflare.com/workers/cache/debugging/: "Return a full 200
   * instead"). That single behaviour is why a 54 MB PDF showed no cf-cache-status
   * at all and was re-read from R2 on every request.
   *
   * Workers Caching, enabled in wrangler.jsonc, fetches the full body ONCE, caches
   * the 200, and slices every subsequent range out of that entry without invoking
   * this Worker. Visitors still receive a 206; it comes from the edge.
   *
   * So these two assertions ARE the performance fix. A future refactor that
   * "restores" range handling would silently make both PDFs uncacheable again, and
   * nothing else in the repo would notice.
   */
  it('answers a range request with a FULL 200 — never its own 206', async () => {
    const { res } = await get('/catalogue', { headers: { range: 'bytes=0-1023' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-range')).toBeNull()
  })

  it('never forwards a Range to R2 — the edge slices, not this Worker', async () => {
    const { calls } = await get('/catalogue', { headers: { range: 'bytes=0-1023' } })
    expect(calls[0]?.ranged).toBe(false)
  })

  it('still advertises accept-ranges, because the EDGE serves them', async () => {
    const { res } = await get('/catalogue')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
  })
})

describe('apex worker when the object is missing', () => {
  it('404s with a distinct message, so a cached miss is diagnosable', async () => {
    const { env } = bucket({ miss: true })
    const request = new Request('https://wear-run.help/catalogue')
    const res = await handle(request, env as unknown as ApexEnv)
    expect(res.status).toBe(404)
    // Deliberately NOT the same body as an unknown path: "the route exists but the
    // file did not come back" is a different fault from "no such route", and on an
    // R2-backed host it can be a CACHED 404 from before the object existed.
    expect(await res.text()).toContain('temporarily unavailable')
  })
})
