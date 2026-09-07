import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The caching CONTRACT, exercised against a stand-in for Payload.
 *
 * `content.ts` imports `@payload-config`, which pulls the whole CMS config and a
 * Cloudflare binding resolver into the test process — so the behaviour is pinned here
 * against the same shape instead. What matters is the policy, and the policy has three
 * rules that are each easy to get wrong in a way nothing would notice:
 *
 *   a hit must not call the database
 *   an expired entry must
 *   a FAILURE must never be cached, or one bad second becomes one bad minute
 */

const TTL_MS = 60_000

function makeReader<T>(load: () => Promise<T>, fallback: T) {
  let cache: { value: T; expires: number } | null = null
  return {
    clear: () => {
      cache = null
    },
    read: async (): Promise<T> => {
      if (cache && cache.expires > Date.now()) return cache.value
      try {
        const value = await load()
        cache = { value, expires: Date.now() + TTL_MS }
        return value
      } catch {
        return fallback
      }
    },
  }
}

describe('the content cache policy', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('serves a second read without touching the database', async () => {
    const load = vi.fn().mockResolvedValue(['a'])
    const reader = makeReader(load, [])
    expect(await reader.read()).toEqual(['a'])
    expect(await reader.read()).toEqual(['a'])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reads again once the entry has expired', async () => {
    vi.useFakeTimers()
    const load = vi.fn().mockResolvedValue(['a'])
    const reader = makeReader(load, [])
    await reader.read()
    vi.advanceTimersByTime(TTL_MS + 1)
    await reader.read()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('NEVER caches a failure', async () => {
    // The readers fall back to defaults when D1 is unhappy. Caching that fallback would
    // turn a bad second into a bad minute — and worse, it would keep serving defaults
    // after the database recovered.
    const load = vi.fn().mockRejectedValueOnce(new Error('D1 down')).mockResolvedValue(['real'])
    const reader = makeReader(load, ['fallback'])

    expect(await reader.read()).toEqual(['fallback'])
    // the very next read must try again rather than serve a cached fallback
    expect(await reader.read()).toEqual(['real'])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('a cleared cache reads afresh', async () => {
    const load = vi.fn().mockResolvedValue(['a'])
    const reader = makeReader(load, [])
    await reader.read()
    reader.clear()
    await reader.read()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('content.ts implements that policy', () => {
  const source = () => readFileSync(join(import.meta.dirname, 'content.ts'), 'utf8')

  it('checks the cache before reading, in both readers', () => {
    const code = source()
    expect(code).toMatch(/if \(settingsCache && settingsCache\.expires > Date\.now\(\)\)/)
    expect(code).toMatch(/if \(productsCache && productsCache\.expires > Date\.now\(\)\)/)
  })

  it('stores only inside the try block, so a failure is never cached', () => {
    // If the assignment moved below the catch, a D1 outage would be cached for a minute.
    const code = source()
    const settings = /export async function getSiteSettings[\s\S]*?\n}/.exec(code)?.[0] ?? ''
    const products = /export async function getProductCards[\s\S]*?\n}/.exec(code)?.[0] ?? ''
    for (const [name, body] of [
      ['getSiteSettings', settings],
      ['getProductCards', products],
    ] as const) {
      const assign = body.indexOf('Cache = { value')
      const catchAt = body.indexOf('} catch')
      expect(assign, `${name}: no cache write found`).toBeGreaterThan(-1)
      expect(assign, `${name}: caches after the catch, so failures are cached`).toBeLessThan(
        catchAt,
      )
    }
  })
})
