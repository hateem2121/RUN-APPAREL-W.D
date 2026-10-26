import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.hoisted`, as in searchVisibility.test.ts: vi.mock's factory runs before module scope.
const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import { CONTENT_VERSION_KEY } from '../../pageCache.mjs'
import {
  keptPagesAfterChange,
  keptPagesAfterDelete,
  keptPagesAfterGlobalChange,
  recordContentChange,
} from './contentVersion'

/**
 * A CMS save makes every kept website page stale (pageCache.mjs, polish X15). These pin the
 * two things that matter: the save is recorded in the KV key the Worker reads, and recording
 * it can never fail or slow the save itself.
 */
function fakeKv(put = vi.fn().mockResolvedValue(undefined)) {
  return { put }
}

describe('recording a save for the page cache', () => {
  beforeEach(() => {
    getCloudflareContext.mockReset()
  })

  it('writes a new, unique content version under the key the Worker reads', async () => {
    const kv = fakeKv()
    const waitUntil = vi.fn()
    getCloudflareContext.mockResolvedValue({ env: { SITE_CACHE: kv }, ctx: { waitUntil } })
    await recordContentChange()
    await recordContentChange()
    expect(kv.put).toHaveBeenCalledTimes(2)
    const [first, second] = kv.put.mock.calls
    expect(first?.[0]).toBe(CONTENT_VERSION_KEY)
    // Random, never a clock: two saves in one millisecond must still differ.
    expect(first?.[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(first?.[1]).not.toBe(second?.[1])
  })

  it('does not hold up the save: the write runs after the response', async () => {
    const kv = fakeKv()
    const waitUntil = vi.fn()
    getCloudflareContext.mockResolvedValue({ env: { SITE_CACHE: kv }, ctx: { waitUntil } })
    await recordContentChange()
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('never fails a save when KV refuses the write', async () => {
    const kv = fakeKv(vi.fn().mockRejectedValue(new Error('KV down')))
    getCloudflareContext.mockResolvedValue({ env: { SITE_CACHE: kv } })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordContentChange()).resolves.toBeUndefined()
    quiet.mockRestore()
  })

  it('does nothing without the binding (tests, next dev, a preview with no KV)', async () => {
    getCloudflareContext.mockResolvedValue({ env: {} })
    await expect(recordContentChange()).resolves.toBeUndefined()
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    await expect(recordContentChange()).resolves.toBeUndefined()
  })

  /*
   * 2026-10-25: a save marks the kept pages and garment answers stale, through the store's own
   * entrypoint (worker.mjs SitePages.invalidateKept), so each is served once more while it is
   * drawn again instead of every region's next visitor waiting.
   */
  it('marks both kinds of kept copy stale, after the response', async () => {
    const kv = fakeKv()
    const invalidateKept = vi.fn().mockResolvedValue(true)
    let pending: Promise<unknown> | undefined
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      pending = promise
    })
    getCloudflareContext.mockResolvedValue({
      env: { SITE_CACHE: kv },
      ctx: { waitUntil, exports: { SitePages: { invalidateKept } } },
    })
    await recordContentChange()
    await pending
    expect(invalidateKept).toHaveBeenCalledWith(['site-pages', 'garment-data'])
    expect(waitUntil).toHaveBeenCalledTimes(1)
    // The content version is still written: the store's off switch keys copies by it.
    expect(kv.put).toHaveBeenCalledTimes(1)
  })

  it('never fails a save when the store cannot be told, or is not there', async () => {
    const kv = fakeKv()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const invalidateKept of [
      vi.fn().mockRejectedValue(new Error('RPC failed')),
      vi.fn(() => {
        throw new Error('stub threw at once')
      }),
    ]) {
      getCloudflareContext.mockResolvedValue({
        env: { SITE_CACHE: kv },
        ctx: { exports: { SitePages: { invalidateKept } } },
      })
      await expect(recordContentChange()).resolves.toBeUndefined()
    }
    getCloudflareContext.mockResolvedValue({ env: { SITE_CACHE: kv }, ctx: { waitUntil: vi.fn() } })
    await expect(recordContentChange()).resolves.toBeUndefined()
    expect(kv.put).toHaveBeenCalledTimes(3)
    quiet.mockRestore()
  })

  it('the hooks record the change and hand the document back untouched', async () => {
    const kv = fakeKv()
    getCloudflareContext.mockResolvedValue({ env: { SITE_CACHE: kv } })
    const doc = { id: 7 }
    const args = { doc } as never
    expect(await keptPagesAfterChange(args)).toBe(doc)
    expect(await keptPagesAfterDelete(args)).toBe(doc)
    expect(await keptPagesAfterGlobalChange(args)).toBe(doc)
    expect(kv.put).toHaveBeenCalledTimes(3)
  })
})
