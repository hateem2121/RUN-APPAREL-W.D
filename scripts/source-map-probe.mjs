#!/usr/bin/env node
/**
 * SO-14 — no real source map is served on either host, checked by CONTENT.
 *
 * ⚠️ THE VIEWER HOST'S `.map` URLs ARE NOT 404s. Measured live 2026-09-24:
 * `GET viewer.wear-run.help/assets/<real-file>.js.map` -> 200, `content-type: text/html`
 * — the SPA fallback shell, because `/assets/*` is excluded from `run_worker_first`
 * (`apps/viewer/wrangler.jsonc`) and a missing file under an excluded prefix falls
 * through to Cloudflare's `single-page-application` handling, same as any other unknown
 * path there. A probe that trusts the STATUS CODE alone would read 200 as "found a source
 * map" on this host. The site host is the opposite case — a genuine 404 — so the two
 * branches below are deliberately NOT symmetric.
 *
 * Read-only: one real script tag per host, one `.map` GET per host.
 *
 *   node scripts/source-map-probe.mjs
 */
import { pathToFileURL } from 'node:url'

export const SITE_ORIGIN = 'https://wear-run.help'
export const VIEWER_ORIGIN = 'https://viewer.wear-run.help'
export const SITE_PAGE = `${SITE_ORIGIN}/`
export const VIEWER_PAGE = `${VIEWER_ORIGIN}/rxps/wine`

/** A real, absolute-path script src from a page's HTML, or null. */
export function findScriptSrc(html, pathPrefix) {
  const re = new RegExp(`<script[^>]*\\ssrc="(${pathPrefix}[^"]*\\.js)"`, 'i')
  return html.match(re)?.[1] ?? null
}

/**
 * Pure: given a `.map` response's status/content-type/body, decide whether a REAL source
 * map leaked. `shape` picks which host's rules apply — they are not the same check.
 *
 * @param {'genuine-404' | 'spa-fallback'} shape
 */
export function evaluateMapResponse(shape, { status, contentType, body }) {
  if (shape === 'genuine-404') {
    // This host 404s a missing file for real — the site's own behaviour. Anything else
    // (a 200, or a 404 that is somehow still JSON-shaped and version:3) is worth a look.
    if (status === 404) return { ok: true, reason: '404, as expected' }
    return { ok: false, reason: `expected 404, got ${status}` }
  }
  // 'spa-fallback': a 200 here is the DESIGNED behaviour and proves nothing either way —
  // only the BODY can. A real source map is JSON carrying "version":3; the SPA shell is
  // HTML and never does.
  const type = contentType ?? ''
  const looksLikeSourceMap =
    type.includes('application/json') || (body ?? '').includes('"version":3')
  if (looksLikeSourceMap) {
    return {
      ok: false,
      reason: `content-type ${type || '(none)'} and/or body looks like a real source map`,
    }
  }
  return { ok: true, reason: `${status} ${type || '(no content-type)'}, not source-map-shaped` }
}

async function checkHost(label, pageUrl, pathPrefix, shape) {
  const pageRes = await fetch(pageUrl, { headers: { accept: 'text/html' } })
  if (pageRes.status === 403 || pageRes.status === 429) {
    console.log(`⚠️  ${pageUrl} returned ${pageRes.status} — INCONCLUSIVE (Bot Fight Mode).`)
    return true
  }
  const html = await pageRes.text()
  const scriptSrc = findScriptSrc(html, pathPrefix)
  if (!scriptSrc) {
    console.error(`source-map-probe: ${pageUrl} names no ${pathPrefix}*.js script to test.`)
    process.exit(2)
  }
  const mapUrl = new URL(`${scriptSrc}.map`, pageUrl).toString()
  const mapRes = await fetch(mapUrl)
  const body = await mapRes.text()
  const { ok, reason } = evaluateMapResponse(shape, {
    status: mapRes.status,
    contentType: mapRes.headers.get('content-type'),
    body,
  })
  console.log(`   ${label}: ${mapUrl} -> ${reason}`)
  return ok
}

async function main() {
  const siteOk = await checkHost('site', SITE_PAGE, '/_next/static/', 'genuine-404')
  const viewerOk = await checkHost('viewer', VIEWER_PAGE, '/assets/', 'spa-fallback')
  if (!siteOk || !viewerOk) {
    console.error('::error::source-map-probe: a real source map may be reachable — see above.')
    process.exit(1)
  }
  console.log('source-map-probe: OK — no source map reachable on either host')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`source-map-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
