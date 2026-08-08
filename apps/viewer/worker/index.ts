import { parseViewerPath } from '@run-apparel/shared'
import type { ViewerApiSuccess } from '@run-apparel/shared'
import { OG_CARDS } from './og-cards'
import { buildPreview, type Preview } from './preview'

/**
 * The viewer's Worker. Its ONLY job is to give a shared link a preview card that
 * names the actual garment and colourway.
 *
 * Until 2026-08-08 this project was static-assets-only. index.html carries one
 * set of Open Graph tags, and the SPA fallback serves that one document for every
 * route — so /n001/wine and /n001/lime unfurled identically, with the same
 * picture and the same sentence. A crawler does not run JavaScript, so App.tsx's
 * document.title never reaches it. Fixing that needs the response rewritten per
 * request, which needs a Worker.
 *
 * WHAT WAS CHECKED BEFORE ADDING ONE. `dist/_headers` — the CSP, HSTS and
 * Permissions-Policy — is applied by the asset router, and Cloudflare documents
 * only that it is "supported natively", never what happens to a response a Worker
 * pulled through the ASSETS binding. If it were applied before the binding,
 * adding this file would silently strip the CSP from every page and no test here
 * would notice. Measured on wrangler 4.114.0 on 2026-08-08: assets-only,
 * `env.ASSETS.fetch(request)` and `new Response(body, response)` all returned
 * identical CSP, HSTS and a deliberately non-default probe header, with an
 * X-Worker-Ran control proving the Worker was really in the path. See CLAUDE.md.
 *
 * ⚠️ ASSET REQUESTS NEVER REACH THIS FILE — measured, not read off the docs.
 * With `run_worker_first` unset, Workers Static Assets serves anything matching a
 * file in dist/ directly. Verified on wrangler 4.114.0 by logging every entry to
 * this handler: `/assets/index-*.js`, `/og/n001/wine.jpg` and `/` produced NO log
 * line at all, and `/n001/lime` produced one. So /assets/* keeps the
 * zero-overhead path it had before this file existed, and only SPA-fallback
 * routes cost anything.
 */

interface Env {
  ASSETS: Fetcher
  /** Service binding to run-apparel-viewer-cms — same account, no public hop. */
  CMS: Fetcher
}

/**
 * ONLY CRAWLERS GET THE REWRITE, AND THIS IS THE LOAD-BEARING DECISION IN THIS
 * FILE.
 *
 * Measured 2026-08-08, five requests each from a warm connection:
 *
 *   viewer.wear-run.help/n001/wine     (static HTML)   0.106 - 0.155 s
 *   cms /api/health                                    0.428 - 0.657 s
 *   cms /api/public/viewer/n001/wine                   1.77  - 2.27  s
 *
 * The payload endpoint costs about 1.9 s of server time — Payload plus a D1 query
 * plus the lexical→HTML conversion — and it is NOT edge-cached on either host
 * (cf-cache-status came back empty on cms.wear-run.help and on the workers.dev
 * URL alike; a Worker's own response does not pass through the edge cache, so its
 * `s-maxage=60` buys nothing). Putting that in front of the HTML would take a QR
 * scan from ~0.11 s to ~2 s to first byte — a 20x regression for every visitor,
 * to fix something no visitor can see.
 *
 * A crawler, by contrast, is fetching precisely because it wants the head, and
 * allows far longer (Facebook and WhatsApp both allow ~10 s). So it waits and the
 * visitor does not.
 *
 * The list can afford to be conservative: a crawler that is NOT matched falls
 * through to index.html's generic card, which is exactly what every link showed
 * before this file existed. The failure mode of a miss is "no worse than
 * yesterday", never a broken page.
 */
const CRAWLER = new RegExp(
  [
    // Almost every major crawler self-identifies with "bot": Googlebot, bingbot,
    // Twitterbot, LinkedInBot, Slackbot-LinkExpanding, Discordbot, TelegramBot,
    // Applebot (iMessage), redditbot, Pinterestbot, Applebot-Extended.
    'bot',
    'crawler',
    'spider',
    // The ones that do not.
    'facebookexternalhit',
    'facebookcatalog',
    'whatsapp',
    'skypeuripreview',
    'vkshare',
    'iframely',
    'embedly',
    'cardyb', // Bluesky
    'mastodon',
    'slack-imgproxy',
    'google-inspectiontool',
    'link preview',
    'linkpreview',
  ].join('|'),
  'i',
)

/** Cache lifetime for a crawled payload, in seconds. Matches the CMS's own s-maxage. */
const PREVIEW_CACHE_SECONDS = 60

/** Beyond this the crawler has almost certainly given up; serve the generic card. */
const CMS_TIMEOUT_MS = 8000

/**
 * Fetch the public viewer payload over the service binding.
 *
 * Returns null on ANY failure — timeout, 404, malformed JSON, missing binding.
 * The caller then returns the asset response untouched, so a CMS outage degrades
 * a link preview to the generic one and NEVER to a broken page. That is the whole
 * error strategy and it is deliberately blunt: this feature is cosmetic, and
 * nothing about it is worth failing a page load over.
 */
