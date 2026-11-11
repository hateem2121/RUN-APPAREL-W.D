import { describe, expect, it, vi } from 'vitest'
import {
  checkTurnstile,
  TURNSTILE_FIELD,
  TURNSTILE_SCRIPT,
  TURNSTILE_SITEKEY,
  TURNSTILE_VERIFY_URL,
  turnstileSpamReasons,
} from './turnstile'

/** A fake siteverify answering `body` with `status`, recording what it was asked. */
function siteverify(body: unknown, status = 200) {
  const calls: { url: string; form: URLSearchParams }[] = []
  const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), form: new URLSearchParams(String(init?.body ?? '')) })
    return new Response(JSON.stringify(body), { status })
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

describe('checkTurnstile', () => {
  it('passes a token Cloudflare accepts, sending the secret, the token and the visitor address', async () => {
    const { fetcher, calls } = siteverify({ success: true })
    const verdict = await checkTurnstile({
      token: 'tok',
      secret: 'sec',
      remoteip: '203.0.113.9',
      fetcher,
    })
    expect(verdict).toBe('passed')
    expect(calls[0]?.url).toBe(TURNSTILE_VERIFY_URL)
    expect(calls[0]?.form.get('secret')).toBe('sec')
    expect(calls[0]?.form.get('response')).toBe('tok')
    expect(calls[0]?.form.get('remoteip')).toBe('203.0.113.9')
  })

  it('fails a token Cloudflare rejects (a robot, a forged or a reused token)', async () => {
    const { fetcher } = siteverify({ success: false, 'error-codes': ['invalid-input-response'] })
    expect(await checkTurnstile({ token: 'forged', secret: 'sec', fetcher })).toBe('failed')
  })

  it('calls a post with no token "missing" without asking Cloudflare', async () => {
    const { fetcher, calls } = siteverify({ success: true })
    expect(await checkTurnstile({ token: '', secret: 'sec', fetcher })).toBe('missing')
    expect(await checkTurnstile({ token: undefined, secret: 'sec', fetcher })).toBe('missing')
    expect(calls).toHaveLength(0)
  })

  it('checks nothing while the secret is not set, so the form works before the owner adds it', async () => {
    const { fetcher, calls } = siteverify({ success: false })
    expect(await checkTurnstile({ token: '', secret: undefined, fetcher })).toBe('unchecked')
    expect(await checkTurnstile({ token: 'tok', secret: '  ', fetcher })).toBe('unchecked')
    expect(calls).toHaveLength(0)
  })

  it('never blames the buyer for an outage: a network error or a 5xx is "unchecked"', async () => {
    const down = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await checkTurnstile({ token: 'tok', secret: 'sec', fetcher: down })).toBe('unchecked')
    const { fetcher } = siteverify({ success: false }, 503)
    expect(await checkTurnstile({ token: 'tok', secret: 'sec', fetcher })).toBe('unchecked')
  })

  it('gives up on a slow answer as "unchecked"', async () => {
    vi.useFakeTimers()
    const slow = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    ) as unknown as typeof fetch
    const verdict = checkTurnstile({ token: 'tok', secret: 'sec', fetcher: slow, timeoutMs: 100 })
    await vi.advanceTimersByTimeAsync(150)
    expect(await verdict).toBe('unchecked')
    vi.useRealTimers()
  })
})

describe('turnstileSpamReasons', () => {
  it('holds a failed or missing token as spam, and nothing else', () => {
    expect(turnstileSpamReasons('failed')).toEqual(['turnstile-failed'])
    expect(turnstileSpamReasons('missing')).toEqual(['turnstile-missing'])
    expect(turnstileSpamReasons('passed')).toEqual([])
    expect(turnstileSpamReasons('unchecked')).toEqual([])
  })
})

describe('the public half', () => {
  it('is the widget made 2026-11-11 (invisible, wear-run.com), loaded explicitly from Cloudflare', () => {
    expect(TURNSTILE_SITEKEY).toBe('0x4AAAAAAF8kW9pIU3Z62udl')
    expect(TURNSTILE_SCRIPT).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    )
    expect(TURNSTILE_FIELD).toBe('cf-turnstile-response')
  })
})
