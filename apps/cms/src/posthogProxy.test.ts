import {
  POSTHOG_API_HOST as CONSENT_API_HOST,
  POSTHOG_PROJECT_TOKEN as CONSENT_TOKEN,
} from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import {
  answerPosthog,
  POSTHOG_PROJECT_TOKEN,
  POSTHOG_PROXY_PATH,
  posthogHeaders,
  posthogTarget,
} from '../posthogProxy.mjs'

/**
 * PostHog through `wear-run.com/rw` (posthogProxy.mjs says why). Each test is a way the live proxy
 * could fail without anyone seeing it: events at the wrong host, the site's cookies leaving for
 * PostHog, every visitor placed in a Cloudflare data centre, an event's body lost on the way.
 */

type Sent = { url: string; init: RequestInit }

function recorder(answer: () => Response = () => new Response('ok', { status: 200 })) {
  const sent: Sent[] = []
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return answer()
  }) as unknown as typeof fetch
  return { sent, send }
}

describe('the page and the proxy name the same path', () => {
  it('consent.ts sends PostHog to the path this Worker answers', () => {
    expect(CONSENT_API_HOST).toBe(POSTHOG_PROXY_PATH)
  })

  it('serves the settings of the project consent.ts starts, and only that one', () => {
    expect(POSTHOG_PROJECT_TOKEN).toBe(CONSENT_TOKEN)
  })
})

describe('posthogTarget: which PostHog host, or none', () => {
  it.each([
    ['/rw/static/array.js', 'https://us-assets.i.posthog.com/static/array.js'],
    ['/rw/static/recorder.js?v=1.2', 'https://us-assets.i.posthog.com/static/recorder.js?v=1.2'],
    [
      `/rw/array/${POSTHOG_PROJECT_TOKEN}/config.js`,
      `https://us-assets.i.posthog.com/array/${POSTHOG_PROJECT_TOKEN}/config.js`,
    ],
    ['/rw/e/?ip=0&_=1', 'https://us.i.posthog.com/e/?ip=0&_=1'],
    ['/rw/i/v0/e/', 'https://us.i.posthog.com/i/v0/e/'],
    ['/rw/s/', 'https://us.i.posthog.com/s/'],
    ['/rw/flags/?v=2', 'https://us.i.posthog.com/flags/?v=2'],
    ['/rw', 'https://us.i.posthog.com/'],
  ])('%s → %s', (path, target) => {
    expect(posthogTarget(new URL(`https://wear-run.com${path}`))?.toString()).toBe(target)
  })

  it.each([
    'https://wear-run.com/rwanda',
    'https://wear-run.com/products/rw/static/array.js',
    'https://wear-run.com/',
    'https://cms.wear-run.help/rw/static/array.js',
    'https://wear-run.help/rw/e/',
  ])('leaves %s alone', (address) => {
    expect(posthogTarget(new URL(address))).toBeNull()
  })

  /*
   * The page policies admit 'self', so a settings file served here runs as the site's own code.
   * PostHog serves ANY project's as JavaScript: only this site's may pass (commit security review,
   * 26 Nov 2026).
   */
  it.each([
    '/rw/array/phc_attackerProject123/config.js',
    `/rw/array/${POSTHOG_PROJECT_TOKEN}x/config.js`,
    '/rw/array/',
    `/rw/array/${POSTHOG_PROJECT_TOKEN}/other.js`,
  ])("refuses another project's settings: %s", (path) => {
    expect(posthogTarget(new URL(`https://wear-run.com${path}`))).toBeNull()
  })

  /*
   * A second decoding at PostHog could turn an allowed shape into another project's file (a parser
   * differential, commit security review, 26 Nov 2026): no address PostHog's script uses has one.
   */
  it.each([
    `/rw/array/${POSTHOG_PROJECT_TOKEN}/..%2f..%2farray%2fphc_attacker%2fconfig.js`,
    `/rw/array/${POSTHOG_PROJECT_TOKEN}/%2e%2e/phc_attacker/config.js`,
    '/rw/static/..%5carray%5cphc_attacker%5cconfig.js',
    '/rw//array/phc_attacker/config.js',
    '/rw/e/%2F%2Fevil',
  ])('refuses an escaped or doubled separator: %s', (path) => {
    expect(posthogTarget(new URL(`https://wear-run.com${path}`))).toBeNull()
  })

  it.each(['/rw/static/sub/array.js', '/rw/static/array.html', '/rw/static/'])(
    'serves only PostHog files by name from /static/: refuses %s',
    (path) => {
      expect(posthogTarget(new URL(`https://wear-run.com${path}`))).toBeNull()
    },
  )
})

