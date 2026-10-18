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
import { isInconclusiveStatus } from './inconclusive-statuses.mjs'

export const PAGE_URL = 'https://wear-run.com/products'
/** Neither fetch had a limit; a stalled edge would have held the job until its 60 minutes. */
export const FETCH_TIMEOUT_MS = 30_000
/** The public pages name the bucket by its wear-run.com address since 2026-09-28. */
export const MEDIA_HOST = 'media.wear-run.com'
/** The page never same-page-fetches from here — it only LINKS to it. */
export const UNEXPECTED_HOST = 'viewer.wear-run.help'

/**
 * Pure: every `<link rel="preconnect">` host in an HTML string, whatever the attribute order and
 * whatever other `rel` words sit beside it. Until 2026-10-18 only `rel` immediately before `href`
 * was matched, so `<link href=… rel="preconnect">` read as "(none)" and passed.
 */
export function extractPreconnectHosts(html) {
  const hosts = []
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tag.match(/\srel="([^"]*)"/i)?.[1] ?? ''
    if (!rel.toLowerCase().split(/\s+/).includes('preconnect')) continue
    const href = tag.match(/\shref="([^"]*)"/i)?.[1]
    if (!href) continue
    try {
      hosts.push(new URL(href).host)
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

/**
 * Fetch the first card picture and judge the answer by its headers alone. The body is never
 * needed, so it is cancelled: from 2026-10-05 this step took 6 min 40 s in every run although its
 * answer was printed in its first second, because Node's fetch holds the connection — and the
 * process — until a body is read or cancelled (undici's docs; reproduced 2026-10-18, still alive
 * at 600 s). A 307 is the `onerror=redirect` fallback to the full-size file.
 */
export async function checkCardPicture(src, fetchImpl = fetch) {
  const picture = await fetchImpl(new URL(src, PAGE_URL), {
    headers: { accept: 'image/avif,image/webp,*/*' },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  const status = picture.status
  const resized = picture.headers.get('cf-resized') ?? ''
  const type = picture.headers.get('content-type') ?? ''
  await picture.body?.cancel()
  const problems = []
  if (status >= 300 && status < 400) {
    problems.push(
      `The first card picture fell back to the original (${status}, cf-resized: ${resized}). ` +
        "Cloudflare's resizing is off for wear-run.com, or this month's free 5,000 resizes are used up.",
    )
  } else if (status !== 200 || !type.startsWith('image/') || /err=/.test(resized)) {
    problems.push(`The first card picture answered ${status} ${type} (cf-resized: ${resized}).`)
  }
  return { status, type, resized, problems }
}

async function main() {
  const res = await fetch(PAGE_URL, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (isInconclusiveStatus(res.status)) {
    // An annotation, so it shows on the run's page; a plain log line here went unseen.
    console.log(`::warning::preconnect-probe: inconclusive — ${PAGE_URL} answered ${res.status}`)
    await res.body?.cancel()
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
    const picture = await checkCardPicture(src)
    console.log(
      `preconnect-probe: first card picture ${picture.status} ${picture.type} cf-resized: ${picture.resized || '(none)'}`,
    )
    problems.push(...picture.problems)
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
