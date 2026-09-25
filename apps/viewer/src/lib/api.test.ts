import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchViewerData } from './api'

afterEach(() => vi.restoreAllMocks())

describe('fetchViewerData', () => {
  it('returns the JSON payload on success', async () => {
    const payload = { product: { productCode: 'N001' } }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
    )
    await expect(fetchViewerData('n001', 'navy')).resolves.toEqual(payload)
  })

  it('returns the error body on 404 without throwing', async () => {
    const err = { error: 'not_found', message: 'nope' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => err }),
    )
    await expect(fetchViewerData('x', 'y')).resolves.toEqual(err)
  })

  it('throws on other non-ok statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    await expect(fetchViewerData('x', 'y')).rejects.toThrow(/500/)
  })

  it('URL-encodes the slugs into the request path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViewerData('n 001', 'na/vy')
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain(encodeURIComponent('n 001'))
    expect(url).toContain(encodeURIComponent('na/vy'))
  })

  // "/n001" — no colour named. The request must omit the colour segment entirely
  // rather than send an empty one: ".../n001/" would 404 as a mangled colour.
  it('omits the colour segment when no colour is requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViewerData('n001', null)
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toMatch(/\/api\/public\/viewer\/n001$/)
  })
})

describe('fetchViewerData — timeout and retry', () => {
  // ⚠️ THERE WAS NO TIMEOUT AT ALL BEFORE 2026-09-04. A slow (not down) CMS left
  // App.tsx in `{ kind: 'loading' }` forever, with the whole document aria-hidden
  // behind the preloader. These tests pin the bound and the retry policy.

  it('passes an abort signal, so a hung request cannot wait forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await fetchViewerData('rxps', 'wine')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    // NEGATIVE CONTROL: drop `signal:` from api.ts and this line fails. Asserting
    // only that fetch was called would pass against the unbounded version.
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('retries exactly once on a transport failure, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchViewerData('rxps', 'wine')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry and rethrows the transport error', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError')
    const fetchMock = vi.fn().mockRejectedValue(timeout)
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchViewerData('rxps', 'wine')).rejects.toThrow(/timed out/i)
    // bounded: two attempts, not an unbounded loop
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 404 — it is a real answer, not a failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not_found' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchViewerData('nope', 'wine')).resolves.toEqual({ error: 'not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry a 5xx — re-asking cannot change it, and doubles the load', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchViewerData('rxps', 'wine')).rejects.toThrow(/503/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * RO-04 — how long a visitor watches "PREPARING…" when the CMS holds the request.
 *
 * The block above proves a signal is passed and that there are two attempts. Neither
 * pins the NUMBERS, and the numbers are the contract: 8 s per attempt, one retry, so a
 * server that never answers ends in the unavailable notice after 16 s. The audit held
 * the API for 12 s and read "PREPARING…" on the loading screen; the words are guarded
 * by e2e/audit-guards.spec.ts (FA-P-07), and this guards how long they stay up. A
 * timeout raised to 30 s would keep that visitor there for a full minute, and a second
 * retry for 24 s, with every test above still green.
 *
 * The server here holds every request until its signal aborts — the real shape of a
 * stalled mobile connection — and `AbortSignal.timeout` is replaced by one built on
 * `setTimeout`, so fake time drives it and the test takes milliseconds, not 16 s. The
 * replacement records every value it is asked for, so the 8 s itself is asserted too.
 */
describe('fetchViewerData — the retry-timeout ceiling (RO-04)', () => {
  const realTimeout = AbortSignal.timeout

  afterEach(() => {
    AbortSignal.timeout = realTimeout
    vi.useRealTimers()
  })

  it('gives up on a server that never answers at 16 s — not before, not after', async () => {
    vi.useFakeTimers()
    const timeouts: number[] = []
    AbortSignal.timeout = (ms: number) => {
      timeouts.push(ms)
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms)
      return controller.signal
    }
    const held = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) throw new Error('no signal: this request could wait forever')
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )
    vi.stubGlobal('fetch', held)

    let settled: 'pending' | 'resolved' | 'rejected' = 'pending'
    let reason: unknown
    const attempt = fetchViewerData('rxps', 'wine').then(
      () => {
        settled = 'resolved'
      },
      (error: unknown) => {
        settled = 'rejected'
        reason = error
      },
    )

    await vi.advanceTimersByTimeAsync(7_999)
    expect(held, 'the first attempt was abandoned before 8 s').toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(held, 'no retry at 8 s: the per-attempt timeout is not 8 s').toHaveBeenCalledTimes(2)

    // The audit's own case: held for 12 s, the visitor is still being told
    // "PREPARING…", because the fetch has not settled.
    await vi.advanceTimersByTimeAsync(4_000)
    expect(settled, 'the request settled before 12 s').toBe('pending')

    await vi.advanceTimersByTimeAsync(3_999)
    expect(settled, 'the request settled before 16 s').toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    await attempt
    expect(
      settled,
      'still waiting at 16 s: a longer timeout or another retry keeps the visitor on the ' +
        'loading screen past the ceiling',
    ).toBe('rejected')
    expect(reason).toMatchObject({ kind: 'network' })
    expect(held).toHaveBeenCalledTimes(2)
    expect(timeouts).toEqual([8_000, 8_000])
  })
})

/**
 * ⚠️ WHY THE FAILURE'S KIND IS A TESTED CONTRACT AND NOT AN IMPLEMENTATION DETAIL.
 *
 * Audit FA-P-05/FA-P-06: a 500 and a phone with no signal both reached
 * `App.tsx`'s catch, which rendered the retired-product screen — "THIS REFERENCE
 * IS NO LONGER LIVE". Nothing had been retired. `App.tsx` now picks the screen
 * from `ViewerFetchError.kind`, so these three values ARE the copy a buyer reads.
 */
describe('fetchViewerData — why it failed', () => {
  const onLine = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)

  it('labels a 5xx as a server failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    )
    await expect(fetchViewerData('rxps', 'wine')).rejects.toMatchObject({
      name: 'ViewerFetchError',
      kind: 'server',
    })
  })

  it('labels a dropped request as a network failure when the device says it is online', async () => {
    onLine(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchViewerData('rxps', 'wine')).rejects.toMatchObject({ kind: 'network' })
  })

  it('labels it offline when the device says it has no network', async () => {
    // The case the service worker makes reachable: the shell is precached, so the
    // page renders perfectly and only the payload is missing. Measured on the live
    // site — the navigation SUCCEEDED offline and showed "no longer live".
    onLine(false)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchViewerData('rxps', 'wine')).rejects.toMatchObject({ kind: 'offline' })
  })

  it('keeps the underlying message, which is what reaches the beacon', async () => {
    onLine(true)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('signal timed out')))
    // The visitor sees the KIND; Sentry needs to tell a timeout from a CORS
    // rejection, and both arrive here as the same kind.
    await expect(fetchViewerData('rxps', 'wine')).rejects.toThrow(/signal timed out/)
  })

  it('reads onLine at the moment of failure, not at import — negative control', async () => {
    // Without this the two assertions above could both be satisfied by a constant.
    // Same fetch rejection, opposite navigator state, opposite kind.
    const failing = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', failing)
    onLine(false)
    await expect(fetchViewerData('a', 'b')).rejects.toMatchObject({ kind: 'offline' })
    onLine(true)
    await expect(fetchViewerData('a', 'b')).rejects.toMatchObject({ kind: 'network' })
  })
})
