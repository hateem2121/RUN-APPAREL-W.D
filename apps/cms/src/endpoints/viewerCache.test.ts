import { beforeEach, describe, expect, it } from 'vitest'
import {
  __clearViewerCache,
  __viewerCacheSize,
  readViewerCache,
  viewerCacheKey,
  writeViewerCache,
} from './viewerCache'

const T0 = 1_000_000

beforeEach(() => {
  __clearViewerCache()
})

describe('viewerCacheKey', () => {
  /**
   * ⚠️ THE FAILURE THIS PREVENTS LOOKS LIKE A BROKEN IMAGE, NOT LIKE A CACHE BUG.
   * `buildViewerResponse` resolves every poster and model URL against the request origin,
   * so one product genuinely has different payloads on different hosts. A key without the
   * origin would serve a preview's URLs to production, or the reverse.
   */
  it('separates the same product on different origins', () => {
    expect(viewerCacheKey('https://cms.wear-run.help', 'rxps', 'wine')).not.toBe(
      viewerCacheKey('http://localhost:3100', 'rxps', 'wine'),
    )
  })

  it('separates colourways, and the default form from a named one', () => {
    expect(viewerCacheKey('o', 'rxps', 'wine')).not.toBe(viewerCacheKey('o', 'rxps', 'navy'))
    expect(viewerCacheKey('o', 'rxps', null)).not.toBe(viewerCacheKey('o', 'rxps', 'wine'))
  })

  /**
   * The separator must not be a character a slug can contain, or two different requests
   * could collide into one key. `normalizeSlug` permits letters, digits and hyphens.
   */
  it('cannot be collided by a hyphenated slug', () => {
    expect(viewerCacheKey('o', 'a-b', 'c')).not.toBe(viewerCacheKey('o', 'a', 'b-c'))
  })
})

describe('read and write', () => {
  it('returns what was stored, inside the window', () => {
    writeViewerCache('k', { product: 'rxps' }, T0)
    expect(readViewerCache('k', T0 + 59_000)).toEqual({ product: 'rxps' })
  })

  it('misses on an unknown key', () => {
    expect(readViewerCache('nothing')).toBeNull()
  })

  /**
   * ⚠️ ASSERTED AGAINST AN INJECTED CLOCK, NOT A `setTimeout`. A test that waits for real
   * time either takes a minute or proves nothing; this proves the boundary exactly.
   */
  it('expires at the TTL and drops the entry', () => {
    writeViewerCache('k', 1, T0)
    expect(readViewerCache('k', T0 + 60_000)).toBeNull()
    expect(__viewerCacheSize(), 'an expired read must not leave the entry behind').toBe(0)
  })

  it('the negative control: one millisecond earlier is still a hit', () => {
    writeViewerCache('k', 1, T0)
    expect(readViewerCache('k', T0 + 59_999)).toBe(1)
  })
})

describe('the map cannot grow without bound', () => {
  it('stays at the ceiling under pressure', () => {
    for (let i = 0; i < 500; i += 1) writeViewerCache(`k${i}`, i, T0)
    expect(__viewerCacheSize()).toBeLessThanOrEqual(400)
  })

  /**
   * Expired entries are free to lose, so eviction must take those first — dropping a live
   * entry while a dead one sits beside it would throw away the work this cache exists to
   * save. Half the map is written a full TTL earlier, so it is expired by the time the
   * pressure arrives.
   */
  it('evicts expired entries before live ones', () => {
    for (let i = 0; i < 200; i += 1) writeViewerCache(`old${i}`, i, T0)
    for (let i = 0; i < 200; i += 1) writeViewerCache(`new${i}`, i, T0 + 61_000)
    writeViewerCache('trigger', 'x', T0 + 61_000)

    expect(readViewerCache('old0', T0 + 61_000), 'an expired entry should be gone').toBeNull()
    expect(readViewerCache('new0', T0 + 61_000), 'a live entry should survive').toBe(0)
    expect(readViewerCache('trigger', T0 + 61_000)).toBe('x')
  })

  it('re-writing an existing key does not count against the ceiling', () => {
    for (let i = 0; i < 400; i += 1) writeViewerCache(`k${i}`, i, T0)
    const before = __viewerCacheSize()
    writeViewerCache('k0', 'updated', T0)
    expect(__viewerCacheSize()).toBe(before)
    expect(readViewerCache('k0', T0)).toBe('updated')
  })
})
