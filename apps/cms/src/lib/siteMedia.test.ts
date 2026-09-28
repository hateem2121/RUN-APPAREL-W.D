import { describe, expect, it } from 'vitest'
import { ADMIN_MEDIA_ORIGIN, onSiteMedia, SITE_MEDIA_ORIGIN } from './siteMedia'

describe('public pages name the media host on their own site (domain move, 2026-09-28)', () => {
  it('moves a production media URL to the wear-run.com address of the same bucket', () => {
    expect(onSiteMedia('https://media.wear-run.help/rxps-wine-poster.webp')).toBe(
      'https://media.wear-run.com/rxps-wine-poster.webp',
    )
    expect(onSiteMedia('https://media.wear-run.help/folder/rxps-2026-09-28-optimized.glb')).toBe(
      'https://media.wear-run.com/folder/rxps-2026-09-28-optimized.glb',
    )
  })

  // The e2e harness points PUBLIC_MEDIA_BASE_URL at its own localhost server, and a URL
  // already on the site's media host must not be touched twice.
  it.each([
    'http://localhost:4174/rxps-wine-poster.webp',
    '/api/media/file/rxps-wine-poster.webp',
    'https://media.wear-run.com/rxps-wine-poster.webp',
    // Only the exact origin: a lookalike host is not ours to rewrite.
    'https://media.wear-run.help.example.com/x.webp',
    'https://media.wear-run.helper/x.webp',
  ])('leaves %s alone', (url) => {
    expect(onSiteMedia(url)).toBe(url)
  })

  it('the two origins are the same bucket under the two domains', () => {
    expect(ADMIN_MEDIA_ORIGIN.replace('.help', '')).toBe(SITE_MEDIA_ORIGIN.replace('.com', ''))
  })
})
