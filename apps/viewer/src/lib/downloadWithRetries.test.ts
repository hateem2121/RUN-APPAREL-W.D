import { describe, expect, it, vi } from 'vitest'
import { DownloadStalledError } from './fetchWithProgress'
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
})