async function loadPayload(
  env: Env,
  route: { productSlug: string; colourSlug: string | null },
  origin: string,
  ctx: ExecutionContext,
): Promise<ViewerApiSuccess | null> {
  // The colour segment is dropped rather than sent empty — `/n001/` and
  // `/n001/null` are both read by the API as a mangled colour and 404. Same rule
  // as src/lib/api.ts, and the reason that file documents it.
  const path =
    route.colourSlug === null
      ? `/api/public/viewer/${encodeURIComponent(route.productSlug)}`
      : `/api/public/viewer/${encodeURIComponent(route.productSlug)}/${encodeURIComponent(route.colourSlug)}`

  // Keyed on the viewer's OWN origin so the entry is unambiguously in this zone.
  // It cannot leak: every request to this host reaches the Worker before the
  // cache is consulted, and a visitor asking for this path gets three path
  // segments, which parseViewerPath rejects. The body is the public API's
  // response in any case.
  const cacheKey = `${origin}/__og${path}`
  const cache = caches.default

  try {
    const hit = await cache.match(cacheKey)
    if (hit) return (await hit.json()) as ViewerApiSuccess
  } catch {
    // Cache unavailable (it is a no-op in some local runtimes) — just fetch.
  }

  try {
    const res = await env.CMS.fetch(`https://cms.wear-run.help${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CMS_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = await res.text()
    const payload = JSON.parse(body) as ViewerApiSuccess | { error: string }
    if ('error' in payload) return null
    if (!payload.product?.slug || !payload.selectedColourway?.slug) return null

    ctx.waitUntil(
      cache
        .put(
          cacheKey,
          new Response(body, {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${PREVIEW_CACHE_SECONDS}`,
            },
          }),
        )
        .catch(() => {}),
    )
    return payload
  } catch {
    return null
  }
}

/** Escape a value for interpolation into an attribute in appended markup. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Overwrite the head with this garment's own preview.
 *
 * og:url and <link rel="canonical"> are APPENDED rather than overwritten because
 * index.html deliberately carries neither — a static value for either would tell
 * crawlers that /n001/wine is the homepage and invite them to collapse every
 * colourway into one page. Per-request is the only form in which they are
 * correct, and this is the first time there has been a per-request anything.
 * scripts/og.test.ts asserts they stay absent from the static file.
 */
function applyPreview(response: Response, preview: Preview): Response {
  const rewriter = new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(preview.title)
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', preview.description)
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', preview.title)
      },
    })
    .on('meta[property="og:description"], meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', preview.description)
      },
    })
    .on('head', {
      element(el) {
        el.append(
          `<meta property="og:url" content="${attr(preview.url)}" />` +
            `<link rel="canonical" href="${attr(preview.url)}" />`,
          { html: true },
        )
      },
    })

  const image = preview.image
  if (image) {
    rewriter
      .on('meta[property="og:image"], meta[name="twitter:image"]', {
        element(el) {
          el.setAttribute('content', image.url)
        },
      })
      .on('meta[property="og:image:type"]', {
        element(el) {
          el.setAttribute('content', image.type)
        },
      })
      .on('meta[property="og:image:alt"]', {
        element(el) {
          el.setAttribute('content', image.alt)
        },
      })
      .on('meta[property="og:image:width"]', {
        element(el) {
          if (image.width) el.setAttribute('content', String(image.width))
          else el.remove()
        },
      })
      .on('meta[property="og:image:height"]', {
        element(el) {
          if (image.height) el.setAttribute('content', String(image.height))
          else el.remove()
        },
      })
  } else {
    // No card and no poster. Removing the tags leaves a card with no picture;
    // LEAVING them would show N001 in wine for whatever garment this is. A
    // missing image is a worse-looking link. The wrong garment is a false one,
    // and this feature exists to put links in front of leads.
    rewriter.on('meta[property^="og:image"], meta[name="twitter:image"]', {
      element(el) {
        el.remove()
      },
    })
  }

  return rewriter.transform(response)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const route = parseViewerPath(url.pathname)

    // Not a garment link, not a GET, or not a crawler → byte-for-byte what this
    // project served before the Worker existed. The overwhelming majority of
    // requests take this branch and pay one URL parse and one regex for it.
    if (!route || request.method !== 'GET' || !CRAWLER.test(request.headers.get('user-agent') ?? '')) {
      return env.ASSETS.fetch(request)
    }

    const [response, payload] = await Promise.all([
      env.ASSETS.fetch(request),
      loadPayload(env, route, url.origin, ctx),
    ])

    if (!payload) return response
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response

    const transformed = applyPreview(response, buildPreview(payload, { origin: url.origin, cards: OG_CARDS }))
    // The response body now depends on the User-Agent. Google documents Vary as
    // the correct signal for user-agent-dependent serving, and it stops any cache
    // in front of this handing a crawler's copy to a visitor.
    const headers = new Headers(transformed.headers)
    headers.append('Vary', 'User-Agent')
    return new Response(transformed.body, {
      status: transformed.status,
      statusText: transformed.statusText,
      headers,
    })
  },
} satisfies ExportedHandler<Env>
