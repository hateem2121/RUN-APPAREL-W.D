import { describe, expect, it } from 'vitest'
import { SITE_ORIGIN } from './seo'

/**
 * The preconnect rule, extracted as data rather than mocked through a React render.
 *
 * The function itself lives beside the page that uses it; this pins the DECISION, which
 * is the part that can go wrong silently: preconnecting to an origin the page does not
 * use costs a connection and buys nothing, and preconnecting to the current origin is
 * pure waste.
 */
function crossOriginPosterHost(urls: Array<string | null>): string | null {
  const absolute = urls.find((url) => url?.startsWith('http'))
  if (!absolute) return null
  try {
    const { origin } = new URL(absolute)
    return origin === SITE_ORIGIN ? null : origin
  } catch {
    return null
  }
}

describe('poster preconnect', () => {
  it('names the media host when posters are served from it', () => {
    expect(crossOriginPosterHost(['https://media.wear-run.help/a.webp'])).toBe(
      'https://media.wear-run.help',
    )
  })

  it('stays silent when posters are same-origin', () => {
    // A preconnect to the origin already serving the document is a wasted hint.
    expect(crossOriginPosterHost([`${SITE_ORIGIN}/a.webp`])).toBeNull()
  })

  it('stays silent on relative URLs, which is what local development produces', () => {
    // PUBLIC_MEDIA_BASE_URL is unset outside production, so Payload emits
    // `/api/media/file/…`. Emitting a preconnect then would advertise nothing.
    expect(crossOriginPosterHost(['/api/media/file/a.webp'])).toBeNull()
    expect(crossOriginPosterHost([null, null])).toBeNull()
  })

  it('skips placeholder cards to find the first real poster', () => {
    expect(crossOriginPosterHost([null, null, 'https://media.wear-run.help/b.webp'])).toBe(
      'https://media.wear-run.help',
    )
  })

  it('never throws on a malformed URL', () => {
    // A hand-edited CMS value should degrade to "no hint", not to a 500.
    expect(crossOriginPosterHost(['http://['])).toBeNull()
  })
})
