import { cardImage } from './cardImage'
import { SITE_ORIGIN } from './seo'

/**
 * The origin the /products cards fetch their FIRST picture from, when that is another origin, so
 * the page can preconnect to it. Null when the pictures come from this page's own address, from
 * a relative URL (every local runtime), or from nowhere.
 *
 * ⚠️ JUDGED ON THE ADDRESS THE CARD WILL ACTUALLY REQUEST, after `cardImage`. Since 2026-09-29 a
 * media.wear-run.com picture is fetched through `/cdn-cgi/image/…` on the page's own address, so
 * that host needs no connection of its own; judged on the raw URL, the page kept opening one
 * nothing used (final review, 2026-09-29). The preconnect itself is explained where it is
 * rendered, in `app/(frontend)/products/page.tsx`.
 */
export function preconnectHost(urls: ReadonlyArray<string | null | undefined>): string | null {
  const first = urls.find((url): url is string => typeof url === 'string' && url.length > 0)
  if (!first) return null
  const requested = cardImage(first).src
  if (!requested.startsWith('http')) return null
  try {
    const { origin } = new URL(requested)
    return origin === SITE_ORIGIN ? null : origin
  } catch {
    return null
  }
}
