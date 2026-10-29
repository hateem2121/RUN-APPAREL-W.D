import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadStalledError, ModelFetchError, retryAfterMs } from './fetchWithProgress'
import { downloadWithRetries, MAX_ATTEMPTS, STALL_MS } from './downloadWithRetries'

const stall = () => Promise.reject(new DownloadStalledError('u', 0, STALL_MS))
const ok = () => Promise.resolve(new Blob(['x']))

describe('downloadWithRetries (issue #41)', () => {
  it('uses the approved limits: 12 s of silence, three tries in all', () => {
    // The visitor reads "TRYING AGAIN (2 OF 3)", so these two numbers ARE copy.
    expect(STALL_MS).toBe(12_000)
    expect(MAX_ATTEMPTS).toBe(3)
  })

  it('retries a stall and resolves on a later attempt', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(stall)
      .mockImplementationOnce(stall)
      .mockImplementationOnce(ok)
    const attempts: number[] = []
    await expect(
      downloadWithRetries('u', {
        onProgress: () => {},
        onAttempt: (n) => attempts.push(n),
        fetcher,
      }),
    ).resolves.toBeInstanceOf(Blob)
    expect(attempts).toEqual([1, 2, 3])
  })

  it('gives up with the stall error after MAX_ATTEMPTS, reporting every stall', async () => {
    const fetcher = vi.fn(stall)
    const stalls: number[] = []
    await expect(
      downloadWithRetries('u', { onProgress: () => {}, onStall: (a) => stalls.push(a), fetcher }),
    ).rejects.toBeInstanceOf(DownloadStalledError)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(stalls).toEqual([1, 2, 3])
  })

  it('never retries any other failure', async () => {
    // A 404 or an HTML page is not made better by asking again; the caller's plain-URL fallback handles it.
    const fetcher = vi.fn(() => Promise.reject(new Error('responded 404')))
    await expect(downloadWithRetries('u', { onProgress: () => {}, fetcher })).rejects.toThrow('404')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('passes the stall window and the caller signal through', async () => {
    const fetcher = vi.fn(ok)
    const ac = new AbortController()
    await downloadWithRetries('u', { onProgress: () => {}, signal: ac.signal, fetcher })
    expect(fetcher).toHaveBeenCalledWith('u', expect.any(Function), ac.signal, { stallMs: 12_000 })
  })

  it('passes the garment data’s size to every attempt, for the percentage (polish F12)', async () => {
    const fetcher = vi.fn().mockImplementationOnce(stall).mockImplementationOnce(ok)
    await downloadWithRetries('u', { onProgress: () => {}, fetcher, expectedBytes: 3_839_756 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const call of fetcher.mock.calls) {
      expect(call[3]).toEqual({ stallMs: 12_000, expectedBytes: 3_839_756 })
    }
  })
})

describe('temporary connection recovery', () => {
  afterEach(() => vi.useRealTimers())
  it.each([new TypeError('Load failed'), new ModelFetchError('busy', 'http 503', 503)])(
    'recovers within the same bounded loader',
    async (error) => {
      vi.useFakeTimers()
      const fetcher = vi.fn().mockRejectedValueOnce(error).mockImplementation(ok)
      const result = downloadWithRetries('u', { onProgress: () => {}, fetcher })
      await vi.runAllTimersAsync()
      await expect(result).resolves.toBeInstanceOf(Blob)
      expect(fetcher).toHaveBeenCalledTimes(2)
    },
  )
  it.each([403, 404, 401])('does not retry permanent HTTP %s', async (status) => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ModelFetchError('denied', `http ${status}`, status))
    await expect(downloadWithRetries('u', { onProgress: () => {}, fetcher })).rejects.toThrow(
      'denied',
    )
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('honours Retry-After and cancellation while waiting', async () => {
    vi.useFakeTimers()
    const ac = new AbortController()
    const fetcher = vi.fn().mockRejectedValue(new ModelFetchError('busy', 'http 429', 429, 2000))
    const result = downloadWithRetries('u', { onProgress: () => {}, fetcher, signal: ac.signal })
    const rejection = expect(result).rejects.toHaveProperty('name', 'AbortError')
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetcher).toHaveBeenCalledOnce()
    ac.abort()
    await rejection
    await vi.runAllTimersAsync()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('gives up after three network failures without a fourth direct-loader request', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'))
    const result = downloadWithRetries('u', { onProgress: () => {}, fetcher, attempts: 100 })
    const rejection = expect(result).rejects.toThrow('offline')
    await vi.runAllTimersAsync()
    await rejection
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('does not automatically retry before a long server pause', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ModelFetchError('busy', 'http 429', 429, 60000))
    await expect(downloadWithRetries('u', { onProgress: () => {}, fetcher })).rejects.toThrow(
      'busy',
    )
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('parses both standard Retry-After forms', () => {
    expect(retryAfterMs('2')).toBe(2000)
    expect(retryAfterMs('Wed, 28 Oct 2026 00:00:02 GMT', Date.parse('2026-10-28T00:00:00Z'))).toBe(
      2000,
    )
    expect(retryAfterMs('invalid')).toBeUndefined()
    expect(retryAfterMs('-1')).toBeUndefined()
  })
})
