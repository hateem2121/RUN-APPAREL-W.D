import type { ViewerApiSuccess } from '@run-apparel/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { takeEmbeddedPayload } from '../src/lib/embeddedPayload'
import { posterPicture } from '../src/lib/garmentContour'
import {
  PERSON_PAYLOAD_BUDGET_MS,
  personHeadMarkup,
  personPageHeaders,
  posterPreload,
  withinBudget,
  withoutValidators,
} from './personPayload'

/**
 * A person's garment page carrying its own data (owner, 2026-11-15; `personPayload.ts` has the
 * measurements). What would have to break for these to fail: the page waiting past its budget for
 * a slow CMS, a preload the stage does not match (a second download of the poster), a person's
 * copy read as a robot's (no 3D for anyone), or a kept copy revalidated into stale data.
 */

const ROUTE = { productSlug: 'kaizen', colourSlug: 'orange' }
const POSTER = 'https://media.wear-run.com/kaizen-orange-poster.webp'

function payload(over: { glbUrl?: string | null; separate?: boolean } = {}): ViewerApiSuccess {
  const glbUrl = over.glbUrl === undefined ? 'https://media.wear-run.com/kaizen.glb' : over.glbUrl
  return {
    product: {
      slug: 'kaizen',
      variantMode: over.separate ? 'separate-glb-per-colour' : 'single-glb-variants',
      glbUrl: over.separate ? null : glbUrl,
      posterFallback: null,
    },
    selectedColourway: {
      slug: 'orange',
      glbUrl: over.separate ? glbUrl : null,
      poster: { url: POSTER },
    },
  } as unknown as ViewerApiSuccess
}

afterEach(() => {
  vi.useRealTimers()
  document.head.innerHTML = ''
})

describe('waiting for the edge’s copy, within a budget', () => {
  it('is 300 ms', () => {
    expect(PERSON_PAYLOAD_BUDGET_MS).toBe(300)
  })

  it('hands on an answer that comes in time', async () => {
    await expect(withinBudget(Promise.resolve('data'), 300)).resolves.toBe('data')
  })

  it('gives up at the budget, and the work goes on', async () => {
    vi.useFakeTimers()
    let finished = false
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => {
        finished = true
        resolve('late')
      }, 2_000),
    )
    const raced = withinBudget(slow, 300)
    await vi.advanceTimersByTimeAsync(300)
    await expect(raced).resolves.toBeNull()
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1_700)
    expect(finished).toBe(true)
  })
})

describe('the poster asked for with the HTML', () => {
  it('is the very request the stage makes: the seam address, with CORS, first', () => {
    const tag = posterPreload(payload())
    expect(tag).toContain(`href="${posterPicture(POSTER).src}"`)
    expect(tag).toContain('crossorigin="anonymous"')
    expect(tag).toContain('fetchpriority="high"')
    expect(tag).toContain('as="image"')
  })

  it('follows the colour’s own model when each colour has one', () => {
    expect(posterPreload(payload({ separate: true }))).toContain('rel="preload"')
    expect(posterPreload(payload({ separate: true, glbUrl: null }))).toBe('')
  })

  // Without 3D the stage draws the HD copy, not this poster: a preload would be a second download.
  it('is not asked for a garment with no 3D file', () => {
    expect(posterPreload(payload({ glbUrl: null }))).toBe('')
  })
})

describe('the markup a person’s page gains', () => {
  it('round-trips as a person’s copy: the app loads the garment and the 3D', () => {
    document.head.insertAdjacentHTML('beforeend', personHeadMarkup(payload(), ROUTE))
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).not.toBeNull()
    const taken = takeEmbeddedPayload('/api/public/viewer/kaizen/orange')
    expect(taken?.forRobot).toBe(false)
    expect(taken?.payload).toEqual(payload())
  })
})

describe('the headers of a page that carries data', () => {
  it('lose their validators, so a browser fetches again instead of keeping old data', () => {
    const headers = personPageHeaders(
      new Headers({
        etag: '"6193e10b57754cf5485b3b6c5dd74b31"',
        'last-modified': 'Sat, 14 Nov 2026 22:37:56 GMT',
        'cache-control': 'public, max-age=0, must-revalidate, no-transform',
        'content-security-policy': "default-src 'self'",
      }),
    )
    expect(headers.get('etag')).toBeNull()
    expect(headers.get('last-modified')).toBeNull()
    expect(headers.get('cache-control')).toBe('private, max-age=0, no-transform')
    // Everything else rides along, the page's security policy above all.
    expect(headers.get('content-security-policy')).toBe("default-src 'self'")
  })

  it('ask the assets for the whole page, never a 304', () => {
    const request = withoutValidators(
      new Request('https://wear-run.com/products/kaizen/orange', {
        headers: { 'if-none-match': '"x"', 'if-modified-since': 'y', 'user-agent': 'phone' },
      }),
    )
    expect(request.headers.get('if-none-match')).toBeNull()
    expect(request.headers.get('if-modified-since')).toBeNull()
    expect(request.headers.get('user-agent')).toBe('phone')
    expect(request.url).toBe('https://wear-run.com/products/kaizen/orange')
  })
})
