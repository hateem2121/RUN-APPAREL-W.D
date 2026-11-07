import { workerResponseHeaders } from './securityHeaders'

/**
 * Which version of this Worker answered — the proof a deploy's pre-live checks need.
 *
 * WHY (2026-11-07). ci.yml now uploads each new version at 0% of traffic and runs the post-deploy
 * checks against it BEFORE any visitor gets it, by sending Cloudflare's
 * `Cloudflare-Workers-Version-Overrides` header. Cloudflare's own docs (Version overrides, read
 * 2026-11-07): "In the case that a request's version override is not applied, the request will be
 * routed according to the percentages" — i.e. silently to the OLD version, and every check would
 * pass while testing the version already live. They recommend returning the version ID from the
 * version metadata binding; scripts/version-overrides.mjs asks this address with and without the
 * header and fails unless the answers are the new and the old version respectively.
 *
 * `/products/__worker/version` because the CMS Worker forwards only `/products/<a>/<b>` and the
 * viewer's own folders to this Worker (apps/cms/viewerForward.mjs), and no product slug starts
 * with `__`. A Worker-built response, so it takes workerResponseHeaders() (viewer-headers rule).
 */
export const WORKER_VERSION_PATH = '/products/__worker/version'

export function workerVersionResponse(
  pathname: string,
  metadata: { id?: string } | undefined,
): Response | null {
  if (pathname !== WORKER_VERSION_PATH) return null
  return new Response(
    `${JSON.stringify({ worker: 'run-apparel-viewer-site', version: metadata?.id ?? null })}\n`,
    {
      headers: {
        ...workerResponseHeaders('application/json; charset=utf-8'),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    },
  )
}