describe('posthogHeaders: what PostHog is told', () => {
  const visitor = new Headers({
    cookie: 'run-consent=accepted; run-theme=dark',
    'cf-connecting-ip': '203.0.113.7',
    'content-type': 'text/plain',
    'content-encoding': 'gzip',
    'user-agent': 'Mozilla/5.0 test',
    host: 'wear-run.com',
  })

  it("never the site's cookies", () => {
    expect(posthogHeaders(visitor).has('cookie')).toBe(false)
  })

  it("the visitor's own IP, so a visit is not placed in a data centre", () => {
    expect(posthogHeaders(visitor).get('x-forwarded-for')).toBe('203.0.113.7')
  })

  it('the body is described as it was sent', () => {
    const headers = posthogHeaders(visitor)
    expect(headers.get('content-type')).toBe('text/plain')
    expect(headers.get('content-encoding')).toBe('gzip')
    expect(headers.get('user-agent')).toBe('Mozilla/5.0 test')
  })

  it("not the site's host: the request is addressed to PostHog", () => {
    expect(posthogHeaders(visitor).has('host')).toBe(false)
  })

  it('a project key goes on; a personal key or anything else does not', () => {
    const withKey = new Headers({ authorization: 'Bearer phc_abc' })
    expect(posthogHeaders(withKey).get('authorization')).toBe('Bearer phc_abc')
    for (const value of ['Bearer phx_personal', 'Bearer phs_secret', 'Basic dXNlcjpwYXNz']) {
      expect(posthogHeaders(new Headers({ authorization: value })).has('authorization')).toBe(false)
    }
  })
})

describe('answerPosthog', () => {
  it('passes an event on whole, body and all, and sends the answer back', async () => {
    const { sent, send } = recorder(() => new Response('{"status":1}', { status: 200 }))
    const body = 'data=eyJldmVudCI6IiRwYWdldmlldyJ9'
    const answer = await answerPosthog(
      new Request('https://wear-run.com/rw/e/?compression=base64', {
        method: 'POST',
        body,
        headers: { cookie: 'run-consent=accepted', 'cf-connecting-ip': '198.51.100.4' },
      }),
      send,
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe('https://us.i.posthog.com/e/?compression=base64')
    expect(sent[0]?.init.method).toBe('POST')
    expect(new TextDecoder().decode(sent[0]?.init.body as ArrayBuffer)).toBe(body)
    const headers = sent[0]?.init.headers as Headers
    expect(headers.has('cookie')).toBe(false)
    expect(headers.get('x-forwarded-for')).toBe('198.51.100.4')
    expect(answer?.status).toBe(200)
    expect(await answer?.text()).toBe('{"status":1}')
  })

  it('fetches the script with no body', async () => {
    const { sent, send } = recorder()
    await answerPosthog(new Request('https://wear-run.com/rw/static/array.js'), send)
    expect(sent[0]?.url).toBe('https://us-assets.i.posthog.com/static/array.js')
    expect(sent[0]?.init.body).toBeUndefined()
  })

  it("keeps PostHog's status and type, marks it unindexable, and drops any cookie it sets", async () => {
    const { send } = recorder(
      () =>
        new Response('nope', {
          status: 400,
          headers: { 'content-type': 'application/json', 'set-cookie': 'a=b' },
        }),
    )
    const answer = await answerPosthog(new Request('https://wear-run.com/rw/e/'), send)
    expect(answer?.status).toBe(400)
    expect(answer?.headers.get('content-type')).toBe('application/json')
    expect(answer?.headers.get('x-robots-tag')).toBe('noindex')
    expect(answer?.headers.has('set-cookie')).toBe(false)
  })

  it("answers another project's settings 404 itself, and PostHog is never asked", async () => {
    const { sent, send } = recorder()
    const answer = await answerPosthog(
      new Request('https://wear-run.com/rw/array/phc_attackerProject123/config.js'),
      send,
    )
    expect(answer?.status).toBe(404)
    expect(answer?.headers.get('x-content-type-options')).toBe('nosniff')
    expect(sent).toHaveLength(0)
  })

  it('marks every answer nosniff, so a data answer never runs as script', async () => {
    const { send } = recorder(
      () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const answer = await answerPosthog(new Request('https://wear-run.com/rw/flags/?v=2'), send)
    expect(answer?.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it.each(['text/html; charset=utf-8', 'application/javascript', 'text/javascript'])(
    'refuses a data answer that comes back as %s',
    async (type) => {
      const { send } = recorder(
        () =>
          new Response('<script>x</script>', { status: 200, headers: { 'content-type': type } }),
      )
      const answer = await answerPosthog(new Request('https://wear-run.com/rw/e/'), send)
      expect(answer?.status).toBe(404)
    },
  )

  it('lets its own code through as code, without the data policy', async () => {
    const { send } = recorder(
      () =>
        new Response('/* posthog */', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        }),
    )
    const answer = await answerPosthog(new Request('https://wear-run.com/rw/static/array.js'), send)
    expect(answer?.status).toBe(200)
    expect(answer?.headers.get('content-type')).toBe('application/javascript')
    expect(answer?.headers.has('content-security-policy')).toBe(false)
  })

  it('locks a data answer down, drops redirects and cross-site headers', async () => {
    const { send } = recorder(
      () =>
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://evil.example/',
            'access-control-allow-origin': '*',
            'access-control-allow-credentials': 'true',
          },
        }),
    )
    const answer = await answerPosthog(new Request('https://wear-run.com/rw/flags/'), send)
    expect(answer?.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(answer?.headers.has('location')).toBe(false)
    expect(answer?.headers.has('access-control-allow-origin')).toBe(false)
    expect(answer?.headers.has('access-control-allow-credentials')).toBe(false)
  })

  it('is null for every other address, and PostHog is never asked', async () => {
    const { sent, send } = recorder()
    expect(await answerPosthog(new Request('https://wear-run.com/guides'), send)).toBeNull()
    expect(await answerPosthog(new Request('https://cms.wear-run.help/rw/e/'), send)).toBeNull()
    expect(sent).toHaveLength(0)
  })
})
