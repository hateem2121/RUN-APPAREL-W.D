import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELOAD_GUARD_MS,
  reloadForStaleChunk,
  reloadOnChunkFailure,
  resetStaleChunkReload,
} from './staleChunkReload'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('reloadForStaleChunk (deploy deleted a chunk, 2026-10-21)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetStaleChunkReload()
  })

  it('reloads once and reports why', () => {
    const reload = vi.fn()
    const reports: unknown[] = []
    const listener = (e: Event) => reports.push((e as CustomEvent).detail)
    document.addEventListener('run:diagnostic', listener)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const outcome = reloadForStaleChunk(
      'model-viewer',
      { product: 'R-XPS' },
      { storage: memoryStorage(), now: () => 1_000, online: () => true, reload },
    )

    document.removeEventListener('run:diagnostic', listener)
    expect(outcome).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reports).toEqual([
      { product: 'R-XPS', reason: 'model-viewer', kind: 'stale-chunk-reload' },
    ])
  })

  it('never reloads twice inside the guard — a missing chunk must not become a reload loop', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memoryStorage()
    const reload = vi.fn()
    let t = 1_000
    const deps = { storage, now: () => t, online: () => true, reload }

    expect(reloadForStaleChunk('model-viewer', {}, deps)).toBe('reloaded')
    resetStaleChunkReload() // the reloaded document
    t += RELOAD_GUARD_MS - 1
    expect(reloadForStaleChunk('model-viewer', {}, deps)).toBe('already-reloaded')
    expect(reload).toHaveBeenCalledTimes(1)

    // A later deploy, long after, is a new stale chunk and earns its own reload.
    t += 2
    expect(reloadForStaleChunk('model-viewer', {}, deps)).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when storage throws, because it could not prove there is no loop', () => {
    const reload = vi.fn()
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(
      reloadForStaleChunk('model-viewer', {}, { storage: throwing, online: () => true, reload }),
    ).toBe('no-storage')
    expect(reload).not.toHaveBeenCalled()
  })

  it('does not reload offline — that would swap the page for the offline document', () => {
    const reload = vi.fn()
    expect(
      reloadForStaleChunk(
        'model-viewer',
        {},
        { storage: memoryStorage(), online: () => false, reload },
      ),
    ).toBe('offline')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('one failure reported twice in one document (the import effect re-runs)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetStaleChunkReload()
  })

  it('reloads once, and the second report does not paint the fallback', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reload = vi.fn()
    const deps = { storage: memoryStorage(), now: () => 1_000, online: () => true, reload }
    expect(reloadForStaleChunk('model-viewer', {}, deps)).toBe('reloaded')
    // Same document, same instant: without the in-document flag this read the fresh
    // timestamp as "already-reloaded" and Stage showed the notice while the page unloaded.
    expect(reloadForStaleChunk('model-viewer', {}, deps)).toBe('reloaded')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('a page on its way out (e2e caught this, 2026-10-21)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetStaleChunkReload()
  })

  it('does not reload a page the visitor is leaving — the cancelled import is not a stale chunk', () => {
    const reload = vi.fn()
    window.dispatchEvent(new Event('beforeunload'))
    expect(
      reloadForStaleChunk(
        'model-viewer',
        {},
        { storage: memoryStorage(), online: () => true, reload },
      ),
    ).toBe('leaving')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('a page restored from the back/forward cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetStaleChunkReload()
  })

  it('is live again: a stale chunk after Back still earns its reload', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reload = vi.fn()
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(
      reloadForStaleChunk(
        'model-viewer',
        {},
        { storage: memoryStorage(), online: () => true, reload },
      ),
    ).toBe('reloaded')
  })
})

describe('reloadOnChunkFailure (background pieces, owner 2026-10-22)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetStaleChunkReload()
  })

  const refused = () => Promise.reject(new Error('Failed to fetch dynamically imported module'))

  it('passes a loaded module through and never reloads', async () => {
    const reload = vi.fn()
    const deps = { storage: memoryStorage(), now: () => 1_000, online: () => true, reload }
    await expect(
      reloadOnChunkFailure('footer-prompt', Promise.resolve('module'), deps),
    ).resolves.toBe('module')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once for a refused import and still hands the failure to the caller', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reload = vi.fn()
    const deps = { storage: memoryStorage(), now: () => 1_000, online: () => true, reload }
    await expect(reloadOnChunkFailure('footer-prompt', refused(), deps)).rejects.toThrow(
      'Failed to fetch dynamically imported module',
    )
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('two pieces failing in one page-load share ONE reload', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reload = vi.fn()
    const deps = { storage: memoryStorage(), now: () => 1_000, online: () => true, reload }
    await reloadOnChunkFailure('footer-prompt', refused(), deps).catch(() => {})
    await reloadOnChunkFailure('related-cards', refused(), deps).catch(() => {})
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a second failure inside the guard (after the reload) does not reload again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reload = vi.fn()
    const storage = memoryStorage()
    let t = 1_000
    const deps = { storage, now: () => t, online: () => true, reload }
    await reloadOnChunkFailure('polish', refused(), deps).catch(() => {})
    resetStaleChunkReload() // the reloaded document
    t += 10_000
    await expect(reloadOnChunkFailure('polish', refused(), deps)).rejects.toThrow()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('fails quietly, without a reload, where storage is unavailable', async () => {
    const reload = vi.fn()
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    await expect(
      reloadOnChunkFailure('polish', refused(), { storage: throwing, online: () => true, reload }),
    ).rejects.toThrow()
    expect(reload).not.toHaveBeenCalled()
  })
})
