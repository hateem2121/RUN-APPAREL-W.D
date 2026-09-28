import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.hoisted`, not a bare `const`: vi.mock's factory is hoisted above module scope, so
// a plain `const getCloudflareContext = vi.fn()` is in its temporal dead zone when the
// factory runs ("Cannot access 'getCloudflareContext' before initialization").
const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import { parseSearchVisibility, robotsFor, searchVisibility, sitemapFor } from './searchVisibility'

/**
 * The switch that keeps a beta out of search engines. Owner decision 2026-09-06: a
 * deploy-time setting, not an admin field, and hidden until the owner calls it final.
 *
 * ⚠️ FAILS CLOSED. Every branch here is a way the site could become indexable by
 * accident — a missing var, a typo, a wrong case — and every one must resolve to hidden.
 */
describe('parseSearchVisibility', () => {
  it.each([undefined, null, '', 'hidden', 'HIDDEN', 'Visible', 'visible ', 'true', 1])(
    'treats %j as hidden',
    (raw) => {
      expect(parseSearchVisibility(raw)).toBe('hidden')
    },
  )

  it('opens only on the exact word', () => {
    expect(parseSearchVisibility('visible')).toBe('visible')
  })
})

describe('searchVisibility reads the Worker first, then the process, then fails closed', () => {
  beforeEach(() => {
    getCloudflareContext.mockReset()
    delete process.env.SITE_INDEXING
  })

  it('takes the Worker binding when there is one', async () => {
    getCloudflareContext.mockResolvedValue({ env: { SITE_INDEXING: 'visible' } })
    process.env.SITE_INDEXING = 'hidden'
    expect(await searchVisibility()).toBe('visible')
  })

  it('falls back to the process when there is no Worker context (next start, tests)', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    process.env.SITE_INDEXING = 'visible'
    expect(await searchVisibility()).toBe('visible')
  })

  it('is hidden when nothing says otherwise', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    expect(await searchVisibility()).toBe('hidden')
  })
})

describe('what the switch does', () => {
  it('hidden means noindex; visible means the layout declares nothing', () => {
    // `undefined`, not `{ index: true }`: declaring index in the layout broke the 404's
    // own noindex after hydration (measured 2026-09-05, recorded in layout.tsx).
    expect(robotsFor('hidden')).toEqual({ index: false })
    expect(robotsFor('visible')).toBeUndefined()
  })

  it('hidden means an empty sitemap; visible lists the site pages on the given origin', () => {
    expect(sitemapFor('hidden', 'https://wear-run.com')).toEqual([])
    expect(sitemapFor('visible', 'https://wear-run.com').map((e) => e.url)).toEqual([
      'https://wear-run.com',
      'https://wear-run.com/products',
      'https://wear-run.com/contact',
      'https://wear-run.com/privacy',
      'https://wear-run.com/terms',
    ])
  })

  /**
   * THE GARMENTS JOINED THE SITEMAP ON 2026-09-28, when they moved onto the site's own
   * host at /products/<product>/<colour>. Until then they lived on viewer.wear-run.help,
   * and a sitemap may only speak for the host that serves it. One entry per colour, in the
   * catalogue's own order — each colour page is its own canonical URL (the viewer Worker
   * writes it) — and never the colourless /products/<product>, which is the default
   * colour's page under a second address.
   */
  it('lists every colour of every garment when visible, and none when hidden', () => {
    const garments = [
      { slug: 'rxps', colours: [{ slug: 'wine' }, { slug: 'navy' }] },
      { slug: 'r-xmp', colours: [{ slug: 'black' }] },
    ]
    expect(sitemapFor('hidden', 'https://wear-run.com', garments)).toEqual([])
    expect(
      sitemapFor('visible', 'https://wear-run.com', garments)
        .map((e) => e.url)
        .slice(5),
    ).toEqual([
      'https://wear-run.com/products/rxps/wine',
      'https://wear-run.com/products/rxps/navy',
      'https://wear-run.com/products/r-xmp/black',
    ])
  })
})
