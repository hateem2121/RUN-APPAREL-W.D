/**
 * Is `rawModel` allowed to be loaded by the `/render` route?
 *
 * PURE, and deliberately dependency-free — see preview.ts's header for why:
 * this has to run identically inside the Worker (index.ts, `lib: ["ES2022"]`,
 * no DOM) and inside the browser bundle (RenderPage.tsx, full DOM lib), and
 * @cloudflare/workers-types redeclares enough of DOM that loading both in one
 * file produces hundreds of duplicate-identifier errors. Plain strings and the
 * ambient `URL` global — which both environments already provide their own
 * types for — only.
 *
 * WHY THIS EXISTS. `/render` loads whatever GLB the `model` query param names,
 * with no publish gate and no owner review in front of it — the shrink robot
 * calls it against an unpublished draft. A route that will fetch an arbitrary
 * remote URL inside our own browser is a hazard, not a feature (task 13
 * brief), so the host has to be checked before the page ever asks
 * `<model-viewer>` to load it.
 *
 * "our own host" is deliberately not one hard-coded literal. Production serves
 * the PAGE from viewer.wear-run.help and the MODEL from media.wear-run.help —
 * two different origins already trusted together by scripts/csp.mjs's img-src
 * and connect-src zone (`https://*.wear-run.help`) — while local dev and the
 * e2e fixture server (apps/viewer/e2e/serve.mjs) serve the model fixture from
 * their OWN single origin. Same-origin covers the second case for free, and
 * covers the first too (viewer.wear-run.help is itself `*.wear-run.help`);
 * the wildcard suffix is what additionally allows the separate media host in
 * production, without hard-coding `media.` — which would silently start
 * rejecting every model the day media moves subdomains.
 */
export function isAllowedRenderModel(rawModel: string | null, pageOrigin: string): boolean {
  if (!rawModel) return false
  let url: URL
  try {
    // A base lets `model` be either a path on our own host (what the e2e
    // fixtures and the shrink robot's own CMS-relative fallback URL look
    // like) or a full URL (production's media.wear-run.help) — see above.
    url = new URL(rawModel, pageOrigin)
  } catch {
    return false
  }
  if (url.origin === pageOrigin) return true
  return url.protocol === 'https:' && /(^|\.)wear-run\.help$/.test(url.hostname)
}
