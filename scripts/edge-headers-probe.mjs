#!/usr/bin/env node
/**
 * PF-12 + PF-14 — cache-control per content type, and HTTP/3 negotiation.
 *
 * Both are edge-only behaviour: Cloudflare's cache substrate and `alt-svc`
 * negotiation are not reproducible against a local dev server (no local server here
 * runs behind Cloudflare's edge), so both become one live-probe script, following the
 * `scripts/*-probe.mjs` pattern (`preconnect-probe.mjs`, `icon-parity-probe.mjs`) this
 * repo already uses for the same reason.
 *
 * Read-only: five plain GETs, one at a time, 1.2s apart, exactly as root CLAUDE.md's
 * "Read cf-cache-status off the GET's own headers, NEVER off a HEAD" trap requires —
 * a HEAD lands on a different edge cache entry from a GET on this domain, measured
 * in both directions there.
 *
 *   node scripts/edge-headers-probe.mjs
 */
import { pathToFileURL } from 'node:url'
import { DEFAULT_PRODUCT } from './live-products.mjs'

export const VIEWER_PAGE_URL = `https://viewer.wear-run.help/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`
export const CMS_PAGE_URL = 'https://wear-run.help/'
export const API_URL = `https://cms.wear-run.help/api/public/viewer/${DEFAULT_PRODUCT.slug}/${DEFAULT_PRODUCT.colourway}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pure: Bot Fight Mode's refusal of a robot — inconclusive, never a failed assertion. */
export function isRefusal(status) {
  return status === 403 || status === 429
}

/** Pure: pick the first hashed entry-chunk path out of the viewer's built HTML. */
export function extractHashedAssetPath(html) {
  const match = html.match(/<script[^>]*\ssrc="(\/assets\/index-[^"]+\.js)"/)
  return match ? match[1] : null
}

/**
 * Pure: does this response carry the edge's HTTP/3 advertisement?
 *
 * PF-14. `alt-svc: h3=":443"` (Cloudflare appends `; ma=86400`) tells a visitor's
 * next request it may use HTTP/3 — edge-only, so this is the whole check.
 */
export function hasH3AltSvc(altSvc) {
  return /\bh3=":443"/.test(altSvc ?? '')
}

/**
 * Pure: PF-12 — judge a `cache-control` value against what its content KIND should
 * carry. `kind` is one of 'hashed-immutable' (content-hashed JS/CSS — never
 * revalidated, a new build gets a new URL), 'html' (must always revalidate so a new
 * deploy goes live immediately), or 'long-ttl' (poster/model — versioned by content,
 * not content-hashed, so `immutable` is not required, but a short TTL would mean
 * every visitor re-fetches a multi-MB file for nothing).
 */
export function evaluateCacheControl(kind, cacheControl) {
  const cc = cacheControl ?? ''
  const problems = []
  if (kind === 'hashed-immutable') {
    if (!/immutable/.test(cc)) problems.push(`missing "immutable": ${cc}`)
    const maxAge = Number(cc.match(/max-age=(\d+)/)?.[1] ?? 0)
    if (!(maxAge >= 31536000)) problems.push(`max-age too short for a hashed asset: ${cc}`)
  } else if (kind === 'html') {
    if (!/must-revalidate/.test(cc)) problems.push(`missing "must-revalidate": ${cc}`)
  } else if (kind === 'long-ttl') {
    const maxAge = Number(cc.match(/max-age=(\d+)/)?.[1] ?? 0)
    // A day is the floor worth calling "long" for a multi-megabyte file — well above
    // any deploy cadence and far below "the media never changes at this URL".
    if (!(maxAge >= 86400)) problems.push(`TTL too short for a poster/model response: ${cc}`)
  } else {
    throw new Error(`edge-headers-probe: unknown kind "${kind}"`)
  }
  return { ok: problems.length === 0, problems }
}

/**
 * One GET, classified. Never a HEAD — see the file header.
 *
 * `range` requests `bytes=0-0` for the model: a full GET of a live 1.9-8.2 MB GLB is
 * weight on every scheduled run for no reason this check needs. (Not an R2 bill: R2
 * egress is free, re-read on its pricing page 2026-09-25.)
 * A ranged GET still returns real cache-control/alt-svc headers on its 206, but
 * CANNOT show content-encoding — this probe never reads that header, on purpose.
 *
 * `requireH3` defaults true. It is false for `media.wear-run.help`: measured live
 * 2026-09-24, that host (the R2-backed poster/model origin) sends NO `alt-svc` header
 * at all, while `wear-run.help`, `cms.wear-run.help` and `viewer.wear-run.help` all
 * advertise `h3=":443"`. That is a real, repeatable asymmetry — not a probe bug — and
 * changing it is a Cloudflare zone/custom-domain setting, out of a builder's scope
 * (root CLAUDE.md: no Cloudflare/DNS/settings changes). This probe therefore states
 * the finding plainly rather than either hiding it (treating h3 as universal) or
 * failing the build on something nobody here is allowed to fix.
 *
 * ⚠️ PF-14, SETTLED 2026-09-25: THERE IS NO SETTING TO FLIP. A Chromium forced onto QUIC
 * for the media host (`--origin-to-force-quic-on=media.wear-run.help:443`) fails with
 * `net::ERR_QUIC_PROTOCOL_ERROR`, while the same run against `wear-run.help` lands on
 * `h3`. Cloudflare's HTTP/3 is ONE zone-wide toggle, free on every plan, and it is on —
 * three hosts of this zone advertise it. The R2 custom domain simply does not speak QUIC.
 * Fronting it with a Worker route (Workers do) was rejected: every poster and model
 * request would run a Worker, adding a failure point to the one host that must not fail,
 * to save one handshake on objects that are edge-cache HITs. If this probe ever reports
 * h3 on media, the platform changed; flip `requireH3` back to true for it.
 */
async function probeOne(label, url, kind, { range, requireH3 = true } = {}) {
  const headers = range ? { range } : {}
  const res = await fetch(url, { headers })
  if (isRefusal(res.status)) {
    return { label, url, inconclusive: true, status: res.status }
  }
  const cacheControl = res.headers.get('cache-control')
  const altSvc = res.headers.get('alt-svc')
  const cc = evaluateCacheControl(kind, cacheControl)
  const h3 = hasH3AltSvc(altSvc)
  return {
    label,
    url,
    status: res.status,
    cacheControl,
    altSvc,
    ok: cc.ok && (requireH3 ? h3 : true) && (range ? res.status === 206 : res.ok),
    problems: [...cc.problems, ...(requireH3 && !h3 ? [`no h3 alt-svc: ${altSvc}`] : [])],
    // Never a failure — informational, so the known media.wear-run.help asymmetry is
    // visible in every run's output without gating on it.
    notes: !requireH3 && !h3 ? [`no h3 alt-svc on ${new URL(url).host} (known, out of scope)`] : [],
  }
}

async function main() {
  const results = []

  // 1. Viewer HTML page.
  const viewerRes = await fetch(VIEWER_PAGE_URL)
  const viewerHtml = await viewerRes.text()
  // A 403/429 is Bot Fight Mode refusing a robot, not the edge's answer — INCONCLUSIVE,
  // the same as probeOne() treats it (found in review 2026-09-25: only three of the five
  // requests did).
  if (isRefusal(viewerRes.status)) {
    results.push({
      label: 'viewer HTML',
      url: VIEWER_PAGE_URL,
      inconclusive: true,
      status: viewerRes.status,
    })
  } else {
    const cc = evaluateCacheControl('html', viewerRes.headers.get('cache-control'))
    const h3 = hasH3AltSvc(viewerRes.headers.get('alt-svc'))
    results.push({
      label: 'viewer HTML',
      url: VIEWER_PAGE_URL,
      status: viewerRes.status,
      ok: cc.ok && h3,
      problems: [...cc.problems, ...(h3 ? [] : ['no h3 alt-svc'])],
    })
  }
  await sleep(1200)

  // 2. Hashed viewer asset, resolved from the HTML just fetched — never a hard-coded
  // hash, which would go stale at the next build.
  const assetPath = extractHashedAssetPath(viewerHtml)
  if (assetPath) {
    results.push(
      await probeOne(
        'hashed viewer asset',
        `https://viewer.wear-run.help${assetPath}`,
        'hashed-immutable',
      ),
    )
  } else {
    results.push({
      label: 'hashed viewer asset',
      ok: false,
      problems: ['no hashed entry chunk found in viewer HTML'],
    })
  }
  await sleep(1200)

  // 3 & 4. Poster and model, resolved from the live payload rather than guessed.
  // Shape confirmed live 2026-09-24: `product.glbUrl` is the merged single-GLB model,
  // and each colourway's `poster.url` (a Media doc, not a bare string) is its own
  // poster — `product.posterFallback.url` is the default/OG fallback, used only if a
  // colourway carries none.
  const apiRes = await fetch(API_URL)
  const payload = apiRes.ok ? await apiRes.json().catch(() => null) : null
  const posterUrl =
    payload?.colourways?.[0]?.poster?.url ?? payload?.product?.posterFallback?.url ?? null
  const glbUrl = payload?.colourways?.[0]?.glbUrl ?? payload?.product?.glbUrl ?? null
  await sleep(1200)

  if (posterUrl) {
    results.push(await probeOne('poster', posterUrl, 'long-ttl', { requireH3: false }))
  } else {
    results.push({
      label: 'poster',
      ok: false,
      problems: ['no poster URL found in the live payload'],
    })
  }
  await sleep(1200)

  if (glbUrl) {
    results.push(
      await probeOne('model (ranged GET)', glbUrl, 'long-ttl', {
        range: 'bytes=0-0',
        requireH3: false,
      }),
    )
  } else {
    results.push({ label: 'model', ok: false, problems: ['no GLB URL found in the live payload'] })
  }
  await sleep(1200)

  // 5. One CMS HTML page.
  {
    const res = await fetch(CMS_PAGE_URL)
    if (isRefusal(res.status)) {
      results.push({ label: 'CMS HTML', url: CMS_PAGE_URL, inconclusive: true, status: res.status })
    } else {
      const cc = evaluateCacheControl('html', res.headers.get('cache-control'))
      const h3 = hasH3AltSvc(res.headers.get('alt-svc'))
      results.push({
        label: 'CMS HTML',
        url: CMS_PAGE_URL,
        status: res.status,
        ok: cc.ok && h3,
        problems: [...cc.problems, ...(h3 ? [] : ['no h3 alt-svc'])],
      })
    }
  }

  let failed = false
  for (const r of results) {
    if (r.inconclusive) {
      console.log(`⚠️  ${r.label} (${r.url}) answered ${r.status} — INCONCLUSIVE (Bot Fight Mode).`)
      continue
    }
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.label}${r.url ? ` (${r.url})` : ''}`)
    for (const n of r.notes ?? []) console.log(`     note: ${n}`)
    if (!r.ok) {
      failed = true
      for (const p of r.problems ?? []) console.error(`::error::${p}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`edge-headers-probe: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(2)
  })
}
