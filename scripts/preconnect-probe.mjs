#!/usr/bin/env node
/**
 * SO-05 — what /products asks the network for, read off the LIVE page, because no local runtime
 * can show it.
 *
 * REWRITTEN 2026-09-29. Until then this checked that /products preconnects to the media host,
 * because the cards loaded their pictures from it. Since 2026-09-29 the cards load card-sized
 * copies that Cloudflare resizes on the page's OWN address (`apps/cms/src/lib/cardImage.ts`):
 * /products went from 0.67 to about 0.86 on a phone. So this now checks three things:
 *   1. no preconnect to the media host (nothing on the page fetches from it any more), nor to
 *      the viewer host (only ever linked to);
 *   2. the first card's picture is a `/cdn-cgi/image/…` resize, not the full-size file;
 *   3. fetching that picture returns a REAL resize: 200 with an image type and no `err=` in
 *      `cf-resized`. ⚠️ A 307 is the `onerror=redirect` fallback to the original — the page still
 *      works, but it means Cloudflare's resizing is off for wear-run.com (Images → Transformations
 *      in the dashboard) or the free plan's 5,000 resizes this month are used up. Both silently
 *      put the phone score back near 0.7, which is why a fallback FAILS this probe.
 * Nothing local can answer these: `next start` and `opennextjs-cloudflare preview` serve no
 * `/cdn-cgi/image/`, and local Payload emits relative media URLs that `cardImage` leaves alone.
 *
 * Read-only: one GET of the page and one of its first picture.
 *   node scripts/preconnect-probe.mjs
 */
import { realpathSync } from 'node:fs'

export const PAGE_URL = 'https://wear-run.com/products'
/** The public pages name the bucket by its wear-run.com address since 2026-09-28. */
export const MEDIA_HOST = 'media.wear-run.com'
/** The page never same-page-fetches from here — it only LINKS to it. */
export const UNEXPECTED_HOST = 'viewer.wear-run.help'

/** Pure: every `<link rel="preconnect">` host in an HTML string. */
export function extractPreconnectHosts(html) {
  const hosts = []
  for (const match of html.matchAll(/<link\s+rel="preconnect"\s+href="([^"]+)"/gi)) {
    try {
      hosts.push(new URL(match[1]).host)
    } catch {
      // A malformed href is a template bug worth surfacing on its own terms, not here.
    }
  }
  return hosts
}

/** Pure: judge the set of preconnect hosts a page declared. */
export function evaluatePreconnect(hosts) {
  const problems = []
  if (hosts.includes(MEDIA_HOST)) {
    problems.push(
      `A preconnect to ${MEDIA_HOST} exists on ${PAGE_URL} — the cards fetch resized pictures ` +
        'from the page itself since 2026-09-29, so that connection is opened and never used.',
    )
  }
  if (hosts.includes(UNEXPECTED_HOST)) {
    problems.push(
      `A preconnect to ${UNEXPECTED_HOST} exists — /products only LINKS to that host, it ` +
        'never same-page-fetches from it, so this preconnect buys nothing and costs a ' +
        'connection.',
    )
  }
  return { ok: problems.length === 0, problems }
}

/** Pure: the `src` of the first card picture on the page, or null. */
export function firstCardImage(html) {
  const tag = html.match(/<img\b[^>]*\bclass="[^"]*\bproduct-card__img\b[^"]*"[^>]*>/)?.[0]
  return tag?.match(/\ssrc="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&') ?? null
}

/** Pure: is the first card picture a Cloudflare resize? */
export function evaluateCardImage(src) {
  if (!src) return { ok: false, problems: [`${PAGE_URL} has no card picture at all.`] }
  if (!src.startsWith('/cdn-cgi/image/'))
    return {
      ok: false,
      problems: [
        `The first card picture is not resized (${src.slice(0, 90)}): the page is loading ` +
          'full-size pictures again, which measured 0.67 on a phone.',
      ],
    }
  return { ok: true, problems: [] }
}

async function main() {
  const res = await fetch(PAGE_URL, { headers: { accept: 'text/html' } })
  if (res.status === 403 || res.status === 429) {
    console.log(`⚠️  ${PAGE_URL} answered ${res.status} — INCONCLUSIVE (Bot Fight Mode).`)
    process.exit(0)
  }
  if (!res.ok) {
    console.error(`preconnect-probe: ${PAGE_URL} answered ${res.status}.`)
    process.exit(2)
  }
  const html = await res.text()
  const hosts = extractPreconnectHosts(html)
  const src = firstCardImage(html)
  const problems = [...evaluatePreconnect(hosts).problems, ...evaluateCardImage(src).problems]
  console.log(`preconnect-probe: ${PAGE_URL} preconnects to: ${hosts.join(', ') || '(none)'}`)

  if (src?.startsWith('/cdn-cgi/image/')) {
    const picture = await fetch(new URL(src, PAGE_URL), {
      headers: { accept: 'image/avif,image/webp,*/*' },
      redirect: 'manual',
    })
    const resized = picture.headers.get('cf-resized') ?? ''
    const type = picture.headers.get('content-type') ?? ''
    console.log(
      `preconnect-probe: first card picture ${picture.status} ${type} cf-resized: ${resized || '(none)'}`,
    )
    if (picture.status >= 300 && picture.status < 400) {
      problems.push(
        `The first card picture fell back to the original (${picture.status}, cf-resized: ${resized}). ` +
          "Cloudflare's resizing is off for wear-run.com, or this month's free 5,000 resizes are used up.",
      )
    } else if (picture.status !== 200 || !type.startsWith('image/') || /err=/.test(resized)) {
      problems.push(
        `The first card picture answered ${picture.status} ${type} (cf-resized: ${resized}).`,
      )
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
  console.log('preconnect-probe: OK')
}

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  main().catch((error) => {
    console.error(`preconnect-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
